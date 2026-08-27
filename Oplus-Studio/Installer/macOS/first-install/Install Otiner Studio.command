#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$SCRIPT_DIR/Install Otiner Studio.app/Contents/MacOS/OtinerInstaller"
if [ ! -x "$INSTALLER" ]; then
    /bin/chmod +x "$INSTALLER" 2>/dev/null || true
fi
exec "$INSTALLER"
