import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { createHash, randomUUID } from 'node:crypto'
import type { QueryResult, TableInfo } from './data-source-types.ts'
import { sqlQuoteIdent, tableNameFromFile } from './sql-guard.ts'
import type { WorkspaceFile } from './workspace-files.ts'
import { DEFAULT_PREVIEW_LIMIT, MAX_PREVIEW_LIMIT, MAX_QUERY_LIMIT } from './paths.ts'
import { queryTabularSheets } from './sqlite-runtime.ts'

export interface XlsxSheet {
  name: string
  columns: string[]
  rows: unknown[][]
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50

function unzip(buffer: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  let eocd = -1
  const start = Math.max(0, buffer.length - 22 - 65535)
  for (let i = buffer.length - 22; i >= start; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('无法解析 Excel 文件（不是有效的 xlsx）')
  const count = buffer.readUInt16LE(eocd + 10)
  let central = buffer.readUInt32LE(eocd + 16)
  for (let n = 0; n < count; n += 1) {
    if (buffer.readUInt32LE(central) !== CENTRAL) throw new Error('无法解析 Excel 文件（zip 目录损坏）')
    const method = buffer.readUInt16LE(central + 10)
    const compSize = buffer.readUInt32LE(central + 20)
    const nameLen = buffer.readUInt16LE(central + 28)
    const extraLen = buffer.readUInt16LE(central + 30)
    const commentLen = buffer.readUInt16LE(central + 32)
    const localOff = buffer.readUInt32LE(central + 42)
    const name = buffer.subarray(central + 46, central + 46 + nameLen).toString('utf8')
    const localNameLen = buffer.readUInt16LE(localOff + 26)
    const localExtraLen = buffer.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + localNameLen + localExtraLen
    const compressed = buffer.subarray(dataStart, dataStart + compSize)
    let data: Buffer
    if (method === 0) data = Buffer.from(compressed)
    else if (method === 8) data = inflateRawSync(compressed)
    else throw new Error(`无法解析 Excel 文件（不支持的压缩方式 ${method}）`)
    if (!name.endsWith('/')) files.set(name.replace(/\\/g, '/'), data)
    central += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`))
  return match?.[1]
}

function colIndex(ref: string): number {
  const letters = /[A-Za-z]+/.exec(ref)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return Math.max(0, n - 1)
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (xml === undefined) return []
  const values: string[] = []
  for (const si of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const inner = si[1] ?? ''
    const texts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(match => decodeXml(match[1] ?? ''))
    values.push(texts.join(''))
  }
  return values
}

function parseSheetXml(xml: string, shared: string[]): { columns: string[]; rows: unknown[][] } {
  const grid = new Map<number, Map<number, unknown>>()
  let maxCol = -1
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowXml = rowMatch[1] ?? ''
    for (const cellMatch of rowXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const head = cellMatch[1] ?? ''
      const body = cellMatch[2] ?? ''
      const ref = attr(head, 'r') ?? ''
      const type = attr(head, 't') ?? ''
      const col = colIndex(ref)
      const row = Number(/(\d+)$/.exec(ref)?.[1] ?? '0')
      if (!Number.isFinite(row) || row < 1) continue
      let value: unknown = ''
      if (type === 'inlineStr' || type === 'str') {
        const text = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? ''
        value = decodeXml(text)
      } else if (type === 's') {
        const index = Number(/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '')
        value = shared[index] ?? ''
      } else if (type === 'b') {
        value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] === '1'
      } else {
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
        if (raw === undefined) value = ''
        else {
          const decoded = decodeXml(raw)
          const asNumber = Number(decoded)
          value = decoded !== '' && Number.isFinite(asNumber) ? asNumber : decoded
        }
      }
      if (!grid.has(row)) grid.set(row, new Map())
      grid.get(row)!.set(col, value)
      if (col > maxCol) maxCol = col
    }
  }
  const rowNumbers = [...grid.keys()].sort((a, b) => a - b)
  if (rowNumbers.length === 0 || maxCol < 0) return { columns: [], rows: [] }
  const headerRow = grid.get(rowNumbers[0]!) ?? new Map()
  const columns: string[] = []
  const used = new Set<string>()
  for (let col = 0; col <= maxCol; col += 1) {
    const raw = headerRow.get(col)
    const base = raw === undefined || raw === '' ? `col_${col + 1}` : String(raw)
    let name = base
    let index = 2
    while (used.has(name.toLowerCase())) {
      name = `${base}_${index}`
      index += 1
    }
    used.add(name.toLowerCase())
    columns.push(name)
  }
  const rows = rowNumbers.slice(1).map((rowNumber) => {
    const cells = grid.get(rowNumber) ?? new Map()
    return columns.map((_, col) => cells.get(col) ?? '')
  })
  return { columns, rows }
}

function workbookTarget(rels: string | undefined, rid: string): string | undefined {
  if (rels === undefined) return undefined
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const tag = match[1] ?? ''
    if (attr(tag, 'Id') !== rid) continue
    const target = attr(tag, 'Target')
    if (target === undefined) return undefined
    const normalized = target.replace(/^\//, '')
    return normalized.startsWith('xl/') ? normalized : `xl/${normalized.replace(/^\.\//, '')}`
  }
  return undefined
}

function safeSheetName(name: string, used: Set<string>): string {
  const cleaned = tableNameFromFile(name)
  let candidate = cleaned
  let index = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${cleaned}_${index}`
    index += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export async function readXlsxSheets(absPath: string): Promise<XlsxSheet[]> {
  const buffer = await readFile(absPath)
  const files = unzip(buffer)
  const workbook = files.get('xl/workbook.xml')?.toString('utf8')
  if (workbook === undefined) throw new Error('无法解析 Excel 文件（缺少 workbook）')
  const rels = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8')
  const shared = parseSharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8'))
  const used = new Set<string>()
  const sheets: XlsxSheet[] = []
  for (const match of workbook.matchAll(/<sheet\b([^>]*)(?:\/>|><\/sheet>)/g)) {
    const tag = match[1] ?? ''
    const rawName = attr(tag, 'name') ?? 'sheet'
    const rid = attr(tag, 'r:id') ?? attr(tag, 'id')
    const target = rid ? workbookTarget(rels, rid) : undefined
    const xml = target === undefined ? undefined : files.get(target)?.toString('utf8')
    if (xml === undefined) continue
    const parsed = parseSheetXml(xml, shared)
    sheets.push({ name: safeSheetName(rawName, used), columns: parsed.columns, rows: parsed.rows })
  }
  if (sheets.length === 0) throw new Error('这个 Excel 文件里没有可预览的工作表')
  return sheets
}

export async function loadXlsxTables(
  files: readonly WorkspaceFile[],
): Promise<{ tables: string[]; byName: Map<string, XlsxSheet> }> {
  const tables: string[] = []
  const byName = new Map<string, XlsxSheet>()
  const used = new Set<string>()
  for (const file of files) {
    if (file.kind !== 'xlsx') continue
    const sheets = await readXlsxSheets(file.absPath)
    for (const sheet of sheets) {
      const name = files.length === 1 ? sheet.name : safeSheetName(`${tableNameFromFile(file.relPath)}_${sheet.name}`, used)
      used.add(name.toLowerCase())
      tables.push(name)
      byName.set(name, { ...sheet, name })
    }
  }
  return { tables, byName }
}

export function describeXlsxTable(sheet: XlsxSheet): TableInfo {
  return {
    name: sheet.name,
    columns: sheet.columns.map(name => ({ name, type: columnType(sheet, name) })),
  }
}

function columnType(sheet: XlsxSheet, name: string): string {
  const index = sheet.columns.indexOf(name)
  const values = sheet.rows.map(row => row[index]).filter(value => value !== '' && value !== null && value !== undefined)
  if (values.length > 0 && values.every(value => typeof value === 'number')) return 'NUMBER'
  return 'TEXT'
}

export async function inspectXlsxFiles(
  files: readonly WorkspaceFile[],
  table?: string,
  limit?: number,
): Promise<{ tables: string[]; preview?: QueryResult & { table: string } }> {
  const { tables, byName } = await loadXlsxTables(files)
  const chosen = table === undefined || table === ''
    ? tables[0]
    : tables.find(name => name.toLowerCase() === table.toLowerCase())
  if (chosen === undefined) return { tables }
  const sheet = byName.get(chosen)
  if (sheet === undefined) return { tables }
  const capped = Math.min(Math.max(1, Math.floor(limit || DEFAULT_PREVIEW_LIMIT)), MAX_PREVIEW_LIMIT)
  const rows = sheet.rows.slice(0, capped).map(row => sheet.columns.map((_, index) => row[index] ?? null))
  return {
    tables,
    preview: {
      table: chosen,
      columns: sheet.columns,
      rows,
      rowCount: rows.length,
      sql: `SELECT * FROM ${sqlQuoteIdent(chosen)} LIMIT ${capped}`,
    },
  }
}

export async function queryXlsxFiles(files: readonly WorkspaceFile[], sql: string): Promise<QueryResult> {
  const { byName } = await loadXlsxTables(files)
  return queryTabularSheets([...byName.values()], sql)
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export async function materializeXlsxCsvs(file: WorkspaceFile): Promise<WorkspaceFile[]> {
  const sheets = await readXlsxSheets(file.absPath)
  const stamp = createHash('sha1').update(file.absPath).digest('hex').slice(0, 12)
  const dir = join(tmpdir(), 'dsh-data-xlsx', stamp, randomUUID())
  await mkdir(dir, { recursive: true })
  const out: WorkspaceFile[] = []
  for (const sheet of sheets) {
    const relPath = `${sheet.name}.csv`
    const absPath = join(dir, relPath)
    const lines = [
      sheet.columns.map(csvCell).join(','),
      ...sheet.rows.slice(0, MAX_QUERY_LIMIT).map(row => sheet.columns.map((_, index) => csvCell(row[index])).join(',')),
    ]
    await writeFile(absPath, `${lines.join('\n')}\n`, 'utf8')
    out.push({ absPath, relPath: `${file.relPath.replace(/\.xlsx$/i, '')}/${relPath}`, kind: 'csv' })
  }
  return out
}
