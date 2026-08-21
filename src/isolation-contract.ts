/**
 * Distribution isolation: data mode must not change native dsh presets.
 * Native roster ids: standard, code, minimal, cordis.
 */
export const PRESET_ID = 'dsh-data'

/** Host-plane plugin id. The only row this bundle may insert. */
export const HOST_PLUGIN_ID = 'dsh-data-mode-register'

/** Marker written into a copied user preset. Absence means a foreign directory. */
export const ORIGIN_FILE = 'origin.json'

export const ORIGIN_PACKAGE = 'dsh-data-mode'

export const NATIVE_PRESET_IDS = ['standard', 'code', 'minimal', 'cordis'] as const

export const FORBIDDEN_HOST_PATCH_IDS = ['agent-presets'] as const

export const FORBIDDEN_HOST_PLUGIN_NAMES = [
  'dsh-data-mode/tool-data',
  'dsh-data-mode/data-source',
  'dsh-data-mode/provider-duckdb',
  'dsh-data-mode/guard',
  'dsh-data-mode/context',
] as const

export const FORBIDDEN_PRESET_PLUGIN_NAMES = [
  '@deepseek-ai/dsh-tool-bash',
  '@deepseek-ai/dsh-tool-pwsh',
  '@deepseek-ai/dsh-tool-fs',
  '@deepseek-ai/dsh-tool-subagent',
  '@deepseek-ai/dsh-tool-workflow',
] as const
