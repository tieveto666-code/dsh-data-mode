import { useEffect, useRef, useState } from 'react'
import { Button, Input, Modal, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DataSourceKey } from './locales.ts'
import {
  connectDatabase, fetchKnowledge, fetchPreview, fetchState, fileToBase64, removeSource, selectSource, uploadTable,
} from './api.ts'
import type { EngineId, KnowledgeEntry, PreviewPayload, SourceState, SourceView } from './api.ts'
import { KnowledgePanel } from './KnowledgePanel.tsx'

const PRESET_ID = 'dsh-data'
const STYLE_ID = 'dsh-data-mode-datasource'

const CSS = `
.dsh-ds-trigger{display:grid;place-items:center;flex:none;width:28px;height:28px;border:none;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color 120ms ease,color 120ms ease,box-shadow 120ms ease}
.dsh-ds-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-ds-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3);outline:none}
.dsh-ds-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-ds-trigger.is-on{color:#fff;background:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 32%,transparent)}
.dsh-ds-trigger.is-on:hover:not(:disabled){color:#fff;background:var(--dsw-alias-state-business-primary);filter:brightness(1.06)}
.dsh-ds-dialog{box-sizing:border-box;width:min(960px,calc(100vw - 32px))!important;height:min(500px,calc(100vh - 48px))!important;max-width:min(960px,calc(100vw - 32px))!important;max-height:min(500px,calc(100vh - 48px))!important;padding-bottom:0!important;gap:0!important}
.dsh-ds-chrome{display:flex;flex-direction:column;min-width:0;height:100%;max-height:100%;min-height:0}
.dsh-ds-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}
.dsh-ds-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsh-ds-back{display:inline-flex;align-items:center;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px;cursor:pointer}
.dsh-ds-back:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-state-business-primary)}
.dsh-ds-close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-ds-close:hover:not(:disabled){border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-ds-body{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow:auto;padding:8px 24px 20px}
.dsh-ds-footer{display:flex;justify-content:flex-end;flex:none;gap:8px;padding:0 24px 24px}
.dsh-ds-home{display:flex;flex-direction:column;flex:1;gap:12px;min-width:0;min-height:0}
.dsh-ds-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}
.dsh-ds-tabs{display:flex;flex:none;align-items:center;justify-content:flex-start;gap:10px}
.dsh-ds-tab{appearance:none;-webkit-appearance:none;box-sizing:border-box;flex:none;height:32px;padding:0 14px;border:1px solid color-mix(in srgb,var(--dsw-alias-label-primary) 42%,transparent)!important;border-radius:8px;background:var(--dsw-alias-bg-base,#fff)!important;box-shadow:0 1px 0 color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px;cursor:pointer;transition:background-color 120ms ease,border-color 120ms ease,box-shadow 120ms ease,color 120ms ease}
.dsh-ds-tab:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary)!important;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,var(--dsw-alias-bg-base,#fff))!important;color:var(--dsw-alias-state-business-primary)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 28%,transparent)}
.dsh-ds-tab.is-on{border-color:var(--dsw-alias-state-business-primary)!important;background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,var(--dsw-alias-bg-base,#fff))!important;color:var(--dsw-alias-state-business-primary)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent)}
.dsh-ds-tab.is-on:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 24%,var(--dsw-alias-bg-base,#fff))!important}
.dsh-ds-hint{margin:0;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsh-ds-empty{margin:0;padding:28px 16px;border:1px dashed var(--dsw-alias-border-l2);border-radius:14px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);text-align:center}
.dsh-ds-list{display:flex;flex-direction:column;flex:1;min-width:0;min-height:0;overflow-x:hidden;overflow-y:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dsh-ds-row{display:grid;grid-template-columns:minmax(0,1fr) max-content;align-items:center;column-gap:16px;width:100%;min-width:0;box-sizing:border-box;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-ds-row:last-child{border-bottom:none}
.dsh-ds-row.is-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 6%,transparent);box-shadow:inset 2px 0 0 var(--dsw-alias-state-business-primary)}
.dsh-ds-row-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-ds-row-title{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-ds-row-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary)}
.dsh-ds-row-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.dsh-ds-badge{flex:none;height:20px;padding:0 7px;border-radius:999px;background:var(--dsw-alias-state-business-primary);color:#fff;font-size:11px;font-weight:500;line-height:20px}
.dsh-ds-actions{display:flex;flex-shrink:0;align-items:center;gap:6px;white-space:nowrap}
.dsh-ds-form{display:flex;flex-direction:column;flex:1;gap:10px;min-height:0;overflow:auto}
.dsh-ds-engines{display:flex;gap:8px}
.dsh-ds-engine{height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;cursor:pointer}
.dsh-ds-engine:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary)}
.dsh-ds-engine.is-on{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,var(--dsw-alias-bg-layer-2))}
.dsh-ds-field{display:flex;flex-direction:column;gap:4px}
.dsh-ds-label{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-ds-error{margin:0 0 12px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dsh-ds-file{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-ds-check{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--dsw-alias-label-secondary)}
.dsh-ds-preview{display:flex;flex-direction:column;flex:1;gap:12px;min-height:0}
.dsh-ds-preview-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;min-width:0}
.dsh-ds-preview-kicker{margin:0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.dsh-ds-preview-meta{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-ds-select{position:relative;min-width:180px}
.dsh-ds-select-btn{appearance:none;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;height:32px;padding:0 10px 0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;cursor:pointer}
.dsh-ds-select-btn:hover:not(:disabled){border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,var(--dsw-alias-bg-base,#fff))}
.dsh-ds-select-btn:disabled{opacity:.6;cursor:default}
.dsh-ds-select-btn.is-open{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent)}
.dsh-ds-select-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-ds-select-caret{flex:none;width:10px;height:10px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px)}
.dsh-ds-select-menu{position:absolute;z-index:30;top:calc(100% + 4px);right:0;left:0;max-height:240px;overflow:auto;padding:4px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base,#fff);box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent)}
.dsh-ds-select-option{display:block;width:100%;padding:8px 10px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:18px;text-align:left;cursor:pointer}
.dsh-ds-select-option:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-state-business-primary)}
.dsh-ds-select-option.is-on{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 16%,transparent);color:var(--dsw-alias-state-business-primary);font-weight:500}
.dsh-ds-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;min-height:148px;padding:20px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-ds-drop:hover,.dsh-ds-drop.is-over{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-state-business-primary)}
.dsh-ds-drop-title{margin:0;font-size:13px;font-weight:500;line-height:20px;color:inherit}
.dsh-ds-drop-hint{margin:0;font-size:12px;line-height:18px;opacity:.8}
.dsh-ds-table-wrap{flex:1;min-height:0;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:12px}
.dsh-ds-table{width:max-content;min-width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;line-height:18px}
.dsh-ds-table th,.dsh-ds-table td{padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-ds-table th{position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-weight:600}
.dsh-ds-table td{color:var(--dsw-alias-label-primary)}
.dsh-ds-dialog button:hover:not(:disabled){cursor:pointer}
.dsh-ds-actions button:hover:not(:disabled),
.dsh-ds-toolbar button:hover:not(:disabled),
.dsh-ds-footer button:hover:not(:disabled),
.dsh-ds-form button:hover:not(:disabled){box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary) 22%,transparent)}
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

function DatabaseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <ellipse cx="8" cy="3.6" rx="5.2" ry="2.1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.8 3.6v8.2c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1V3.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2.8 7.7c0 1.16 2.33 2.1 5.2 2.1s5.2-.94 5.2-2.1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

type Tab = 'database' | 'files'
type Panel = 'home' | 'connect' | 'upload' | 'preview' | 'knowledge'

export type DataSourceChipProps =
  PropsRuntime<'conversation.input.datasource'>
  & PropsLocale<'dataSource'>

function workspaceIdOf(
  useWorkspaces: DataSourceChipProps['useWorkspaces'],
  sessionId: string,
): string | undefined {
  return useWorkspaces(state => {
    const items = (state as { items?: Array<{ workspaceId?: string; sessionIds?: string[] }> }).items ?? []
    return items.find(item => item.sessionIds?.includes(sessionId))?.workspaceId
  })
}

function typeKey(source: SourceView): DataSourceKey {
  if (source.type === 'postgres') return 'type.postgres'
  if (source.type === 'mysql') return 'type.mysql'
  if (source.type === 'sqlite') return 'type.sqlite'
  return 'type.files'
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isUploadFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return name.endsWith('.csv') || name.endsWith('.xlsx')
}

function TableSelect({
  value, options, disabled, label, onChange,
}: {
  value: string
  options: string[]
  disabled?: boolean
  label: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="dsh-ds-field" ref={rootRef}>
      <span className="dsh-ds-label">{label}</span>
      <div className="dsh-ds-select">
        <button
          type="button"
          className={`dsh-ds-select-btn${open ? ' is-open' : ''}`}
          disabled={disabled || options.length === 0}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => { setOpen(next => !next) }}
        >
          <span className="dsh-ds-select-value">{value || options[0] || ''}</span>
          <span className="dsh-ds-select-caret" aria-hidden />
        </button>
        {open && (
          <div className="dsh-ds-select-menu" role="listbox">
            {options.map(name => (
              <button
                key={name}
                type="button"
                role="option"
                aria-selected={name === value}
                className={`dsh-ds-select-option${name === value ? ' is-on' : ''}`}
                onClick={() => {
                  setOpen(false)
                  if (name !== value) onChange(name)
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function DataSourceChip({
  locked = false, sessionId, useSessions, useWorkspaces, t,
}: DataSourceChipProps) {
  const preset = useSessions(state => state.byId[sessionId]?.agentPreset)
  const workspaceId = workspaceIdOf(useWorkspaces, sessionId)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('database')
  const [panel, setPanel] = useState<Panel>('home')
  const [state, setState] = useState<SourceState>({ sources: [] })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [engine, setEngine] = useState<EngineId>('postgres')
  const [label, setLabel] = useState('')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('5432')
  const [database, setDatabase] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [sqlitePath, setSqlitePath] = useState('')
  const [ssl, setSsl] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [previewSource, setPreviewSource] = useState<SourceView | null>(null)
  const [preview, setPreview] = useState<PreviewPayload | null>(null)
  const [previewTable, setPreviewTable] = useState('')
  const previewAbort = useRef<AbortController | null>(null)
  const [knowledgeSource, setKnowledgeSource] = useState<SourceView | null>(null)
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([])

  useEffect(() => { ensureStyle() }, [])

  useEffect(() => {
    if (preset === PRESET_ID) return
    previewAbort.current?.abort()
    setOpen(false)
    setPanel('home')
    setError(null)
    setFile(null)
    setPreviewSource(null)
    setPreview(null)
    setKnowledgeSource(null)
    setKnowledgeEntries([])
  }, [preset])

  const load = (): void => {
    if (preset !== PRESET_ID) return
    void fetchState(sessionId, workspaceId).then((next) => {
      setState(next)
    }, (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t('error.load'))
    })
  }

  useEffect(() => {
    if (preset !== PRESET_ID) return
    load()
  }, [sessionId, workspaceId, preset])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, sessionId, workspaceId, preset])

  if (preset !== PRESET_ID) return null

  const selected = state.sources.find(source => source.selected)
  const databases = state.sources.filter(source => source.origin === 'database')
  const files = state.sources.filter(source => source.origin !== 'database')
  const listed = tab === 'database' ? databases : files
  const aria = selected ? t('trigger.ariaSelected', { name: selected.label }) : t('trigger.aria')

  const applyState = (next: SourceState, nextPanel: Panel = 'home'): void => {
    setState(next)
    setError(null)
    setPanel(nextPanel)
    setBusy(false)
  }

  const fail = (reason: unknown): void => {
    setBusy(false)
    setError(reason instanceof Error ? reason.message : String(reason))
  }

  const onSelect = (source: SourceView): void => {
    setBusy(true)
    void selectSource({
      sessionId,
      workspaceId,
      sourceId: source.selected ? null : source.id,
    }).then(next => applyState(next, 'home'), fail)
  }

  const onDelete = (source: SourceView): void => {
    setBusy(true)
    void removeSource({ sessionId, workspaceId, sourceId: source.id }).then(next => applyState(next, 'home'), fail)
  }

  const loadPreview = (source: SourceView, table?: string): void => {
    previewAbort.current?.abort()
    const abort = new AbortController()
    previewAbort.current = abort
    let timedOut = false
    const timer = window.setTimeout(() => {
      timedOut = true
      abort.abort()
    }, 20_000)
    setBusy(true)
    setError(null)
    void fetchPreview({ sourceId: source.id, sessionId, workspaceId, table, limit: 20, signal: abort.signal }).then((next) => {
      if (previewAbort.current !== abort) return
      setPreview(next)
      setPreviewTable(next.preview?.table ?? next.tables[0] ?? '')
      setBusy(false)
    }, (reason: unknown) => {
      if (previewAbort.current !== abort) return
      setBusy(false)
      if (abort.signal.aborted) {
        if (timedOut) setError(t('error.previewTimeout'))
        return
      }
      setError(reason instanceof Error ? reason.message : t('error.preview'))
    }).finally(() => {
      window.clearTimeout(timer)
    })
  }

  const onPreview = (source: SourceView): void => {
    setPreviewSource(source)
    setPreview(null)
    setPreviewTable('')
    setPanel('preview')
    loadPreview(source)
  }

  const loadKnowledgeList = (source: SourceView): void => {
    setBusy(true)
    setError(null)
    void fetchKnowledge({ sourceId: source.id, sessionId, workspaceId }).then((next) => {
      setKnowledgeEntries(next.entries)
      setBusy(false)
    }, (reason: unknown) => {
      setBusy(false)
      setError(reason instanceof Error ? reason.message : t('error.knowledge'))
    })
  }

  const onKnowledge = (source: SourceView): void => {
    setKnowledgeSource(source)
    setKnowledgeEntries([])
    setPanel('knowledge')
    loadKnowledgeList(source)
  }

  const onConnect = (): void => {
    setBusy(true)
    void connectDatabase({
      sessionId,
      workspaceId,
      engine,
      label: label || (engine === 'sqlite' ? sqlitePath : database),
      host,
      port: Number(port) || undefined,
      database,
      user,
      password,
      sqlitePath,
      ssl,
    }).then((next) => {
      setLabel('')
      setPassword('')
      setDatabase('')
      setSqlitePath('')
      setTab('database')
      applyState(next, 'home')
    }, fail)
  }

  const onUpload = (): void => {
    if (file === null) {
      setError(t('field.file'))
      return
    }
    setBusy(true)
    void fileToBase64(file).then(base64 => uploadTable({
      sessionId,
      workspaceId,
      filename: file.name,
      base64,
      label: label || file.name,
    })).then((next) => {
      setLabel('')
      setFile(null)
      setTab('files')
      applyState(next, 'home')
    }, fail)
  }

  const close = (): void => {
    previewAbort.current?.abort()
    setOpen(false)
    setPanel('home')
    setError(null)
    setFile(null)
    setPreviewSource(null)
    setPreview(null)
    setKnowledgeSource(null)
    setKnowledgeEntries([])
  }

  const goHome = (): void => {
    previewAbort.current?.abort()
    setPanel('home')
    setError(null)
    setPreviewSource(null)
    setPreview(null)
    setKnowledgeSource(null)
    setKnowledgeEntries([])
  }

  const sourceRow = (source: SourceView) => {
    const type = t(typeKey(source))
    const origin = source.origin === 'workspace' ? t('badge.workspace') : undefined
    const detail = source.detail ?? source.note
    const meta = [type, origin, detail].filter(Boolean).join(' · ')
    return (
      <div key={source.id} className={`dsh-ds-row${source.selected ? ' is-on' : ''}`}>
        <div className="dsh-ds-row-copy">
          <div className="dsh-ds-row-title">
            <span className="dsh-ds-row-name">{source.label}</span>
            {source.selected && <span className="dsh-ds-badge">{t('badge.selected')}</span>}
          </div>
          <span className="dsh-ds-row-meta">{meta}</span>
        </div>
        <div className="dsh-ds-actions">
          <Button variant="outline" size="sm" disabled={locked || busy} onClick={() => { onKnowledge(source) }}>{t('action.knowledge')}</Button>
          <Button variant="outline" size="sm" disabled={locked || busy} onClick={() => { onPreview(source) }}>{t('action.preview')}</Button>
          <Button variant={source.selected ? 'outline' : 'primary'} size="sm" disabled={locked || busy} onClick={() => { onSelect(source) }}>
            {source.selected ? t('action.deselect') : t('action.select')}
          </Button>
          {source.origin !== 'workspace' && source.id !== 'demo-sqlite' && source.id !== 'demo-xlsx' && (
            <Button variant="outline" size="sm" disabled={locked || busy} onClick={() => { onDelete(source) }}>{t('action.delete')}</Button>
          )}
        </div>
      </div>
    )
  }

  const home = (
    <div className="dsh-ds-home">
      <div className="dsh-ds-toolbar">
        <div className="dsh-ds-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'database'}
            className={`dsh-ds-tab${tab === 'database' ? ' is-on' : ''}`}
            onClick={() => { setTab('database'); setError(null) }}
          >
            {t('tab.database')} · {databases.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'files'}
            className={`dsh-ds-tab${tab === 'files' ? ' is-on' : ''}`}
            onClick={() => { setTab('files'); setError(null) }}
          >
            {t('tab.files')} · {files.length}
          </button>
        </div>
        {tab === 'database'
          ? <Button variant="primary" size="sm" disabled={locked || busy} onClick={() => { setPanel('connect'); setError(null) }}>{t('action.connect')}</Button>
          : <Button variant="primary" size="sm" disabled={locked || busy} onClick={() => { setPanel('upload'); setError(null) }}>{t('action.upload')}</Button>}
      </div>
      <p className="dsh-ds-hint">{tab === 'database' ? t('section.databaseHint') : t('section.filesHint')}</p>
      {listed.length === 0
        ? <p className="dsh-ds-empty">{tab === 'database' ? t('empty.database') : t('empty.files')}</p>
        : <div className="dsh-ds-list">{listed.map(sourceRow)}</div>}
    </div>
  )

  const previewRows = preview?.preview?.rows ?? []
  const previewColumns = preview?.preview?.columns ?? []
  const previewView = previewSource === null ? null : (
    <div className="dsh-ds-preview">
      <div className="dsh-ds-preview-head">
        <div>
          <p className="dsh-ds-preview-kicker">{t('preview.title', { name: previewSource.label })}</p>
          <p className="dsh-ds-preview-meta">
            {preview?.preview
              ? t('preview.meta', { rows: String(preview.preview.rowCount), cols: String(preview.preview.columns.length) })
              : t(typeKey(previewSource))}
          </p>
        </div>
        {(preview?.tables.length ?? 0) > 0 && previewSource !== null && (
          <TableSelect
            label={t('field.table')}
            value={previewTable}
            options={preview?.tables ?? []}
            disabled={busy}
            onChange={(next) => {
              setPreviewTable(next)
              loadPreview(previewSource, next)
            }}
          />
        )}
      </div>
      {busy && preview === null
        ? <p className="dsh-ds-empty">{t('busy')}</p>
        : (preview?.tables.length ?? 0) === 0
          ? <p className="dsh-ds-empty">{t('preview.emptyTables')}</p>
          : previewColumns.length === 0
            ? <p className="dsh-ds-empty">{t('preview.emptyRows')}</p>
            : (
              <div className="dsh-ds-table-wrap">
                <table className="dsh-ds-table">
                  <thead>
                    <tr>{previewColumns.map(column => <th key={column}>{column}</th>)}</tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, index) => (
                      <tr key={index}>
                        {previewColumns.map((column, col) => <td key={`${index}-${column}`}>{cellText(row[col])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </div>
  )

  const knowledgeView = knowledgeSource === null ? null : (
    <KnowledgePanel
      source={knowledgeSource}
      entries={knowledgeEntries}
      busy={busy}
      locked={locked}
      sessionId={sessionId}
      workspaceId={workspaceId}
      t={t}
      onEntries={setKnowledgeEntries}
      onBusy={setBusy}
      onError={setError}
    />
  )

  return (
    <>
      <Tooltip label={t('trigger.title')} side="top" delayMs={500}>
        <button
          type="button"
          className={`dsh-ds-trigger${selected ? ' is-on' : ''}`}
          aria-label={aria}
          aria-pressed={selected !== undefined}
          disabled={locked}
          onClick={() => { setOpen(true) }}
        >
          <DatabaseGlyph />
        </button>
      </Tooltip>
      <Modal
        open={open}
        onClose={close}
        title={t('dialog.title')}
        closeLabel={t('dialog.close')}
        className="dsh-ds-dialog"
        headless
      >
        <div className="dsh-ds-chrome">
          <div className="dsh-ds-header">
            {panel === 'home'
              ? <h2 className="dsh-ds-title">{t('dialog.title')}</h2>
              : (
                <button type="button" className="dsh-ds-back" disabled={busy} onClick={goHome}>
                  {t('action.back')}
                </button>
              )}
            <button type="button" className="dsh-ds-close" aria-label={t('dialog.close')} onClick={close}>×</button>
          </div>
          <div className="dsh-ds-body">
            {error !== null && <p className="dsh-ds-error" role="status">{error}</p>}
            {panel === 'home' && home}
            {panel === 'preview' && previewView}
            {panel === 'knowledge' && knowledgeView}
            {panel === 'connect' && (
              <div className="dsh-ds-form">
                <div className="dsh-ds-engines">
                  {(['postgres', 'mysql', 'sqlite'] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`dsh-ds-engine${engine === id ? ' is-on' : ''}`}
                      onClick={() => {
                        setEngine(id)
                        setPort(id === 'mysql' ? '3306' : '5432')
                      }}
                    >
                      {t(`engine.${id}`)}
                    </button>
                  ))}
                </div>
                <label className="dsh-ds-field">
                  <span className="dsh-ds-label">{t('field.label')}</span>
                  <Input value={label} placeholder={t('placeholder.label')} onChange={event => { setLabel(event.target.value) }} />
                </label>
                {engine === 'sqlite' ? (
                  <label className="dsh-ds-field">
                    <span className="dsh-ds-label">{t('field.sqlitePath')}</span>
                    <Input value={sqlitePath} placeholder={t('placeholder.sqlite')} onChange={event => { setSqlitePath(event.target.value) }} />
                  </label>
                ) : (
                  <>
                    <label className="dsh-ds-field">
                      <span className="dsh-ds-label">{t('field.host')}</span>
                      <Input value={host} placeholder={t('placeholder.host')} onChange={event => { setHost(event.target.value) }} />
                    </label>
                    <label className="dsh-ds-field">
                      <span className="dsh-ds-label">{t('field.port')}</span>
                      <Input value={port} onChange={event => { setPort(event.target.value) }} />
                    </label>
                    <label className="dsh-ds-field">
                      <span className="dsh-ds-label">{t('field.database')}</span>
                      <Input value={database} placeholder={t('placeholder.database')} onChange={event => { setDatabase(event.target.value) }} />
                    </label>
                    <label className="dsh-ds-field">
                      <span className="dsh-ds-label">{t('field.user')}</span>
                      <Input value={user} onChange={event => { setUser(event.target.value) }} />
                    </label>
                    <label className="dsh-ds-field">
                      <span className="dsh-ds-label">{t('field.password')}</span>
                      <Input type="password" value={password} onChange={event => { setPassword(event.target.value) }} />
                    </label>
                    <label className="dsh-ds-check">
                      <input type="checkbox" checked={ssl} onChange={event => { setSsl(event.target.checked) }} />
                      {t('field.ssl')}
                    </label>
                  </>
                )}
              </div>
            )}
            {panel === 'upload' && (
              <div className="dsh-ds-form">
                <label className="dsh-ds-field">
                  <span className="dsh-ds-label">{t('field.label')}</span>
                  <Input value={label} placeholder={t('placeholder.label')} onChange={event => { setLabel(event.target.value) }} />
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={event => {
                    const next = event.target.files?.[0]
                    if (next === undefined) return
                    if (!isUploadFile(next)) {
                      setError(t('error.fileType'))
                      return
                    }
                    setError(null)
                    setFile(next)
                  }}
                />
                <div
                  className={`dsh-ds-drop${dragOver ? ' is-over' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => { fileRef.current?.click() }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      fileRef.current?.click()
                    }
                  }}
                  onDragEnter={(event) => { event.preventDefault(); setDragOver(true) }}
                  onDragOver={(event) => { event.preventDefault(); setDragOver(true) }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragOver(false)
                    const next = event.dataTransfer.files[0]
                    if (next === undefined) return
                    if (!isUploadFile(next)) {
                      setError(t('error.fileType'))
                      return
                    }
                    setError(null)
                    setFile(next)
                  }}
                >
                  <p className="dsh-ds-drop-title">{file !== null ? file.name : t('field.drop')}</p>
                  <p className="dsh-ds-drop-hint">{t('field.dropHint')}</p>
                </div>
              </div>
            )}
          </div>
          {(panel === 'connect' || panel === 'upload') && (
            <div className="dsh-ds-footer">
              <Button
                variant="primary"
                size="sm"
                disabled={busy || locked}
                onClick={panel === 'connect' ? onConnect : onUpload}
              >
                {busy ? t('busy') : t('action.save')}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
