import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ORIGIN_FILE, ORIGIN_PACKAGE, PRESET_ID } from './isolation-contract.ts'

export type EnsurePresetResult = 'installed' | 'skipped-exists' | 'skipped-foreign'

export interface EnsureDataPresetOptions {
  dshHome: string
  templateDir: string
  log?: (message: string) => void
}

export interface OriginDocument {
  package: string
  presetId: string
}

function originPath(directory: string): string {
  return join(directory, ORIGIN_FILE)
}

export async function readOrigin(directory: string): Promise<OriginDocument | undefined> {
  try {
    const raw = await readFile(originPath(directory), 'utf8')
    const parsed = JSON.parse(raw) as Partial<OriginDocument>
    if (typeof parsed.package !== 'string' || typeof parsed.presetId !== 'string') return undefined
    return { package: parsed.package, presetId: parsed.presetId }
  } catch {
    return undefined
  }
}

/**
 * Copy the shipped preset into the user roster root.
 *
 * Never overwrites. Never writes `settings.yaml` or `agent-presets.default`.
 * Native shipped presets live under the deployment config and are not touched.
 */
export async function ensureDataPreset(options: EnsureDataPresetOptions): Promise<EnsurePresetResult> {
  const dest = join(options.dshHome, '.agent-presets', PRESET_ID)
  const existing = await readOrigin(dest).catch(() => undefined)

  try {
    await readFile(join(dest, 'agent.cordis.yml'), 'utf8')
  } catch {
    await mkdir(join(options.dshHome, '.agent-presets'), { recursive: true, mode: 0o700 })
    try {
      await cp(options.templateDir, dest, { recursive: true, errorOnExist: true, force: false })
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'EEXIST' || code === 'ERR_FS_CP_EEXIST') return 'skipped-exists'
      throw error
    }
    await writeFile(
      originPath(dest),
      `${JSON.stringify({ package: ORIGIN_PACKAGE, presetId: PRESET_ID }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    )
    options.log?.(`dsh-data-mode: installed user preset "${PRESET_ID}" at ${dest}`)
    return 'installed'
  }

  if (existing?.package === ORIGIN_PACKAGE && existing.presetId === PRESET_ID) {
    options.log?.(`dsh-data-mode: preset "${PRESET_ID}" already present, leaving it unchanged`)
    return 'skipped-exists'
  }

  options.log?.(
    `dsh-data-mode: "${PRESET_ID}" already exists and is not this package's copy; leaving it unchanged`,
  )
  return 'skipped-foreign'
}
