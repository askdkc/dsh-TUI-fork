/** Persisted model favorites. Catalog availability never deletes a saved ref. */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DATA_DIR } from './utils/paths.js'
import type { ModelRef } from './modelGroups.js'

export function parseModelFavorites(text: string): readonly ModelRef[] {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return [] }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return []
  const models = (parsed as Record<string, unknown>).models
  if (!Array.isArray(models)) return []
  const result: ModelRef[] = []
  for (const value of models) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const item = value as Record<string, unknown>
    if (typeof item.provider !== 'string' || !item.provider || typeof item.id !== 'string' || !item.id) continue
    if (!result.some(ref => ref.provider === item.provider && ref.id === item.id)) {
      result.push({ provider: item.provider, id: item.id })
    }
  }
  return result
}

export function readModelFavorites(dir: string = DATA_DIR): readonly ModelRef[] {
  try { return parseModelFavorites(readFileSync(join(dir, 'model-favorites.json'), 'utf8')) }
  catch { return [] }
}

export function toggleModelFavorite(
  current: readonly ModelRef[],
  ref: ModelRef,
  dir: string = DATA_DIR,
): { favorites: readonly ModelRef[]; saved: boolean } {
  const exists = current.some(item => item.provider === ref.provider && item.id === ref.id)
  const favorites = exists
    ? current.filter(item => item.provider !== ref.provider || item.id !== ref.id)
    : [...current, ref]
  const temporary = join(dir, `model-favorites.${randomUUID()}.tmp`)
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(temporary, `${JSON.stringify({ models: favorites }, null, 2)}\n`, { flag: 'wx' })
    renameSync(temporary, join(dir, 'model-favorites.json'))
    return { favorites, saved: true }
  } catch {
    try { unlinkSync(temporary) } catch { /* no temporary file */ }
    return { favorites, saved: false }
  }
}
