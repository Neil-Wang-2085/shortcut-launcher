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

/** 读取字段，兼容 `"expression "` / `"Expression"` 这类 key */
function field(obj: any, name: string): any {
  if (!obj || typeof obj !== 'object') return undefined
  if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name]
  const lower = name.toLowerCase()
  for (const k of Object.keys(obj)) {
    if (k.trim().toLowerCase() === lower) return obj[k]
  }
  return undefined
}

export function normalizeEntry(raw: any): Entry | null {
  if (!raw || typeof raw !== 'object') return null

  // GDB 命令常见写法：
  // { "name": "regs", "expression": "info registers" }
  // { "name": "regs", "expression": ["p s_cursors[{}].ac.curfpa"] }
  const expressionRaw = field(raw, 'expression')
  let expression = ''
  if (typeof expressionRaw === 'string' && expressionRaw.trim()) {
    expression = expressionRaw.trim()
  } else if (Array.isArray(expressionRaw)) {
    const first = expressionRaw.find((x) => typeof x === 'string' && x.trim())
    if (typeof first === 'string') expression = first.trim()
  }

  let type = field(raw, 'type')
  const keysRaw = field(raw, 'keys')
  if (type !== 'shortcut' && type !== 'command') {
    if (keysRaw || field(raw, 'key')) type = 'shortcut'
    else if (field(raw, 'command') || expression) type = 'command'
    else return null
  }

  const titleRaw = field(raw, 'title')
  const nameRaw = field(raw, 'name')
  const commandRaw = field(raw, 'command')
  const title =
    typeof titleRaw === 'string' && titleRaw.trim()
      ? titleRaw.trim()
      : typeof nameRaw === 'string' && nameRaw.trim()
        ? nameRaw.trim()
        : expression || (typeof commandRaw === 'string' ? commandRaw.trim() : '')
  if (!title) return null

  const idRaw = field(raw, 'id')
  const id =
    typeof idRaw === 'string' && idRaw.trim()
      ? idRaw.trim()
      : `custom.${Date.now()}.${Math.random().toString(36).slice(2, 7)}`

  const base = {
    id,
    app: (field(raw, 'app') ?? (expression ? 'gdb' : 'custom')) as any,
    title,
    description: field(raw, 'description') ?? field(raw, 'zh') ?? '',
    tags: splitTags(field(raw, 'tags')),
    platform: field(raw, 'platform') ?? 'win',
    version: field(raw, 'version'),
    builtin: false,
  }

  if (type === 'shortcut') {
    const win = keysRaw?.win ?? keysRaw ?? field(raw, 'key')
    if (!win || typeof win !== 'string' || !win.trim()) return null
    return { ...base, type: 'shortcut', keys: { win: win.trim() } } as Entry
  }

  const command =
    typeof commandRaw === 'string' && commandRaw.trim()
      ? commandRaw.trim()
      : expression
  if (!command) return null
  return { ...base, type: 'command', command } as Entry
}

function safeKeyPart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'file'
}

/**
 * 递归收集 JSON 里所有 `expression` 字段（GDB 命令）。
 * `expression` 支持字符串或字符串数组，例如：
 * { "name": "cursors", "expression": ["p s_cursors[{}].ac.curfpa"] }
 */
export function collectExpressionCommands(data: any, fileKey: string): Entry[] {
  const out: Entry[] = []
  const seen = new Set<string>()
  let counter = 0
  const key = safeKeyPart(fileKey)

  const add = (expr: any, node: any, titleOverride?: string): void => {
    if (typeof expr !== 'string' || !expr.trim()) return
    const cmd = expr.trim()
    if (seen.has(cmd)) return
    seen.add(cmd)

    const titleField = field(node, 'title')
    const nameField = field(node, 'name')
    const title =
      (titleOverride && titleOverride.trim()) ||
      (typeof titleField === 'string' && titleField.trim()) ||
      (typeof nameField === 'string' && nameField.trim()) ||
      cmd

    const e = normalizeEntry({
      id: `custom.${key}.expr.${counter++}`,
      app: field(node, 'app') ?? 'gdb',
      type: 'command',
      title,
      command: cmd,
      description: field(node, 'description') ?? field(node, 'zh') ?? '',
      tags: field(node, 'tags') ?? ['imported'],
      platform: field(node, 'platform') ?? 'win',
    })
    if (e) out.push(e)
  }

  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }

    const exprRaw = field(node, 'expression')
    if (typeof exprRaw === 'string') {
      add(exprRaw, node)
    } else if (Array.isArray(exprRaw)) {
      const strings = exprRaw.filter((x) => typeof x === 'string' && x.trim())
      const titleField = field(node, 'title')
      const nameField = field(node, 'name')
      const base =
        (typeof titleField === 'string' && titleField.trim()) ||
        (typeof nameField === 'string' && nameField.trim()) ||
        ''
      strings.forEach((s, i) => {
        add(s, node, base ? (strings.length > 1 ? `${base} [${i + 1}]` : base) : undefined)
      })
      for (const item of exprRaw) {
        if (item && typeof item === 'object') walk(item)
      }
    }

    for (const [k, v] of Object.entries(node)) {
      if (k.trim().toLowerCase() === 'expression') continue
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
