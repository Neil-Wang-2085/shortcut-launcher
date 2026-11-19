# Shortcut Launcher for VS Code

在 VS Code 里搜索 **250+ 快捷键 / 命令**，支持中文说明，复制命令或查看键帽，不用切出编辑器。

## 用法

- 快捷键：`Ctrl+Alt+Shift+K`（macOS：`Cmd+Alt+Shift+K`）
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
code --install-extension shortcut-launcher-0.1.0.vsix
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

桌面版（Electron）提供全局热键、透明浮层、自定义条目；扩展版聚焦「在编辑器内快速查/抄」。两者共用同一套数据与搜索逻辑。

桌面版：https://github.com/Neil-Wang-2085/shortcut-launcher

## License

MIT
