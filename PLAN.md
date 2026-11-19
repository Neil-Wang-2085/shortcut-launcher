# Shortcut & Command Launcher — 设计与实施 Plan

> 目标：一个常驻 Windows 桌面的小工具，全局热键呼出，**模糊搜索** Office / Photoshop / Git / GDB 的快捷键与命令；**命令自动复制**，**快捷键弹透明浮层**；支持用户自定义条目。

---

## 1. 范围

### MVP（v0.1）
- 内置数据：Word / Excel / PowerPoint、Photoshop、Git、GDB（各 50–120 条）。
- 模糊搜索：标题 / 按键 / 命令 / 描述 / 标签，支持中英文、拼写容错。
- 命令类结果：`Enter` → 复制到剪贴板 + 轻提示。
- 快捷键类结果：`Enter` → 透明浮层显示键帽 + 说明，自动消失。
- 全局热键呼出/隐藏 launcher。
- 自定义条目：新增/编辑/删除（GDB 命令、常用 snippet）。

### 后续（v0.2+）
- 导入/导出 JSON、使用频率排序、主题、多语言。
- Mac 键位映射（Cmd/Option）。
- 托盘菜单、开机自启、单实例。
- 云同步 / 团队共享数据包（可选）。

---

## 2. 技术选型

### 推荐：Electron + TypeScript + React + Vite
理由：
- 本机已有 Node v24，零额外运行时安装。
- 透明窗口、全局热键、剪贴板、托盘、单实例等能力成熟。
- 开发迭代快，UI 灵活。

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| **Electron + TS** | 生态成熟、开发快、透明窗口稳 | 包体 ~120–180MB | **推荐** |
| Tauri (Rust) | 包体 ~10MB | 需装 Rust 工具链 | 备选（v1.0 后考虑） |
| C# WPF | 原生、单 exe | 需装 .NET SDK | 备选 |
| Python + PySide6 | 上手快 | 打包大、热键/透明窗需额外处理 | 不推荐 |

**关键依赖**
- 搜索：`fuse.js`（weighted keys + threshold + includeScore/Matches）
- 构建：`electron-vite` + `electron-builder`
- 存储：JSON（userData 目录），无需数据库
- 热键：Electron `globalShortcut`
- 剪贴板：Electron `clipboard`
- 托盘：Electron `Tray`

---

## 3. 目录结构

```
shortcut-launcher/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/                     # 主进程
│   │   ├── index.ts              # app 生命周期 / 单实例 / 托盘 / 热键
│   │   ├── windows.ts            # launcher / popup 窗口创建
│   │   ├── ipc.ts                # IPC handlers（搜索、复制、弹窗、CRUD）
│   │   ├── store.ts              # seed + user 数据合并、持久化
│   │   └── hotkey.ts             # 全局热键注册/冲突检测
│   ├── preload/
│   │   └── index.ts              # contextBridge 暴露安全 API
│   ├── renderer/
│   │   ├── launcher/             # 搜索主界面
│   │   ├── popup/                # 透明快捷键浮层
│   │   └── settings/             # 自定义条目管理
│   └── shared/
│       ├── types.ts              # Entry schema
│       ├── search.ts             # 归一化 + Fuse 配置 + 加权排序
│       ├── normalize.ts          # 按键/命令归一化、同义词
│       └── data/
│           ├── word.json
│           ├── excel.json
│           ├── powerpoint.json
│           ├── photoshop.json
│           ├── git.json
│           └── gdb.json
└── tests/
    ├── search.test.ts
    └── e2e/
```

---

## 4. 数据模型

### 4.1 通用字段

```ts
type AppId = 'word' | 'excel' | 'powerpoint' | 'photoshop' | 'git' | 'gdb' | 'custom'
type EntryType = 'shortcut' | 'command'

interface BaseEntry {
  id: string              // 稳定 id，如 "word.bold"
  app: AppId
  type: EntryType
  title: string           // 显示名，如 "Bold"
  description: string     // 说明
  tags: string[]          // 检索标签，如 ["format","font"]
  platform?: 'win' | 'mac' | 'all'
  version?: string        // 如 "2019/365"
  source?: string         // 来源链接/备注
  builtin: boolean        // 内置 or 用户自定义
  createdAt?: number
  updatedAt?: number
}
```

### 4.2 快捷键条目

```json
{
  "id": "word.bold",
  "app": "word",
  "type": "shortcut",
  "title": "Bold",
  "keys": { "win": "Ctrl+B", "mac": "Cmd+B" },
  "description": "Toggle bold formatting",
  "tags": ["format", "font", "text"],
  "platform": "all",
  "version": "2019/365",
  "builtin": true
}
```

### 4.3 命令条目

