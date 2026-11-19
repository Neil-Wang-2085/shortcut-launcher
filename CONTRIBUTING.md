# Contributing

感谢愿意帮忙。最需要的贡献是**补充快捷键/命令数据**和**修正中文说明**。

## 开发环境

- Node.js 22+
- Windows 10/11

```powershell
npm install
npm test
npm start
```

## 数据贡献（最需要）

1. 在 `src/shared/data/<app>.json` 增加条目（没有对应 app 可新建文件，并在 `src/shared/data.ts` 注册）
2. 在 `src/shared/zh-desc.ts` 增加中文说明（key 为条目 `id`）
3. 可选：在 `src/shared/zh-aliases.ts` 增加中文别名（帮助同义词搜索）
4. 运行 `npm test`，确保 31 项测试通过
5. 提交 PR，附上官方文档链接

### 条目格式

快捷键：

```json
{
  "id": "vscode.command-palette",
  "app": "vscode",
  "type": "shortcut",
  "title": "Command Palette",
  "keys": { "win": "Ctrl+Shift+P" },
  "description": "Run any command by name",
  "tags": ["command", "palette"],
  "platform": "win",
  "builtin": true
}
```

命令：

```json
{
  "id": "git.amend-author",
  "app": "git",
  "type": "command",
  "title": "Change last commit author",
  "command": "git commit --amend --author=\"Name <email>\" --no-edit",
  "description": "Rewrite the author of the most recent commit",
  "tags": ["author", "amend"],
  "platform": "all",
  "builtin": true
}
```

约定：

- `id` 用 `app.slug`，全局唯一
- 快捷键放 `keys.win`；mac 键位可留空
- 命令里的待填参数用 `<url>` / `<branch>` 形式，启动器会自动识别并弹出补参编辑条
- `tags` 用英文小写；中文同义词放 `zh-aliases.ts`

### 数据准确性

- 优先引用官方文档；**不要整表照抄**受版权保护的快捷键表
- 注明适用版本（如 Office 365、Photoshop 2024）
- 中文说明简洁直白，避免机翻腔
- 同一功能在不同版本有差异时，以当前主流版本为准并在 description 里说明

## 代码贡献

- 保持轻量：运行时依赖只有 `fuse.js`
- 搜索/排序逻辑改动必须补测试（`tests/search.test.ts`）
- 提交前运行：

```powershell
npm test
npm run build
```

## Pull Request

- 一个 PR 聚焦一个主题
- 说明改了什么、怎么验证的
- 数据类 PR 请附来源链接

## 行为准则

- 友善、就事论事
- 不提交与项目无关的广告或引流内容
