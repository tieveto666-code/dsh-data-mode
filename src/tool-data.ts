import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_PREVIEW_LIMIT } from './paths.ts'
import { markDescribed, sessionKeyFromAgent, setBindings } from './session-state.ts'
import type { AnalysisKind } from './session-state.ts'
import { asQueryResult, type QueryResult } from './data-source-types.ts'
import {
  assertSourceVisible,
  selectedSourceIdOf,
  sessionIdFromAgent,
  visibleListPayload,
} from './source-access.ts'

export const name = 'dsh-tool-data'
export const inject = ['tools', 'dataSource']

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    columns: { type: 'array', required: true, items: { type: 'string' } },
    rows: { type: 'array', required: true, items: { type: 'array', items: { type: 'json' } } },
    rowCount: { type: 'number', required: true },
    sql: { type: 'string', required: true },
  },
} as const

function renderQuery(_args: unknown, value: QueryResult) {
  return [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }]
}

const ANALYSIS_KINDS: readonly AnalysisKind[] = [
  'metric', 'rank', 'share', 'trend', 'extrema', 'attribution', 'other',
]

function omitUndefined<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

function asAnalysisKind(value: unknown): AnalysisKind | undefined {
  return typeof value === 'string' && (ANALYSIS_KINDS as readonly string[]).includes(value)
    ? value as AnalysisKind
    : undefined
}

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'list_data_sources',
    description: 'List the data source the user selected in the composer. Returns no sources until one is selected. Do not invent source ids.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sources: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string', required: true },
                label: { type: 'string', required: true },
                type: { type: 'string', required: true },
                readonly: { type: 'boolean', required: true },
                available: { type: 'boolean', required: true },
                selected: { type: 'boolean' },
                tables: { type: 'array', items: { type: 'string' } },
                note: { type: 'string' },
              },
            },
          },
          selectedSourceId: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(_args, exec) {
      const sessionId = sessionIdFromAgent(exec.agent)
      const selectedSourceId = selectedSourceIdOf(sessionId)
      if (selectedSourceId === undefined) {
        return { sources: [] }
      }
      const sources = await ctx.dataSource.listSources({ sourceId: selectedSourceId })
      const visible = visibleListPayload(sources, selectedSourceId)
      return omitUndefined({
        sources: visible.sources.map(source => omitUndefined({
          id: source.id,
          label: source.label,
          type: source.type,
          readonly: true,
          available: source.available,
          selected: true,
          tables: source.tables,
          note: source.note,
        })),
        selectedSourceId: visible.selectedSourceId,
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'describe_schema',
    description: 'Describe tables and columns in a data source. Required before run_sql on those tables.',
    parameters: {
      sourceId: { type: 'string', required: true },
      table: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceId: { type: 'string', required: true },
          tables: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                file: { type: 'string' },
                columns: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string', required: true },
                      type: { type: 'string', required: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args, exec) {
      assertSourceVisible(sessionIdFromAgent(exec.agent), args.sourceId)
      const result = await ctx.dataSource.describe({ sourceId: args.sourceId, table: args.table })
      const key = sessionKeyFromAgent(exec.agent)
      for (const table of result.tables) markDescribed(key, table.name)
      if (args.table) markDescribed(key, args.table)
      return {
        sourceId: result.sourceId,
        tables: result.tables.map(table => omitUndefined({
          name: table.name,
          file: table.file,
          columns: table.columns,
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'preview_rows',
    description: 'Preview a small sample of rows from a table.',
    parameters: {
      sourceId: { type: 'string', required: true },
      table: { type: 'string', required: true },
      limit: { type: 'number' },
    },
    output: {
      schema: querySchema,
      render: renderQuery,
    },
    async execute(args, exec) {
      assertSourceVisible(sessionIdFromAgent(exec.agent), args.sourceId)
      return asQueryResult(await ctx.dataSource.preview({
        sourceId: args.sourceId,
        table: args.table,
        limit: args.limit ?? DEFAULT_PREVIEW_LIMIT,
      }))
    },
  }))

  ctx.tools.register(defineTool({
    name: 'run_sql',
    description: 'Run a read-only SQL query. Forbidden for off-topic questions. Describe tables first. Default LIMIT 200, hard cap 5000.',
    parameters: {
      sourceId: { type: 'string', required: true },
      sql: { type: 'string', required: true, description: 'Read-only SELECT / WITH / EXPLAIN / SHOW' },
      metric: { type: 'string', description: 'What this query computes, e.g. sum(gmv)' },
      timeRange: { type: 'string' },
      grain: { type: 'string' },
      filters: { type: 'string' },
      analysisKind: { type: 'string', description: 'metric | rank | share | trend | extrema | attribution | other' },
    },
    output: {
      schema: querySchema,
      render: renderQuery,
    },
    async execute(args, exec) {
      assertSourceVisible(sessionIdFromAgent(exec.agent), args.sourceId)
      const result = await ctx.dataSource.query({
        sourceId: args.sourceId,
        sql: args.sql,
        signal: exec.signal,
      })
      setBindings(sessionKeyFromAgent(exec.agent), {
        metric: typeof args.metric === 'string' ? args.metric : undefined,
        timeRange: typeof args.timeRange === 'string' ? args.timeRange : undefined,
        grain: typeof args.grain === 'string' ? args.grain : undefined,
        filters: typeof args.filters === 'string' ? args.filters : undefined,
        analysisKind: asAnalysisKind(args.analysisKind),
        lastSql: result.sql,
        sourceId: args.sourceId,
      })
      return asQueryResult(result)
    },
  }))
}
