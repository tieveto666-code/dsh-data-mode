import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { handleCatalogHttp, type CatalogHttpDeps } from '../src/catalog-http.ts'
import { DATA_MODE_ONLY, isDataModePreset, resolvePresetFromSession } from '../src/data-mode-gate.ts'
import { PRESET_ID } from '../src/isolation-contract.ts'

describe('data mode gate', () => {
  it('prefers the latest agent-preset/selected event over the header', () => {
    expect(resolvePresetFromSession({
      header: { agentPreset: 'standard' },
      events: [
        { type: 'agent-preset/selected', data: { agentPreset: 'minimal' } },
        { type: 'agent-preset/selected', data: { agentPreset: PRESET_ID } },
      ],
    })).toBe(PRESET_ID)
    expect(isDataModePreset('standard')).toBe(false)
    expect(isDataModePreset(PRESET_ID)).toBe(true)
  })
})

function mockReq(method: string, url: string, body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage
  req.method = method
  req.url = url
  req.headers = { host: '127.0.0.1' }
  let started = false
  const originalOn = req.on.bind(req)
  req.on = ((event: string, listener: (...args: unknown[]) => void) => {
    originalOn(event, listener)
    if ((event === 'data' || event === 'end') && !started) {
      started = true
      queueMicrotask(() => {
        if (body !== undefined) req.emit('data', Buffer.from(body))
        req.emit('end')
      })
    }
    return req
  }) as IncomingMessage['on']
  return req
}

function mockRes(): ServerResponse & { body: string; statusCode: number } {
  const res = {
    statusCode: 200,
    body: '',
    headersSent: false,
    setHeader() { return res },
    end(chunk?: string) {
      res.headersSent = true
      if (chunk !== undefined) res.body += chunk
    },
  }
  return res as unknown as ServerResponse & { body: string; statusCode: number }
}

async function tempDeps(preset: string | undefined): Promise<CatalogHttpDeps> {
  return {
    dshHome: await mkdtemp(join(tmpdir(), 'dsh-http-home-')),
    resolveWorkspace: () => tmpdir(),
    resolvePreset: () => preset,
  }
}

describe('catalog http data-mode isolation', () => {
  it('rejects state and preview when the session is not data mode', async () => {
    const deps = await tempDeps('standard')
    const stateRes = mockRes()
    await handleCatalogHttp(mockReq('GET', '/api/dsh-data-mode/state?sessionId=s1'), stateRes, deps)
    expect(stateRes.statusCode).toBe(403)
    expect(JSON.parse(stateRes.body).error).toBe(DATA_MODE_ONLY)

    const previewRes = mockRes()
    await handleCatalogHttp(
      mockReq('POST', '/api/dsh-data-mode/preview', JSON.stringify({ sessionId: 's1', sourceId: 'demo-sqlite' })),
      previewRes,
      deps,
    )
    expect(previewRes.statusCode).toBe(403)
  })

  it('serves state when the session is data mode', async () => {
    const deps = await tempDeps(PRESET_ID)
    const res = mockRes()
    await handleCatalogHttp(mockReq('GET', '/api/dsh-data-mode/state?sessionId=data-1'), res, deps)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { sources: Array<{ id: string }> }
    expect(body.sources.some(source => source.id === 'demo-sqlite')).toBe(true)
    expect(body.sources.some(source => source.id === 'workspace-files')).toBe(false)
  })

  it('rejects knowledge APIs outside data mode and CRUD entries inside it', async () => {
    const blocked = await tempDeps('standard')
    const blockedRes = mockRes()
    await handleCatalogHttp(
      mockReq('GET', '/api/dsh-data-mode/knowledge?sessionId=s1&sourceId=demo-xlsx'),
      blockedRes,
      blocked,
    )
    expect(blockedRes.statusCode).toBe(403)

    const deps = await tempDeps(PRESET_ID)
    const created = mockRes()
    await handleCatalogHttp(
      mockReq('POST', '/api/dsh-data-mode/knowledge', JSON.stringify({
        sessionId: 'data-1',
        sourceId: 'demo-xlsx',
        key: '主营业务收入',
        value: '主营业务收入=联网通信主营业务收入+算网数智主营业务收入',
      })),
      created,
      deps,
    )
    expect(created.statusCode).toBe(200)
    const createdBody = JSON.parse(created.body) as { entries: Array<{ id: string; key: string }> }
    expect(createdBody.entries).toHaveLength(1)

    const listed = mockRes()
    await handleCatalogHttp(
      mockReq('GET', '/api/dsh-data-mode/knowledge?sessionId=data-1&sourceId=demo-xlsx'),
      listed,
      deps,
    )
    expect(listed.statusCode).toBe(200)
    expect(JSON.parse(listed.body).entries).toHaveLength(1)

    const removed = mockRes()
    await handleCatalogHttp(
      mockReq('POST', '/api/dsh-data-mode/knowledge-remove', JSON.stringify({
        sessionId: 'data-1',
        sourceId: 'demo-xlsx',
        id: createdBody.entries[0]!.id,
      })),
      removed,
      deps,
    )
    expect(removed.statusCode).toBe(200)
    expect(JSON.parse(removed.body).entries).toEqual([])
  })
})
