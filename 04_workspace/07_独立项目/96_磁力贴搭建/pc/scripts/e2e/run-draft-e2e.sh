#!/bin/bash
# 跑 M4 端到端（草稿生成页 + 四条分支）。这个测试会**真往 library/works/ 里写东西**：
# 每跑完一条分支就落一份作品（work.json + draft.* + render.png + vision.json）。
#
# 这个 runner 是后补的，但补得有理由：**library/works/ 里那 15 个测试残留就是它
# 留下的**（8 个有完整 work.json、7 个只剩 draft.svg）。当时没有备份还原这一步，
# 于是那些目录在盘上待了一整天，看起来和真作品一模一样。五个 e2e 全都得走 runner。
#
# 用法：bash scripts/e2e/run-draft-e2e.sh
set -u

PC="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$PC/.." && pwd)/library"
SCRATCH="${MCDRV:-/tmp/mcdrv}"
BK="$SCRATCH/libbackup-draft"
LOG="$SCRATCH/draft-e2e.log"

mkdir -p "$SCRATCH"
rm -rf "$BK"; mkdir -p "$BK"
if [ -d "$LIB/works" ]; then
  cp -R "$LIB/works" "$BK/works"
  echo "已备份 library/works/（$(ls -1 "$LIB/works" | wc -l | tr -d ' ') 个目录）→ $BK/works"
else
  echo "library/works/ 不存在，记下来跑完要删掉"
fi

node "$HERE/draft-e2e.mjs" "$@" 2>&1 | tee "$LOG"
CODE=${PIPESTATUS[0]}

echo; echo "---- 还原 ----"
if [ -d "$BK/works" ]; then
  rm -rf "$LIB/works"; cp -R "$BK/works" "$LIB/works"
  echo "已还原 library/works/（$(ls -1 "$LIB/works" | wc -l | tr -d ' ') 个目录）"
else
  rm -rf "$LIB/works"; echo "已删除本轮新建的 library/works/"
fi
exit $CODE