```json
{
  "id": "git.rebase-interactive",
  "app": "git",
  "type": "command",
  "title": "Interactive rebase",
  "command": "git rebase -i HEAD~N",
  "description": "Rewrite last N commits: pick / squash / reword / drop",
  "tags": ["rewrite", "history", "squash"],
  "platform": "all",
  "builtin": true
}
```

### 4.4 合并规则
- 内置数据只读（打包在 `resources/data`）。
- 用户数据存 `app.getPath('userData')/user-entries.json`。
- 按 `id` 合并：用户同 id **覆盖**内置；`builtin:false` 为用户条目。
- 删除内置条目？MVP 不支持删除，仅支持"隐藏"（可选）。

---

## 5. 模糊搜索设计

### 5.1 归一化（`normalize.ts`）
- 小写、去首尾空格。
- 按键同义词：`Ctrl`=`Control`、`Cmd`=`Command`、`Win`=`Meta`、`Del`=`Delete`、`Esc`=`Escape`、`+` 与空格统一。
- 组合键归一为 `ctrl+b` 形式，便于与查询匹配。
- 命令：保留原文，额外生成"去空格/小写"副本。
- 中文别名：如 `加粗` 对应 Bold（在 tags/title 中预置）。

### 5.2 Fuse.js 配置

```ts
new Fuse(entries, {
  includeScore: true,
  includeMatches: true,
  threshold: 0.35,          // 0 精确，1 全匹配
  ignoreLocation: true,
  minMatchCharLength: 1,
  useExtendedSearch: true,
  keys: [
    { name: 'title',       weight: 3.0 },
    { name: 'keys.win',    weight: 3.0 },
    { name: 'keys.mac',    weight: 1.5 },
    { name: 'tags',        weight: 2.0 },
    { name: 'command',     weight: 1.8 },
    { name: 'description', weight: 1.0 },
    { name: 'app',         weight: 0.8 },
  ],
})
```

### 5.3 排序增强（在 Fuse score 之上）
1. 精确/前缀命中：`title` 或 `keys` 以查询开头 → 提升。
2. 类型/应用过滤：`app:git`、`type:shortcut`、`tag:rebase`。
3. 使用频率/最近使用：本地记录 `usage.json`，指数衰减加成。
4. 同分时：`shortcut` 优先于 `command`？可按用户偏好配置。

### 5.4 查询语法
- `app:git rebase` → 仅 git
- `type:shortcut ctrl b` → 仅快捷键
- `tag:format bold` → 按标签
- 无语法 → 全量模糊

### 5.5 性能
- 数据集 1–3k 条，内存索引足够；输入 debounce 50ms。
- 启动时预计算 `searchText`（归一化后的拼接串），减少运行时开销。

---

## 6. UI / 交互

### 6.1 Launcher
- 尺寸约 520×460，圆角、无边框、居中（或跟随鼠标屏）。
- 顶部搜索框 + 应用过滤 chips（All / Word / Excel / PPT / PS / Git / GDB / Custom）。
- 结果列表：图标 + 标题 + 类型徽标（⌨/>）+ 描述；选中高亮。
- 键盘：`↑↓` 选择、`Enter` 执行、`Esc` 隐藏、`Tab` 切过滤、`Ctrl+1..8` 快速切应用。
- 底部提示：`Enter 执行 · Esc 关闭 · Tab 过滤`。

### 6.2 命令结果
- `Enter` → `clipboard.writeText(command)` → 轻提示 "Copied: git rebase -i HEAD~N"（1.5s）。
- 可选：执行后自动隐藏 launcher。

### 6.3 快捷键结果（透明浮层）
- `Enter` → 打开 popup 窗口：
  - 半透明背景（`rgba(0,0,0,0.85)` 或毛玻璃），圆角。
  - 键帽可视化（`Ctrl` `Shift` `V` 分块），下方标题 + 说明 + 应用徽标。
  - 3s 自动消失；点击/任意键关闭；可配置时长。
- 窗口参数：
  ```
  transparent: true, frame: false, alwaysOnTop: true,
  skipTaskbar: true, hasShadow: false, resizable: false,
  focusable: false   // click-through，不抢焦点
  ```
- 位置：屏幕中心，或 `screen.getCursorScreenPoint()` 附近；多显示器用 `getDisplayNearestPoint`。
- 若需要"点击关闭"，则 `focusable: true` + `setIgnoreMouseEvents(false)`；做成配置项。

### 6.4 全局热键
- 默认 `Ctrl+Alt+K`（避免与常见软件冲突）。
- 注册失败（被占用）→ 提示用户改键（设置页可改）。
- 呼出时：若已显示则隐藏（toggle）。

### 6.5 托盘
- 菜单：Show / Settings / Add Entry / Quit。
- 双击托盘图标 = toggle launcher。

