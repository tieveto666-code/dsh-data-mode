import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ensureDataPreset } from '../src/install-preset.ts'
import { ORIGIN_FILE, PRESET_ID } from '../src/isolation-contract.ts'

const templateDir = join(dirname(fileURLToPath(import.meta.url)), '../preset/dsh-data')

describe('ensureDataPreset', () => {
  it('installs into .agent-presets/dsh-data and does not create native ids', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-data-mode-'))
    const result = await ensureDataPreset({ dshHome, templateDir })
    expect(result).toBe('installed')
    const dest = join(dshHome, '.agent-presets', PRESET_ID)
    const composition = await readFile(join(dest, 'agent.cordis.yml'), 'utf8')
    expect(composition).toContain('dsh-data-mode/tool-data')
    const origin = JSON.parse(await readFile(join(dest, ORIGIN_FILE), 'utf8')) as { presetId: string }
    expect(origin.presetId).toBe('dsh-data')
    await expect(readFile(join(dshHome, '.agent-presets', 'standard', 'agent.cordis.yml'), 'utf8')).rejects.toThrow()
    await expect(readFile(join(dshHome, '.agent-presets', 'data', 'agent.cordis.yml'), 'utf8')).rejects.toThrow()
  })

  it('never overwrites an existing dsh-data preset', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-data-mode-'))
    await ensureDataPreset({ dshHome, templateDir })
    const dest = join(dshHome, '.agent-presets', PRESET_ID)
    await writeFile(join(dest, 'preset.yml'), 'name: 用户改过的数据模式\n', 'utf8')
    const second = await ensureDataPreset({ dshHome, templateDir })
    expect(second).toBe('skipped-exists')
    expect(await readFile(join(dest, 'preset.yml'), 'utf8')).toContain('用户改过的数据模式')
  })

  it('does not overwrite a foreign directory occupying dsh-data, and leaves a data shell alone', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'dsh-data-mode-'))
    const foreign = join(dshHome, '.agent-presets', PRESET_ID)
    await mkdir(foreign, { recursive: true })
    await writeFile(join(foreign, 'agent.cordis.yml'), '- id: persona\n  name: other\n', 'utf8')
    const dataShell = join(dshHome, '.agent-presets', 'data')
    await mkdir(dataShell, { recursive: true })
    await writeFile(join(dataShell, 'agent.cordis.yml'), '- id: persona\n  name: shell\n', 'utf8')

    const result = await ensureDataPreset({ dshHome, templateDir })
    expect(result).toBe('skipped-foreign')
    expect(await readFile(join(foreign, 'agent.cordis.yml'), 'utf8')).toContain('name: other')
    expect(await readFile(join(dataShell, 'agent.cordis.yml'), 'utf8')).toContain('name: shell')
  })
})
