const NON_ID = /[^a-z0-9]+/g

export function slugId(prefix: string, label: string): string {
  const slug = label.toLowerCase().replace(NON_ID, '-').replace(/^-|-$/g, '').slice(0, 24)
  return `${prefix}-${slug || 'source'}-${Date.now().toString(36)}`
}

export function safeFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? 'data.csv'
  const cleaned = base.replace(/[^\w.\-()\u4e00-\u9fff]+/g, '_')
  return cleaned === '' ? 'data.csv' : cleaned
}

export function originOf(type: string, explicit?: string): 'workspace' | 'upload' | 'database' {
  if (explicit === 'workspace' || explicit === 'upload' || explicit === 'database') return explicit
  if (type === 'postgres' || type === 'mysql' || type === 'sqlite') return 'database'
  return 'workspace'
}
