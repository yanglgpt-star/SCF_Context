#!/bin/bash
# 跑 M5 端到端。这个测试会真往 library/ 里写 shapes.json、measure.json、shots/
# —— 而且写的是「卡尺实测」这个**假来源**。跑完必须还原，否则用户真实的 library
# 里会留下一条假的来源说明（这是五个 e2e 里唯一一个不碰 works/ 的）。
#
# 用法：bash scripts/e2e/run-measure-e2e.sh
set -u

PC="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
LIB="$(cd "$PC/.." && pwd)/library"
SCRATCH="${MCDRV:-/tmp/mcdrv}"
BK="$SCRATCH/libbackup"
LOG="$SCRATCH/measure-e2e.log"

mkdir -p "$SCRATCH"
rm -rf "$BK"; mkdir -p "$BK"
cp "$LIB/shapes.json" "$BK/shapes.json"
had_measure=0; [ -f "$LIB/measure.json" ] && { had_measure=1; cp "$LIB/measure.json" "$BK/measure.json"; }
had_shots=0;   [ -d "$LIB/shots" ]        && { had_shots=1;   cp -R "$LIB/shots" "$BK/shots"; }

node "$HERE/measure-e2e.mjs" "$@" 2>&1 | tee "$LOG"
CODE=${PIPESTATUS[0]}

# 还原
cp "$BK/shapes.json" "$LIB/shapes.json"
[ $had_measure -eq 0 ] && rm -f "$LIB/measure.json"
[ $had_measure -eq 1 ] && cp "$BK/measure.json" "$LIB/measure.json"
if [ $had_shots -eq 0 ]; then rm -rf "$LIB/shots"; else rm -rf "$LIB/shots"; cp -R "$BK/shots" "$LIB/shots"; fi

echo ""
echo "library 已还原：shapes.json source = $(grep -o '"source": "[^"]*"' "$LIB/shapes.json")"
[ -f "$LIB/measure.json" ] && echo "  （measure.json 是跑之前就有的，已还原）" || echo "  （measure.json 已清掉）"
[ -d "$LIB/shots" ] && echo "  （shots/ 是跑之前就有的，已还原）" || echo "  （shots/ 已清掉）"
exit $CODE
