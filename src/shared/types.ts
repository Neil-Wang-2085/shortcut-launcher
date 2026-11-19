/**
 * 数据模型定义。
 *
 * 条目分两类：
 * - shortcut：快捷键（有 keys）
 * - command：命令（有 command）
 *
 * 内置数据来自 src/shared/data/*.json；用户自定义条目存于 userData 目录。
 */

/** 支持的应用标识 */
export type AppId =
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'photoshop'
  | 'git'
  | 'gdb'
  | 'windows'
  | 'vscode'
  | 'chrome'
  | 'terminal'
  | 'build'
  | 'outlook'
  | 'custom'
/** 条目类型 */
export type EntryType = 'shortcut' | 'command'
/** 平台（目前仅 win；mac 字段预留） */
export type Platform = 'win' | 'mac' | 'all'

/** 按键映射：Windows / macOS 两套写法 */
export interface KeyMap {
  win?: string
  mac?: string
}

/** 条目公共字段 */
export interface BaseEntry {
  /** 稳定 id，如 "word.bold" / "git.rebase-interactive" / "custom.xxx" */
  id: string
  /** 所属应用 */
  app: AppId
  /** 条目类型 */
  type: EntryType
  /** 显示标题（英文） */
  title: string
  /** 说明文字（英文） */
  description?: string
  /** 中文说明（用于界面展示与中文检索） */
  zh?: string
  /** 检索标签（英文，可含中文别名另见 zh-aliases） */
  tags?: string[]
  /** 适用平台 */
  platform?: Platform
  /** 版本，如 "365" / "2024" */
  version?: string
  /** 来源链接/备注 */
  source?: string
  /** 是否内置（内置只读，用户条目为 false） */
  builtin?: boolean
}

/** 快捷键条目 */
export interface ShortcutEntry extends BaseEntry {
  type: 'shortcut'
  keys: KeyMap
}

/** 命令条目 */
export interface CommandEntry extends BaseEntry {
  type: 'command'
  command: string
}

/** 条目联合类型 */
export type Entry = ShortcutEntry | CommandEntry

/**
 * 搜索文档：在原始条目上追加预计算字段，供 Fuse/CJK 匹配使用。
 * 下划线字段不参与展示。
 */
export interface SearchDoc extends Entry {
  _title: string
  _keys: string
  _tags: string
  _command: string
  _desc: string
  _app: string
  /** 仅保留中文的拼接串，用于中文 bigram 匹配 */
  _cjk: string
}
