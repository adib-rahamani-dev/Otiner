#!/usr/bin/env bash
set -euo pipefail

COMMAND_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_SCRIPT="$COMMAND_DIR/scripts/build-macos-installer.sh"

if [ "$(uname -s)" != "Darwin" ]; then
    echo "This builder must be opened on a Mac."
    read -r -p "Press Enter to close..."
    exit 1
fi

chmod +x "$BUILD_SCRIPT"
if "$BUILD_SCRIPT" --skip-build; then
    /usr/bin/osascript -e 'display dialog "Oplus Studio PKG was created successfully. The release folder will open now." buttons {"OK"} default button "OK" with icon note'
    /usr/bin/open "$COMMAND_DIR/release"
else
    /usr/bin/osascript -e 'display dialog "The PKG could not be created. Please send a screenshot of this window to the developer." buttons {"OK"} default button "OK" with icon stop'
    read -r -p "Press Enter to close..."
    exit 1
fi
