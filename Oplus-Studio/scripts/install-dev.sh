#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_ROOT="$PROJECT_ROOT/dist/studio.oplus.ae"
SKIP_BUILD=0
ENABLE_DEBUG=0

for argument in "$@"; do
    case "$argument" in
        --skip-build) SKIP_BUILD=1 ;;
        --debug) ENABLE_DEBUG=1 ;;
        *)
            echo "Unknown option: $argument" >&2
            exit 2
            ;;
    esac
done

if [ "$SKIP_BUILD" -eq 0 ]; then
    node "$SCRIPT_DIR/build.js"
fi
if [ ! -d "$BUILD_ROOT" ]; then
    echo "Built extension is missing: $BUILD_ROOT" >&2
    exit 1
fi

EXTENSIONS_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
TARGET="$EXTENSIONS_ROOT/studio.oplus.ae"
case "$TARGET" in
    "$EXTENSIONS_ROOT"/*) ;;
    *)
        echo "Refusing unsafe install target: $TARGET" >&2
        exit 1
        ;;
esac
if [ "$TARGET" = "$EXTENSIONS_ROOT" ]; then
    echo "Refusing to replace the CEP extensions root." >&2
    exit 1
fi

mkdir -p "$EXTENSIONS_ROOT"
BACKUP_ROOT=""
if [ -d "$TARGET/Database" ]; then
    BACKUP_ROOT="$(mktemp -d -t oplus-studio-database)"
    cp -R "$TARGET/Database" "$BACKUP_ROOT/Database"
fi
if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    rm -rf -- "$TARGET"
fi
cp -R "$BUILD_ROOT" "$TARGET"
if [ -n "$BACKUP_ROOT" ]; then
    rm -rf -- "$TARGET/Database"
    cp -R "$BACKUP_ROOT/Database" "$TARGET/Database"
    rm -rf -- "$BACKUP_ROOT"
fi

if [ "$ENABLE_DEBUG" -eq 1 ]; then
    defaults write com.adobe.CSXS.12 PlayerDebugMode 1
fi

echo "Installed Oplus Studio to $TARGET"
if [ "$ENABLE_DEBUG" -eq 1 ]; then
    echo "Enabled CEP 12 PlayerDebugMode for the current user."
fi
echo "Restart After Effects, then open Window > Extensions > Oplus Studio."
