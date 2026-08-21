import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CATALOG_API_PREFIX, createCatalogHttpDeps, handleCatalogHttp } from './catalog-http.ts'
import { ensureDataPreset } from './install-preset.ts'

/** Minimal host ctx used by the registrar. Avoids a hard compile-time cordis import. */
interface RegistrarContext {
  logger: { info(message: string): void; warn(message: string): void }
  effect(fn: () => () => void, name?: string): void
  inject?(services: string[], callback: (ctx: RegistrarContext & { webServer?: WebServerLike }) => void): void
  get?(name: string): unknown
  webServer?: WebServerLike
}

interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/**
 * Host registrar. Copies the user preset when missing, and (on web) serves the
 * composer data-source API. Must not inject `tools`, `settings`, or `agentPresets`.
 */
export const name = 'dsh-data-mode-register'

function resolveDshHome(): string {
  return process.env.DSH_HOME && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
}

function mountCatalogApi(ctx: RegistrarContext): void {
  const webServer = ctx.webServer ?? (ctx.get?.('webServer') as WebServerLike | undefined)
  if (webServer === undefined || typeof webServer.register !== 'function') return
  const deps = createCatalogHttpDeps(ctx)
  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: CATALOG_API_PREFIX,
    handler: (req, res) => handleCatalogHttp(req, res, deps),
  }), 'dsh-data-mode catalog api')
}

export function apply(ctx: RegistrarContext) {
  const templateDir = fileURLToPath(new URL('../preset/dsh-data/', import.meta.url))
  ctx.effect(() => {
    void ensureDataPreset({
      dshHome: resolveDshHome(),
      templateDir,
      log: message => ctx.logger.info(message),
    }).catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error)
      ctx.logger.warn(`dsh-data-mode: failed to install user preset: ${text}`)
    })
    return () => undefined
  })

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], inner => {
      mountCatalogApi(inner)
    })
    return
  }
  mountCatalogApi(ctx)
}
