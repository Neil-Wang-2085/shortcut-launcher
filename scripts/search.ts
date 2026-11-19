import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Searcher } from '../src/shared/search.ts'
import type { Entry } from '../src/shared/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dataDir = join(here, '..', 'src', 'shared', 'data')

const entries: Entry[] = []
for (const f of readdirSync(dataDir).filter((x) => x.endsWith('.json'))) {
  entries.push(...(JSON.parse(readFileSync(join(dataDir, f), 'utf8')) as Entry[]))
}
const searcher = new Searcher(entries)

const q = process.argv.slice(2).join(' ').trim()
if (!q) {
  console.log('usage: npm run search -- "query"')
  console.log('examples:')
  console.log('  "word bold"')
  console.log('  "ctrl b"')
  console.log('  "app:git rebase"')
  console.log('  "gdb bt"')
  console.log(`\nloaded ${entries.length} entries`)
  process.exit(0)
}

const results = searcher.search(q, 10)
if (!results.length) {
  console.log('no results')
  process.exit(0)
}

for (const r of results) {
  const e = r.entry
  const detail = e.type === 'shortcut' ? (e.keys.win ?? '') : e.command
  console.log(
    `${e.app.padEnd(11)} ${e.type.padEnd(8)} ${e.title.padEnd(30)} ${detail.padEnd(34)} ${r.score.toFixed(3)}`,
  )
}
