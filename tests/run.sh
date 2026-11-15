#!/bin/bash
# Runs every test suite. Usage: bash tests/run.sh current|privacy
# A suite that fails is run once more (phones on a busy server can be slow); it only counts as failed if it fails twice.
cd "$(dirname "$0")"
MODE=${1:-current}
SUITES="e2e2 e2e3 e2e4 e2e5 e2e6 e2e7 e2e8 e2e9 e2e10 e2e11 e2e12 e2e13 e2e14 e2e15 e2e16 e2e18 e2e19"
if [ "$MODE" = privacy ]; then V2=1 python3 make_mock.py; SUITES="$SUITES e2e17"; else python3 make_mock.py; fi
mkdir -p logs; rm -f logs/*
# a suite passes only if it exits cleanly AND printed no FAIL line (older suites don't set an exit code)
try(){ timeout 420 node "$1.js" > "logs/$1.log" 2>&1; local c=$?; grep -q '^FAIL' "logs/$1.log" && c=1; return $c; }
run(){ try "$1" || { mv "logs/$1.log" "logs/$1.try1.log"; try "$1"; }; echo "$1 $?" >> logs/summary; }
for t in $SUITES; do run "$t" & while [ "$(jobs -r | wc -l)" -ge "${PARALLEL:-2}" ]; do sleep 1; done; done; wait
echo "===== $MODE rules ====="
failed=0
for t in $SUITES; do
  code=$(awk -v t="$t" '$1==t{print $2}' logs/summary)
  passes=$(grep -c '^PASS' "logs/$t.log"); fails=$(grep -c '^FAIL' "logs/$t.log")
  note=""; [ -f "logs/$t.try1.log" ] && note=" (passed on 2nd try)"
  if [ "$code" = 0 ]; then echo "✅ $t: $passes checks passed$note"; else echo "❌ $t: $fails failed"; grep '^FAIL' "logs/$t.log" | sed 's/^/     /'; tail -5 "logs/$t.log" | grep -v '^PASS\|^FAIL\|FAILED$' | sed 's/^/     /'; failed=1; fi
done
exit $failed
