import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DataSourceChip } from './DataSourceChip.tsx'
import { en, zh, type DataSourceKey } from './locales.ts'

export type { DataSourceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    dataSource: DataSourceKey
  }
}

const NS = 'dataSource'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-data-mode: dictionaries')
  ctx.slots.inject('conversation.input.datasource', () => ctx.slots.register({
    name: 'conversation.input.datasource',
    locale: NS,
  }, DataSourceChip))
}
