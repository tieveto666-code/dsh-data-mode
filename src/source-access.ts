import { readSelectedSourceIdSync } from './catalog/selection.ts'
import { resolveDshHome } from './paths.ts'
import { sessionIdFromAgent } from './session-state.ts'

export { sessionIdFromAgent }

export const NO_SOURCE_SELECTED =
  '还没有选中数据源。请先在输入框左侧的数据源按钮里选择一个数据库或数据文件。'

export function selectedSourceIdOf(sessionId: string): string | undefined {
  if (sessionId === '') return undefined
  return readSelectedSourceIdSync(resolveDshHome(), sessionId)
}

export function sourceNotSelectedMessage(sourceId: string, selectedId: string): string {
  return `数据源 "${sourceId}" 未选中，当前只能访问已选中的 "${selectedId}"。`
}

export function assertSourceVisible(sessionId: string, sourceId: string): void {
  const selected = selectedSourceIdOf(sessionId)
  if (selected === undefined) throw new Error(NO_SOURCE_SELECTED)
  if (selected !== sourceId) throw new Error(sourceNotSelectedMessage(sourceId, selected))
}

export function visibleListPayload<T extends { id: string }>(
  sources: readonly T[],
  selectedSourceId: string | undefined,
): { sources: T[]; selectedSourceId?: string } {
  if (selectedSourceId === undefined) return { sources: [] }
  const visible = sources.filter(source => source.id === selectedSourceId)
  if (visible.length === 0) return { sources: [] }
  return { sources: visible, selectedSourceId }
}
