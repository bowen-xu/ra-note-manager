# ra-note-manager

笔记管理插件，初始版本为 0.1.0。源码、公开入口、资源、锁文件和测试由本工程维护。

## 独立构建

```sh
pnpm sdk:install -- /path/to/sdk-artifacts
pnpm install --frozen-lockfile
pnpm build --offline
pnpm typecheck
```

SDK 来自版本化公开产物，安装在本工程 .dependencies/sdk/。构建复用原有源码闭包、兼容、共享实例、资源和许可证校验。可复用插件包及回执位于 artifacts/plugin/，Native 独立包位于 artifacts/native/。

## 测试

```sh
RA_WORKBENCH_SDK_DIRECTORY=/path/to/workbench-web-dist pnpm test
```

UI 测试消费 Workbench 已构建的 /sdk/v1/，沿用生产包相同的 external 路径映射。纯领域测试使用本工程夹具。涉及 Core 私有夹具或多个工程的回归由主仓库 tests/acceptance/ 执行。

笔记正文、资产、索引、保存和 HBS 由 Core 拥有，本插件管理同一资源范围中的目录和业务流程。

## 独立预览

preview/ 持有仅装配本插件的 Core 笔记管理工作台，使用公开的 @research-assistant/workbench-preview 开发包。
父仓 pnpm prepare:previews 准备公开依赖后，可在本项目运行 pnpm dev:preview、pnpm build:preview 和 pnpm typecheck:preview。
公开开发模块由 preview/public-modules.json 列出，产物保存在 artifacts/preview/。

## 构建缓存与产物

标准构建入口复用通过完整性校验的既有包。产物在本工程 `artifacts/<kind>/<内容哈希>/package/`，当前入口在 `artifacts/<kind>/latest.json`。回执随产物保存，`.cache/build` 保存索引，`.cache/logs` 保存日志，`.cache/work` 为完成后清理的隔离工作目录。清理编译缓存后仍可复用已保存的当前包。
