import { readdir } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'lib', 'coverage', '.next', '.turbo'])

export type WorkspaceFileKind = 'csv' | 'xlsx' | 'parquet'

export interface WorkspaceFile {
  absPath: string
  relPath: string
  kind: WorkspaceFileKind
}

export function kindOf(filePath: string): WorkspaceFileKind | undefined {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.csv') return 'csv'
  if (ext === '.xlsx') return 'xlsx'
  if (ext === '.parquet') return 'parquet'
  return undefined
}

function globToMatcher(glob: string): { recursive: boolean; match: (relPath: string) => boolean } {
  const normalized = glob.replace(/\\/g, '/').replace(/^\.\//, '')
  const lower = normalized.toLowerCase()
  if (lower === '*.csv') {
    return { recursive: false, match: rel => !rel.includes('/') && rel.toLowerCase().endsWith('.csv') }
  }
  if (lower === '*.xlsx') {
    return { recursive: false, match: rel => !rel.includes('/') && rel.toLowerCase().endsWith('.xlsx') }
  }
  if (lower === '*.parquet') {
    return { recursive: false, match: rel => !rel.includes('/') && rel.toLowerCase().endsWith('.parquet') }
  }
  if (lower === '**/*.csv' || lower.endsWith('/**/*.csv')) {
    return { recursive: true, match: rel => rel.toLowerCase().endsWith('.csv') }
  }
  if (lower === '**/*.xlsx' || lower.endsWith('/**/*.xlsx')) {
    return { recursive: true, match: rel => rel.toLowerCase().endsWith('.xlsx') }
  }
  if (lower === '**/*.parquet' || lower.endsWith('/**/*.parquet')) {
    return { recursive: true, match: rel => rel.toLowerCase().endsWith('.parquet') }
  }
  return {
    recursive: normalized.includes('/'),
    match: rel => rel === normalized || rel.endsWith(`/${normalized}`) || rel.toLowerCase() === lower,
  }
}

async function walk(
  dir: string,
  recursive: boolean,
  onFile: (absPath: string) => void | Promise<void>,
): Promise<void> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!recursive || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      await walk(abs, true, onFile)
      continue
    }
    if (entry.isFile()) await onFile(abs)
  }
}

export function explicitFiles(workspaceRoot: string, relPaths: readonly string[]): WorkspaceFile[] {
  const files: WorkspaceFile[] = []
  for (const rel of relPaths) {
    const relPath = rel.replace(/\\/g, '/').replace(/^\.\//, '')
    if (relPath === '' || relPath.includes('..')) continue
    const kind = kindOf(relPath)
    if (kind === undefined) continue
    files.push({ absPath: join(workspaceRoot, relPath), relPath, kind })
  }
  return files
}

export async function findWorkspaceFiles(
  workspaceRoot: string,
  globs: readonly string[],
  maxFiles: number,
): Promise<WorkspaceFile[]> {
  const files = new Map<string, WorkspaceFile>()
  for (const glob of globs) {
    if (files.size >= maxFiles) break
    const matcher = globToMatcher(glob)
    await walk(workspaceRoot, matcher.recursive, absPath => {
      if (files.size >= maxFiles) return
      const relPath = relative(workspaceRoot, absPath).replace(/\\/g, '/')
      const kind = kindOf(absPath)
      if (kind === undefined || !matcher.match(relPath)) return
      files.set(absPath, { absPath, relPath, kind })
    })
  }
  return [...files.values()].slice(0, maxFiles)
}
