#target aftereffects

/*
 * Oplus Studio host bootstrap.
 *
 * This is the only JSX file loaded directly by CEP. It installs a stable,
 * JSON-only bridge on $.global, loads the focused host modules, and guarantees
 * that uncaught ExtendScript errors never cross into the panel.
 */
(function (global) {
    var OPLUS = global.OPLUS || {};
    global.OPLUS = OPLUS;

    OPLUS.name = "Otiner Studio";
    OPLUS.version = "1.4.0";
    OPLUS.schemaVersion = 1;
    OPLUS.settings = OPLUS.settings || {
        libraryPath: "",
        autoThumbnail: true,
        defaultImportMode: "original"
    };
    OPLUS.moduleErrors = [];

    function isArray(value) {
        return value && value.constructor === Array;
    }

    function pad(value, width) {
        var result = String(value);
        while (result.length < width) {
            result = "0" + result;
        }
        return result;
    }

    function quote(value) {
        var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
        var meta = {
            "\b": "\\b",
            "\t": "\\t",
            "\n": "\\n",
            "\f": "\\f",
            "\r": "\\r",
            "\"": "\\\"",
            "\\": "\\\\"
        };
        escapable.lastIndex = 0;
        return "\"" + String(value).replace(escapable, function (character) {
            var escaped = meta[character];
            if (typeof escaped === "string") {
                return escaped;
            }
            return "\\u" + pad(character.charCodeAt(0).toString(16), 4);
        }) + "\"";
    }

    function stringifyValue(value, stack) {
        var type = typeof value;
        var i;
        var parts;
        var key;

        if (value === null) {
            return "null";
        }
        if (type === "string") {
            return quote(value);
        }
        if (type === "number") {
            return isFinite(value) ? String(value) : "null";
        }
        if (type === "boolean") {
            return value ? "true" : "false";
        }
        if (type === "undefined" || type === "function" || type === "xml") {
            return undefined;
        }
        if (value instanceof Date) {
            return quote(OPLUS.util.dateToIso(value));
        }

        for (i = 0; i < stack.length; i += 1) {
            if (stack[i] === value) {
                throw new Error("Cannot serialize a circular value.");
            }
        }
        stack.push(value);
        parts = [];

        if (isArray(value)) {
            for (i = 0; i < value.length; i += 1) {
                var item = stringifyValue(value[i], stack);
                parts.push(typeof item === "undefined" ? "null" : item);
            }
            stack.pop();
            return "[" + parts.join(",") + "]";
        }

        for (key in value) {
            if (value.hasOwnProperty && !value.hasOwnProperty(key)) {
                continue;
            }
            var encoded = stringifyValue(value[key], stack);
            if (typeof encoded !== "undefined") {
                parts.push(quote(key) + ":" + encoded);
            }
        }
        stack.pop();
        return "{" + parts.join(",") + "}";
    }

    OPLUS.util = OPLUS.util || {};

    OPLUS.util.stringify = function (value) {
        if (typeof JSON !== "undefined" && JSON && JSON.stringify) {
            try {
                return JSON.stringify(value);
            } catch (jsonError) {
                // Fall through to the ExtendScript-safe encoder.
            }
        }
        return stringifyValue(value, []);
    };

    OPLUS.util.parseJson = function (text) {
        if (typeof text !== "string") {
            return text;
        }
        if (typeof JSON !== "undefined" && JSON && JSON.parse) {
            return JSON.parse(text);
        }
        var source = text.replace(/^\s+|\s+$/g, "");
        if (!source) {
            throw new Error("Cannot parse empty JSON.");
        }
        var safe = /^[\],:{}\s]*$/.test(
            source
                .replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
                .replace(/"[^"\\\n\r]*"/g, "")
                .replace(/(?:^|:|,)(?:\s*\[)+/g, "")
                .replace(/\b(?:true|false|null)\b/g, "")
                .replace(/-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "")
        );
        if (!safe) {
            throw new Error("Invalid JSON received by the Otiner bridge.");
        }
        return eval("(" + source + ")");
    };

    OPLUS.util.dateToIso = function (date) {
        return date.getUTCFullYear() + "-" +
            pad(date.getUTCMonth() + 1, 2) + "-" +
            pad(date.getUTCDate(), 2) + "T" +
            pad(date.getUTCHours(), 2) + ":" +
            pad(date.getUTCMinutes(), 2) + ":" +
            pad(date.getUTCSeconds(), 2) + "." +
            pad(date.getUTCMilliseconds(), 3) + "Z";
    };

    OPLUS.util.nowIso = function () {
        return OPLUS.util.dateToIso(new Date());
    };

    OPLUS.util.uuid = function () {
        var stamp = new Date().getTime();
        var seed = Math.floor(Math.random() * 0x100000000);
        function segment(length) {
            var value = "";
            while (value.length < length) {
                seed = (seed * 1664525 + 1013904223) % 0x100000000;
                value += ("00000000" + (seed >>> 0).toString(16)).slice(-8);
            }
            return value.slice(0, length);
        }
        return segment(8) + "-" + segment(4) + "-4" + segment(3) + "-" +
            ((8 + (stamp % 4)).toString(16)) + segment(3) + "-" + segment(12);
    };

    OPLUS.util.normalizePath = function (path) {
        if (path === null || typeof path === "undefined") {
            return "";
        }
        return String(path).replace(/\\/g, "/").replace(/\/+$/g, "");
    };

    OPLUS.util.safeFileName = function (name) {
        var safe = String(name || "Untitled Asset")
            .replace(/[<>:"\/\\|?*\x00-\x1f]/g, "-")
            .replace(/^\s+|\s+$/g, "")
            .replace(/[.\s]+$/g, "")
            .replace(/\s+/g, " ");
        if (!safe) {
            safe = "Untitled Asset";
        }
        var reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
        if (reserved.test(safe)) {
            safe = "_" + safe;
        }
        return safe.slice(0, 96);
    };

    OPLUS.util.ensureFolder = function (path) {
        var folder = path instanceof Folder ? path : new Folder(OPLUS.util.normalizePath(path));
        if (folder.exists) {
            return folder;
        }
        if (folder.parent && !folder.parent.exists && folder.parent.fsName !== folder.fsName) {
            OPLUS.util.ensureFolder(folder.parent);
        }
        if (!folder.create() && !folder.exists) {
            throw new Error("Unable to create folder: " + folder.fsName);
        }
        return folder;
    };

    OPLUS.util.readText = function (path) {
        var file = path instanceof File ? path : new File(OPLUS.util.normalizePath(path));
        if (!file.exists) {
            throw new Error("File does not exist: " + file.fsName);
        }
        file.encoding = "UTF-8";
        if (!file.open("r")) {
            throw new Error("Unable to open file for reading: " + file.fsName);
        }
        var text;
        try {
            text = file.read();
        } finally {
            file.close();
        }
        return text;
    };

    OPLUS.util.writeText = function (path, text) {
        var file = path instanceof File ? path : new File(OPLUS.util.normalizePath(path));
        OPLUS.util.ensureFolder(file.parent);
        file.encoding = "UTF-8";
        file.lineFeed = "Unix";
        if (!file.open("w")) {
            throw new Error("Unable to open file for writing: " + file.fsName);
        }
        try {
            if (!file.write(String(text))) {
                throw new Error("Unable to write file: " + file.fsName);
            }
        } finally {
            file.close();
        }
        return file;
    };

    OPLUS.util.writeJson = function (path, value) {
        return OPLUS.util.writeText(path, OPLUS.util.stringify(value));
    };

    OPLUS.util.merge = function (target, source) {
        var key;
        target = target || {};
        source = source || {};
        for (key in source) {
            if (!source.hasOwnProperty || source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
        return target;
    };

    OPLUS.util.serializeError = function (error, operation) {
        var message = "Unknown ExtendScript error.";
        var code = "HOST_ERROR";
        var line = null;
        var fileName = "";
        if (error !== null && typeof error !== "undefined") {
            message = error.message || error.description || String(error);
            code = error.code || code;
            line = error.line || null;
            fileName = error.fileName || "";
        }
        return {
            code: String(code),
            message: String(message),
            operation: operation || "",
            line: line,
            fileName: String(fileName)
        };
    };

    OPLUS.util.envelope = function (ok, data, error) {
        return OPLUS.util.stringify({
            ok: !!ok,
            data: typeof data === "undefined" ? null : data,
            error: error || null
        });
    };

    OPLUS.util.requireActiveComp = function () {
        var item = app.project ? app.project.activeItem : null;
        if (!item || !(item instanceof CompItem)) {
            var error = new Error("Open or select a composition first.");
            error.code = "NO_ACTIVE_COMPOSITION";
            throw error;
        }
        return item;
    };

    OPLUS.util.propertyValueToJson = function (value) {
        var i;
        var result;
        if (value === null || typeof value === "undefined") {
            return null;
        }
        if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
            return value;
        }
        if (isArray(value)) {
            result = [];
            for (i = 0; i < value.length; i += 1) {
                result.push(OPLUS.util.propertyValueToJson(value[i]));
            }
            return result;
        }
        if (typeof Shape !== "undefined" && value instanceof Shape) {
            return {
                _type: "Shape",
                vertices: OPLUS.util.propertyValueToJson(value.vertices),
                inTangents: OPLUS.util.propertyValueToJson(value.inTangents),
                outTangents: OPLUS.util.propertyValueToJson(value.outTangents),
                closed: value.closed
            };
        }
        if (typeof TextDocument !== "undefined" && value instanceof TextDocument) {
            return {
                _type: "TextDocument",
                text: value.text,
                font: value.font,
                fontSize: value.fontSize,
                fillColor: OPLUS.util.propertyValueToJson(value.fillColor),
                strokeColor: OPLUS.util.propertyValueToJson(value.strokeColor),
                strokeWidth: value.strokeWidth,
                applyFill: value.applyFill,
                applyStroke: value.applyStroke,
                tracking: value.tracking,
                leading: value.leading,
                autoLeading: value.autoLeading,
                justification: String(value.justification)
            };
        }
        try {
            return String(value);
        } catch (ignore) {
            return null;
        }
    };

    OPLUS.log = function (operation, details) {
        try {
            details = details || {};
            var base = OPLUS.settings.libraryPath
                ? OPLUS.util.normalizePath(OPLUS.settings.libraryPath)
                : OPLUS.util.normalizePath(Folder.userData.fsName + "/Oplus Studio");
            var logs = OPLUS.util.ensureFolder(base + "/Logs");
            var file = new File(logs.fsName + "/oplus.log");
            file.encoding = "UTF-8";
            file.lineFeed = "Unix";
            if (file.open("a")) {
                file.writeln(OPLUS.util.stringify({
                    date: OPLUS.util.nowIso(),
                    source: "ExtendScript",
                    operation: operation || "unknown",
                    assetId: details.assetId || null,
                    layer: details.layer || null,
                    property: details.property || null,
                    error: details.error || null,
                    context: details
                }));
                file.close();
            }
        } catch (ignoreLogError) {
            // Logging is deliberately non-fatal.
        }
    };

    OPLUS.util.guard = function (operation, action) {
        try {
            var result = action();
            OPLUS.log(operation, { status: "ok" });
            return OPLUS.util.envelope(true, result, null);
        } catch (error) {
            var serialized = OPLUS.util.serializeError(error, operation);
            OPLUS.log(operation, { status: "error", error: serialized });
            return OPLUS.util.envelope(false, null, serialized);
        }
    };

    var bootstrapFile = new File($.fileName);
    OPLUS.bootstrapDirectory = bootstrapFile.parent.fsName;

    OPLUS.loadModules = function () {
        var names = [
            "effects.jsx",
            "text.jsx",
            "shapes.jsx",
            "serializer.jsx",
            "thumbnail.jsx",
            "native.jsx",
            "importer.jsx"
        ];
        OPLUS.moduleErrors = [];
        var i;
        for (i = 0; i < names.length; i += 1) {
            var moduleFile = new File(OPLUS.bootstrapDirectory + "/" + names[i]);
            if (!moduleFile.exists) {
                OPLUS.moduleErrors.push({ module: names[i], message: "Module file is missing." });
                continue;
            }
            try {
                $.evalFile(moduleFile);
            } catch (moduleError) {
                OPLUS.moduleErrors.push({
                    module: names[i],
                    message: moduleError.message || String(moduleError),
                    line: moduleError.line || null
                });
            }
        }
        return OPLUS.moduleErrors;
    };

    OPLUS.loadModules();

    global.OPLUS_ping = function () {
        return OPLUS.util.guard("bridge.ping", function () {
            return {
                connected: true,
                engine: OPLUS.name,
                engineVersion: OPLUS.version,
                schemaVersion: OPLUS.schemaVersion,
                afterEffectsVersion: String(app.version),
                modulesLoaded: OPLUS.moduleErrors.length === 0,
                moduleErrors: OPLUS.moduleErrors
            };
        });
    };

    global.OPLUS_getStatus = function (libraryPath) {
        return OPLUS.util.guard("bridge.status", function () {
            if (libraryPath) {
                OPLUS.settings.libraryPath = OPLUS.util.normalizePath(libraryPath);
            }
            var project = app.project;
            var active = project ? project.activeItem : null;
            var isComp = !!(active && active instanceof CompItem);
            var projectState = "no-project";
            if (project) {
                projectState = project.file ? "saved" : "unsaved";
            }
            return {
                statusText: "Otiner Engine Connected",
                afterEffectsVersion: String(app.version),
                afterEffectsBuild: app.buildName ? String(app.buildName) : "",
                project: {
                    status: projectState,
                    name: project && project.file ? project.file.name : (project ? "Untitled Project" : ""),
                    path: project && project.file ? project.file.fsName : "",
                    itemCount: project ? project.numItems : 0
                },
                activeComposition: isComp ? {
                    name: active.name,
                    width: active.width,
                    height: active.height,
                    duration: active.duration,
                    frameRate: active.frameRate,
                    selectedLayerCount: active.selectedLayers.length
                } : null,
                libraryPath: OPLUS.settings.libraryPath || "",
                modulesLoaded: OPLUS.moduleErrors.length === 0,
                moduleErrors: OPLUS.moduleErrors
            };
        });
    };

    global.OPLUS_setRuntimeSettings = function (settingsJson) {
        return OPLUS.util.guard("settings.apply", function () {
            var incoming = OPLUS.util.parseJson(settingsJson || "{}");
            OPLUS.util.merge(OPLUS.settings, incoming);
            OPLUS.settings.libraryPath = OPLUS.util.normalizePath(OPLUS.settings.libraryPath || "");
            return OPLUS.settings;
        });
    };

    global.OPLUS_chooseLibrary = function () {
        return OPLUS.util.guard("settings.chooseLibrary", function () {
            var selected = Folder.selectDialog("Choose Otiner Studio Library Location");
            if (!selected) {
                var cancelled = new Error("Library selection was cancelled.");
                cancelled.code = "USER_CANCELLED";
                throw cancelled;
            }
            OPLUS.settings.libraryPath = OPLUS.util.normalizePath(selected.fsName);
            return { libraryPath: OPLUS.settings.libraryPath };
        });
    };

    global.OPLUS_getSelectedLayerSummary = function () {
        return OPLUS.util.guard("selection.summary", function () {
            var comp = OPLUS.util.requireActiveComp();
            var selected = comp.selectedLayers;
            var layers = [];
            var types = [];
            var typeSeen = {};
            var i;
            var type;
            for (i = 0; i < selected.length; i += 1) {
                type = "Layer";
                try { if (selected[i] instanceof TextLayer) { type = "Text"; } } catch (ignoreTextType) {}
                try { if (selected[i] instanceof ShapeLayer) { type = "Shape"; } } catch (ignoreShapeType) {}
                try { if (selected[i] instanceof CameraLayer) { type = "Camera"; } } catch (ignoreCameraType) {}
                try { if (selected[i] instanceof LightLayer) { type = "Light"; } } catch (ignoreLightType) {}
                try {
                    if (type === "Layer" && selected[i] instanceof AVLayer) {
                        if (selected[i].nullLayer) {
                            type = "Null";
                        } else if (selected[i].adjustmentLayer) {
                            type = "Adjustment";
                        } else if (selected[i].source && selected[i].source.mainSource &&
                                selected[i].source.mainSource instanceof SolidSource) {
                            type = "Solid";
                        } else {
                            type = "AV";
                        }
                    }
                } catch (ignoreAvType) {}
                if (!typeSeen[type]) {
                    typeSeen[type] = true;
                    types.push(type);
                }
                layers.push({
                    index: selected[i].index,
                    name: selected[i].name,
                    matchName: selected[i].matchName || "",
                    type: type,
                    enabled: selected[i].enabled,
                    locked: selected[i].locked
                });
            }
            var suggestedCategory = "Animations";
            if (types.length === 1 && types[0] === "Text") {
                suggestedCategory = "Text";
            } else if (types.length === 1 && types[0] === "Shape") {
                suggestedCategory = "Shapes";
            }
            return {
                composition: comp.name,
                compositionName: comp.name,
                count: layers.length,
                layerCount: layers.length,
                layers: layers,
                selectedLayers: layers,
                types: types,
                suggestedCategory: suggestedCategory
            };
        });
    };

    global.OPLUS_saveSelected = function (requestJson) {
        return OPLUS.util.guard("asset.save", function () {
            var request = OPLUS.util.parseJson(requestJson || "{}");
            var metadata = request.metadata || {};
            var assetDir = OPLUS.util.normalizePath(request.assetDir || "");
            var comp = OPLUS.util.requireActiveComp();
            if (!assetDir) {
                var noPath = new Error("An asset folder path is required.");
                noPath.code = "ASSET_PATH_REQUIRED";
                throw noPath;
            }
            if (!comp.selectedLayers || comp.selectedLayers.length === 0) {
                var noSelection = new Error("Select at least one layer to save.");
                noSelection.code = "NO_SELECTED_LAYERS";
                throw noSelection;
            }
            var exactNative = !request.options || request.options.exactNative !== false;
            var saveProfile = request.options && request.options.saveProfile ?
                String(request.options.saveProfile) : "safe-composition";
            var defaultLoadStructure = saveProfile === "safe-composition" ? "composition" : "layers";
            if (exactNative && !app.project.file) {
                var unsavedProject = new Error("Save the After Effects project once before creating an exact Otiner asset.");
                unsavedProject.code = "NATIVE_PROJECT_MUST_BE_SAVED";
                throw unsavedProject;
            }
            if (!OPLUS.serializer || !OPLUS.serializer.serializeSelection) {
                var noSerializer = new Error("The serializer module did not load.");
                noSerializer.code = "SERIALIZER_UNAVAILABLE";
                throw noSerializer;
            }

            OPLUS.util.ensureFolder(assetDir);
            if (request.settings) {
                OPLUS.util.merge(OPLUS.settings, request.settings);
            }

            var serializationOptions = request.options || {};
            serializationOptions.nativeOnly = saveProfile !== "maximum-compatibility";
            var data = OPLUS.serializer.serializeSelection(serializationOptions);
            var created = metadata.created || OPLUS.util.nowIso();
            var updated = metadata.updated || metadata.modified || OPLUS.util.nowIso();
            var asset = {
                id: metadata.id || OPLUS.util.uuid(),
                name: metadata.name || "Untitled Asset",
                category: metadata.category || "Animations",
                type: metadata.type || metadata.category || "Animations",
                tags: metadata.tags || [],
                description: metadata.description || "",
                favorite: !!metadata.favorite,
                created: created,
                updated: updated,
                modified: updated,
                afterEffectsVersion: String(app.version),
                layerCount: data.layers ? data.layers.length : comp.selectedLayers.length,
                selectedLayerCount: data.selectedLayerCount !== undefined ? data.selectedLayerCount : comp.selectedLayers.length,
                dependencyLayerCount: data.dependencyLayerCount || 0,
                saveProfile: saveProfile,
                defaultLoadStructure: defaultLoadStructure,
                thumbnail: "preview.png",
                schemaVersion: OPLUS.schemaVersion
            };

            data.schemaVersion = data.schemaVersion || OPLUS.schemaVersion;
            data.asset = asset;
            OPLUS.util.writeJson(assetDir + "/data.json", data);

            var warnings = [];
            var warningIndex;
            if (data.warnings && data.warnings.length) {
                for (warningIndex = 0; warningIndex < data.warnings.length; warningIndex += 1) {
                    warnings.push(data.warnings[warningIndex]);
                }
            }
            var previewPath = assetDir + "/preview.png";
            var shouldRender = OPLUS.settings.autoThumbnail !== false && request.autoThumbnail !== false;
            var previewResult = null;

            var nativeResult = null;
            if (exactNative) {
                if (!OPLUS.nativeCopy || typeof OPLUS.nativeCopy.saveSelection !== "function") {
                    throw new Error("The exact native-copy module is unavailable.");
                }
                var nativeOptions = request.options || {};
                nativeOptions.nativeLayerIndices = data.nativeLayerIndices || [];
                nativeResult = OPLUS.nativeCopy.saveSelection(assetDir, asset.id, warnings, nativeOptions);
                asset.nativeProject = nativeResult.fileName;
                asset.nativeCompName = nativeResult.compName;
                asset.fidelityMode = "native-aep";
                data.nativeCopy = {
                    fileName: nativeResult.fileName,
                    compName: nativeResult.compName,
                    fidelityMode: "native-aep",
                    saveProfile: saveProfile,
                    defaultLoadStructure: defaultLoadStructure,
                    nativeOnly: data.nativeOnly === true
                };
                OPLUS.util.writeJson(assetDir + "/data.json", data);
            }

            /* Render only after the native snapshot has synchronously restored the
             * original project. Closing a project while saveFrameToPng is pending can
             * freeze or crash AE, especially with GPU plug-ins. */
            if (shouldRender && OPLUS.thumbnail && OPLUS.thumbnail.generate) {
                try {
                    comp = OPLUS.util.requireActiveComp();
                    previewResult = OPLUS.thumbnail.generate(comp, previewPath, request.previewOptions || {});
                    if (previewResult && previewResult.warning) {
                        warnings.push(previewResult.warning);
                    }
                } catch (previewError) {
                    warnings.push({
                        code: "PREVIEW_GENERATION_FAILED",
                        message: "Preview generation failed: " +
                            (previewError.message || String(previewError))
                    });
                    OPLUS.log("preview.generate", {
                        assetId: asset.id,
                        error: OPLUS.util.serializeError(previewError, "preview.generate")
                    });
                }
            } else if (shouldRender) {
                warnings.push({
                    code: "THUMBNAIL_MODULE_UNAVAILABLE",
                    message: "Thumbnail module is unavailable."
                });
            }

            OPLUS.util.writeJson(assetDir + "/asset.json", asset);
            OPLUS.log("asset.saved", {
                assetId: asset.id,
                layerCount: asset.layerCount,
                path: assetDir
            });
            return {
                asset: asset,
                assetDir: assetDir,
                dataPath: assetDir + "/data.json",
                previewPath: previewPath,
                preview: previewResult,
                nativeCopy: nativeResult,
                warnings: warnings
            };
        });
    };

    global.OPLUS_importAsset = function (requestJson) {
        return OPLUS.util.guard("asset.import", function () {
            var request = OPLUS.util.parseJson(requestJson || "{}");
            var data = request.data || null;
            if (!data && request.dataPath) {
                data = OPLUS.util.parseJson(OPLUS.util.readText(request.dataPath));
            }
            if (!data) {
                var noData = new Error("Asset data is required for import.");
                noData.code = "ASSET_DATA_REQUIRED";
                throw noData;
            }
            if (!OPLUS.importer || !OPLUS.importer.importAsset) {
                var noImporter = new Error("The importer module did not load.");
                noImporter.code = "IMPORTER_UNAVAILABLE";
                throw noImporter;
            }
            var options = request.options || {};
            options.mode = request.mode || options.mode || OPLUS.settings.defaultImportMode || "original";
            options.structure = request.loadStructure || options.structure ||
                (data.nativeCopy && data.nativeCopy.defaultLoadStructure) || "composition";
            if (options.structure === "saved") {
                options.structure = (data.nativeCopy && data.nativeCopy.defaultLoadStructure) || "composition";
            }
            options.assetDir = request.assetDir || request.assetPath || options.assetDir || "";
            options.mediaManifest = data.mediaManifest || [];
            options.assetName = data.asset && data.asset.name ? data.asset.name : "Otiner Asset";
            if (options.structure !== "compatibility" && request.preferNative !== false && data.nativeCopy && options.assetDir &&
                    OPLUS.nativeCopy && typeof OPLUS.nativeCopy.importSelection === "function") {
                var nativePath = new File(OPLUS.util.normalizePath(options.assetDir + "/" +
                    (data.nativeCopy.fileName || "native.aep")));
                if (nativePath.exists) {
                    return OPLUS.nativeCopy.importSelection(options.assetDir, data.nativeCopy.compName, options);
                }
            }
            if (data.nativeOnly === true) {
                throw new Error("This fast exact asset requires Native Composition or Editable Native Layers mode.");
            }
            var result = OPLUS.importer.importAsset(data, options);
            if (result && typeof result === "object") { result.structure = "compatibility"; }
            OPLUS.log("asset.imported", {
                assetId: data.asset ? data.asset.id : "",
                mode: options.mode,
                importedLayerCount: result && result.layerCount ? result.layerCount : 0
            });
            return result;
        });
    };

    global.OPLUS_generateThumbnail = function (requestJson) {
        return OPLUS.util.guard("preview.generate", function () {
            var request = OPLUS.util.parseJson(requestJson || "{}");
            var comp = OPLUS.util.requireActiveComp();
            if (!request.outputPath) {
                var noOutput = new Error("A preview output path is required.");
                noOutput.code = "PREVIEW_PATH_REQUIRED";
                throw noOutput;
            }
            if (!OPLUS.thumbnail || !OPLUS.thumbnail.generate) {
                var noThumbnail = new Error("The thumbnail module did not load.");
                noThumbnail.code = "THUMBNAIL_UNAVAILABLE";
                throw noThumbnail;
            }
            return OPLUS.thumbnail.generate(comp, request.outputPath, request.options || {});
        });
    };

    global.OPLUS_reloadModules = function () {
        return OPLUS.util.guard("engine.reloadModules", function () {
            return { moduleErrors: OPLUS.loadModules() };
        });
    };
}($.global));
