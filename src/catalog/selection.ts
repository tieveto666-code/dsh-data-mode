import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { DATA_MODE_DIR } from '../paths.ts'
import { parseYamlObject } from './parse-yaml.ts'

function selectionPath(dshHome: string): string {
  return join(dshHome, DATA_MODE_DIR, 'selections.yaml')
}

interface SelectionDoc {
  sessions: Record<string, string>
}

async function readDoc(dshHome: string): Promise<SelectionDoc> {
  try {
    const text = await readFile(selectionPath(dshHome), 'utf8')
    const root = parseYamlObject(text, selectionPath(dshHome))
    const sessionsRaw = root.sessions
    const sessions: Record<string, string> = {}
    if (sessionsRaw && typeof sessionsRaw === 'object' && !Array.isArray(sessionsRaw)) {
      for (const [key, value] of Object.entries(sessionsRaw as Record<string, unknown>)) {
        if (typeof value === 'string' && value.trim() !== '') sessions[key] = value.trim()
      }
    }
    return { sessions }
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return { sessions: {} }
    throw error
  }
}

export async function readSelectedSourceId(dshHome: string, sessionId: string): Promise<string | undefined> {
  if (sessionId === '') return undefined
  const doc = await readDoc(dshHome)
  return doc.sessions[sessionId]
}

export function readSelectedSourceIdSync(dshHome: string, sessionId: string): string | undefined {
  if (sessionId === '') return undefined
  try {
    const text = readFileSync(selectionPath(dshHome), 'utf8')
    const doc = parseYamlObject(text, selectionPath(dshHome))
    const sessions = doc.sessions
    if (sessions && typeof sessions === 'object' && !Array.isArray(sessions)) {
      const value = (sessions as Record<string, unknown>)[sessionId]
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
    }
    return undefined
  } catch {
    return undefined
  }
}

export async function writeSelectedSourceId(
  dshHome: string,
  sessionId: string,
  sourceId: string | null,
): Promise<void> {
  if (sessionId === '') throw new Error('sessionId is required')
  const doc = await readDoc(dshHome)
  if (sourceId === null || sourceId === '') delete doc.sessions[sessionId]
  else doc.sessions[sessionId] = sourceId
  await mkdir(join(dshHome, DATA_MODE_DIR), { recursive: true })
  await writeFile(selectionPath(dshHome), stringify(doc), 'utf8')
}
