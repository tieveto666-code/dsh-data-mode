import type { Context } from '@deepseek-ai/cordis'
import { readSelectedSourceIdSync } from './catalog/selection.ts'
import { formatRecalledKnowledge, recallKnowledge, userQueryFromAgent } from './knowledge-recall.ts'
import { loadKnowledgeSync } from './knowledge-store.ts'
import { resolveDshHome } from './paths.ts'
import { formatBindings, sessionKeyFromAgent, setBindings } from './session-state.ts'

export const name = 'dsh-data-context'
export const inject = ['systemPrompt']

export function apply(ctx: Context) {
  ctx.systemPrompt.context({
    name: 'data-analysis-bindings',
    order: 50,
    text: assemble => {
      const agent = (assemble as { agent?: unknown }).agent ?? assemble.scope
      const key = sessionKeyFromAgent(agent)
      if (key === 'session:unknown') return ''
      const sessionId = key.slice('session:'.length)
      const dshHome = resolveDshHome()
      const selected = readSelectedSourceIdSync(dshHome, sessionId)
      setBindings(key, { sourceId: selected })
      if (!selected) {
        return 'No data source is selected. Data tools can only see the source the user selected in the composer data-source button. If list_data_sources returns no sources, ask them to select a database or file first. Do not mention or query demo-sqlite, demo-xlsx, or any other unselected catalog source.'
      }
      const parts = [formatBindings(key)]
      const query = userQueryFromAgent(agent)
      const recalled = recallKnowledge(query, loadKnowledgeSync(dshHome, selected))
      const knowledge = formatRecalledKnowledge(recalled)
      if (knowledge !== '') parts.push(knowledge)
      return parts.filter(part => part !== '').join('\n\n')
    },
  })
}
