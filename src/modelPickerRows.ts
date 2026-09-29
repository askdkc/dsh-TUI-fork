import type { LlmModelInfo, LlmProviderInfo } from './adapter/ports/channel-view.js'
import { filterModels } from './modelGroups.js'
import type { ModelRef } from './modelGroups.js'

export type ModelPickerRow =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'model'; key: string; section: string; model: LlmModelInfo; providerName: string }

export function modelPickerRows(
  models: readonly LlmModelInfo[],
  providers: readonly LlmProviderInfo[],
  favorites: readonly ModelRef[],
  recents: readonly ModelRef[],
  query: string,
): readonly ModelPickerRow[] {
  const names = new Map(providers.map(provider => [provider.id, provider.name]))
  const seen = new Set<string>()
  const catalog = models.filter(model => {
    const key = `${model.provider}\0${model.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const row = (section: string, model: LlmModelInfo): ModelPickerRow => ({
    kind: 'model', key: `${section}:${model.provider}/${model.id}`, section, model,
    providerName: names.get(model.provider) ?? model.provider,
  })
  const filtered = filterModels(catalog, query, providers)
  if (query.trim()) return filtered.map(model => row('search', model))
  const result: ModelPickerRow[] = []
  const lookup = (ref: ModelRef) => catalog.find(model => model.provider === ref.provider && model.id === ref.id)
  const favoriteModels = favorites.map(lookup).filter((model): model is LlmModelInfo => model !== undefined)
  if (favoriteModels.length) {
    result.push({ kind: 'heading', key: 'heading:favorites', label: 'Favorites' })
    result.push(...favoriteModels.map(model => row('favorites', model)))
  }
  const recentModels = recents
    .filter(ref => !favorites.some(favorite => favorite.provider === ref.provider && favorite.id === ref.id))
    .map(lookup).filter((model): model is LlmModelInfo => model !== undefined)
  if (recentModels.length) {
    result.push({ kind: 'heading', key: 'heading:recent', label: 'Recent' })
    result.push(...recentModels.map(model => row('recent', model)))
  }
  const order = [...new Set(catalog.map(model => model.provider))]
  for (const provider of order) {
    result.push({ kind: 'heading', key: `heading:${provider}`, label: names.get(provider) ?? provider })
    result.push(...catalog.filter(model => model.provider === provider).map(model => row(provider, model)))
  }
  return result
}

export function focusedModelRow(rows: readonly ModelPickerRow[], index: number): Extract<ModelPickerRow, { kind: 'model' }> | undefined {
  const row = rows[index]
  return row?.kind === 'model' ? row : undefined
}

export function moveModelFocus(rows: readonly ModelPickerRow[], index: number, delta: number): number {
  if (!rows.length) return 0
  let next = index
  for (let attempt = 0; attempt < rows.length; attempt++) {
    next = (next + delta + rows.length) % rows.length
    if (rows[next]?.kind === 'model') return next
  }
  return 0
}
