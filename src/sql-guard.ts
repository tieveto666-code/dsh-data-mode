const READ_ONLY_HEAD = /^(with|select|explain|show|describe|desc|pragma|values)\b/i
const SKIP_DESCRIBE_HEAD = /^(explain|show|describe|desc|pragma)\b/i
const LIMIT_RE = /\blimit\s+(\d+)\b/i

export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim()
}

export function isReadOnlySql(sql: string): boolean {
  const stripped = stripSqlComments(sql)
  if (stripped === '') return false
  return READ_ONLY_HEAD.test(stripped)
}

export function skipsDescribeRequirement(sql: string): boolean {
  return SKIP_DESCRIBE_HEAD.test(stripSqlComments(sql))
}

export function referencedTables(sql: string): string[] {
  const stripped = stripSqlComments(sql)
  if (skipsDescribeRequirement(sql)) return []
  const names = new Set<string>()
  const pattern = /\b(?:from|join)\s+(?!(?:select|lateral)\b)(?:"([^"]+)"|`([^`]+)`|'([^']+)'|([a-zA-Z_][\w.]*))/gi
  for (const match of stripped.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3] ?? match[4]
    if (raw === undefined) continue
    const base = raw.split('.').pop() ?? raw
    if (base !== '') names.add(base)
  }
  return [...names]
}

export function extractLimit(sql: string): number | undefined {
  const match = stripSqlComments(sql).match(LIMIT_RE)
  if (match === null) return undefined
  return Number(match[1])
}

export function applyLimit(sql: string, defaultLimit: number, maxLimit: number): string {
  if (skipsDescribeRequirement(sql)) return sql
  const current = extractLimit(sql)
  if (current !== undefined && current > maxLimit) {
    throw new Error(`run_sql LIMIT ${current} exceeds hard cap ${maxLimit}`)
  }
  if (current !== undefined) return sql
  const stripped = stripSqlComments(sql).replace(/;\s*$/, '')
  return `${stripped}\nLIMIT ${defaultLimit}`
}

export function sqlQuoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}

export function sqlQuoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function tableNameFromFile(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? 'table'
  const stem = base.replace(/\.(csv|xlsx|parquet)$/i, '')
  const cleaned = stem.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^(\d)/, '_$1')
  return cleaned === '' ? 'data_table' : cleaned
}
