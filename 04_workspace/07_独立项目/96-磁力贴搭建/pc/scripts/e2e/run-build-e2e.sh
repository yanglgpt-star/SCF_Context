#!/bin/bash
# 跑 M6 端到端。这个测试会**真往 library/works/ 里写东西**：
#   - 草稿链路落一份新作品（work.json / render.png / render.svg / vision.json）
#   - Build 页保存一次，覆盖那份 work.json
#   - 上传一张照片（works/<id>/photo-01.*）
# 跑完必须还原，否则这些测试残留就混进用户真实的 library 里了 —— 而它们看起来
# 和真作品一模一样（有完整 work.json、有成品图），是最难分辨的一类垃圾。
#
# 用法：bash scripts/e2e/run-build-e2e.sh
# 跑之前先 `npm run dev`，再按 scripts/e2e/README 起一个带 --remote-debugging-port 的 Chrome。
set -u

PC="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$PC/.." && pwd)/library"
SCRATCH="${MCDRV:-/tmp/mcdrv}"
BK="$SCRATCH/libbackup-build"
LOG="$SCRATCH/build-e2e.log"

mkdir -p "$SCRATCH"
rm -rf "$BK"; mkdir -p "$BK"

# works/ 整个目录快照（这一轮测试只碰 works/，不碰 shapes.json / measure.json / shots/）
if [ -d "$LIB/works" ]; then
  cp -R "$LIB/works" "$BK/works"
  echo "已备份 library/works/（$(ls -1 "$LIB/works" | wc -l | tr -d ' ') 个目录）→ $BK/works"
else
  echo "library/works/ 不存在，记下来跑完要删掉"
fi

node "$HERE/build-e2e.mjs" "$@" 2>&1 | tee "$LOG"
CODE=${PIPESTATUS[0]}

echo
echo "---- 还原 ----"
if [ -d "$BK/works" ]; then
  rm -rf "$LIB/works"
  cp -R "$BK/works" "$LIB/works"
  echo "已还原 library/works/（$(ls -1 "$LIB/works" | wc -l | tr -d ' ') 个目录）"
else
  rm -rf "$LIB/works"
  echo "已删除本轮新建的 library/works/"
fi
echo "shapes.json 之类的其它文件本轮没碰，未动"

exit $CODE
