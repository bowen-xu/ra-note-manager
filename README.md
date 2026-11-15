# ra-note-manager

笔记管理插件，初始版本为 0.1.0。源码、公开入口、资源、锁文件和测试由本工程维护。

## 独立构建

```sh
pnpm sdk:install -- /path/to/sdk-artifacts
pnpm install --frozen-lockfile
pnpm build --offline
pnpm typecheck
```

SDK 来自版本化公开产物，安装在本工程 .dependencies/sdk/。构建复用原有源码闭包、兼容、共享实例、资源和许可证校验。产物及回执位于 .tmp/runtime-plugins/。

## 测试

```sh
RA_WORKBENCH_SDK_DIRECTORY=/path/to/workbench-web-dist pnpm test
```

UI 测试消费 Workbench 已构建的 /sdk/v1/，沿用生产包相同的 external 路径映射。纯领域测试使用本工程夹具。涉及 Core 私有夹具或多个工程的回归由主仓库 integration/ 执行。

笔记正文、资产、索引、保存和 HBS 由 Core 拥有，本插件管理同一资源范围中的目录和业务流程。
