#!/bin/sh
# dsh-cli 本地 tarball 安装。
# 走官方 dsh CLI 的 profile 插件机制：`add` 自动初始化 profile（首层
# dsh-base），pnpm 安装后按 dsh.bundle.patch 元数据把本包追加为 bundle
# 层；本包的 patch 会一并 insert 工作状态行（dsh-working-activity，作为
# npm 依赖自动带入），一条命令全部就绪。
# 先按 README 构建并打包本 fork，再把 tarball 路径作为参数传入。
set -eu

if ! command -v dsh >/dev/null 2>&1; then
  echo "未检测到 dsh CLI。先安装官方客户端：" >&2
  echo "  npm install -g @deepseek-ai/dsh" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "未检测到 pnpm。dsh plugin 把安装转发给 pnpm，请先安装：" >&2
  echo "  npm install -g pnpm   （或启用 corepack：corepack enable pnpm）" >&2
  exit 1
fi

if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
  echo "用法：sh install.sh /path/to/askdkc-dsh-cli-<version>.tgz" >&2
  exit 2
fi

dsh plugin --profile dsh-cli add "$1"
echo
echo "安装完成。启动：dsh --profile dsh-cli"
echo "全局安装本包后也可运行 dsh-cli。"
echo
echo "注意：不要再对同一 profile 单独 add dsh-working-activity——它已随"
echo "dsh-cli 的补丁层自动挂载，重复 add 会产生重复行。想调参（如"
echo "publishIntervalMs）在 \$DSH_HOME/profiles/dsh-cli/cordis.patch.yml 按 id 覆盖："
echo "  - id: working-activity"
echo "    config:"
echo "      publishIntervalMs: 500"
