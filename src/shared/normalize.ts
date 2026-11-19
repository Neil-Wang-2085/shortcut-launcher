/**
 * 文本/按键归一化工具。
 * 用于让 "Ctrl" 与 "Control"、"Esc" 与 "Escape" 等写法可以互相命中。
 */

/** 按键同义词表 */
const KEY_SYNONYMS: Record<string, string> = {
  control: 'ctrl',
  ctrl: 'ctrl',
  command: 'cmd',
  cmd: 'cmd',
  meta: 'win',
  win: 'win',
  windows: 'win',
  option: 'alt',
  opt: 'alt',
  alt: 'alt',
  del: 'delete',
  delete: 'delete',
  esc: 'escape',
  escape: 'escape',
  return: 'enter',
  enter: 'enter',
  space: 'space',
  shift: 'shift',
}

/** 归一化单个按键 token（小写 + 同义词替换） */
export function normalizeToken(s: string): string {
  const t = s.trim().toLowerCase()
  return KEY_SYNONYMS[t] ?? t
}

/** 归一化普通文本：小写、压缩空白、去首尾空格 */
export function normalizeText(s: string): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** 只保留中文字符（用于中文 bigram 匹配索引） */
export function cjkOnly(s: string): string {
  return (s ?? '').replace(/[^\u4e00-\u9fff]/g, '')
}

/** 判断 token 是否包含中文 */
export function isCJKToken(s: string): boolean {
  return /[\u4e00-\u9fff]/.test(s)
}

/** 把中文串切成重叠 bigram；单字则返回其本身 */
export function cjkGrams(s: string): string[] {
  const chars = [...s].filter((c) => /[\u4e00-\u9fff]/.test(c))
  if (chars.length <= 1) return chars
  const out: string[] = []
  for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1])
  return out
}

/** 归一化组合键：如 "Ctrl + Shift + B" -> "ctrl+shift+b" */
export function normalizeKeyCombo(s?: string): string {
  if (!s) return ''
  return s
    .split(/\s*\+\s*/)
    .map((p) => normalizeToken(p.replace(/\s+/g, ' ').trim()))
    .filter(Boolean)
    .join('+')
}

/**
 * 生成可搜索的按键字符串。
 * 同时包含 "ctrl+b" 与 "ctrl b" 两种形态，便于不同输入习惯。
 */
export function normalizeKeys(keys?: { win?: string; mac?: string }): string {
  if (!keys) return ''
  const win = normalizeKeyCombo(keys.win)
  const mac = normalizeKeyCombo(keys.mac)
  const parts = [win, mac].filter(Boolean)
  const spaced = parts.map((p) => p.replace(/\+/g, ' '))
  return [...parts, ...spaced].join(' ')
}
