import { describe, expect, it } from 'vitest'
import {
  formatRecalledKnowledge, recallKnowledge, tokenize, userQueryFromAgent,
} from '../src/knowledge-recall.ts'
import type { KnowledgeEntry } from '../src/knowledge-store.ts'

const entries: KnowledgeEntry[] = [
  { id: '1', key: '主营业务收入', value: '主营业务收入=联网通信主营业务收入+算网数智主营业务收入' },
  { id: '2', key: '主营业务收入', value: '主营业务收入指的是中国联通全量的收入合集' },
  { id: '3', key: '键盘价格', value: '键盘单价' },
  { id: '4', key: '净利润', value: '利润总额-所得税' },
]

describe('knowledge recall', () => {
  it('tokenizes CJK unigrams, bigrams, and latin words', () => {
    const tokens = tokenize('主营业务收入 GMV')
    expect(tokens).toContain('主营')
    expect(tokens).toContain('收入')
    expect(tokens).toContain('gmv')
  })

  it('recalls every value under a key contained in the question', () => {
    const hits = recallKnowledge('今年主营业务收入是多少', entries)
    expect(hits.map(entry => entry.id).sort()).toEqual(['1', '2'])
  })

  it('does not recall unrelated keys', () => {
    const hits = recallKnowledge('笔记本比键盘多多少', entries)
    expect(hits.map(entry => entry.key)).toEqual(['键盘价格'])
    expect(hits.some(entry => entry.key === '主营业务收入')).toBe(false)
  })

  it('returns nothing for an empty query or off-topic question', () => {
    expect(recallKnowledge('', entries)).toEqual([])
    expect(recallKnowledge('今天天气怎么样', entries)).toEqual([])
  })

  it('formats recalled knowledge for the model', () => {
    const text = formatRecalledKnowledge(entries.slice(0, 2))
    expect(text).toContain('BM25')
    expect(text).toContain('主营业务收入=联网通信主营业务收入+算网数智主营业务收入')
    expect(text).toContain('中国联通全量的收入合集')
  })

  it('reads the current question from an inbox splice before user/message exists', () => {
    const query = userQueryFromAgent({
      session: {
        events: [
          {
            type: 'agent/inbox/spliced',
            data: { inserted: [{ content: [{ type: 'text', text: '主营业务收入同比？' }] }] },
          },
          { type: 'turn/start', data: { turn: 1 } },
          { type: 'agent/inbox/spliced', data: { inserted: [] } },
        ],
      },
    })
    expect(query).toBe('主营业务收入同比？')
  })
})
