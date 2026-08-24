# CommonJS engine API

The public entry point is **Engine/index.js**. All methods are synchronous except **ImportEngine.execute**, whose completion follows the asynchronous CSInterface callback. No third-party runtime packages are required.

## Factory

    var Engine = require('./Engine');
    var engines = Engine.createEngines(options);

The returned object contains:

- **library** — LibraryEngine
- **imports** — ImportEngine
- **previews** — PreviewEngine
- **serializer** — Serializer
- **logger** — Logger

Useful options:

| Option | Purpose |
| --- | --- |
| projectRoot | Root containing Database and Logs defaults |
| databaseDir | Override settings/catalog directory |
| settingsPath | Override the settings JSON file |
| catalogPath | Override the catalog JSON file |
| logPath | Override Logs/oplus.log |
| initialize | Set false to defer LibraryEngine.initialize |
| refresh | Rebuild catalog during initialization |
| createLibrary | Set false to avoid directory creation during initialization |
| maxPreviewBytes | PNG size limit; default 25 MiB |
| maxLogBytes | Rotation threshold; default 5 MiB |
| maxLogBackups | Rotated log count; default 3 |
| clock | Injectable function for deterministic tests |
| idGenerator | Injectable asset-id function |
| importHostFunction | evalScript function name; default OPLUS_importAsset |

Constructors are also exported individually:

    var LibraryEngine = Engine.LibraryEngine;
    var ImportEngine = Engine.ImportEngine;
    var PreviewEngine = Engine.PreviewEngine;
    var Serializer = Engine.Serializer;
    var Logger = Engine.Logger;

Low-level guarded helpers are available as **Engine.fsUtils**.

## LibraryEngine

### initialize

    library.initialize({
        createLibrary: true,
        refresh: false
    });

Creates missing database defaults, validates existing JSON, and creates the configured asset root when allowed. It returns **status()**.

### settings and setup

    library.getSettings();
    library.saveSettings({
        autoThumbnail: false,
        defaultImportMode: 'currentTime'
    });
    library.configureLibrary('D:/OplusLibrary');

Settings are allow-listed. Unknown patch keys are ignored. A library path is normalized to an absolute path and a filesystem root is rejected. **configureLibrary** creates **Library**, persists settings atomically, scans disk, and returns:

    {
      settings: {},
      assets: [],
      errors: []
    }

### status and paths

    library.status();
    library.getLibraryPath();
    library.getAssetsRoot();
    library.getAssetDirectory(assetId);

Status includes configured, libraryPath, assetsRoot, assetCount, settingsPath, catalogPath, and catalogRevision.

### create

    var record = library.createAsset({
        metadata: {
            name: 'Spring Title',
            category: 'Text',
            tags: ['title', 'spring'],
            description: 'Reusable title.',
            afterEffectsVersion: '25.0'
        },
        data: serializedHostData,
        preview: pngBuffer
    });

Accepted preview forms are a Buffer, a PNG path, a PNG data URL, or base64 when **previewEncoding: "base64"** is supplied in the second argument. If preview is absent, a valid transparent one-pixel PNG is written so every asset bundle remains complete.

Creation stages all three files in a unique hidden directory, renames the finished directory into place, then atomically updates the catalog. A catalog failure removes the new directory.

Aliases: **create** and **createAsset**.

### list and read

    library.listAssets();
    library.list({
        query: 'spring',
        category: 'Text',
        tags: ['title'],
        favoritesOnly: true,
        sort: 'createdDesc',
        limit: 50
    });
    library.search('spring');
    library.getAsset(assetId);
    library.readAsset(assetId);

**getAsset** returns a catalog record. **readAsset** validates and returns disk content:

    {
      metadata: {},
      data: {},
      previewPath: ".../preview.png",
      previewExists: true,
      validation: {},
      record: {},
      directory: "..."
    }

### update and favorite

    library.updateAsset(assetId, {
        name: 'New display name',
        description: 'Updated copy',
        tags: ['title'],
        favorite: true,
        data: replacementData,
        preview: replacementPng
    });

Editable metadata is restricted to name, category, tags, description, afterEffectsVersion, and favorite. The id and original created time are preserved; updated is refreshed.

    library.toggleFavorite(assetId);
    library.toggleFavorite(assetId, true);

### delete

    library.deleteAsset(assetId);
    library.deleteAsset(assetId, {
        permanent: true
    });

Default deletion moves the directory into **.Trash**, updates the catalog, and returns the recoverable trash path. The move is rolled back if the catalog cannot be written. Permanent mode removes that isolated trash directory after catalog success.

### refresh and validate

    var report = library.refresh();
    var validation = library.validateAsset(assetId);

Refresh scans direct asset folders, rejects symbolic links, validates JSON, deduplicates ids, and rebuilds the catalog. Its errors identify individual skipped folders. Validation checks metadata, data, layer count, preview existence, PNG signature, and size.

## Serializer

    var serializer = new Engine.Serializer({
        logger: logger,
        maxPreviewBytes: 25 * 1024 * 1024
    });

