import type { Context } from '@deepseek-ai/cordis'
import { MAX_QUERY_LIMIT } from './paths.ts'
import { extractLimit, isReadOnlySql, referencedTables, skipsDescribeRequirement } from './sql-guard.ts'
import { getDescribed, isDescribed, sessionKeyFromAgent } from './session-state.ts'
import { assertSourceVisible, sessionIdFromAgent } from './source-access.ts'

export const name = 'dsh-data-guard'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.guard(exec => {
    if (exec.name === 'describe_schema' || exec.name === 'preview_rows' || exec.name === 'run_sql') {
      const sourceId = (exec.arguments as { sourceId?: unknown }).sourceId
      if (typeof sourceId === 'string' && sourceId !== '') {
        try {
          assertSourceVisible(sessionIdFromAgent(exec.agent), sourceId)
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      }
    }
    if (exec.name !== 'run_sql') return
    const args = exec.arguments as { sql?: unknown }
    const sql = typeof args.sql === 'string' ? args.sql : ''
    if (!isReadOnlySql(sql)) {
      return 'run_sql only accepts read-only SELECT / WITH / EXPLAIN / SHOW / DESCRIBE / PRAGMA statements'
    }
    const limit = extractLimit(sql)
    if (limit !== undefined && limit > MAX_QUERY_LIMIT) {
      return `run_sql LIMIT ${limit} exceeds hard cap ${MAX_QUERY_LIMIT}`
    }
    if (skipsDescribeRequirement(sql)) return undefined
    const sessionKey = sessionKeyFromAgent(exec.agent)
    const described = getDescribed(sessionKey)
    const missing = referencedTables(sql).filter(table => !isDescribed(sessionKey, table))
    if (missing.length > 0) {
      const known = [...described].join(', ') || '(none)'
      return `run_sql refused: describe_schema first for tables: ${missing.join(', ')}. Already described: ${known}`
    }
    return undefined
  })
}
