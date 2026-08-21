import { PRESET_ID } from './isolation-contract.ts'

export { PRESET_ID }

export const DATA_MODE_ONLY = '仅数据模式可以使用数据源'

/** Newest `agent-preset/selected` wins; otherwise the creation header. */
export function resolvePresetFromSession(session: unknown): string | undefined {
  if (typeof session !== 'object' || session === null) return undefined
  const rec = session as {
    header?: { agentPreset?: unknown }
    events?: Array<{ type?: unknown; data?: { agentPreset?: unknown } }>
  }
  const events = Array.isArray(rec.events) ? rec.events : []
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type === 'agent-preset/selected' && typeof event.data?.agentPreset === 'string') {
      return event.data.agentPreset
    }
  }
  return typeof rec.header?.agentPreset === 'string' ? rec.header.agentPreset : undefined
}

export function isDataModePreset(preset: string | undefined): boolean {
  return preset === PRESET_ID
}

export function resolveLivePreset(
  getSession: ((id: string) => unknown) | undefined,
  sessionId: string,
): string | undefined {
  if (sessionId === '' || getSession === undefined) return undefined
  return resolvePresetFromSession(getSession(sessionId))
}
