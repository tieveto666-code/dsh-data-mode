import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { DATA_MODE_DIR } from '../paths.ts'
import { parseYamlObject } from './parse-yaml.ts'

function secretsPath(dshHome: string): string {
  return join(dshHome, DATA_MODE_DIR, 'secrets.yaml')
}

async function readSecrets(dshHome: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(secretsPath(dshHome), 'utf8')
    const root = parseYamlObject(text, secretsPath(dshHome))
    const raw = root.secrets
    const out: Record<string, string> = {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string' && value !== '') out[key] = value
      }
    }
    return out
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') return {}
    throw error
  }
}

async function writeSecrets(dshHome: string, secrets: Record<string, string>): Promise<void> {
  await mkdir(join(dshHome, DATA_MODE_DIR), { recursive: true })
  const path = secretsPath(dshHome)
  await writeFile(path, stringify({ secrets }), { encoding: 'utf8', mode: 0o600 })
  try {
    await chmod(path, 0o600)
  } catch {
    // Windows cannot chmod the same way; the write mode above is best-effort.
  }
}

export async function readSecret(dshHome: string, sourceId: string): Promise<string | undefined> {
  const secrets = await readSecrets(dshHome)
  return secrets[sourceId]
}

export async function writeSecret(dshHome: string, sourceId: string, password: string): Promise<void> {
  const secrets = await readSecrets(dshHome)
  secrets[sourceId] = password
  await writeSecrets(dshHome, secrets)
}

export async function deleteSecret(dshHome: string, sourceId: string): Promise<void> {
  const secrets = await readSecrets(dshHome)
  if (secrets[sourceId] === undefined) return
  delete secrets[sourceId]
  await writeSecrets(dshHome, secrets)
}

export async function deleteUploadDir(workspaceRoot: string, sourceId: string): Promise<void> {
  await rm(join(workspaceRoot, '.dsh', DATA_MODE_DIR, 'uploads', sourceId), { recursive: true, force: true })
}
