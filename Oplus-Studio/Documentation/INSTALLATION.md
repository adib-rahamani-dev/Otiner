# Installation and first launch

This guide targets Adobe After Effects 2025 (application version 25.x) and CEP/CSXS 12. Oplus Studio is a CEP panel, not a loose JSX script.

## Before installing

1. Close every running After Effects process.
2. Install Node.js 12.22 or newer if you are building from source.
3. Open a terminal in the **Oplus-Studio** repository directory.
4. Run the local verification gate:

       npm run verify

The generated CEP root is **dist/studio.oplus.ae**. Its immediate children include **CSXS**, **UI**, **JSX**, **Engine**, and **Database**. If **CSXS/manifest.xml** is one directory deeper than that after copying, CEP will not discover the panel.

## Unsigned development installation

Unsigned source builds require CEP PlayerDebugMode for the current OS user. This preference relaxes signature checks for development; it is not a substitute for signing a public release.

### Windows, automated

Run:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dev.ps1 -EnableDebug

The script performs a checked build and installs to:

    %APPDATA%\Adobe\CEP\extensions\studio.oplus.ae

The exact expansion normally resembles:

    C:\Users\<username>\AppData\Roaming\Adobe\CEP\extensions\studio.oplus.ae

The installer validates the final target before replacing it. On an update, it preserves any installed **Database** development defaults. Live user settings and the active catalog are outside the installed code bundle.

To enable debug mode separately:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\enable-debug.ps1

Equivalent manual registry operation:

1. Open Registry Editor.
2. Go to **HKEY_CURRENT_USER\Software\Adobe\CSXS.12**.
3. Create a string value named **PlayerDebugMode**.
4. Set it to **1**.

The command-line equivalent is:

    reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f

### macOS, automated

Run:

    chmod +x scripts/*.sh
    ./scripts/install-dev.sh --debug

The script installs to:

    ~/Library/Application Support/Adobe/CEP/extensions/studio.oplus.ae

It also preserves an existing installed **Database** directory during updates.

To enable debug mode separately:

    ./scripts/enable-debug.sh

Equivalent manual command:

    defaults write com.adobe.CSXS.12 PlayerDebugMode 1

If macOS preference caching prevents an immediate change, log out and back in or restart macOS. Restart After Effects in every case.

Adobe documents CEP 12 PlayerDebugMode and Node contexts in the [CEP 12 HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md).

## Manual per-user installation

Build first:

    npm run build

Copy the entire generated **dist/studio.oplus.ae** directory to one of these per-user roots:

- Windows: **C:\Users\<username>\AppData\Roaming\Adobe\CEP\extensions**
- macOS: **~/Library/Application Support/Adobe/CEP/extensions**

Do not copy only **Extension**, and do not rename or move its individual children.

System-wide CEP roots also exist:

- Windows 64-bit: **C:\Program Files (x86)\Common Files\Adobe\CEP\extensions** and **C:\Program Files\Common Files\Adobe\CEP\extensions**
- macOS: **/Library/Application Support/Adobe/CEP/extensions**

System-wide installation normally needs administrator access. The supplied development workflow intentionally uses the per-user root. At runtime, the last selected setting is written beneath the CEP user-data location in **Oplus Studio/settings.json**, while library-specific settings and the catalog live under the chosen root's **Database** directory. The installed **Database** files are clean first-run fallbacks, not the primary mutable store.

Adobe lists CEP discovery paths in the [CEP 12 HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md).

## Confirm the panel loaded

1. Start After Effects 2025.
2. Open **Window > Extensions > Oplus Studio**.
3. Wait for the connection strip to show **Oplus Engine Connected**.
4. Confirm it reports the After Effects version, project state, and library state.

The panel is filtered out when the host is outside manifest range **AEFT [25.0,25.99]**.

## First-run setup

Oplus intentionally ships with an empty **libraryPath**. On first launch:

1. Select **Choose Library Location**.
2. Pick a dedicated writable directory, for example **D:\OplusLibrary** or **/Users/me/Motion/OplusLibrary**.
3. Confirm setup.

Oplus then creates:

    OplusLibrary/
        Database/
            settings.json
            library.json
        Library/
        Cache/
        Logs/
        .Trash/              created by CommonJS soft deletion when used

Each asset under **Library** contains:

    Asset Name/
        asset.json
        data.json
        preview.png

The source defaults are in the installed **Database/settings.json** and **Database/library.json**. The panel copies mutable state to CEP user data and the selected library root. The library path is never synthesized from Documents.

## Disable unsigned-extension mode

After finishing development, remove PlayerDebugMode.

Windows:

    reg delete HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /f

macOS:

    defaults delete com.adobe.CSXS.12 PlayerDebugMode

Restart After Effects.

## Signed release installation

Public distribution should use a certificate-signed ZXP. Adobe's packaging flow uses ZXPSignCmd to sign the staged CEP root, then ExManCmd or a compatible extension manager to install the package. The repository does not create a certificate, store a password, or silently produce an unsigned file with a ZXP suffix.

Start from **dist/studio.oplus.ae** and follow Adobe's [Package, Distribute, Install guide](https://github.com/Adobe-CEP/Getting-Started-guides/blob/master/Package%20Distribute%20Install/readme.md). Keep signing credentials outside source control.

## Common installation failures

### Oplus Studio is absent from Window > Extensions

- Confirm After Effects is version 25.x.
- Confirm the installed path ends in **studio.oplus.ae/CSXS/manifest.xml**.
- Run **npm run check** and address every failure.
- For unsigned builds, verify **PlayerDebugMode** is a string with value **1** under **CSXS.12**.
- Fully quit and restart After Effects after copying files.
- Remove older duplicate bundles with the same manifest ID from other CEP roots.
- Avoid a **#** character anywhere in the installed extension path; CEF treats it specially.

### The panel opens but stays disconnected

- Open the panel connection status and retry.
- Confirm **JSX/bootstrap.jsx** is present in the installed bundle.
- Confirm the manifest **ScriptPath** is **./JSX/bootstrap.jsx**.
- Inspect **Logs/oplus.log** and the CEP host log.
- Re-run **npm run check** to catch missing script references or parse errors.

### Setup cannot write the selected library

- Pick a dedicated non-root directory that the current user can create and modify.
- Do not select a filesystem root such as **C:\** or **/**.
- Avoid read-only network volumes and folders managed by another account.
- If moving a library, change it through Settings so the catalog can refresh from disk.

### Assets are missing after changing locations

Use Refresh. The LibraryEngine scans every direct asset directory, validates **asset.json** and **data.json**, ignores unsafe symbolic links, and reconstructs **Database/library.json**. Invalid folders are reported rather than loaded.
