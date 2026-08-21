import { homedir } from 'node:os'
import { join } from 'node:path'

export function resolveDshHome(explicit?: string): string {
  if (explicit && explicit !== '') return explicit
  if (process.env.DSH_HOME && process.env.DSH_HOME !== '') return process.env.DSH_HOME
  return join(homedir(), '.dsh')
}

export function resolveWorkspaceRoot(explicit?: string): string {
  if (explicit && explicit !== '') return explicit
  if (process.env.DSH_CWD && process.env.DSH_CWD !== '') return process.env.DSH_CWD
  return process.cwd()
}

export const DATA_MODE_DIR = 'data-mode'
export const CATALOG_FILE = 'catalog.yaml'

export const IMPLICIT_SOURCE_ID = 'workspace-files'
export const DEFAULT_QUERY_LIMIT = 200
export const MAX_QUERY_LIMIT = 5000
export const DEFAULT_PREVIEW_LIMIT = 20
export const MAX_PREVIEW_LIMIT = 50
export const MAX_WORKSPACE_FILES = 80
