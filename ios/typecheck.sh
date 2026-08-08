#!/bin/bash
# Type-check the whole app against the iOS simulator SDK.
#
# This exists because compiling the full app bundle needs an installed iOS
# simulator *runtime* (actool refuses without one), while type checking only
# needs the SDK. It catches essentially every Swift mistake and runs in a couple
# of seconds, so it is the fast inner loop even once the runtime is installed.
#
#   ./typecheck.sh
set -euo pipefail

cd "$(dirname "$0")"

SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
ARCH="$(uname -m)"

# shellcheck disable=SC2046
xcrun --sdk iphonesimulator swiftc \
  -typecheck \
  -parse-as-library \
  -target "${ARCH}-apple-ios17.0-simulator" \
  -sdk "$SDK" \
  $(find Nimbus -name '*.swift' | sort)

echo "typecheck ok: $(find Nimbus -name '*.swift' | wc -l | tr -d ' ') files"
