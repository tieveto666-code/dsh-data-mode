import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DataSourceKey } from './locales.ts'
import { addKnowledge, removeKnowledge, updateKnowledge } from './api.ts'
import type { KnowledgeEntry, SourceView } from './api.ts'
import { KNOWLEDGE_PAGE_SIZE, MAX_KNOWLEDGE_KEY, MAX_KNOWLEDGE_VALUE } from '../knowledge-limits.ts'
import { knowledgeWorkbook } from '../xlsx-workbook.ts'

const STYLE_ID = 'dsh-data-mode-knowledge'

const CSS = `
.dsh-ds-know{display:flex;flex-direction:column;flex:1;gap:12px;min-height:0;min-width:0}
.dsh-ds-know-head{display:flex;flex-direction:column;flex:none;gap:4px;min-width:0}
.dsh-ds-know-title{margin:0;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsh-ds-know-desc{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-ds-know-toolbar{display:flex;align-items:center;justify-content:space-between;flex:none;gap:12px;min-width:0}
.dsh-ds-know-search{position:relative;flex:1;min-width:0;max-width:280px}
.dsh-ds-know-search input{box-sizing:border-box;width:100%;height:32px;padding:0 32px 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px}
.dsh-ds-know-search input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent)}
.dsh-ds-know-search-btn{position:absolute;top:0;right:0;display:grid;place-items:center;width:32px;height:32px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-ds-know-tools{display:flex;flex:none;align-items:center;gap:8px}
.dsh-ds-know-batch{position:relative}
.dsh-ds-know-menu{position:absolute;z-index:40;top:calc(100% + 4px);right:0;min-width:132px;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent)}
.dsh-ds-know-menu button{display:block;width:100%;padding:8px 10px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.dsh-ds-know-menu button:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.dsh-ds-know-menu button:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-ds-know-table-wrap{flex:1;overflow:auto;min-width:0;min-height:0;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsh-ds-know-table{width:100%;border-collapse:collapse;table-layout:fixed}
.dsh-ds-know-table th,.dsh-ds-know-table td{padding:10px 12px;border-bottom:1px solid var(--dsw-alias-border-l2);text-align:left;vertical-align:middle;font-size:13px;line-height:20px}
.dsh-ds-know-table thead th{position:sticky;top:0;z-index:1;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-weight:600;vertical-align:middle}
.dsh-ds-know-table tbody tr:last-child td{border-bottom:none}
.dsh-ds-know-table tbody tr:hover td{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 5%,transparent)}
.dsh-ds-know-check{width:44px}
.dsh-ds-know-name{width:28%}
.dsh-ds-know-desc-col{width:auto}
.dsh-ds-know-ops{width:100px}
.dsh-ds-know-cell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}
.dsh-ds-know-hlabel{display:inline-flex;align-items:center;gap:4px}
.dsh-ds-know-info{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1px solid currentColor;border-radius:999px;font-size:10px;line-height:12px;opacity:.7}
.dsh-ds-know-field{display:flex;flex-direction:column;align-items:stretch;gap:4px;width:100%;min-width:0}
.dsh-ds-know-field input{box-sizing:border-box;width:100%;height:32px;margin:0;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px}
.dsh-ds-know-field input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent)}
.dsh-ds-know-count{align-self:flex-end;font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-ds-know-links{display:flex;align-items:center;gap:12px;white-space:nowrap}
.dsh-ds-know-link{border:none;padding:0;background:transparent;color:var(--dsw-alias-state-business-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer}
.dsh-ds-know-link:hover:not(:disabled){text-decoration:underline}
.dsh-ds-know-link:disabled{opacity:.5;cursor:default}
.dsh-ds-know-empty{margin:0;padding:28px 16px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;text-align:center}
.dsh-ds-know-foot{display:flex;align-items:center;justify-content:space-between;flex:none;gap:12px;min-width:0;padding:2px 2px 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-ds-know-foot-left{display:flex;align-items:center;gap:8px}
.dsh-ds-know-pager{display:flex;align-items:center;gap:8px}
.dsh-ds-know-page{min-width:28px;height:24px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);font-size:12px;line-height:22px;text-align:center}
.dsh-ds-know-page-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);cursor:pointer}
.dsh-ds-know-page-btn:disabled{opacity:.45;cursor:default}
`

