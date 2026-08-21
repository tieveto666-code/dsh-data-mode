import type { DataSourceService } from './data-source-types.ts'

export type {
  ColumnInfo,
  DataSourceService,
  DataSourceSummary,
  DataSourceType,
  DescribeResult,
  QueryResult,
  TableInfo,
} from './data-source-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dataSource: DataSourceService
  }
}

export const name = 'dsh-data-source'

/**
 * Contract plugin. Does not provide `dataSource`.
 * The isolate DuckDB provider owns the service instance.
 */
export function apply(): void {}