### prepare and validate

    var prepared = serializer.prepareBundle(bundle, {
        id: generatedId,
        enforceLayerCount: false,
        previewEncoding: 'base64'
    });
    serializer.validateBundle(bundle);

Preparation canonicalizes tags, dates, schema fields, layer count, metadata, and preview. It throws an error with **validationErrors** when invalid. Validation returns **{ valid, errors }** without writing.

Static validators:

    Engine.Serializer.validateMetadata(metadata);
    Engine.Serializer.validateData(data);
    Engine.Serializer.assertPng(buffer, maxBytes);
    Engine.Serializer.inspectJsonTree(value);

### disk operations

    serializer.writeAssetBundle(assetDirectory, prepared, {
        root: assetsRoot,
        prepared: true
    });
    serializer.readAssetBundle(assetDirectory, {
        root: assetsRoot,
        strict: true
    });

Supplying root makes traversal enforcement explicit. JSON and PNG files use atomic replacement.

### host payload

    serializer.parseHostPayload(rawEvalScriptResult);
    serializer.stringify(value);

Malformed or non-object host results throw before callers access fields.

## ImportEngine

    var importer = new Engine.ImportEngine({
        libraryEngine: library,
        serializer: serializer,
        logger: logger
    });

### modes

Constants are exported through **ImportEngine.MODES**:

- ORIGINAL = original
- CENTER_COMPOSITION = center
- CURRENT_TIME = currentTime
- KEEP_ORIGINAL_TIME = originalTime
- REPLACE_SELECTED = replace

**ImportEngine.normalizeMode(value)** also recognizes verbose and hyphenated aliases.

### prepare

    var payload = importer.prepareImport(assetId, {
        mode: 'currentTime',
        currentTime: 4.5,
        targetCompId: 12,
        replaceLayerIndices: [2, 3],
        preserveExpressions: true,
        preserveParenting: true
    });

Before preparing, the engine validates the full stored bundle. The returned payload contains schemaVersion, assetId, mode, requestedAt, metadata, data, and allow-listed options.

### create and execute evalScript

    var expression = importer.createEvalScript(assetId, {
        mode: 'center'
    });

The payload is JSON-encoded twice: once as JSON and once as a JavaScript string literal. This keeps asset text out of executable source.

    importer.importAsset(assetId, options, csInterface, function (error, result) {
        if (error) {
            // Display error.message and preserve error.hostResult for diagnostics.
            return;
        }
        // result is the parsed { ok, data, error } host envelope.
    });

The bridge argument can be a CSInterface instance or a function compatible with **evalScript(expression, callback)**. The method returns the generated expression immediately and settles the callback once.

## PreviewEngine

    var previews = new Engine.PreviewEngine({
        libraryEngine: library,
        logger: logger
    });

Methods:

    previews.getPreviewPath(assetId, 'png');
    previews.describe(assetId);
    previews.validate(bufferOrPathOrDataUrl, 'png');
    previews.savePreview(assetId, pngInput);
    previews.readPreview(assetId);
    previews.readPreview(assetId, { encoding: 'base64' });
    previews.readPreview(assetId, { encoding: 'dataUrl' });
    previews.createHostRequest(assetId, { width: 640, height: 360 });
    previews.createEvalScript(assetId, { width: 640, height: 360 });

PNG is implemented. GIF and MP4 descriptors and signature validation are reserved in the architecture, but writing those formats intentionally throws **EPREVIEWRESERVED** until a host renderer is implemented.

## Logger

    var logger = new Engine.Logger({
        filePath: 'D:/OplusLibrary/Logs/oplus.log',
        maxBytes: 5 * 1024 * 1024,
        maxBackups: 3
    });

    logger.info('asset.saved', {
        assetId: assetId,
        layer: 'Headline',
        property: 'Position',
        message: 'Saved',
        context: { layerCount: 2 }
    });
    logger.warn('preview.skipped', details);
    logger.error('asset.import', {
        error: caughtError
    });
    logger.readEntries(100);
    logger.child({ panelId: 'studio.oplus.ae.panel' });

All write methods return the stored entry on success and false on logging failure. Logger errors never propagate to the panel. **Logger.noop** implements the same safe interface.

## Common error codes

| Code | Meaning |
| --- | --- |
| ELIBRARYSETUP | A library location must be selected |
| ECATALOG | Catalog JSON is structurally invalid |
| EASSETVALIDATION | New or updated bundle failed validation |
| EASSETCORRUPT | Stored asset is not safe to import |
| EASSETNOTFOUND | Requested catalog id is absent |
| EASSETEXISTS | A generated or supplied id is already used |
| EIMPORTMODE | Import mode is unsupported |
| EHOSTJSON | evalScript returned malformed JSON |
| EHOSTIMPORT | Host returned an import failure |
| EPREVIEW | Preview failed validation |
| EPREVIEWRESERVED | GIF/MP4 writing is not implemented |

Callers should show the error message, record the operation and asset id, and leave the library usable.
