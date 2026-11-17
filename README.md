# 笔记管理插件

独立 Git submodule 和 pnpm 工程，当前已建立 TypeScript 迁移目录。

| 目录 | 职责 |
|---|---|
| `src` | 笔记管理生产前端、公开入口与激活 |
| `preview/src` | 公开 Workbench 宿主上的数据适配预览 |
| `tests/contracts` | 插件自有管理与公开契约验收 |

笔记文档、资源、保存与 HBS 由 Core 拥有。本插件通过公开 SDK 管理目录与组织流程。
依赖、锁文件和严格 TypeScript 配置由本工程维护，可执行入口随能力迁移加入。