---

## 7. 自定义条目

- 设置页表单：app、type、title、keys/command、description、tags。
- 校验：title 必填；shortcut 需至少一个键位；command 需非空。
- CRUD 写入 `user-entries.json`；即时刷新索引。
- 导入/导出 JSON（含 schemaVersion）。
- 删除仅对用户条目；内置条目可"隐藏"（`hidden: true`）。

---

## 8. 关键实现细节

| 点 | 做法 |
|---|---|
| 单实例 | `app.requestSingleInstanceLock()`，二次启动聚焦已有窗口 |
| 透明窗口 | `transparent: true` + `backgroundColor: '#00000000'` + `frame:false` |
| 点击穿透 | `win.setIgnoreMouseEvents(true, { forward: true })` |
| 压暗/毛玻璃 | Windows 可用 `vibrancy`/`backgroundMaterial: 'acrylic'`（Electron 支持有限，备选半透明纯色） |
| 剪贴板 | `clipboard.writeText`；注意管理员窗口 UIPI 无法粘贴 |
| 自启 | `app.setLoginItemSettings({ openAtLogin: true })` |
| 数据目录 | `app.getPath('userData')` |
| 打包 | `electron-builder` → NSIS 安装包 + portable exe |
| 安全 | `contextIsolation: true`、`nodeIntegration: false`、preload 白名单 |

---

## 9. 数据来源与准确性

| 应用 | 来源 | 数量 | 备注 |
|---|---|---|---|
| Word/Excel/PowerPoint | Microsoft 官方快捷键文档 | 各 60–120 | 标注版本（2019/365） |
| Photoshop | Adobe 官方默认快捷键 | 80–120 | Win/Mac 双列 |
| Git | git-scm 文档 + 常用 cheat sheet | 50–80 | 命令 + 说明 |
| GDB | GNU GDB 文档 | 40–60 | 命令 + 示例 |
| 自定义 | 用户 | — | 持久化 |

> 快捷方式与命令属于事实性信息；自行整理、标注来源，避免整表照搬受版权保护的表格。

---

## 10. 里程碑

| 阶段 | 内容 | 预估 |
|---|---|---|
| **M0** | 项目骨架 + schema + 60 条 seed + 搜索 CLI 原型（验证模糊效果） | 0.5d |
| **M1** | Launcher UI + 全局热键 + 命令复制 + 托盘 | 1d |
| **M2** | 透明快捷键浮层 + 自动消失 + 位置策略 | 0.5d |
| **M3** | 自定义条目 CRUD + 导入/导出 + 设置页 | 1d |
| **M4** | 单实例/自启/打包（NSIS + portable） | 0.5d |
| **M5** | 搜索调优 + golden query 测试 + 体验打磨 | 0.5d |

**合计约 4 天**（不含数据整理时间；数据整理可并行）。

---

## 11. 测试与验收

### 搜索 golden queries
- `word bold`、`ctrl b`、`excel 冻结`、`ps 液化`、`git rebase`、`gdb bt`、`receive`（拼写错误）。
- 验收：Top1 命中率 ≥ 90%（核心 50 条查询）。

### 功能验收
- 全局热键可呼出/隐藏，冲突时可改。
- 命令复制成功（粘贴验证）。
- 快捷键浮层显示正确键帽、3s 消失、不抢焦点。
- 自定义条目重启后仍在。
- 单实例、托盘、自启正常。

### 自动化
- 单元测试：`normalize` / 打分函数。
- E2E（Playwright + Electron）：启动、搜索、复制、弹窗。

---

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| 全局热键冲突 | 注册失败检测 + 设置页改键 + 提供备选组合 |
| 透明窗口抢焦点 | `focusable:false` + `setIgnoreMouseEvents`；提供"可点击"模式 |
| Office/PS 版本差异 | 数据带 `version`/`platform` 字段，UI 标注 |
| 杀软误报 | 代码签名（可选）+ portable 版 |
| 剪贴板 UIPI | 提示"目标窗口为管理员权限时需以管理员运行本工具" |
| 搜索排序差 | 权重调优 + 同义词 + golden set 回归 |
| 数据量大后变慢 | 预计算 searchText + 增量索引；必要时换 MiniSearch |

---

## 13. 待确认

1. 技术栈：接受 Electron（~150MB）还是必须小体积（Tauri 需装 Rust）？
2. 默认热键用 `Ctrl+Alt+K` 可以吗？
3. 是否需要支持 Mac（键位 Cmd/Option）？
4. Office 版本按 2019/365 为准可以吗？
5. "快捷键浮层"是**只看**还是允许**点击复制按键文本**？
6. 自定义条目是否需要**导入 CSV**（便于从文档批量整理）？
