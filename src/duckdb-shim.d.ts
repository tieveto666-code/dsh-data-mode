declare module 'duckdb' {
  export class Database {
    constructor(path: string, config?: Record<string, string>, callback?: (err: Error | null) => void)
    connect(): {
      all(sql: string, callback: (err: Error | null, rows: Record<string, unknown>[]) => void): void
      exec(sql: string, callback: (err: Error | null) => void): void
    }
    close(callback: (err: Error | null) => void): void
  }
}
