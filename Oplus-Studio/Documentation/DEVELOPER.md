# Developer guide

## Design boundaries

Oplus Studio separates three runtimes that have different language and security constraints:

1. **CEP browser context** renders the panel, uses CSInterface, and coordinates workflows.
2. **CEP Node context** performs local filesystem work. It is enabled by the manifest and uses CommonJS modules with no external runtime dependencies.
3. **After Effects ExtendScript context** accesses app, project, compositions, layers, properties, render queues, and undo groups.

Do not pass functions, host objects, File instances, or cyclic objects between these contexts. Every bridge input and result is JSON.

The source layout and built layout differ:

    Source                         Built CEP root
    Extension/CSXS       ->        CSXS/
    Extension/UI         ->        UI/
    Extension/JSX        ->        JSX/
    Engine               ->        Engine/
    Database             ->        Database/

Always test the built root when diagnosing path behavior.

## CEP startup

**CSXS/manifest.xml** targets **AEFT [25.0,25.99]**, requires **CSXS 12.0**, and enables:

- **--enable-nodejs**
- **--mixed-context**
- **--allow-file-access-from-files**

The panel first determines extension and user-data paths through CSInterface. It explicitly evaluates **JSX/bootstrap.jsx**, then calls **OPLUS_ping** and **OPLUS_getStatus**. The bootstrap itself loads the focused host modules:

- **effects.jsx**
- **text.jsx**
- **shapes.jsx**
- **serializer.jsx**
- **thumbnail.jsx**
- **importer.jsx**

A missing or invalid module is returned in **moduleErrors** rather than crashing After Effects.

## Bridge contract

The public ExtendScript functions are:

| Function | Input | Purpose |
| --- | --- | --- |
| OPLUS_ping | none | Engine identity, AE version, module health |
| OPLUS_getStatus | optional library path | Project, active comp, AE, and library status |
| OPLUS_setRuntimeSettings | settings JSON | Synchronize current settings into ExtendScript |
| OPLUS_chooseLibrary | none | Native folder picker |
| OPLUS_getSelectedLayerSummary | none | Validate and summarize the current selection |
| OPLUS_saveSelected | save request JSON | Serialize selected layers and generate asset files |
| OPLUS_importAsset | import request JSON | Restore an asset using an undo group |
| OPLUS_generateThumbnail | preview request JSON | Render the active comp preview |
| OPLUS_reloadModules | none | Reload focused JSX modules during development |

Every public function returns a JSON string with one envelope:

    {
      "ok": true,
      "data": {},
      "error": null
    }

or:

    {
      "ok": false,
      "data": null,
      "error": {
        "name": "Error",
        "message": "Human-readable explanation",
        "code": "OPTIONAL_CODE",
        "operation": "asset.import",
        "line": 123
      }
    }

The panel must JSON-encode arguments before inserting them into an evalScript expression. The existing bridge helper does this. Never concatenate a user-entered name, tag, expression, path, or serialized layer directly into executable ExtendScript source.

## Persistence model

Three locations serve distinct roles:

- Bundled **Database/settings.json** and **Database/library.json** are clean defaults.
- CEP user data stores the last selected settings so updates do not depend on writing into the installed extension.
- The selected library root owns its mutable **Database**, **Library**, **Cache**, and **Logs** directories.

Example:

    D:/OplusLibrary/
        Database/
            settings.json
            library.json
        Library/
            Spring Title/
                asset.json
                data.json
                preview.png
        Cache/
        Logs/
            oplus.log

For direct CommonJS use, pass the chosen library's database directory to createEngines:

    var root = 'D:/OplusLibrary';
    var engines = require('./Engine').createEngines({
        projectRoot: extensionRoot,
        databaseDir: path.join(root, 'Database'),
        logPath: path.join(root, 'Logs', 'oplus.log')
    });
    engines.library.configureLibrary(root);

The current panel has a small CEP-side persistence layer and does not require the CommonJS aggregate during startup. The modules remain independently testable and are the preferred API for additional Node-side workflows.

## Asset metadata contract

**asset.json** always contains the core fields:

    {
      "id": "asset-id",
      "name": "Spring Title",
      "category": "Text",
      "tags": ["title", "spring"],
      "description": "Reusable title reveal.",
      "created": "2026-01-01T00:00:00.000Z",
      "afterEffectsVersion": "25.0",
      "layerCount": 2,
      "thumbnail": "preview.png"
    }

Optional compatible fields include **updated** and **favorite**. File-valued metadata is restricted to a filename; a stored path cannot escape the asset directory.

**data.json** uses:

    {
      "schema": "oplus.asset-data",
      "schemaVersion": 1,
      "composition": {},
      "selectionStart": 0,
      "selectionEnd": 2,
      "layerCount": 2,
      "layers": [],
      "warnings": []
    }

Layers retain stable source index/parent references, switches, timing, transform, keyframes, expressions, effects, masks, text, and shape data. Arrays preserve ordering. Import performs a creation pass before the parenting/reference pass so children can safely reference recreated parents.

## Import modes

Public and persisted mode values match the UI:

| Value | Meaning |
| --- | --- |
| original | Keep original position |
| center | Offset the imported group to composition center |
| currentTime | Place the imported timing origin at the current time |
| originalTime | Preserve serialized layer timing |
| replace | Replace selected target layers where supported |

The CommonJS ImportEngine and ExtendScript importer also accept verbose legacy aliases such as **centerComposition**, **keepOriginalTime**, and **replaceSelected**, but they normalize to the values above.

## Error and logging rules

- ExtendScript public calls use a guard and return errors in the envelope.
- Import mutations use **app.beginUndoGroup** and **app.endUndoGroup**.
- Property-level restore failures are logged or returned as warnings when safe; a bad optional effect should not crash the panel.
- Node logger entries are JSON Lines at **Logs/oplus.log**.
- Each entry includes date, level, operation, assetId, layer, property, message, error, and context.
- Logging catches its own I/O and serialization errors and returns false; it never throws into the panel.
- Logs rotate at 5 MiB by default with three backups.

## Filesystem safety

The CommonJS modules enforce these invariants:

- Library paths are explicit, absolute after normalization, and cannot be filesystem roots.
- Asset identifiers use a restricted character set.
- Asset folder names remove platform-invalid characters and Windows reserved device names.
- Every derived target is checked to remain below its configured root.
- Existing asset-directory symbolic links are rejected before writes.
- JSON and preview replacements are written and fsynced to a unique temporary file in the same directory, then renamed.
- Deletion first moves an asset below **.Trash**; permanent deletion is opt-in.
- Recursive removal refuses its own root and unlinks symbolic links rather than following them.
- JSON rejects circular references, non-finite numbers, binary buffers, custom prototypes, and prototype-pollution keys.

## Adding a host property

When adding serialization support:

1. Add serialization in the focused JSX module, using match names rather than localized display names where AE provides them.
2. Store enough type information to distinguish scalar, array, color, shape, text document, marker, and spatial values.
3. Extend restore code with capability checks; AE property availability varies by layer and version.
4. Preserve expression text and whether the expression was enabled.
5. Add a Node fixture or contract assertion when the JSON shape changes.
6. Run **npm run verify**.
7. Run the relevant manual cases in After Effects from **Documentation/TESTING.md**.

## Compatibility rules

ExtendScript files intentionally use ES3-era syntax. Avoid let, const, classes, arrow functions, promises, optional chaining, and browser-only APIs in JSX. CommonJS engine files target Node 12.22 syntax. Panel JavaScript may use CEP's browser APIs but should feature-test Node and CSInterface availability and display an actionable error when either is absent.
