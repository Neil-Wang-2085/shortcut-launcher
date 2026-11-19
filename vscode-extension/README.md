# Shortcut Launcher for VS Code

在 VS Code 里搜索 **250+ 快捷键 / 命令**，支持中文说明，复制命令或查看键帽，不用切出编辑器。

## 用法

- 快捷键：`Ctrl+Alt+S`（macOS：`Cmd+Alt+S`）
- 命令面板：`Shortcut Launcher: Search Shortcuts & Commands`
- 状态栏：点击右下角 `⌨ Shortcuts`

搜索：

| 输入 | 作用 |
|---|---|
| `word bold` | 多词 AND |
| `ctrl b` | 按按键组合找 |
| `加粗` / `冻结窗格` | 中文说明直接搜 |
| `git 改作者名字` | 中英混合 |

执行：

- **命令**：复制到剪贴板；提示里可点「插入终端」直接执行
- **快捷键**：在底部打开键帽面板，展示按键 + 中文说明

## 自定义命令

两种方式：

1. 快捷键 **`Ctrl+Alt+N`**（macOS：`Cmd+Alt+N`），或搜索面板底部 **＋ 新增自定义命令…**
2. 命令面板执行 `Shortcut Launcher: Add Custom Command`

> 想换成别的键：`Ctrl+K Ctrl+S` 打开键盘快捷方式，搜索 `Shortcut Launcher: Add Custom Command`，点铅笔图标重新录制即可。

其他命令：

- `Shortcut Launcher: Edit Custom Entry`：编辑已有自定义条目
- `Shortcut Launcher: Manage Custom Entries`：打开管理面板（右侧按钮可编辑 / 删除）
- `Shortcut Launcher: Delete Custom Entry`：删除（带确认）
- `Shortcut Launcher: Import Custom Entries (JSON)`：导入 JSON（数组或 `{ "entries": [...] }`）
- `Shortcut Launcher: Open Custom Entries File`：直接编辑存储文件

> 搜索结果里，自定义条目右侧会显示「编辑 / 删除」按钮（鼠标悬停可见）；内置条目只读，不显示按钮。

存储位置：VS Code 的 globalStorage

```
.../User/globalStorage/neilwang.shortcut-launcher/custom-entries.json
```

格式与桌面版一致，可直接从桌面版的 `user-entries.json` 复制过来。

## 从文件夹导入（可视化）

命令面板执行 `Shortcut Launcher: Import Commands from Folder…`，会打开一个面板：

1. 输入或选择文件夹路径
2. 点「扫描」：递归扫描该目录下所有 `.json`（跳过 `node_modules`、`.git`、`dist`、`out`）
3. 默认勾选「扫描后自动导入」；也可以取消勾选，先看预览再点「导入全部」
4. 支持三种 JSON 结构：数组、`{ "entries": [...] }`、桌面版的 `user-entries.json`

> 没有 `id` 的条目会按「文件路径 + 序号」生成稳定 id，重复扫描不会重复导入。

## 内置数据

250 条，覆盖 Office 三件套、Photoshop、Git、GDB、Windows、VS Code、Chrome/Edge、终端、CMake/Make、Outlook。

数据与桌面版共用：`src/shared/data/*.json`、`src/shared/zh-desc.ts`。

## 安装

### 从 Marketplace

在 VS Code 扩展面板搜索 **Shortcut Launcher**，或：

```bash
code --install-extension neilwang.shortcut-launcher
```

### 从 VSIX

```bash
code --install-extension shortcut-launcher-0.2.4.vsix
```

### 从源码

```bash
cd vscode-extension
npm install
npm run build
npm run package
```

## 开发

```bash
npm install
npm run build      # esbuild 打包到 dist/extension.js
npm run typecheck  # tsc --noEmit
npm run package    # 生成 .vsix
```

在 VS Code 里按 `F5` 启动扩展开发宿主即可调试。

## 与桌面版的关系

桌面版（Electron）提供全局热键、透明浮层、自定义条目、从网址导入；扩展版聚焦「在编辑器内快速查/抄」与「从文件夹批量导入命令」。两者共用同一套数据与搜索逻辑。

桌面版：https://github.com/Neil-Wang-2085/shortcut-launcher

## License

MIT
