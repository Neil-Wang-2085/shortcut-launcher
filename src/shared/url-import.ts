/**
 * 从网页 HTML 中启发式提取快捷键 / 命令。
 *
 * 支持：
 * - 表格：一列是按键、另一列是说明
 * - <kbd> / 文本行：`Ctrl + B — Bold`
 * - 代码块：以 git/gdb/cmake 等开头的命令行
 *
 * 解析结果只作为候选，界面上还要用户勾选确认。
 */

export interface ParsedEntry {
  app: 'custom'
  type: 'shortcut' | 'command'
  title: string
  description?: string
  keys?: { win: string }
  command?: string
  tags?: string[]
  platform: 'win'
}

const KEY_PATTERN =
  /((?:Ctrl|Control|Alt|Shift|Win|Cmd|Command|⌘|⌥|⇧|⌃)(?:\s*[+＋]\s*(?:Ctrl|Control|Alt|Shift|Win|Cmd|Command|F\d{1,2}|[A-Za-z0-9.]+))+)/i

const COMMAND_RE =
  /^(git|gdb|npm|pnpm|yarn|npx|docker|kubectl|cmake|make|ninja|gcc|g\+\+|clang|ssh|scp|rsync|tar|zip|unzip|curl|wget|chmod|chown|find|grep|rg|sed|awk|ps|kill|systemctl|journalctl|apt|apt-get|brew|pip|python|node|go|cargo|rustc|java|javac|mvn|gradle)\b/

function decode(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
}

function text(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function normalizeKey(s: string): string {
  return s.replace(/\s*[+＋]\s*/g, '+').replace(/\s+/g, ' ').trim()
}

function extractKey(s: string): string | null {
  const m = s.match(KEY_PATTERN)
  if (!m) return null
  const key = normalizeKey(m[1])
  return key.length >= 2 ? key : null
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

export function parseHtml(html: string, sourceUrl = ''): ParsedEntry[] {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')

  const out: ParsedEntry[] = []
  const seen = new Set<string>()

  const push = (e: ParsedEntry): void => {
    const key =
      e.type === 'shortcut'
        ? `s|${(e.keys?.win ?? '').toLowerCase()}|${e.title.toLowerCase()}`
        : `c|${(e.command ?? '').toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(e)
  }

  const pushShortcut = (key: string, desc: string): void => {
    const description = truncate(desc.replace(/\s+/g, ' ').trim(), 120)
    if (!key || description.length < 2) return
    push({
      app: 'custom',
      type: 'shortcut',
      title: truncate(description, 80),
      description,
      keys: { win: key },
      tags: ['imported'],
      platform: 'win',
    })
  }

  const pushCommand = (cmd: string): void => {
    const command = truncate(cmd.replace(/\s+/g, ' ').trim(), 120)
    if (command.length < 3) return
    push({
      app: 'custom',
      type: 'command',
      title: truncate(command, 80),
      command,
      description: sourceUrl ? `导入自 ${sourceUrl}` : '从网页导入的命令',
      tags: ['imported'],
      platform: 'win',
    })
  }

  // 1) 表格：找一列像按键，另一列作说明
  for (const table of clean.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    for (const row of table[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => text(m[1]))
      if (cells.length < 2) continue
      let key = ''
      let keyIdx = -1
      for (let i = 0; i < cells.length; i++) {
        const k = extractKey(cells[i])
        if (k) {
          key = k
          keyIdx = i
          break
        }
      }
      if (!key) continue
      const desc =
        cells
          .filter((_, i) => i !== keyIdx)
          .sort((a, b) => b.length - a.length)[0] ?? ''
      pushShortcut(key, desc)
    }
  }

  // 2) 代码块：命令
  for (const block of clean.matchAll(/<(pre|code)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const content = decode(
      block[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
    )
    for (const line of content.split(/\r?\n/)) {
      const cmd = line.trim().replace(/^\$\s+/, '').replace(/^>\s+/, '')
      if (cmd.length < 3 || cmd.length > 120) continue
      if (!COMMAND_RE.test(cmd)) continue
      pushCommand(cmd)
    }
  }

  // 3) 纯文本行：`Ctrl + B — Bold` / `Ctrl+B: Bold`
  const plain = decode(
    clean
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|div|h[1-6]|tr|td|th)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
  for (const line of plain.split(/\r?\n/)) {
    const s = line.replace(/\s+/g, ' ').trim()
    if (!s || s.length > 160) continue
    const m = s.match(/^(.{2,40}?)\s*[-–—:]\s+(.{3,120})$/)
    if (!m) continue
    const key = extractKey(m[1])
    if (!key) continue
    pushShortcut(key, m[2])
  }

  return out.slice(0, 300)
}
