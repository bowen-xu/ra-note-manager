# ra-note-manager

笔记管理插件，初始版本为 0.1.0。源码、公开入口、资源、锁文件和测试由本工程维护。

## 独立构建

以下命令在本工程根目录执行。SDK 成品目录由其 `artifacts/sdk/latest.json`
定位，目录内包含 `sdk-artifacts.json` 和安装器。

```sh
pnpm sdk:install /absolute/path/to/sdk-package
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
```

SDK 安装在本工程 `.dependencies/sdk/`。`pnpm build` 生成包含 manifest 和前端
资源的完整笔记管理插件包，执行原有源码闭包、兼容、共享实例、资源和许可证校验。
已准备好锁定依赖缓存时，可运行 `pnpm build --offline` 要求离线构建。

## 测试

```sh
RA_WORKBENCH_SDK_DIRECTORY=/absolute/path/to/workbench/apps/web/dist pnpm test
```

UI 测试消费 Workbench 已构建的 /sdk/v1/，沿用生产包相同的 external 路径映射。纯领域测试使用本工程夹具。
单插件协作测试位于 `preview/tests/`，运行 `pnpm test:preview`。它们消费指定版本
的公开预览宿主和本插件源码，沿用 Core 的数据库与 Markdown 测试装配。完整产品
组合验收由父仓负责。Core 私有实现验证留在 Workbench。

笔记正文、资产、索引、保存和 HBS 由 Core 拥有，本插件管理同一资源范围中的目录和业务流程。

## 独立预览

`preview/` 持有仅装配本插件的 Core 笔记管理工作台，使用公开的
`@research-assistant/workbench-preview` 开发包。预览及协作测试需要先将选定版本的
公开宿主安装到 `preview/.dependencies/workbench-preview/`，并安装 `preview/` 的依赖。
SDK 依赖继续来自本工程的 `.dependencies/sdk/`。

父仓库联调时，在父仓库根目录执行 `pnpm prepare:previews` 自动准备这些公开产物
与依赖。随后回到本工程选择以下命令。

```sh
pnpm dev:preview
pnpm build:preview
pnpm typecheck:preview
pnpm test:preview
```

公开开发模块由 `preview/public-modules.json` 列出。

## 构建缓存与产物

| 路径 | 内容 |
|---|---|
| `artifacts/plugin/latest.json` | 当前完整插件包与回执 |
| `artifacts/preview/latest.json` | 当前公开预览包 |
| `.cache/build/` | 构建输入到已有包的索引 |
| `.cache/logs/` | 按次保存的构建日志 |
| `.cache/work/` | 隔离构建工作目录 |
| `node_modules/.vite/`、`preview/node_modules/.vite/` | Vite／Vitest 缓存 |

标准构建入口校验并复用 `artifacts/<kind>/<内容哈希>/package/` 中的完整产物。
回执随产物保存。清理编译缓存后，同输入构建仍可复用已保存的当前包。

工程位于 Research Assistant 父仓库时，可在父仓库根目录运行统一清理入口。

```sh
pnpm clean:cache notes --dry-run
pnpm clean:cache notes
pnpm clean:cache notes --kind logs
```

默认清理编译缓存并保留构建索引。`--kind logs` 选择构建日志，`--kind all`
还清理构建索引及残留隔离工作目录。索引清除后，构建工具回退核对当前
`latest.json` 对应的包，其他历史输入组合可能重新构建。清理范围与命令说明见
父仓库 README 的缓存章节。
