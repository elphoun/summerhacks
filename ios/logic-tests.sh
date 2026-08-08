#!/bin/bash
# Run the exploration-model tests on macOS.
#
# The model layer is plain Swift + CoreLocation, so it can be compiled and run
# natively — no simulator, no app bundle. Which means the invariant that matters
# most (one explorer's travel never uncovers ground for another) is verified on
# every change in about two seconds.
#
#   ./logic-tests.sh
set -euo pipefail

cd "$(dirname "$0")"

BIN="$(mktemp -d)/logic-tests"

xcrun swiftc \
  -o "$BIN" \
  Nimbus/Config.swift \
  Nimbus/Model/Place.swift \
  Nimbus/Services/ExplorationStore.swift \
  LogicTests/main.swift

"$BIN"
