declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
  export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'ghost' | 'outline' | 'toolbar'
    size?: 'md' | 'sm'
    icon?: ReactNode
  }): ReactNode
  export function Input(props: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }): ReactNode
  export function Modal(props: {
    open: boolean
    onClose: () => void
    title: string
    closeLabel?: string
    children?: ReactNode
    footer?: ReactNode
    className?: string
    headless?: boolean
  }): ReactNode
  export function Tooltip(props: {
    label: string
    side?: string
    delayMs?: number
    children: ReactNode
  }): ReactNode
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  export type PropsRuntime<Name extends string> = {
    locked: boolean
    sessionId: string
    useSessions: (selector: (state: { byId: Record<string, { agentPreset?: string }> }) => unknown) => any
    useWorkspaces: (selector: (state: unknown) => unknown) => any
  }
  export type PropsLocale<NS extends string> = {
    t: (key: string, params?: Record<string, string>) => string
  }
  interface LocaleNamespaceMap {}
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  export interface ClientContext {
    effect(fn: () => unknown, name?: string): void
    locale: { register(ns: string, dicts: unknown): () => void }
    slots: {
      inject(name: string, fn: () => unknown): void
      register(options: object, component: unknown): unknown
    }
  }
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {}
declare module '@deepseek-ai/dsh-client-locale/client' {}