function ensureStyle(): void {
  if (typeof document === 'undefined') return
  const existing = document.getElementById(STYLE_ID)
  if (existing) {
    existing.textContent = CSS
    return
  }
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

function SearchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function exportEntries(label: string, entries: readonly KnowledgeEntry[]): void {
  const bytes = knowledgeWorkbook(entries)
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${label}-知识.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function KnowledgePanel({
  source, entries, busy, locked, sessionId, workspaceId, t, onEntries, onBusy, onError,
}: {
  source: SourceView
  entries: KnowledgeEntry[]
  busy: boolean
  locked: boolean
  sessionId: string
  workspaceId?: string
  t: (key: DataSourceKey, vars?: Record<string, string>) => string
  onEntries: (entries: KnowledgeEntry[]) => void
  onBusy: (busy: boolean) => void
  onError: (message: string | null) => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const batchRef = useRef<HTMLDivElement>(null)

  useEffect(() => { ensureStyle() }, [])

  useEffect(() => {
    setQuery('')
    setPage(1)
    setSelected([])
    setAdding(false)
    setEditingId(null)
    setDraftKey('')
    setDraftValue('')
    setBatchOpen(false)
  }, [source.id])

  useEffect(() => {
    if (selected.length === 0) setBatchOpen(false)
  }, [selected.length])

  useEffect(() => {
    if (!batchOpen) return
    const onDoc = (event: MouseEvent) => {
      if (!batchRef.current?.contains(event.target as Node)) setBatchOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBatchOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [batchOpen])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') return entries
    return entries.filter(entry => entry.key.toLowerCase().includes(needle))
  }, [entries, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / KNOWLEDGE_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * KNOWLEDGE_PAGE_SIZE, currentPage * KNOWLEDGE_PAGE_SIZE)
  const pageIds = pageRows.map(entry => entry.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.includes(id))

  const resetDraft = (): void => {
    setAdding(false)
    setEditingId(null)
    setDraftKey('')
    setDraftValue('')
  }

  const run = (job: Promise<{ entries: KnowledgeEntry[] }>): void => {
    onBusy(true)
    onError(null)
    void job.then((next) => {
      onEntries(next.entries)
      setSelected(ids => ids.filter(id => next.entries.some(entry => entry.id === id)))
      resetDraft()
      onBusy(false)
    }, (reason: unknown) => {
      onBusy(false)
      onError(reason instanceof Error ? reason.message : t('error.knowledgeSave'))
    })
  }

  const onSave = (): void => {
    const payload = { sessionId, workspaceId, sourceId: source.id, key: draftKey, value: draftValue }
    run(editingId === null ? addKnowledge(payload) : updateKnowledge({ ...payload, id: editingId }))
  }

  const onStartAdd = (): void => {
    setEditingId(null)
    setDraftKey('')
    setDraftValue('')
    setAdding(true)
    setErrorSafe()
  }

  const setErrorSafe = (): void => { onError(null) }

  const onStartEdit = (entry: KnowledgeEntry): void => {
    setAdding(false)
    setEditingId(entry.id)
    setDraftKey(entry.key)
    setDraftValue(entry.value.replace(/[\r\n]+/g, ' '))
    onError(null)
  }

  const onDeleteOne = (entry: KnowledgeEntry): void => {
    run(removeKnowledge({ sessionId, workspaceId, sourceId: source.id, id: entry.id }))
  }

  const onBatchDelete = (): void => {
    setBatchOpen(false)
    if (selected.length === 0) return
    run(removeKnowledge({ sessionId, workspaceId, sourceId: source.id, ids: selected }))
  }

  const toggleOne = (id: string): void => {
    setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const togglePage = (): void => {
    setSelected(current => {
      if (allPageSelected) return current.filter(id => !pageIds.includes(id))
      return [...new Set([...current, ...pageIds])]
    })
  }

  const toggleAllFiltered = (): void => {
    const ids = filtered.map(entry => entry.id)
    const all = ids.length > 0 && ids.every(id => selected.includes(id))
    setSelected(all ? selected.filter(id => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }

  const draftRow = (key: string) => (
    <tr key={key}>
      <td className="dsh-ds-know-check"><input type="checkbox" disabled /></td>
      <td>
        <div className="dsh-ds-know-field">
          <input
            value={draftKey}
            maxLength={MAX_KNOWLEDGE_KEY}
            placeholder={t('placeholder.knowledgeKey')}
            disabled={busy || locked}
            onChange={event => { setDraftKey(event.target.value.replace(/[\r\n]/g, '').slice(0, MAX_KNOWLEDGE_KEY)) }}
          />
          <span className="dsh-ds-know-count">{draftKey.length}/{MAX_KNOWLEDGE_KEY}</span>
        </div>
      </td>
      <td>
        <div className="dsh-ds-know-field">
          <input
            value={draftValue}
            maxLength={MAX_KNOWLEDGE_VALUE}
            placeholder={t('placeholder.knowledgeValue')}
            disabled={busy || locked}
            onChange={event => { setDraftValue(event.target.value.replace(/[\r\n]/g, '').slice(0, MAX_KNOWLEDGE_VALUE)) }}
          />
          <span className="dsh-ds-know-count">{draftValue.length}/{MAX_KNOWLEDGE_VALUE}</span>
        </div>
      </td>
      <td>
        <div className="dsh-ds-know-links">
          <button type="button" className="dsh-ds-know-link" disabled={busy || locked} onClick={onSave}>{t('knowledge.save')}</button>
          <button type="button" className="dsh-ds-know-link" disabled={busy} onClick={resetDraft}>{t('knowledge.cancel')}</button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="dsh-ds-know">
      <div className="dsh-ds-know-head">
        <p className="dsh-ds-know-title">{t('knowledge.title', { name: source.label })}</p>
        <p className="dsh-ds-know-desc">{t('knowledge.hint')}</p>
      </div>
      <div className="dsh-ds-know-toolbar">
        <div className="dsh-ds-know-search">
          <input
            value={query}
            placeholder={t('knowledge.search')}
            onChange={event => {
              setQuery(event.target.value)
              setPage(1)
            }}
          />
          <button type="button" className="dsh-ds-know-search-btn" aria-label={t('knowledge.search')} onClick={() => { setPage(1) }}>
            <SearchGlyph />
          </button>
        </div>
        <div className="dsh-ds-know-tools">
          <Button variant="outline" size="sm" disabled={busy || entries.length === 0} onClick={() => { exportEntries(source.label, entries) }}>
            {t('knowledge.export')}
          </Button>
          <div className="dsh-ds-know-batch" ref={batchRef}>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || locked || selected.length === 0}
              onClick={() => { setBatchOpen(open => !open) }}
            >
              {t('knowledge.batch')}
            </Button>
            {batchOpen && (
              <div className="dsh-ds-know-menu">
                <button type="button" disabled={busy || locked || selected.length === 0} onClick={onBatchDelete}>
                  {t('knowledge.batchDelete')}
                </button>
              </div>
            )}
          </div>
          <Button variant="primary" size="sm" disabled={busy || locked || adding} onClick={onStartAdd}>
            {t('knowledge.create')}
          </Button>
        </div>
      </div>
      <div className="dsh-ds-know-table-wrap">
        <table className="dsh-ds-know-table">
          <colgroup>
            <col className="dsh-ds-know-check" />
            <col className="dsh-ds-know-name" />
            <col className="dsh-ds-know-desc-col" />
            <col className="dsh-ds-know-ops" />
          </colgroup>
          <thead>
            <tr>
              <th className="dsh-ds-know-check">
                <input type="checkbox" checked={allPageSelected} disabled={pageIds.length === 0} onChange={togglePage} />
              </th>
              <th className="dsh-ds-know-name">{t('knowledge.name')}</th>
              <th className="dsh-ds-know-desc-col">
                <span className="dsh-ds-know-hlabel">
                  {t('knowledge.description')}
                  <Tooltip label={t('knowledge.descriptionTip')} side="top" delayMs={300}>
                    <span className="dsh-ds-know-info" aria-label={t('knowledge.descriptionTip')}>i</span>
                  </Tooltip>
                </span>
              </th>
              <th className="dsh-ds-know-ops">{t('knowledge.ops')}</th>
            </tr>
          </thead>
          <tbody>
            {adding && draftRow('draft')}
            {pageRows.length === 0 && !adding
              ? (
                <tr>
                  <td colSpan={4}><p className="dsh-ds-know-empty">{query.trim() === '' ? t('knowledge.empty') : t('knowledge.emptySearch')}</p></td>
                </tr>
              )
              : pageRows.map(entry => (
                editingId === entry.id
                  ? draftRow(entry.id)
                  : (
                    <tr key={entry.id}>
                      <td className="dsh-ds-know-check">
                        <input type="checkbox" checked={selected.includes(entry.id)} onChange={() => { toggleOne(entry.id) }} />
                      </td>
                      <td><div className="dsh-ds-know-cell" title={entry.key}>{entry.key}</div></td>
                      <td><div className="dsh-ds-know-cell" title={entry.value}>{entry.value}</div></td>
                      <td>
                        <div className="dsh-ds-know-links">
                          <button type="button" className="dsh-ds-know-link" disabled={busy || locked} onClick={() => { onStartEdit(entry) }}>{t('knowledge.edit')}</button>
                          <button type="button" className="dsh-ds-know-link" disabled={busy || locked} onClick={() => { onDeleteOne(entry) }}>{t('action.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  )
              ))}
          </tbody>
        </table>
      </div>
      <div className="dsh-ds-know-foot">
        <label className="dsh-ds-know-foot-left">
          <input type="checkbox" checked={filtered.length > 0 && filtered.every(entry => selected.includes(entry.id))} disabled={filtered.length === 0} onChange={toggleAllFiltered} />
          {t('knowledge.selectAll')}
          <span>{t('knowledge.selected', { count: String(selected.length) })}</span>
        </label>
        <div className="dsh-ds-know-pager">
          <button type="button" className="dsh-ds-know-page-btn" disabled={currentPage <= 1} onClick={() => { setPage(currentPage - 1) }} aria-label={t('knowledge.prev')}>‹</button>
          <span className="dsh-ds-know-page">{currentPage}</span>
          <button type="button" className="dsh-ds-know-page-btn" disabled={currentPage >= pageCount} onClick={() => { setPage(currentPage + 1) }} aria-label={t('knowledge.next')}>›</button>
          <span>{t('knowledge.pageSize')}</span>
        </div>
      </div>
    </div>
  )
}
