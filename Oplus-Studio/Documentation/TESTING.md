# Test and acceptance plan

## Automated engine harness

Run:

    npm test

**Engine/test/run.js** uses a unique operating-system temporary directory and the real CommonJS modules. It currently verifies:

1. Default database initialization with an empty library path.
2. Traversal, invalid id, root removal, and unsafe-path rejection.
3. Settings persistence and explicit library creation.
4. Complete asset bundle creation with metadata, data, and PNG.
5. List, search, category, tag, update, and favorite behavior.
6. Preview description, data URL reading, signature validation, and reserved formats.
7. Import mode normalization, envelope creation, evalScript encoding, and callback parsing.
8. Circular and non-finite JSON rejection.
9. Atomic replacement without leaked temporary files.
10. Catalog reconstruction from asset folders.
11. Recoverable soft deletion.
12. Structured logging and failure-safe logger behavior.

The harness never touches the user's configured library. It cleans only its verified child under the operating-system temporary directory.

## Static source contracts

Run:

    npm run check

This validates manifest paths/runtime/host, panel file references, required modules, JSON parsing, JavaScript syntax, and JSX parsing. See **Documentation/BUILD.md** for its exact boundary.

## Complete local gate

Run before every manual acceptance pass:

    npm run verify

Install the generated build, not the source tree:

    powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-dev.ps1 -EnableDebug

or:

    ./scripts/install-dev.sh --debug

## After Effects 2025 acceptance matrix

Use a disposable project and a new empty Oplus library. Preserve the resulting **Logs/oplus.log** with the test report.

### 1. Extension loading and bridge

1. Start After Effects 2025.
2. Open **Window > Extensions > Oplus Studio**.
3. Confirm the panel is dockable and remains usable at its minimum size.
4. Confirm the connection strip says **Oplus Engine Connected**.
5. Confirm AE version is 25.x.
6. Confirm project status changes between unsaved and saved.
7. Confirm the selected library path is displayed.

Expected: no modal script error, no blank panel, **modulesLoaded** is true, and **moduleErrors** is empty.

### 2. First-run settings persistence

1. Remove or move the existing CEP user-data Oplus settings for this disposable test.
2. Launch the panel.
3. Confirm setup appears and no Documents path is preselected.
4. Choose a non-root writable test folder.
5. Disable automatic thumbnails and choose a non-default import mode.
6. Close the panel and After Effects.
7. Relaunch and reopen the panel.

Expected: setup creates **Database**, **Library**, **Cache**, and **Logs**; the selected path and preferences persist.

### 3. Save selected layers

Create and save separate assets for:

- text layer
- shape layer with nested groups, fill, stroke, path, trim paths, and repeater
- null object
- solid
- adjustment layer
- camera
- light
- multiple parented layers
- layers with 2D and 3D transforms
- motion blur, disabled, locked, and non-normal blend modes
- masks with animated path/feather/opacity/expansion
- effects with animated parameters and expressions
- text animators and range selectors

For each:

1. Select the intended layers.
2. Press Save.
3. Enter a name containing spaces and, once, platform-invalid filename characters.
4. Add duplicate/mixed-case tags.
5. Confirm the new card appears without a panel reload.

Expected: one sanitized asset directory appears and the source comp is unchanged.

### 4. Asset files and JSON

Inspect every saved directory.

Expected:

- **asset.json**, **data.json**, and **preview.png** exist.
- Both JSON files parse.
- Metadata id is unique.
- Name/category/tags/description match the panel.
- created is a valid ISO date.
- afterEffectsVersion matches the host.
- layerCount matches data layers.
- thumbnail is exactly a filename.
- parent references use stable serialized identities/indexes.
- keyframes retain time, value, interpolation, ease, and spatial tangents where applicable.
- expressions remain strings and retain enabled state.

Refresh the panel and verify all cards return.

### 5. Preview generation

Enable automatic thumbnails, save another asset, and inspect the preview.

Expected:

- **preview.png** has a valid PNG signature and is non-empty.
- The card and detail pane display it.
- A preview failure creates a warning/log entry but does not prevent **asset.json** and **data.json** from being written.

Disable automatic thumbnails and save an asset.

Expected: the save remains usable and the UI presents a safe fallback until a preview is generated.

### 6. Import modes

Use a new composition with dimensions and duration different from the source. Test each mode:

| Mode | Expected |
| --- | --- |
| original | Original spatial placement is retained |
| center | Imported group is offset to composition center |
| currentTime | Serialized timing origin lands on the current time indicator |
| originalTime | Original start/in/out times are retained |
| replace | Selected targets are replaced/mapped where supported |

For every mode verify:

- layer order
- parent relationships
- enabled/locked/3D/motion-blur/blend switches
- transforms and timing
- keyframe values/interpolation/ease/tangents
- expressions
- supported effects
- masks
- text document/animators
- shape hierarchy/operators

Expected: unsupported individual properties become warnings/logs; the panel and host remain responsive.

### 7. Undo

After each successful import, invoke Undo once.

Expected: the entire import is removed as one **Oplus Studio: Import Asset** undo step. No partial layer set remains. Redo should restore the imported group when After Effects supports it.

### 8. Library CRUD and recovery

1. Edit an asset's name, category, tags, description, and favorite status.
2. Refresh and restart the panel.
3. Search by name, description, and tag.
4. Filter categories and favorites.
5. Delete an asset.
6. Manually place an invalid folder and malformed JSON under **Library**, then refresh.

Expected: edits persist; filters are accurate; deleted items leave the catalog; invalid folders are skipped and reported without blocking valid assets.

### 9. Failure handling

Exercise:

- no project
- no active composition
- no selected layers
- read-only library folder
- missing data.json
- malformed asset.json
- corrupt PNG
- expression that errors in the target comp
- effect unavailable in the target AE installation
- panel closed during a long operation

Expected: errors are actionable, no unhandled modal JavaScript error appears, After Effects does not crash, and the next valid operation still works.

## Release evidence

Record:

- OS and version
- After Effects exact version/build
- Oplus version and commit
- automated gate output
- pass/fail for each section above
- known warnings
- relevant Oplus log entries
- a screenshot of the connected status and imported result

A release is not accepted on automated tests alone.
