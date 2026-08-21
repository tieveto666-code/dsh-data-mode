import { describe, expect, it } from 'vitest'
import {
  formatBindings,
  getDescribed,
  isDescribed,
  markDescribed,
  sessionKeyFromAgent,
  setBindings,
} from '../src/session-state.ts'

describe('session-state', () => {
  it('keys described tables and bindings per session', () => {
    const a = sessionKeyFromAgent({ sessionId: 'session-a' })
    const b = sessionKeyFromAgent({ sessionId: 'session-b' })
    expect(sessionKeyFromAgent({ id: 'live-id' })).toBe('session:live-id')
    expect(sessionKeyFromAgent({ session: { id: 'from-session' } })).toBe('session:from-session')
    markDescribed(a, 'sales')
    setBindings(a, { metric: 'GMV', analysisKind: 'metric' })
    expect(isDescribed(a, 'sales')).toBe(true)
    expect(isDescribed(b, 'sales')).toBe(false)
    expect(getDescribed(b).size).toBe(0)
    expect(formatBindings(a)).toContain('GMV')
    expect(formatBindings(b)).toBe('')
  })
})
