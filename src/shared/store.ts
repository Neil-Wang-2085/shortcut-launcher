import type { Entry } from './types.ts'

export interface UserDataFile {
  version: number
  entries: Entry[]
}

export function mergeEntries(seed: Entry[], user: Entry[]): Entry[] {
  const map = new Map<string, Entry>()
  for (const e of seed) map.set(e.id, { ...e, builtin: true })
  for (const e of user) map.set(e.id, { ...e, builtin: false })
  return [...map.values()]
}

function splitTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
  return []
}

export function normalizeEntry(raw: any): Entry | null {
  if (!raw || typeof raw !== 'object') return null

  // GDB 命令常见写法：{ "name": "regs", "expression": "info registers" }
  const expression =
    typeof raw.expression === 'string' && raw.expression.trim() ? raw.expression.trim() : ''

  let type = raw.type
  if (type !== 'shortcut' && type !== 'command') {
    if (raw.keys || raw.key) type = 'shortcut'
    else if (raw.command || expression) type = 'command'
    else return null
  }

  const title =
    typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : expression || (typeof raw.command === 'string' ? raw.command.trim() : '')
  if (!title) return null

  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `custom.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`

  const base = {
    id,
    app: (raw.app ?? (expression ? 'gdb' : 'custom')) as any,
    title,
    description: raw.description ?? raw.zh ?? '',
    tags: splitTags(raw.tags),
    platform: raw.platform ?? 'win',
    version: raw.version,
    builtin: false,
  }

  if (type === 'shortcut') {
    const win = raw.keys?.win ?? raw.keys ?? raw.key
    if (!win || typeof win !== 'string' || !win.trim()) return null
    return { ...base, type: 'shortcut', keys: { win: win.trim() } } as Entry
  }

  const command =
    typeof raw.command === 'string' && raw.command.trim()
      ? raw.command.trim()
      : expression
  if (!command) return null
  return { ...base, type: 'command', command } as Entry
}

function safeKeyPart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'file'
}

/**
 * 递归收集 JSON 里所有 `expression` 字段（GDB 命令）。
 * 支持 `{ commands: [{ name, expression }] }` 这类嵌套结构。
 */
export function collectExpressionCommands(data: any, fileKey: string): Entry[] {
  const out: Entry[] = []
  const seen = new Set<string>()
  let counter = 0
  const key = safeKeyPart(fileKey)

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }

    if (typeof node.expression === 'string' && node.expression.trim()) {
      const expr = node.expression.trim()
      if (!seen.has(expr)) {
        seen.add(expr)
        const e = normalizeEntry({
          id: `custom.${key}.expr.${counter++}`,
          app: node.app ?? 'gdb',
          type: 'command',
          title: node.title ?? node.name ?? expr,
          command: expr,
          description: node.description ?? node.zh ?? '',
          tags: node.tags ?? ['imported'],
          platform: node.platform ?? 'win',
        })
        if (e) out.push(e)
      }
    }

    for (const [k, v] of Object.entries(node)) {
      if (k === 'expression') continue
      walk(v)
    }
  }

  walk(data)
  return out
}

export function parseJsonImport(text: string): Entry[] {
  const data = JSON.parse(text)
  const arr = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : []
  const entries = arr.map(normalizeEntry).filter(Boolean) as Entry[]
  const extra = collectExpressionCommands(data, 'import').filter((e) => {
    if (e.type !== 'command') return false
    return !entries.some((x) => x.type === 'command' && x.command === e.command)
  })
  return [...entries, ...extra]
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQ = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQ = true
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

/**
 * CSV columns (header required, case-insensitive):
 * id,app,type,title,command,keys,description,tags,platform
 */
export function parseCsvImport(text: string): Entry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
  const result: Entry[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const get = (name: string) => {
      const j = idx(name)
      return j >= 0 ? (cells[j] ?? '').trim() : ''
    }
    const raw: any = {
      id: get('id'),
      app: get('app') || 'custom',
      type: get('type'),
      title: get('title'),
      command: get('command'),
      description: get('description'),
      tags: get('tags'),
      platform: get('platform') || 'win',
    }
    const keys = get('keys')
    if (keys) raw.keys = { win: keys }
    const e = normalizeEntry(raw)
    if (e) result.push(e)
  }
  return result
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(entries: Entry[]): string {
  const header = ['id', 'app', 'type', 'title', 'command', 'keys', 'description', 'tags', 'platform']
  const rows = entries.map((e) =>
    [
      e.id,
      e.app,
      e.type,
      e.title,
      e.type === 'command' ? e.command : '',
      e.type === 'shortcut' ? (e.keys.win ?? '') : '',
      e.description ?? '',
      (e.tags ?? []).join(';'),
      e.platform ?? 'win',
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}
