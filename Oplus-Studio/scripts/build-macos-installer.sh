#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKIP_BUILD=0
if [ "${1:-}" = "--skip-build" ]; then
    SKIP_BUILD=1
elif [ "$#" -gt 0 ]; then
    echo "Unknown option: $1" >&2
    exit 2
fi

if command -v node >/dev/null 2>&1; then
    VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
else
    VERSION="$(/usr/bin/sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROJECT_ROOT/package.json" | /usr/bin/head -n 1)"
fi
if [ -z "$VERSION" ]; then
    echo "Could not read the Otiner Studio version." >&2
    exit 1
fi
BUILD_ROOT="$PROJECT_ROOT/dist/studio.oplus.ae"
RELEASE_ROOT="$PROJECT_ROOT/release"
WORK_ROOT="$RELEASE_ROOT/.macos-pkg-work"
PAYLOAD_ROOT="$WORK_ROOT/payload"
COMPONENT_PKG="$WORK_ROOT/OplusStudio-component.pkg"
OUTPUT_PKG="$RELEASE_ROOT/Otiner-Studio-Installer-macOS-$VERSION.pkg"
INSTALL_PATH="$PAYLOAD_ROOT/Library/Application Support/Adobe/CEP/extensions/studio.oplus.ae"
SCRIPTS_PATH="$PROJECT_ROOT/Installer/macOS/scripts"
PACKAGE_SCRIPTS="$WORK_ROOT/scripts"

safe_remove_work_root() {
    if [ "$WORK_ROOT" != "$RELEASE_ROOT/.macos-pkg-work" ] || [ -z "$RELEASE_ROOT" ]; then
        echo "Refusing unsafe package-work cleanup target: $WORK_ROOT" >&2
        exit 1
    fi
    if [ -e "$WORK_ROOT" ] || [ -L "$WORK_ROOT" ]; then
        rm -rf -- "$WORK_ROOT"
    fi
}

if [ "$(uname -s)" != "Darwin" ]; then
    echo "A macOS .pkg can only be built on a Mac." >&2
    exit 1
fi
command -v pkgbuild >/dev/null 2>&1 || { echo "pkgbuild is missing." >&2; exit 1; }
command -v productbuild >/dev/null 2>&1 || { echo "productbuild is missing." >&2; exit 1; }

if [ "$SKIP_BUILD" -eq 0 ]; then
    command -v node >/dev/null 2>&1 || { echo "Node.js is required unless --skip-build is used." >&2; exit 1; }
    node "$SCRIPT_DIR/build.js"
fi
if [ ! -d "$BUILD_ROOT" ]; then
    echo "Built extension is missing: $BUILD_ROOT" >&2
    exit 1
fi
mkdir -p "$RELEASE_ROOT"
safe_remove_work_root
mkdir -p "$INSTALL_PATH"
cp -R "$BUILD_ROOT/." "$INSTALL_PATH/"
mkdir -p "$PACKAGE_SCRIPTS"
cp "$SCRIPTS_PATH/postinstall" "$PACKAGE_SCRIPTS/postinstall"
chmod +x "$PACKAGE_SCRIPTS/postinstall"

pkgbuild \
    --root "$PAYLOAD_ROOT" \
    --scripts "$PACKAGE_SCRIPTS" \
    --identifier "studio.oplus.ae.installer" \
    --version "$VERSION" \
    --install-location "/" \
    "$COMPONENT_PKG"

if [ -n "${OPLUS_MAC_INSTALLER_ID:-}" ]; then
    productbuild --sign "$OPLUS_MAC_INSTALLER_ID" --package "$COMPONENT_PKG" "$OUTPUT_PKG"
else
    productbuild --package "$COMPONENT_PKG" "$OUTPUT_PKG"
    echo "WARNING: PKG is not Developer ID signed or notarized. Use only for internal testing." >&2
fi

safe_remove_work_root
echo "Created: $OUTPUT_PKG"
