import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_HOST_PATCH_IDS,
  FORBIDDEN_HOST_PLUGIN_NAMES,
  FORBIDDEN_PRESET_PLUGIN_NAMES,
  HOST_PLUGIN_ID,
  NATIVE_PRESET_IDS,
  PRESET_ID,
} from '../src/isolation-contract.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('host bundle patch isolation', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

  it('inserts only the registrar on the host plane', () => {
    expect(patch).toContain(`id: ${HOST_PLUGIN_ID}`)
    expect(patch).toMatch(/name:\s*dsh-data-mode\s*$/m)
  })

  it('does not patch agent-presets or change default: standard', () => {
    for (const id of FORBIDDEN_HOST_PATCH_IDS) {
      expect(patch).not.toMatch(new RegExp(`id:\\s*${id}\\b`))
    }
    expect(patch).not.toMatch(/default:\s*standard/)
    expect(patch).not.toMatch(/agent-presets:\s*\n\s*default:/)
  })

  it('does not register data tools on the host', () => {
    for (const name of FORBIDDEN_HOST_PLUGIN_NAMES) {
      expect(patch).not.toContain(name)
    }
    expect(patch).not.toContain('run_sql')
    expect(patch).not.toContain('list_data_sources')
    expect(patch).not.toContain('@deepseek-ai/dsh-plan-mode')
  })

  it('does not mention native preset ids as something to edit', () => {
    for (const id of NATIVE_PRESET_IDS) {
      expect(patch).not.toMatch(new RegExp(`id:\\s*${id}\\b`))
    }
  })
})

describe('shipped data preset isolation', () => {
  const composition = readFileSync(join(root, 'preset/dsh-data/agent.cordis.yml'), 'utf8')
  const metadata = readFileSync(join(root, 'preset/dsh-data/preset.yml'), 'utf8')

  it('uses a roster id that does not collide with native presets or a user data shell', () => {
    expect(PRESET_ID).toBe('dsh-data')
    expect(PRESET_ID).not.toBe('data')
    expect(NATIVE_PRESET_IDS).not.toContain(PRESET_ID)
  })

  it('registers data tools only inside the preset composition', () => {
    expect(composition).toContain('dsh-data-mode/tool-data')
    expect(composition).toContain('dsh-data-mode/data-source')
    expect(composition).toContain('dsh-data-mode/provider-duckdb')
    expect(composition).toContain('isolate:')
    expect(composition).toContain('dataSource: true')
  })

  it('mounts data Plan Mode and data skills inside the preset', () => {
    expect(composition).toContain('@deepseek-ai/dsh-plan-mode')
    expect(composition).toContain('planMode: true')
    expect(composition).toContain('Only the source the user selected')
    expect(composition).toContain('recalled 业务知识')
    expect(readFileSync(join(root, 'preset/dsh-data/skills/data-qa/SKILL.md'), 'utf8')).toContain('A — 拒答')
    expect(readFileSync(join(root, 'preset/dsh-data/skills/data-qa/SKILL.md'), 'utf8')).toContain('Business knowledge recalled')
    expect(readFileSync(join(root, 'preset/dsh-data/skills/data-attribution/SKILL.md'), 'utf8')).toContain('先验证涨跌')
  })

  it('does not pull coding-agent tools into data mode', () => {
    for (const name of FORBIDDEN_PRESET_PLUGIN_NAMES) {
      expect(composition).not.toContain(name)
    }
  })

  it('declares a display name without claiming to replace native modes', () => {
    expect(metadata).toContain('数据模式')
    expect(metadata).toMatch(/问数|分析/)
    expect(metadata).not.toMatch(/替换标准|取代标准|覆盖标准/)
  })
})

describe('registrar source isolation', () => {
  const source = readFileSync(join(root, 'src/index.ts'), 'utf8')

  it('does not inject tools, settings, or agentPresets', () => {
    expect(source).not.toMatch(/export const inject\s*=/)
    expect(source).not.toContain("inject: ['tools']")
    expect(source).not.toContain('ctx.tools')
    expect(source).not.toContain('ctx.settings')
    expect(source).not.toContain('ctx.agentPresets')
    expect(source).not.toContain('default:')
  })

  it('gates the composer catalog API on the session preset', () => {
    const http = readFileSync(join(root, 'src/catalog-http.ts'), 'utf8')
    expect(http).toContain('allowDataMode')
    expect(http).toContain('resolvePreset')
    const client = readFileSync(join(root, 'src/client/DataSourceChip.tsx'), 'utf8')
    expect(client).toContain("const PRESET_ID = 'dsh-data'")
    expect(client).toContain('if (preset !== PRESET_ID) return null')
    expect(client).toContain("onKnowledge")
    expect(client).toContain("action.knowledge")
  })

  it('occupies the dedicated datasource seat and falls back to conversation.input.left', () => {
    const client = readFileSync(join(root, 'src/client/index.ts'), 'utf8')
    expect(client).toContain("inject('conversation.input.datasource'")
    expect(client).toContain("inject('conversation.input.left'")
    expect(client).toContain("id: LEFT_ENTRY_ID")
    expect(client).not.toContain('deepseek-harness-custom')
    expect(client).not.toContain('InputBar.tsx')
  })
})

describe('native standard preset stays free of data tools', () => {
  it('does not contain run_sql when the sibling dsh checkout is present', () => {
    const standard = join(root, '../deepseek-harness-custom/apps/cli/config/agent-presets/standard/agent.cordis.yml')
    if (!existsSync(standard)) return
    const text = readFileSync(standard, 'utf8')
    expect(text).not.toContain('run_sql')
    expect(text).not.toContain('list_data_sources')
    expect(text).not.toContain('dsh-data-mode/tool-data')
  })
})
