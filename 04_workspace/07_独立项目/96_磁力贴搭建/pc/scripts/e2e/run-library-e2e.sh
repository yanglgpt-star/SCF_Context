#!/bin/bash
# 跑 M8 端到端。这个测试会**真往 library/works/ 里写东西**（一份新作品 + 一批
# step-NN.svg/png + 一个只有 draft.svg 的不完整目录），残留看起来和真作品一模一样，
# 所以跑完必须还原。
#
# 备份的是整个 library/works/，不是单个目录 —— 脚本自己跑草稿链路造作品，
# 新目录名事先不知道。
#
# 用法：bash scripts/e2e/run-library-e2e.sh
set -u

PC="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$PC/.." && pwd)/library"
SCRATCH="${MCDRV:-/tmp/mcdrv}"
BK="$SCRATCH/libbackup-library"
LOG="$SCRATCH/library-e2e.log"

mkdir -p "$SCRATCH"
rm -rf "$BK"; mkdir -p "$BK"
if [ -d "$LIB/works" ]; then
  cp -R "$LIB/works" "$BK/works"
  echo "已备份 library/works/（$(ls -1 "$LIB/works" | wc -l | tr -d ' ') 个目录）→ $BK/works"
else
  echo "library/works/ 不存在，记下来跑完要删掉"
fi

node "$HERE/library-e2e.mjs" "$@" 2>&1 | tee "$LOG"
CODE=${PIPESTATUS[0]}

echo; echo "---- 还原 ----"
if [ -d "$BK/works" ]; then
  rm -rf "$LIB/works"; cp -R "$BK/works" "$LIB/works"
  echo "已还原 library/works/（$(ls -1 "$LIB/works" | wc -l | tr -d ' ') 个目录）"
else
  rm -rf "$LIB/works"; echo "已删除本轮新建的 library/works/"
fi
exit $CODE
