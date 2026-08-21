import { access, copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_MODE_DIR } from '../paths.ts'
import type { DataSourceRecord } from './types.ts'

export const DEMO_XLSX_ID = 'demo-xlsx'
export const DEMO_XLSX_LABEL = 'XLSX 示例'

export function demoXlsxPath(dshHome: string): string {
  return join(dshHome, DATA_MODE_DIR, 'demo.xlsx')
}

export function demoXlsxSource(dshHome: string): DataSourceRecord {
  return {
    id: DEMO_XLSX_ID,
    type: 'duckdb-files',
    label: DEMO_XLSX_LABEL,
    origin: 'upload',
    files: [demoXlsxPath(dshHome)],
    readonly: true,
  }
}

function packagedDemoPath(): string {
  return fileURLToPath(new URL('../../examples/demo.xlsx', import.meta.url))
}

export async function ensureDemoXlsx(dshHome: string): Promise<string> {
  const dest = demoXlsxPath(dshHome)
  try {
    await access(dest)
    return dest
  } catch {
    await mkdir(join(dshHome, DATA_MODE_DIR), { recursive: true })
    await copyFile(packagedDemoPath(), dest)
    return dest
  }
}

export function withDemoXlsx(sources: DataSourceRecord[], dshHome: string): DataSourceRecord[] {
  if (sources.some(source => source.id === DEMO_XLSX_ID)) return sources
  const sqliteAt = sources.findIndex(source => source.id === 'demo-sqlite')
  const demo = demoXlsxSource(dshHome)
  if (sqliteAt === -1) return [demo, ...sources]
  return [...sources.slice(0, sqliteAt + 1), demo, ...sources.slice(sqliteAt + 1)]
}
