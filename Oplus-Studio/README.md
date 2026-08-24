# Oplus Studio

Oplus Studio is a CEP 12 motion-design asset manager for Adobe After Effects 2025 (AEFT 25.x). It saves selected layers as portable JSON bundles, maintains a searchable local catalog, creates PNG preview slots, and restores assets through an undo-safe ExtendScript importer.

The repository is source-first: do not copy the **Extension** folder directly into Adobe's CEP directory. The build merges the panel, host scripts, CommonJS engines, and database defaults into one installable CEP root.

## Quick start

Requirements:

- Adobe After Effects 2025, version 25.x
- Node.js 12.22 or newer for checks and builds
- PowerShell on Windows or Bash on macOS

From this directory:

    npm test
    npm run check
    npm run build

Install an unsigned per-user development build on Windows:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dev.ps1 -EnableDebug

Install one on macOS:

    chmod +x scripts/*.sh
    ./scripts/install-dev.sh --debug

Close After Effects before installing, restart it afterward, then open **Window > Extensions > Oplus Studio**. On first launch, select a writable library location. Oplus does not assume or hardcode the Documents folder.

See [Documentation/INSTALLATION.md](Documentation/INSTALLATION.md) for manual paths, PlayerDebugMode, signing, and troubleshooting.

## Runtime architecture

    CEP panel (HTML/CSS/JavaScript)
        |
        | CSInterface.evalScript()
        v
    ExtendScript bootstrap and AE API engines
        |
        | JSON response: { ok, data, error }
        v
    CommonJS storage engines
        |
        +-- atomic settings and catalog JSON
        +-- Library/<asset>/asset.json
        +-- Library/<asset>/data.json
        +-- Library/<asset>/preview.png
        +-- structured Logs/oplus.log

The Node modules have no runtime package dependencies and are written for CEP's CommonJS context. The aggregate entry point is **Engine/index.js**.

## Repository map

- **Extension/** — CEP manifest, panel UI, CSInterface bridge, and ExtendScript host code
- **Engine/** — library, serializer, import-envelope, preview, and logging modules
- **Database/** — first-run settings and empty catalog defaults
- **Documentation/** — installation, development, build, and test references
- **scripts/** — static checker, deterministic staging build, and safe per-user installers
- **dist/** — generated install root; never edit this directory

## Engine example

    var OplusEngine = require('./Engine');
    var engines = OplusEngine.createEngines({
        projectRoot: __dirname
    });

    if (!engines.library.status().configured) {
        engines.library.configureLibrary('D:/OplusLibrary');
    }

    var asset = engines.library.createAsset({
        metadata: {
            name: 'Spring Title',
            category: 'Text',
            tags: ['title', 'spring']
        },
        data: hostSerializedData
    });

    var jsxCall = engines.imports.createEvalScript(asset.id, {
        mode: 'currentTime'
    });

Full contracts and safety behavior are documented in [Documentation/ENGINE_API.md](Documentation/ENGINE_API.md).

## Verification

Run the complete local gate:

    npm run verify

It checks all source contracts, executes the engine integration harness, then produces **dist/studio.oplus.ae**. Automated tests do not replace the After Effects manual acceptance matrix in [Documentation/TESTING.md](Documentation/TESTING.md).

## Distribution note

The included installers are for unsigned development builds. A public release should be certificate-signed and packaged as ZXP with Adobe's signing tool. No private certificate or signing password belongs in this repository.
