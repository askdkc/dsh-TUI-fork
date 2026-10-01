import { writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { normalizeCatalog, rosterIds, fetchCatalogJson, OPEN_CODE_URLS } from '../src/opencode-catalog.ts'
const metadata = await fetchCatalogJson('https://models.dev/api.json', fetch)
const snapshots = {}
for (const provider of ['opencode', 'opencode-go']) {
  const listing = await fetchCatalogJson(`${OPEN_CODE_URLS[provider]}/models`, fetch)
  snapshots[provider] = normalizeCatalog(provider, rosterIds(listing), metadata[provider], Date.now())
}
const destination = fileURLToPath(new URL('../src/opencode-owned.generated.ts', import.meta.url))
const temporary = `${destination}.${process.pid}.tmp`
await writeFile(temporary, `/** Generated from official rosters and exact-route models.dev metadata. */\nexport const OPEN_CODE_SNAPSHOTS = ${JSON.stringify(snapshots, null, 2)}\n`)
await rename(temporary, destination)
for (const [provider, snapshot] of Object.entries(snapshots)) console.log(`${provider}: ${snapshot.models.length} available, ${snapshot.excluded.length} excluded`)
