# 笔搭

> VS Code 小说创作工作流助手，配合 Kilo Code 等 AI 插件辅助写作。

## 这是什么？

笔搭是一个 VS Code 扩展，帮你把 VS Code 变成一个小说创作工作台。它本身不写小说，而是：

- **管理创作流程**：以章节为循环（计划→写作→检查→修订→归档），引导你一步步写
- **管理小说设定**：人物卡、设定卡、伏笔、时间线，防止长篇写到后面忘记前面的设定
- **配合 AI 审稿**：与 Kilo Code 等 AI 插件通过文件协作，AI 审稿后你逐条接受/拒绝/合并建议
- **作者始终掌控**：AI 只建议不代写，正文修改必须由你确认

## 安装

### 方式一：从 GitHub Release 安装（推荐）

1. 前往 [Releases 页面](https://github.com/nex-coding2/novel-companion-bida/releases)
2. 下载最新版本的 `novel-companion-0.1.0.vsix` 文件
3. 打开 VS Code，按 `Ctrl+Shift+P`，输入 `Install from VSIX`
4. 选择下载的 `.vsix` 文件，安装后重载窗口

### 方式二：从源码构建

```bash
git clone https://github.com/nex-coding2/novel-companion-bida.git
cd novel-companion-bida
npm install
npm run build
```
然后用 F5 调试运行，或 `npx @vscode/vsce package` 自行打包。

### 安装后配置

1. 安装 Kilo Code 或其他 AI 插件
2. `Ctrl+Shift+P` → `笔搭: 安装 AI 技能文件` → 安装技能到 Kilo Code

## 快速开始

1. 用 VS Code 打开一个空文件夹
2. `Ctrl+Shift+P` → 输入 `新建小说项目` → 按向导填写
3. 侧边栏「章节大纲」点「+」→ 新建章节
4. 在 `draft.md` 中写正文，状态栏实时显示字数
5. 写满 30 分钟后状态栏提示审稿 → 点击生成 AI 任务
6. 复制任务路径 → 粘贴到 Kilo Code → AI 审稿
7. 结果自动导入 → 打开审阅面板 → 逐条接受/拒绝/合并

## 侧边栏功能

| 分块 | 作用 |
|------|------|
| 小说信息 | 书名、作者、题材、卷数、章节数、总字数、故事梗概 |
| 章节大纲 | 章节列表（按卷分组），点击打开大纲 |
| 正文 | 章节列表（按卷分组），点击打开正文 |
| 人物 | 人物卡（按角色类型分组） |
| 设定 | 设定卡（按分类分组） |
| 伏笔 | 伏笔管理（按状态分组，可回收） |
| 时间线 | 时间线管理（含 Mermaid 有向图） |

## 核心理念

- **作者是主笔，AI 是助手** — AI 默认只建议，不直接改正文
- **文件协议驱动** — 与 AI 插件通过文件通信，不绑定特定厂商
- **本地优先** — 所有数据是 Markdown/YAML/JSON，支持 Git 版本管理

## 技能文件

笔搭自带 3 个技能文件，可安装到 Kilo Code 增强协作：

- **小说审稿** — 指导 AI 读取任务文件、生成审稿建议
- **小说灵感辅助** — 指导 AI 提供方案而非代写
- **设定一致性检查** — 指导 AI 检查设定矛盾

## 详细文档

完整使用说明见仓库 `docs/使用说明.md`。

## 许可证

MIT
