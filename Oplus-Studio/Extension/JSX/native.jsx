/* Otiner Studio - native AEP snapshot save/import for exact layer fidelity. */
(function (global) {
    var OPLUS = global.OPLUS = global.OPLUS || {};
    var nativeApi = OPLUS.nativeCopy = OPLUS.nativeCopy || {};
    var PRIMARY_MARKER = "__OTINER_NATIVE_PRIMARY__\n";
    var DEPENDENCY_MARKER = "__OTINER_NATIVE_DEPENDENCY__\n";
    var CACHE_MARKER = "__OTINER_NATIVE_CACHE__\n";

    function read(object, name, fallback) {
        try { if (object !== null && object !== undefined && object[name] !== undefined) { return object[name]; } }
        catch (ignore) {}
        return fallback;
    }

    function warn(warnings, code, message, details) {
        var item = { code: code, message: String(message || code) };
        var key;
        details = details || {};
        for (key in details) { if (details.hasOwnProperty(key)) { item[key] = details[key]; } }
        if (warnings) { warnings.push(item); }
        try { if (typeof OPLUS.log === "function") { OPLUS.log("native.warning", item); } } catch (ignoreLog) {}
    }

    function selectedIndexMap(comp) {
        var result = {};
        var selected = comp.selectedLayers || [];
        var i;
        for (i = 0; i < selected.length; i += 1) { result[selected[i].index] = true; }
        return result;
    }

    function propertyLayerReferences(layer) {
        var result = [];
        var seen = {};
        function add(value) {
            var index = Math.round(Number(value));
            if (isFinite(index) && index > 0 && !seen[index]) { seen[index] = true; result.push(index); }
        }
        function scan(group) {
            var i;
            var child;
            var typeName;
            var k;
            for (i = 1; i <= Number(read(group, "numProperties", 0)); i += 1) {
                try {
                    child = group.property(i);
                    if (read(child, "numKeys", undefined) !== undefined &&
                            read(child, "propertyValueType", undefined) !== undefined) {
                        typeName = String(read(child, "propertyValueType", "")).toUpperCase();
                        if (typeName.indexOf("LAYER_INDEX") >= 0) {
                            if (child.numKeys > 0) {
                                for (k = 1; k <= child.numKeys; k += 1) { add(child.keyValue(k)); }
                            } else { add(child.value); }
                        }
                    } else if (child) { scan(child); }
                } catch (ignoreProperty) {}
            }
        }
        scan(layer);
        return result;
    }

    function dependencyIndexMap(comp, primary, knownIndices) {
        var keep = {};
        var queue = [];
        var key;
        var i;
        var layer;
        var parent;
        var matte;
        var references;
        if (knownIndices && knownIndices.length) {
            for (i = 0; i < knownIndices.length; i += 1) {
                key = Math.round(Number(knownIndices[i]));
                if (key > 0 && key <= comp.numLayers) { keep[key] = true; }
            }
        }
        for (key in primary) {
            if (primary.hasOwnProperty(key) && primary[key]) { keep[key] = true; queue.push(Number(key)); }
        }
        if (knownIndices && knownIndices.length) { return keep; }
        for (i = 0; i < queue.length; i += 1) {
            try { layer = comp.layer(queue[i]); } catch (ignoreLayer) { layer = null; }
            if (!layer) { continue; }
            parent = read(layer, "parent", null);
            matte = read(layer, "trackMatteLayer", null);
            if (parent && !keep[parent.index]) { keep[parent.index] = true; queue.push(parent.index); }
            if (matte && !keep[matte.index]) { keep[matte.index] = true; queue.push(matte.index); }
            references = propertyLayerReferences(layer);
            for (key = 0; key < references.length; key += 1) {
                if (!keep[references[key]]) { keep[references[key]] = true; queue.push(references[key]); }
            }
        }
        return keep;
    }

    function sanitizeId(value) {
        return String(value || "asset").replace(/[^A-Za-z0-9_-]/g, "_").substring(0, 80);
    }

    function findCompById(itemId) {
        var i;
        var item;
        for (i = 1; i <= app.project.numItems; i += 1) {
            item = app.project.item(i);
            try { if (item instanceof CompItem && item.id === itemId) { return item; } } catch (ignore) {}
        }
        return null;
    }

    global.OPLUS_NATIVE_RESTORE_PROJECT = function () {
        var state = global.OPLUS_NATIVE_RESTORE_STATE;
        var originalFile;
        var restoredComp;
        if (!state || !state.path) { return; }
        originalFile = new File(state.path);
        try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (ignoreClose) {}
        try {
            app.open(originalFile);
            restoredComp = findCompById(state.activeItemId);
            if (restoredComp) { try { restoredComp.openInViewer(); } catch (ignoreViewer) {} }
        } catch (restoreError) {
            try { alert("Otiner saved the original project safely at:\n" + state.path +
                "\n\nOpen it manually. Automatic reopen failed:\n" + restoreError.toString()); } catch (ignoreAlert) {}
        }
        global.OPLUS_NATIVE_RESTORE_STATE = null;
    };

    function scheduleRestore(originalFile, activeItemId) {
        global.OPLUS_NATIVE_RESTORE_STATE = { path: originalFile.fsName, activeItemId: activeItemId };
        app.scheduleTask("OPLUS_NATIVE_RESTORE_PROJECT()", 900, false);
    }

    function restoreOriginalNow(originalFile, activeItemId, primary) {
        var restoredComp;
        var i;
        try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (ignoreClose) {}
        app.open(originalFile);
        restoredComp = findCompById(activeItemId);
        if (!restoredComp) { throw new Error("OPLUS_NATIVE_RESTORE_COMP_MISSING: The original composition could not be restored."); }
        try { restoredComp.openInViewer(); } catch (ignoreViewer) {}
        for (i = 1; i <= restoredComp.numLayers; i += 1) {
            try { restoredComp.layer(i).selected = !!primary[i]; } catch (ignoreSelection) {}
        }
        return restoredComp;
    }

    function saveSelectionReducedProject(assetDir, assetId, warnings, options) {
        var comp = OPLUS.util.requireActiveComp();
        var originalFile = app.project.file;
        var activeItemId = read(comp, "id", 0);
        var primary = selectedIndexMap(comp);
        var selectedLayerCount = comp.selectedLayers ? comp.selectedLayers.length : 0;
        var keep;
        var snapshotComp;
        var snapshotName = "__OTINER_NATIVE_" + sanitizeId(assetId) + "__";
        var nativeFile = new File(OPLUS.util.normalizePath(assetDir + "/native.aep"));
        var i;
        var originalComment;
        var saveError = null;
        var restoreError = null;
        if (!originalFile) {
            throw new Error("OPLUS_NATIVE_PROJECT_MUST_BE_SAVED: Save the After Effects project once before saving an exact Otiner asset.");
        }
        if (!comp.selectedLayers || comp.selectedLayers.length === 0) {
            throw new Error("OPLUS_NO_SELECTED_LAYERS: Select at least one layer.");
        }
        app.project.save(originalFile);
        try {
            keep = dependencyIndexMap(comp, primary, options && options.nativeLayerIndices);
            snapshotComp = comp.duplicate();
            snapshotComp.name = snapshotName;
            try { snapshotComp.comment = "Otiner native asset " + String(assetId || ""); } catch (ignoreComment) {}
            for (i = 1; i <= snapshotComp.numLayers; i += 1) {
                originalComment = String(read(snapshotComp.layer(i), "comment", ""));
                snapshotComp.layer(i).comment = (primary[i] ? PRIMARY_MARKER : DEPENDENCY_MARKER) + originalComment;
            }
            for (i = snapshotComp.numLayers; i >= 1; i -= 1) {
                if (!keep[i]) {
                    snapshotComp.layer(i).remove();
                }
            }
            app.project.reduceProject([snapshotComp]);
            app.project.save(nativeFile);
            if (!nativeFile.exists || nativeFile.length < 1) {
                throw new Error("OPLUS_NATIVE_SAVE_FAILED: After Effects did not create native.aep.");
            }
        } catch (error) {
            saveError = error;
        }
        try { restoreOriginalNow(originalFile, activeItemId, primary); }
        catch (errorRestore) { restoreError = errorRestore; }
        if (restoreError) {
            throw new Error("OPLUS_NATIVE_RESTORE_FAILED: " + restoreError.toString() +
                (saveError ? " Save error: " + saveError.toString() : ""));
        }
        if (saveError) { throw saveError; }
        return {
            fileName: "native.aep",
            filePath: nativeFile.fsName,
            compName: snapshotName,
            selectedLayerCount: selectedLayerCount,
            restoreScheduled: false,
            strategy: "reduce-project"
        };
    }

    function compSettings(comp) {
        return {
            width: Number(read(comp, "width", 1920)),
            height: Number(read(comp, "height", 1080)),
            pixelAspect: Number(read(comp, "pixelAspect", 1)),
            duration: Number(read(comp, "duration", 1)),
            frameRate: Number(read(comp, "frameRate", 25)),
            backgroundColor: read(comp, "bgColor", [0, 0, 0]),
            displayStartTime: Number(read(comp, "displayStartTime", 0)),
            workAreaStart: Number(read(comp, "workAreaStart", 0)),
            workAreaDuration: Number(read(comp, "workAreaDuration", 1)),
            time: Number(read(comp, "time", 0))
        };
    }

    function commandId(name, fallback) {
        var result = 0;
        try { result = Number(app.findMenuCommandId(name)) || 0; } catch (ignore) {}
        return result || fallback;
    }

    function markAndSelectLayers(comp, keep, primary) {
        var count = 0;
        var i;
        var layer;
        var wasLocked;
        var originalComment;
        for (i = 1; i <= comp.numLayers; i += 1) {
            layer = comp.layer(i);
            try { layer.selected = false; } catch (ignoreDeselect) {}
            if (!keep[i]) { continue; }
            count += 1;
            wasLocked = !!read(layer, "locked", false);
            try { if (wasLocked) { layer.locked = false; } } catch (ignoreUnlock) {}
            originalComment = String(read(layer, "comment", ""));
            layer.comment = (primary[i] ? PRIMARY_MARKER : DEPENDENCY_MARKER) + originalComment;
            layer.selected = true;
            try { if (wasLocked) { layer.locked = true; } } catch (ignoreRelock) {}
        }
        return count;
    }

    function applyCompSettings(comp, settings) {
        try { comp.bgColor = settings.backgroundColor; } catch (ignoreBackground) {}
        try { comp.displayStartTime = settings.displayStartTime; } catch (ignoreStart) {}
        try { comp.workAreaStart = settings.workAreaStart; } catch (ignoreWorkStart) {}
        try { comp.workAreaDuration = settings.workAreaDuration; } catch (ignoreWorkDuration) {}
        try { comp.time = settings.time; } catch (ignoreTime) {}
    }

    function saveSelectionClipboard(assetDir, assetId, warnings, options) {
        var comp = OPLUS.util.requireActiveComp();
        var originalFile = app.project.file;
        var activeItemId = read(comp, "id", 0);
        var primary = selectedIndexMap(comp);
        var selectedLayerCount = comp.selectedLayers ? comp.selectedLayers.length : 0;
        var keep;
        var expectedLayerCount;
        var settings;
        var snapshotName = "__OTINER_NATIVE_" + sanitizeId(assetId) + "__";
        var nativeFile = new File(OPLUS.util.normalizePath(assetDir + "/native.aep"));
        var snapshotComp;
        var copyId = commandId("Copy", 19);
        var pasteId = commandId("Paste", 20);
        if (!originalFile) {
            throw new Error("OPLUS_NATIVE_PROJECT_MUST_BE_SAVED: Save the After Effects project once before saving an exact Otiner asset.");
        }
        if (!selectedLayerCount) { throw new Error("OPLUS_NO_SELECTED_LAYERS: Select at least one layer."); }

        /* Save first, then discard all temporary markers and selection changes when
         * the original project is closed. The AE clipboard retains native effect data. */
        app.project.save(originalFile);
        keep = dependencyIndexMap(comp, primary, options && options.nativeLayerIndices);
        settings = compSettings(comp);
        expectedLayerCount = markAndSelectLayers(comp, keep, primary);
        if (!copyId || !pasteId || expectedLayerCount < 1) {
            throw new Error("OPLUS_NATIVE_CLIPBOARD_UNAVAILABLE: After Effects Copy/Paste commands are unavailable.");
        }
        app.executeCommand(copyId);
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
        app.newProject();
        snapshotComp = app.project.items.addComp(snapshotName, settings.width, settings.height,
            settings.pixelAspect, settings.duration, settings.frameRate);
        applyCompSettings(snapshotComp, settings);
        snapshotComp.openInViewer();
        app.executeCommand(pasteId);
        if (snapshotComp.numLayers !== expectedLayerCount) {
            throw new Error("OPLUS_NATIVE_CLIPBOARD_INCOMPLETE: After Effects did not paste every required layer.");
        }
        try { snapshotComp.comment = "Otiner native asset " + String(assetId || ""); } catch (ignoreComment) {}
        app.project.save(nativeFile);
        if (!nativeFile.exists || nativeFile.length < 1) {
            throw new Error("OPLUS_NATIVE_SAVE_FAILED: After Effects did not create native.aep.");
        }
        restoreOriginalNow(originalFile, activeItemId, primary);
        return {
            fileName: "native.aep",
            filePath: nativeFile.fsName,
            compName: snapshotName,
            selectedLayerCount: selectedLayerCount,
            restoreScheduled: false,
            strategy: "clipboard-isolated"
        };
    }

    function saveSelection(assetDir, assetId, warnings, options) {
        var comp = OPLUS.util.requireActiveComp();
        var originalFile = app.project.file;
        var activeItemId = read(comp, "id", 0);
        var primary = selectedIndexMap(comp);
        var fastError;
        options = options || {};
        if (!originalFile) {
            throw new Error("OPLUS_NATIVE_PROJECT_MUST_BE_SAVED: Save the After Effects project once before saving an exact Otiner asset.");
        }
        if (!comp.selectedLayers || comp.selectedLayers.length === 0) {
            throw new Error("OPLUS_NO_SELECTED_LAYERS: Select at least one layer.");
        }
        if (options.nativeFastPath === false) {
            return saveSelectionReducedProject(assetDir, assetId, warnings, options);
        }
        try {
            return saveSelectionClipboard(assetDir, assetId, warnings, options);
        } catch (error) {
            fastError = error;
        }
        try {
            restoreOriginalNow(originalFile, activeItemId, primary);
        } catch (restoreError) {
            throw new Error("OPLUS_NATIVE_FAST_RESTORE_FAILED: " + fastError.toString() + " Restore failed: " + restoreError.toString());
        }
        warn(warnings, "NATIVE_FAST_PATH_FALLBACK",
            "The isolated fast save was unavailable, so Otiner used the exact compatibility path.", {
                reason: fastError.toString()
            });
        return saveSelectionReducedProject(assetDir, assetId, warnings, options);
    }

    function newItemIdsBeforeImport() {
        var result = {};
        var i;
        for (i = 1; i <= app.project.numItems; i += 1) { result[app.project.item(i).id] = true; }
        return result;
    }

    function findImportedComp(name, oldIds) {
        var i;
        var item;
        for (i = 1; i <= app.project.numItems; i += 1) {
            item = app.project.item(i);
            try {
                if (!oldIds[item.id] && item instanceof CompItem && item.name === name) { return item; }
            } catch (ignore) {}
        }
        return null;
    }

    function nativeSignature(nativeFile, compName) {
        var modified = 0;
        try { modified = nativeFile.modified ? nativeFile.modified.getTime() : 0; } catch (ignoreModified) {}
        return normalizeFileKey(nativeFile.fsName) + "|" + Number(nativeFile.length || 0) + "|" + modified + "|" + String(compName || "");
    }

    function findCachedComp(signature) {
        var i;
        var item;
        var expected = CACHE_MARKER + signature;
        for (i = 1; i <= app.project.numItems; i += 1) {
            item = app.project.item(i);
            try {
                if (item instanceof CompItem && String(read(item, "comment", "")) === expected) { return item; }
            } catch (ignore) {}
        }
        return null;
    }

    function installedEffectMap() {
        var result = {};
        var effects;
        var i;
        try { effects = app.effects; } catch (ignoreEffects) { effects = null; }
        if (!effects) { return null; }
        for (i = 0; i < effects.length; i += 1) {
            try { if (effects[i].matchName) { result[String(effects[i].matchName)] = true; } } catch (ignoreEffect) {}
        }
        return result;
    }

    function removeUnavailableEffects(layer, installed, warnings) {
        var parade;
        var i;
        var effect;
        var matchName;
        var canAdd;
        if (!installed) { return; }
        try { parade = layer.property("ADBE Effect Parade"); } catch (ignoreParade) { parade = null; }
        if (!parade) { return; }
        for (i = parade.numProperties; i >= 1; i -= 1) {
            effect = parade.property(i);
            matchName = String(read(effect, "matchName", ""));
            canAdd = false;
            try { canAdd = !!parade.canAddProperty(matchName); } catch (ignoreCanAdd) {}
            if (matchName && !installed[matchName] && !canAdd) {
                warn(warnings, "EFFECT_NOT_INSTALLED",
                    "An effect was skipped because it is not installed in this After Effects.", {
                        layer: read(layer, "name", ""), effect: read(effect, "name", matchName), matchName: matchName
                    });
                try { effect.remove(); } catch (ignoreRemove) {}
            }
        }
    }

    function stripMarker(layer) {
        var comment = String(read(layer, "comment", ""));
        var primary = comment.indexOf(PRIMARY_MARKER) === 0;
        if (primary) { comment = comment.substring(PRIMARY_MARKER.length); }
        else if (comment.indexOf(DEPENDENCY_MARKER) === 0) { comment = comment.substring(DEPENDENCY_MARKER.length); }
        try { layer.comment = comment; } catch (ignoreComment) {}
        return primary;
    }

    function normalizeFileKey(value) {
        var path = String(value || "").replace(/\\/g, "/");
        try { if ($.os && String($.os).toLowerCase().indexOf("windows") >= 0) { path = path.toLowerCase(); } }
        catch (ignore) {}
        return path;
    }

    function relinkPackagedMedia(oldIds, assetDir, manifest, warnings) {
        var byOriginal = {};
        var i;
        var entry;
        var item;
        var originalPath;
        var replacement;
        manifest = manifest || [];
        for (i = 0; i < manifest.length; i += 1) {
            entry = manifest[i] || {};
            if (entry.originalPath && entry.packagedPath && !byOriginal[normalizeFileKey(entry.originalPath)]) {
                byOriginal[normalizeFileKey(entry.originalPath)] = entry;
            }
        }
        for (i = 1; i <= app.project.numItems; i += 1) {
            item = app.project.item(i);
            if (oldIds[item.id]) { continue; }
            try {
                if (!(item instanceof FootageItem) || !item.file) { continue; }
                originalPath = normalizeFileKey(item.file.fsName);
                entry = byOriginal[originalPath];
                if (!entry) { continue; }
                replacement = new File(OPLUS.util.normalizePath(assetDir + "/" + entry.packagedPath));
                if (!replacement.exists) {
                    warn(warnings, "PACKAGED_MEDIA_MISSING", "A packaged source file is missing.", {
                        source: item.name, path: replacement.fsName
                    });
                    continue;
                }
                try {
                    if (entry.sequence && typeof item.replaceWithSequence === "function") {
                        item.replaceWithSequence(replacement, !!entry.forceAlphabetical);
                    } else { item.replace(replacement); }
                } catch (relinkError) {
                    warn(warnings, "PACKAGED_MEDIA_RELINK_FAILED", relinkError.toString(), {
                        source: item.name, path: replacement.fsName
                    });
                }
            } catch (ignoreItem) {}
        }
    }

    function acquireSourceComp(nativeFile, compName, assetDir, options, warnings) {
        var signature = nativeSignature(nativeFile, compName);
        var sourceComp = findCachedComp(signature);
        var oldIds;
        var importOptions;
        var cacheHit = !!sourceComp;
        if (!sourceComp) {
            oldIds = newItemIdsBeforeImport();
            importOptions = new ImportOptions(nativeFile);
            try {
                if (importOptions.canImportAs(ImportAsType.PROJECT)) {
                    importOptions.importAs = ImportAsType.PROJECT;
                }
            } catch (ignoreImportAs) {}
            app.project.importFile(importOptions);
            relinkPackagedMedia(oldIds, assetDir, options && options.mediaManifest, warnings);
            sourceComp = findImportedComp(compName, oldIds);
            if (!sourceComp) {
                throw new Error("OPLUS_NATIVE_COMP_MISSING: The exact-copy composition was not found in native.aep.");
            }
            try { sourceComp.comment = CACHE_MARKER + signature; } catch (ignoreCacheMarker) {}
        }
        return { comp: sourceComp, cacheHit: cacheHit };
    }

    function removeSelectedLayers(layers, exceptLayer) {
        var i;
        for (i = layers.length - 1; i >= 0; i -= 1) {
            if (layers[i] && layers[i] !== exceptLayer) {
                try { layers[i].remove(); } catch (ignoreRemove) {}
            }
        }
    }

    function addAsComposition(destination, sourceComp, options, warnings, cacheHit) {
        var previousSelection = destination.selectedLayers || [];
        var layer = destination.layers.add(sourceComp);
        var mode = String(options.mode || "original");
        try { layer.name = String(options.assetName || sourceComp.name || "Otiner Composition"); } catch (ignoreName) {}
        if (mode === "currentTime") {
            try { layer.startTime = destination.time; } catch (ignoreStart) {}
        }
        if (mode === "center") {
            try {
                var transform = layer.property("ADBE Transform Group");
                var position = transform ? transform.property("ADBE Position") : null;
                if (position) { position.setValue([destination.width / 2, destination.height / 2]); }
            } catch (ignoreCenter) {}
        }
        if (mode === "replace") { removeSelectedLayers(previousSelection, layer); }
        try { layer.selected = true; } catch (ignoreSelect) {}
        return {
            mode: "native",
            structure: "composition",
            layerCount: 1,
            sourceLayerCount: sourceComp.numLayers,
            cacheHit: cacheHit,
            warnings: warnings,
            layers: [{
                name: String(read(layer, "name", "Otiner Composition")),
                index: Number(read(layer, "index", 0)),
                dependencyOnly: false
            }]
        };
    }

    function selectAllLayersForBatch(comp) {
        var i;
        var layer;
        for (i = 1; i <= comp.numLayers; i += 1) {
            layer = comp.layer(i);
            try { layer.selected = true; }
            catch (error) {
                throw new Error("OPLUS_NATIVE_BATCH_SELECT_FAILED: A required layer could not be selected safely.");
            }
        }
    }

    function removeNewTopLayers(destination, count) {
        var i;
        for (i = 0; i < count; i += 1) {
            try { destination.layer(1).remove(); } catch (ignoreRemove) { break; }
        }
    }

    function copyLayersBatch(sourceComp, destination, options, warnings) {
        var copyId = commandId("Copy", 19);
        var pasteId = commandId("Paste", 20);
        var beforeCount = destination.numLayers;
        var addedCount;
        var records = [];
        var installed = installedEffectMap();
        var previousSelection = destination.selectedLayers || [];
        var i;
        var copied;
        if (!copyId || !pasteId) {
            throw new Error("OPLUS_NATIVE_BATCH_UNAVAILABLE: After Effects Copy/Paste commands are unavailable. Use Safe Composition mode.");
        }
        sourceComp.openInViewer();
        selectAllLayersForBatch(sourceComp);
        app.executeCommand(copyId);
        destination.openInViewer();
        app.executeCommand(pasteId);
        addedCount = destination.numLayers - beforeCount;
        if (addedCount !== sourceComp.numLayers) {
            if (addedCount > 0) { removeNewTopLayers(destination, addedCount); }
            throw new Error("OPLUS_NATIVE_BATCH_INCOMPLETE: After Effects did not paste every layer. Nothing was imported; use Safe Composition mode.");
        }
        for (i = addedCount; i >= 1; i -= 1) {
            copied = destination.layer(i);
            records.push({ layer: copied, primary: stripMarker(copied) });
            removeUnavailableEffects(copied, installed, warnings);
        }
        if (String(options.mode || "") === "replace") {
            removeSelectedLayers(previousSelection, null);
        }
        adjustBatchPlacement(records, destination, String(options.mode || "original"));
        return records;
    }

    function adjustBatchPlacement(records, destination, mode) {
        var i;
        var layer;
        var earliest = null;
        var offset;
        var roots = [];
        var position;
        var value;
        var centerX = 0;
        var centerY = 0;
        if (mode === "currentTime") {
            for (i = 0; i < records.length; i += 1) {
                layer = records[i].layer;
                if (records[i].primary) {
                    earliest = earliest === null ? Number(read(layer, "inPoint", 0)) :
                        Math.min(earliest, Number(read(layer, "inPoint", 0)));
                }
            }
            offset = Number(read(destination, "time", 0)) - (earliest === null ? 0 : earliest);
            for (i = 0; i < records.length; i += 1) {
                try { records[i].layer.startTime += offset; } catch (ignoreTime) {}
            }
        } else if (mode === "center") {
            for (i = 0; i < records.length; i += 1) {
                layer = records[i].layer;
                if (!records[i].primary || read(layer, "parent", null)) { continue; }
                try {
                    position = layer.property("ADBE Transform Group").property("ADBE Position");
                    value = position.value;
                    if (value && value.length >= 2) {
                        roots.push({ property: position, value: value });
                        centerX += Number(value[0]);
                        centerY += Number(value[1]);
                    }
                } catch (ignorePosition) {}
            }
            if (roots.length) {
                centerX /= roots.length;
                centerY /= roots.length;
                for (i = 0; i < roots.length; i += 1) {
                    value = roots[i].value.slice(0);
                    value[0] += destination.width / 2 - centerX;
                    value[1] += destination.height / 2 - centerY;
                    try { roots[i].property.setValue(value); } catch (ignoreSetPosition) {}
                }
            }
        }
    }

    function copyLayersLegacy(sourceComp, destination, warnings) {
        var copiedBySourceIndex = {};
        var records = [];
        var installed = installedEffectMap();
        var i;
        var sourceLayer;
        var copied;
        var parent;
        var matte;
        var matteType;
        for (i = sourceComp.numLayers; i >= 1; i -= 1) {
            sourceLayer = sourceComp.layer(i);
            sourceLayer.copyToComp(destination);
            copied = destination.layer(1);
            copiedBySourceIndex[i] = copied;
            records.unshift({ source: sourceLayer, layer: copied, primary: stripMarker(copied) });
            removeUnavailableEffects(copied, installed, warnings);
        }
        for (i = 0; i < records.length; i += 1) {
            parent = read(records[i].source, "parent", null);
            if (parent && copiedBySourceIndex[parent.index]) {
                try { records[i].layer.parent = copiedBySourceIndex[parent.index]; } catch (ignoreParent) {}
            }
            matte = read(records[i].source, "trackMatteLayer", null);
            matteType = read(records[i].source, "trackMatteType", null);
            if (matte && copiedBySourceIndex[matte.index]) {
                try {
                    if (typeof records[i].layer.setTrackMatte === "function") {
                        records[i].layer.setTrackMatte(copiedBySourceIndex[matte.index], matteType);
                    } else { records[i].layer.trackMatteType = matteType; }
                } catch (ignoreMatte) {}
            }
        }
        return records;
    }

    function importSelection(assetDir, compName, options) {
        var destination = OPLUS.util.requireActiveComp();
        var nativeFile = new File(OPLUS.util.normalizePath(assetDir + "/native.aep"));
        var warnings = [];
        var acquired;
        var sourceComp;
        var structure;
        var records;
        var result;
        var i;
        var undoStarted = false;
        options = options || {};
        structure = String(options.structure || "composition");
        if (!nativeFile.exists) {
            throw new Error("OPLUS_NATIVE_FILE_MISSING: native.aep is missing from this asset.");
        }
        try {
            app.beginUndoGroup("Otiner Studio - Native Import");
            undoStarted = true;
            acquired = acquireSourceComp(nativeFile, compName, assetDir, options, warnings);
            sourceComp = acquired.comp;
            if (structure === "composition") {
                result = addAsComposition(destination, sourceComp, options, warnings, acquired.cacheHit);
            } else {
                try {
                    records = copyLayersBatch(sourceComp, destination, options, warnings);
                } catch (batchError) {
                    if (options.allowLegacyLayerCopy === true) {
                        warn(warnings, "NATIVE_BATCH_FALLBACK", "Batch copy failed; the legacy layer path was requested.", {
                            reason: batchError.toString()
                        });
                        records = copyLayersLegacy(sourceComp, destination, warnings);
                    } else { throw batchError; }
                }
                result = {
                    mode: "native",
                    structure: "layers",
                    layerCount: records.length,
                    layers: [],
                    warnings: warnings,
                    cacheHit: acquired.cacheHit
                };
                for (i = 0; i < records.length; i += 1) {
                    result.layers.push({
                        name: String(read(records[i].layer, "name", "")),
                        index: Number(read(records[i].layer, "index", 0)),
                        dependencyOnly: !records[i].primary
                    });
                }
            }
        } finally {
            if (undoStarted) { try { app.endUndoGroup(); } catch (ignoreUndo) {} }
        }
        return result;
    }

    nativeApi.saveSelection = saveSelection;
    nativeApi.importSelection = importSelection;
}(typeof $ !== "undefined" && $.global ? $.global : this));
