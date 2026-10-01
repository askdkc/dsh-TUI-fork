# Adapter 边界与上游契约

## 边界规则

官方 `@deepseek-ai/*` 包只允许在 `src/dsh-adapter/` 内被 import。
UI 层(`screens/`、`components/`、`ink/`、`hooks/`、`utils/`、`terminal-utils/`)
一律通过 adapter 的 facade(`src/dsh-adapter/types.ts` 的类型 re-export、
`channel.ts`/`plugin.ts` 等运行期服务)间接接触上游。

门禁:`pnpm run verify:boundary`(扫描全部源码,发现越界 import 即失败;
已挂进 `build`)。

## 上游契约

- 唯一支持版本：`0.2.0-rc.2`。不保留旧 DSH 的 API 分支或测试矩阵。
- peer/dev 范围：`0.2.0-rc.2`。升级时原地替换基线，不累积旧版 OR 范围。
- 白名单包:blessed list(harness 包按完整版本号校验,框架包 cordis/schemastery 按 major 校验)
- 启动时:检测到 drift 打 warning;CI 上 `pnpm run verify:contract` 直接失败

## Patch Surface

`cordis.patch.yml` 里对官方行的干预已快照到 `patch-surface.snapshot.json`:

- **disabled overrides**：23 行，全部按当前 preset 所有权禁用。
- **config overrides**：8 行，包含 TUI persona、DeepSeek 默认值与隐私设置。
- **inserts**：16 行。共享 host 服务使用 TUI 作用域 id，在官方同 id/name 行
  已启用时自行禁用。preset 使用当前声明式 registry；PTC runtime 由 base 提供。
  不再插入旧目录 roster 或旧 code-runtime 行，不做包版本/缺失 API 分派。

上游发版后如果 patch 面变化,`pnpm run verify:patch-surface` 会在 CI 先爆;
确认差异后执行 `node --import tsx/esm scripts/verify-patch-surface.ts --snapshot`
重新生成快照。`pnpm run verify:web-coexistence` 会把 dsh-tui patch 与官方
web-app patch 按 include 语义合成一遍,直接拦截 loader entry id 复用;
当相邻 `deepseek-harness` 源码存在时还会额外校验其 base + web patch。

## 升级流程

- dev 树由 `pnpm-workspace.yaml` 的 overrides 钉在 `0.2.0-rc.2`,
  CI `upstream-contract` lane 对同版上游 tag 的固定 SHA 做源码类型与 patch 合成校验，
  只检查当前基线的源码类型。
  旧 SQLite 迁移工具的依赖闭包单独锁在 `vendor/sqlite-island`。
- `contract.ts` 是唯一真源:主验证线原地替换、不累积;`package.json` 的
  peer/dev 范围、CI 钉住的上游 SHA、校验脚本里的版本常量都只是它的镜像,
  必须同一次改齐(位置见 [docs/contributing.md](docs/contributing.md) 跨文件清单)。
- 上游删掉的包跟着删,不留半悬空的依赖;patch-surface 快照只保留当前 web-app 基线。
- 业务 UI 代码原则上零修改;若最新预发布源码 tsc 报错,修复落在 `src/dsh-adapter/`
  内,直接使用当前 API；不为旧安装增加降级分支。

## 当前 API 接缝

前台 shell 使用 `execute(resolve(spec)).result()`，失败不重复执行。
工具结果直接读取 V4 消息的 `content`、`isError` 和 call-ID。
Live Session 使用 `snapshotEvents()`、exclusive `seq` 与 `inheritedEventCount`。
持久化通过 `open(id, 'read')` 读取，并始终关闭 handle；列表消费 `list({ signal })` 的 snapshot。

Loader 行只调度 TUI runtime，Config 仍由原 Loader 行拥有。
设置使用 Config 的 volatile 字段、owner 的 Loader ID 和更新事件，写入当前 profile。
不注册旧 settings.yaml scope。当前 TUI 自定义事件仍在严格读取前注册；
旧 DSH 格式转换由官方 format catalog 负责，TUI 不自带旧 packed-row decoder。
