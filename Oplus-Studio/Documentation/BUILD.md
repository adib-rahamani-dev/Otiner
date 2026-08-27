# Build and release guide

## Toolchain

The runtime has no npm dependencies and no bundler. Node.js 12.22 or newer is sufficient for the engine harness, static checks, and staging build. After Effects is needed only for host acceptance tests.

Because there are no packages to install, a clean checkout can run:

    npm run verify

The command sequence is:

1. **npm run check**
2. **npm test**
3. **npm run build**

## Static contract gate

**scripts/check.js** fails the build when it finds:

- missing **CSXS/manifest.xml**
- malformed manifest tag nesting
- an AE host range other than **AEFT [25.0,25.99]**
- a runtime other than **CSXS 12**
- missing **--enable-nodejs**
- manifest MainPath or ScriptPath traversal/missing targets
- mismatched extension IDs
- missing local script, stylesheet, or image references from panel HTML
- missing CommonJS engine entry points
- JavaScript syntax errors using Node **--check**
- JSX parser errors after removing #target, #targetengine, and #include directives
- malformed package, settings, or catalog JSON

This is a structural gate, not an After Effects emulator. It cannot confirm AE property availability, render-queue output, expression evaluation, layer parenting, or undo behavior.

Run it alone:

    npm run check

## Staging build

Run:

    npm run build

The build:

1. Runs the static contract gate.
2. Verifies all source directories exist.
3. Validates the exact generated target before cleaning.
4. Rejects symbolic links in build sources.
5. Copies **Extension** contents to the CEP root.
6. Adds production **Engine** modules without the test harness.
7. Adds clean **Database** defaults.
8. Creates writable runtime placeholders for **Logs** and **Cache**.
9. Writes non-secret **build-info.json**.

Output:

    dist/
        studio.oplus.ae/
            CSXS/
            UI/
            JSX/
            Engine/
            Database/
            Logs/
            Cache/
            build-info.json

Clean only:

    npm run clean

For diagnostics only, skip the contract gate:

    node scripts/build.js --skip-check

Do not use **--skip-check** in CI or for a release candidate.

Production builds omit the source **Extension/.debug** descriptor. Use
**npm run build:debug** only when remote CEF inspection is intentionally needed.

## One-click installers

Windows (requires Inno Setup 6):

    npm run installer:windows

macOS (must run on macOS; uses Apple's pkgbuild and productbuild):

    npm run installer:mac

Both generated installers bundle the complete staged extension. They are intended
for internal testing because they enable CEP 12 PlayerDebugMode. Public releases
should use the signed ZXP path below, or a fully signed/notarized installer chain.

Detailed Persian handoff instructions are in **README-EASY-INSTALL.md**.

## Drag-and-drop update package

Build the Windows-authored cross-platform update ZIP with:

    npm run package:update:windows

The output is **release/Otiner-Update-<version>.zip**. Users can drag this file
onto the Otiner Update dialog. The updater rejects traversal, symbolic links,
wrong bundle IDs, malformed versions, oversized payloads, and non-newer builds.
It stores a rollback backup beneath CEP user data and preserves installed
Database, Logs, and Cache directories before replacing extension code.

## Development deployment

Windows:

    npm run install:dev:windows

To build, install, and enable unsigned mode in one command:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dev.ps1 -EnableDebug

macOS:

    npm run install:dev:mac

Or include debug mode:

    ./scripts/install-dev.sh --debug

Both installers target only the current user's CEP root. They check the target before recursive replacement and preserve an existing installed **Database** directory. Pass **-SkipBuild** on Windows or **--skip-build** on macOS only when **dist/studio.oplus.ae** is already verified.

## Versioning checklist

For a release, update these values together:

1. **package.json** version
2. Manifest **ExtensionBundleVersion**
3. Manifest Extension version in **ExtensionList**
4. ExtendScript **OPLUS.version**
5. Any release notes and package filename

Keep **schemaVersion** separate from the application version. Increment schemaVersion only when stored JSON compatibility changes, and add an explicit migration before shipping.

The manifest host range should stay on 25.x for the After Effects 2025 release line. A future AE release should be admitted only after executing the full manual matrix.

## CI example

A minimal platform-independent CI step is:

    node --version
    npm run verify

Archive **dist/studio.oplus.ae** as an unsigned test artifact. Do not publish that directory as a signed release.

Recommended CI additions:

- Run on Windows and macOS because path rules differ.
- Preserve the complete test output.
- Hash or archive the staged directory after verification.
- Scan the artifact for private keys, P12 files, and secrets.
- Require manual After Effects acceptance for a release tag.

## Signed ZXP release

Adobe's public distribution flow expects a signed ZXP. Obtain Adobe's ZXPSignCmd separately and use a code-signing certificate that is not committed to the repository.

A typical signing shape is:

    ZXPSignCmd -sign <input-extension-directory> <output.zxp> <certificate.p12> <password> -tsa <timestamp-url>

Use **dist/studio.oplus.ae** as the input extension directory. Verify the resulting package with the signing tool before distribution. Inject the certificate path and password from a secure CI secret store, never package.json or a shell script in source control.

The repository wrapper builds, signs, and verifies in one command after setting
**ZXPSIGNCMD_PATH**, **OPLUS_ZXP_CERTIFICATE**, and **OPLUS_ZXP_PASSWORD**:

    npm run package:zxp

Follow Adobe's current [Package, Distribute, Install guide](https://github.com/Adobe-CEP/Getting-Started-guides/blob/master/Package%20Distribute%20Install/readme.md) for ZXPSignCmd/ExManCmd acquisition and release installation.

## Reproducibility notes

Source JSON serialization is deterministic because object keys are sorted before atomic writes. The staged file set and **build-info.json** contain no build timestamp or machine path. Filesystem metadata can still differ between copies, so package-level reproducibility requires the chosen archive/signing tool to normalize timestamps and permissions.
