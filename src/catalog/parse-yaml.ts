import { parse } from 'yaml'

export function parseYamlObject(text: string, fileLabel: string): Record<string, unknown> {
  const value = parse(text) as unknown
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${fileLabel} must be a YAML mapping`)
  }
  return value as Record<string, unknown>
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim())
  return items.length > 0 ? items : undefined
}
