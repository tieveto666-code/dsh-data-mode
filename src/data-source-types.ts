import type { DataSourceType } from './catalog/types.ts'

export type { DataSourceType }

export interface DataSourceSummary {
  id: string
  label: string
  type: DataSourceType
  readonly: true
  available: boolean
  selected?: boolean
  tables?: string[]
  note?: string
}

export interface ColumnInfo {
  name: string
  type: string
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  file?: string
}

export interface DescribeResult {
  sourceId: string
  tables: TableInfo[]
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  sql: string
}

export function asQueryResult(value: QueryResult & Record<string, unknown>): QueryResult {
  return {
    columns: value.columns,
    rows: value.rows,
    rowCount: value.rowCount,
    sql: value.sql,
  }
}

export interface DataSourceService {
  listSources(filter?: { sourceId?: string }): Promise<DataSourceSummary[]>
  describe(input: { sourceId: string; table?: string }): Promise<DescribeResult>
  preview(input: { sourceId: string; table: string; limit: number }): Promise<QueryResult>
  query(input: { sourceId: string; sql: string; signal?: AbortSignal }): Promise<QueryResult>
}
