/** Catalog types shared by the Agent reader and the composer data-source UI. */

export type DataSourceType = 'duckdb-files' | 'postgres' | 'mysql' | 'sqlite'

/** How the source was registered. Drives the composer panel grouping. */
export type DataSourceOrigin = 'workspace' | 'upload' | 'database'

export const FILE_SOURCE_TYPES: readonly DataSourceType[] = ['duckdb-files']
export const DATABASE_SOURCE_TYPES: readonly DataSourceType[] = ['postgres', 'mysql', 'sqlite']

export interface DataSourceRecord {
  id: string
  type: DataSourceType
  label: string
  origin?: DataSourceOrigin
  workspaceGlobs?: string[]
  /** Workspace-relative file paths (uploads). Preferred over globs when set. */
  files?: string[]
  /** Connection URI without password. */
  uri?: string
  host?: string
  port?: number
  database?: string
  user?: string
  sqlitePath?: string
  ssl?: boolean
  credentialRef?: string
  readonly: true
}

export interface DataCatalog {
  sources: DataSourceRecord[]
}

export interface CatalogLoadOptions {
  dshHome: string
  workspaceRoot: string
}

export interface DataSourceView {
  id: string
  label: string
  type: DataSourceType
  origin: DataSourceOrigin
  detail?: string
  selected: boolean
  available: boolean
  note?: string
}

export interface ConnectDatabaseInput {
  engine: 'postgres' | 'mysql' | 'sqlite'
  label: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  sqlitePath?: string
  ssl?: boolean
}

export interface UploadTableInput {
  filename: string
  bytes: Uint8Array
  label?: string
}
