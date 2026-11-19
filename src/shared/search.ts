import Fuse from 'fuse.js'
import type { Entry, SearchDoc } from './types.ts'
import { normalizeText, normalizeKeys, cjkOnly, isCJKToken, cjkGrams } from './normalize.ts'
import { APP_ZH, ZH_ALIASES } from './zh-aliases.ts'
import { ZH_DESC } from './zh-desc.ts'

export interface SearchResult {
  entry: Entry
  score: number
}

export interface QueryFilters {
  app?: string
  type?: string
  tag?: string
}

/** 使用记录：次数 + 最近使用时间（毫秒） */
export interface UsageInfo {
  count: number
  last: number
}
export type UsageMap = Record<string, UsageInfo>

const APP_ALIASES: Record<string, string> = {
  word: 'word doc docx',
  excel: 'excel xls xlsx',
  powerpoint: 'powerpoint ppt pptx slides',
  photoshop: 'photoshop ps',
  git: 'git scm',
  gdb: 'gdb debugger',
  windows: 'windows win system sys',
  vscode: 'vscode vs code editor',
  chrome: 'chrome edge browser',
  terminal: 'terminal shell powershell cmd console',
  build: 'build cmake make ninja compile',
  outlook: 'outlook mail email',
  custom: 'custom user',
}

export function toSearchDoc(e: Entry): SearchDoc {
  const keys = e.type === 'shortcut' ? normalizeKeys(e.keys) : ''
  const command = e.type === 'command' ? normalizeText(e.command) : ''
  // 内置条目取 zh-desc 中的中文说明；自定义条目沿用用户填写的 zh/description
  const zh = ZH_DESC[e.id] ?? e.zh ?? ''
  const cjk = cjkOnly(
    [
      e.title,
      e.description ?? '',
      zh,
      (e.tags ?? []).join(' '),
      (ZH_ALIASES[e.id] ?? []).join(''),
      APP_ZH[e.app] ?? '',
    ].join(' '),
  )
  return {
    ...e,
    zh,
    _title: normalizeText(e.title),
    _keys: keys,
    _tags: (e.tags ?? []).join(' ').toLowerCase(),
    _command: command,
    _desc: normalizeText(e.description ?? ''),
    _app: APP_ALIASES[e.app] ?? e.app,
    _cjk: cjk,
  }
}

export function parseQuery(q: string): { text: string; filters: QueryFilters } {
  const filters: QueryFilters = {}
  const terms: string[] = []
  for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
    const m = tok.match(/^(app|type|tag):(.+)$/i)
    if (m) filters[m[1].toLowerCase() as keyof QueryFilters] = m[2].toLowerCase()
    else terms.push(tok)
  }
  return { text: terms.join(' '), filters }
}

/**
 * Normalize whitespace only. Extended-search operators are disabled, so
 * tokens such as "-i" must be preserved as literal search text.
 */
export function sanitizeQuery(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(' ')
}

export class Searcher {
  private fuse: Fuse<SearchDoc>
  private docs: SearchDoc[]
  private byId: Map<string, SearchDoc>
  private usage: UsageMap

  constructor(entries: Entry[], usage: UsageMap = {}) {
    this.usage = usage
    this.docs = entries.map(toSearchDoc)
    this.byId = new Map(this.docs.map((d) => [d.id, d]))
    this.fuse = new Fuse(this.docs, {
      includeScore: true,
      includeMatches: true,
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 1,
      useExtendedSearch: false,
      keys: [
        { name: '_title', weight: 3.0 },
        { name: '_keys', weight: 3.0 },
        { name: '_tags', weight: 2.0 },
        { name: '_command', weight: 1.8 },
        { name: '_desc', weight: 1.0 },
        { name: '_app', weight: 0.8 },
      ],
    })
  }

  /** 使用次数 + 最近使用带来的排序加成（分数越低越靠前） */
  private usageBoost(id: string): number {
    const u = this.usage[id]
    if (!u) return 0
    const countBoost = Math.min(0.6, 0.12 * Math.log1p(u.count))
    const ageDays = (Date.now() - u.last) / 86400000
    const recency = ageDays < 3 ? 0.15 : ageDays < 14 ? 0.08 : ageDays < 60 ? 0.03 : 0
    return countBoost + recency
  }

  private cjkMatches(token: string): Map<string, number> {    const grams = cjkGrams(token)
    const map = new Map<string, number>()
    if (!grams.length) return map
    for (const d of this.docs) {
      if (!d._cjk) continue
      let hit = 0
      for (const g of grams) if (d._cjk.includes(g)) hit++
      const ratio = hit / grams.length
      if (ratio >= 0.5) map.set(d.id, 1 - ratio)
    }
    return map
  }

  search(q: string, limit = 10): SearchResult[] {
    const { text, filters } = parseQuery(q)
    const clean = sanitizeQuery(text)
    const tokens = clean.split(/\s+/).filter(Boolean)

    let results: Array<{ item: SearchDoc; score: number }>

    if (tokens.length === 0) {
      results = this.docs.map((d) => ({ item: d, score: 0 }))
    } else if (tokens.length === 1) {
      const t = tokens[0]
      results = isCJKToken(t)
        ? [...this.cjkMatches(t)].map(([id, s]) => ({ item: this.byId.get(id)!, score: s }))
        : this.fuse.search(t).map((r) => ({ item: r.item, score: r.score ?? 1 }))
    } else {
      // Token AND: every token must match; aggregate average score.
      // CJK tokens use bigram containment instead of Fuse's byte-level fuzzy match.
      const maps = tokens.map((t) =>
        isCJKToken(t)
          ? this.cjkMatches(t)
          : new Map(this.fuse.search(t).map((r) => [r.item.id, r.score ?? 1])),
      )
      results = []
      for (const [id, first] of maps[0]) {
        let sum = first
        let ok = true
        for (let i = 1; i < maps.length; i++) {
          const s = maps[i].get(id)
          if (s == null) {
            ok = false
            break
          }
          sum += s
        }
        if (ok) {
          const doc = this.byId.get(id)
          if (doc) results.push({ item: doc, score: sum / tokens.length })
        }
      }
    }

    results = results.filter(({ item }) => {
      if (filters.app && item.app !== filters.app) return false
      if (filters.type && item.type !== filters.type) return false
      if (filters.tag && !(item.tags ?? []).some((t) => t.toLowerCase() === filters.tag)) return false
      return true
    })

    const qn = clean.toLowerCase().trim()
    const boosted = results.map(({ item, score }) => {
      let s = score
      if (qn) {
        if (item._title === qn) s -= 0.5
        else if (item._title.startsWith(qn)) s -= 0.25
        if (item._keys) {
          // 按键组合精确命中（如 "win+d"）优先于模糊命中（如 "win+down"）
          if (item._keys.split(' ').includes(qn)) s -= 0.35
          else if (item._keys.includes(qn)) s -= 0.2
        }
      }
      s -= this.usageBoost(item.id)
      return { entry: item as unknown as Entry, score: s }
    })
    boosted.sort((a, b) => a.score - b.score)
    return boosted.slice(0, limit)
  }
}
