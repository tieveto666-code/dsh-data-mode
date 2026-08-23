import { createElement, useEffect, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DataSourceChip, type DataSourceChipProps } from './DataSourceChip.tsx'
import { en, zh, type DataSourceKey } from './locales.ts'

export type { DataSourceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    dataSource: DataSourceKey
  }
}

const NS = 'dataSource'
const LEFT_ENTRY_ID = 'dsh-data-source'

/**
 * Hosts that declare `conversation.input.datasource` (custom / patched dsh)
 * get the dedicated seat. Official dsh does not declare that seat, so we also
 * occupy the stock `conversation.input.left` list. When the dedicated seat is
 * live, the left fallback renders nothing to avoid two buttons.
 */
let dedicatedSeatLive = false
const dedicatedSeatListeners = new Set<() => void>()

function setDedicatedSeatLive(next: boolean): void {
  dedicatedSeatLive = next
  for (const listener of dedicatedSeatListeners) listener()
}

function asDisposer(value: unknown): () => void {
  return typeof value === 'function' ? () => { (value as () => void)() } : () => undefined
}

function DataSourceChipOnLeft(props: DataSourceChipProps) {
  const [hide, setHide] = useState(dedicatedSeatLive)
  useEffect(() => {
    const sync = (): void => { setHide(dedicatedSeatLive) }
    dedicatedSeatListeners.add(sync)
    sync()
    return () => { dedicatedSeatListeners.delete(sync) }
  }, [])
  if (hide) return null
  return createElement(DataSourceChip, props)
}

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-data-mode: dictionaries')

  ctx.slots.inject('conversation.input.datasource', () => {
    setDedicatedSeatLive(true)
    const stop = ctx.slots.register({
      name: 'conversation.input.datasource',
      locale: NS,
    }, DataSourceChip)
    return () => {
      setDedicatedSeatLive(false)
      asDisposer(stop)()
    }
  })

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: LEFT_ENTRY_ID,
    order: -20,
    locale: NS,
  }, DataSourceChipOnLeft))
}
