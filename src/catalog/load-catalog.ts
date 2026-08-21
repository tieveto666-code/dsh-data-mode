import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { CATALOG_FILE, DATA_MODE_DIR, IMPLICIT_SOURCE_ID } from '../paths.ts'
import { ensureDemoSqlite, withDemoSource } from './demo-sqlite.ts'
import { ensureDemoXlsx, withDemoXlsx } from './demo-xlsx.ts'
import { asString, asStringArray, parseYamlObject } from './parse-yaml.ts'
import type {
  CatalogLoadOptions, DataCatalog, DataSourceOrigin, DataSourceRecord, DataSourceType,
} from './types.ts'

export const DEFAULT_FILE_GLOBS = ['**/*.csv', '**/*.xlsx', '**/*.parquet']

export function workspaceFilesSource(): DataSourceRecord {
  return {
    id: 'workspace-files',
    type: 'duckdb-files',
    label: '工作区 CSV / XLSX',
    origin: 'workspace',
    workspaceGlobs: DEFAULT_FILE_GLOBS,
    readonly: true,
  }
}

function parseType(value: unknown): DataSourceType | undefined {
  if (value === 'duckdb-files' || value === 'postgres' || value === 'mysql' || value === 'sqlite') return value
  return undefined
}

function parseOrigin(value: unknown): DataSourceOrigin | undefined {
  if (value === 'workspace' || value === 'upload' || value === 'database') return value
  return undefined
}

function parsePort(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }
  return undefined
}

function parseSource(raw: unknown, index: number, fileLabel: string): DataSourceRecord {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${fileLabel} sources[${index}] must be a mapping`)
  }
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const type = parseType(row.type)
  const label = asString(row.label) ?? id
  if (id === undefined || type === undefined || label === undefined) {
    throw new Error(`${fileLabel} sources[${index}] needs id, type (duckdb-files|postgres|mysql|sqlite), and label`)
  }
  return {
    id,
    type,
    label,
    origin: parseOrigin(row.origin),
    workspaceGlobs: asStringArray(row.workspaceGlobs),
    files: asStringArray(row.files),
    uri: asString(row.uri),
    host: asString(row.host),
    port: parsePort(row.port),
    database: asString(row.database),
    user: asString(row.user),
    sqlitePath: asString(row.sqlitePath),
    ssl: row.ssl === true,
    credentialRef: asString(row.credentialRef),
    readonly: true,
  }
}

export function parseCatalogDocument(text: string, fileLabel: string): DataCatalog {
  const root = parseYamlObject(text, fileLabel)
  const sourcesRaw = root.sources
  if (sourcesRaw === undefined) return { sources: [] }
  if (!Array.isArray(sourcesRaw)) throw new Error(`${fileLabel} sources must be a list`)
  return { sources: sourcesRaw.map((row, index) => parseSource(row, index, fileLabel)) }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return undefined
    throw error
  }
}

function mergeSources(base: DataSourceRecord[], overlay: DataSourceRecord[]): DataSourceRecord[] {
  const byId = new Map<string, DataSourceRecord>()
  for (const source of base) byId.set(source.id, source)
  for (const source of overlay) byId.set(source.id, source)
  return [...byId.values()]
}

export function catalogPaths(options: CatalogLoadOptions) {
  return {
    homePath: join(options.dshHome, DATA_MODE_DIR, CATALOG_FILE),
    workspacePath: join(options.workspaceRoot, '.dsh', DATA_MODE_DIR, CATALOG_FILE),
  }
}

/** Raw files only — empty means the caller may still apply the implicit glob source. */
export async function loadRawCatalog(options: CatalogLoadOptions): Promise<DataCatalog> {
  const { homePath, workspacePath } = catalogPaths(options)
  const homeText = await readOptional(homePath)
  const workspaceText = await readOptional(workspacePath)
  const home = homeText === undefined ? { sources: [] } : parseCatalogDocument(homeText, homePath)
  const workspace = workspaceText === undefined ? { sources: [] } : parseCatalogDocument(workspaceText, workspacePath)
  return { sources: mergeSources(home.sources, workspace.sources) }
}

export function withoutWorkspaceScan(sources: DataSourceRecord[]): DataSourceRecord[] {
  return sources.filter(source => source.id !== IMPLICIT_SOURCE_ID)
}

/**
 * Read-only catalog. Composer UI writes these YAML files; the Agent only reads.
 * Workspace file overrides home records with the same id. The implicit
 * workspace-files scan source is never listed: previewing it required duckdb,
 * and the composer only exposes connected databases plus uploaded files.
 */
export async function loadCatalog(options: CatalogLoadOptions): Promise<DataCatalog> {
  await ensureDemoSqlite(options.dshHome)
  await ensureDemoXlsx(options.dshHome)
  const sources = withoutWorkspaceScan((await loadRawCatalog(options)).sources)
  return { sources: withDemoXlsx(withDemoSource(sources, options.dshHome), options.dshHome) }
}

export async function saveWorkspaceCatalog(
  options: CatalogLoadOptions,
  catalog: DataCatalog,
): Promise<void> {
  const { workspacePath } = catalogPaths(options)
  await mkdir(join(options.workspaceRoot, '.dsh', DATA_MODE_DIR), { recursive: true })
  const body = stringify({
    sources: withoutWorkspaceScan(catalog.sources).map(source => {
      const row: Record<string, unknown> = {
        id: source.id,
        type: source.type,
        label: source.label,
        readonly: true,
      }
      if (source.origin) row.origin = source.origin
      if (source.workspaceGlobs) row.workspaceGlobs = source.workspaceGlobs
      if (source.files) row.files = source.files
      if (source.uri) row.uri = source.uri
      if (source.host) row.host = source.host
      if (source.port !== undefined) row.port = source.port
      if (source.database) row.database = source.database
      if (source.user) row.user = source.user
      if (source.sqlitePath) row.sqlitePath = source.sqlitePath
      if (source.ssl) row.ssl = true
      if (source.credentialRef) row.credentialRef = source.credentialRef
      return row
    }),
  })
  await writeFile(workspacePath, body, 'utf8')
}
