/* OPLUS Studio - asset layer reconstruction engine (ExtendScript ES3). */
(function (global) {
    var OPLUS = global.OPLUS = global.OPLUS || {};
    var importer = OPLUS.importer = OPLUS.importer || {};

    function read(object, name, fallback) {
        try {
            if (object !== null && object !== undefined && object[name] !== undefined) {
                return object[name];
            }
        } catch (ignore) {}
        return fallback;
    }

    function number(value, fallback) {
        value = Number(value);
        return (!isNaN(value) && isFinite(value)) ? value : fallback;
    }

    function log(operation, details) {
        try { if (typeof OPLUS.log === "function") { OPLUS.log(operation, details || {}); } } catch (ignore) {}
    }

    function warn(warnings, code, error, extra) {
        var item = { code: code, message: String(error || code) };
        var key;
        extra = extra || {};
        for (key in extra) { if (extra.hasOwnProperty(key)) { item[key] = extra[key]; } }
        warnings.push(item);
        log("importer.warning", item);
    }

    function parseJson(value) {
        if (typeof value !== "string") { return value; }
        if (OPLUS.util && typeof OPLUS.util.parseJson === "function") {
            return OPLUS.util.parseJson(value);
        }
        if (typeof JSON !== "undefined" && JSON.parse) { return JSON.parse(value); }
        throw new Error("OPLUS_JSON_UNAVAILABLE: No JSON parser is available.");
    }

    function copyOptions(options) {
        var result = {};
        var key;
        options = parseJson(options || {}) || {};
        for (key in options) { if (options.hasOwnProperty(key)) { result[key] = options[key]; } }
        return result;
    }

    function unpack(payload, options) {
        var parsed = parseJson(payload);
        var explicitOptions = copyOptions(options);
        var result = { data: parsed, options: {}, assetId: null };
        var bundledOptions;
        var key;
        if (!parsed || typeof parsed !== "object") {
            throw new Error("OPLUS_INVALID_ASSET_DATA: Import payload must be an object.");
        }
        if (parsed.data !== undefined && parsed.layers === undefined) {
            result.data = parseJson(parsed.data);
            result.assetId = parsed.assetId || read(parsed.metadata, "id", null);
            bundledOptions = copyOptions(parsed.options || {});
            for (key in bundledOptions) {
                if (bundledOptions.hasOwnProperty(key)) { result.options[key] = bundledOptions[key]; }
            }
            if (!result.options.mode && parsed.mode) { result.options.mode = parsed.mode; }
            if (!result.options.metadata && parsed.metadata) { result.options.metadata = parsed.metadata; }
        }
        for (key in explicitOptions) {
            if (explicitOptions.hasOwnProperty(key)) { result.options[key] = explicitOptions[key]; }
        }
        if (!result.data || !(result.data.layers instanceof Array)) {
            throw new Error("OPLUS_INVALID_ASSET_DATA: The payload has no layers array.");
        }
        if (!result.assetId) { result.assetId = read(result.data.asset, "id", null); }
        return result;
    }

    function activeComp() {
        if (OPLUS.serializer && typeof OPLUS.serializer.getActiveComp === "function") {
            return OPLUS.serializer.getActiveComp();
        }
        try {
            if (app.project.activeItem instanceof CompItem) { return app.project.activeItem; }
        } catch (ignore) {}
        return null;
    }

    function normalizeMode(mode) {
        var compact = String(mode || "original").toLowerCase().replace(/[\s_\-]/g, "");
        if (compact === "center" || compact === "centercomp" || compact === "centercomposition") {
            return "center";
        }
        if (compact === "current" || compact === "currenttime" || compact === "placeatcurrenttime") {
            return "currentTime";
        }
        if (compact === "originaltime" || compact === "keeporiginaltime") { return "originalTime"; }
        if (compact === "replace" || compact === "replaceselected" || compact === "replaceselectedlayers") {
            return "replace";
        }
        return "original";
    }

    function clampDimension(value, fallback) {
        return Math.max(4, Math.min(30000, Math.round(number(value, fallback))));
    }

    function findFootage(path) {
        var wanted;
        var i;
        var item;
        if (!path) { return null; }
        try { wanted = File(path).fsName.toLowerCase(); } catch (ignorePath) { return null; }
        try {
            for (i = 1; i <= app.project.numItems; i += 1) {
                item = app.project.item(i);
                try {
                    if (item instanceof FootageItem && item.file && item.file.fsName.toLowerCase() === wanted) {
                        return item;
                    }
                } catch (ignoreItem) {}
            }
        } catch (ignoreProject) {}
        return null;
    }

    function resolveFootage(source, options, warnings, layerData) {
        var file;
        var footage;
        var wantedPath;
        var importOptions;
        if (!source || options.importFootage === false) { return null; }
        wantedPath = source.filePath || "";
        if (source.packagedPath && options.assetDir) {
            wantedPath = OPLUS.util.normalizePath(options.assetDir + "/" + source.packagedPath);
        }
        if (!wantedPath) { return null; }
        footage = findFootage(wantedPath);
        if (footage) { return footage; }
        try {
            file = new File(wantedPath);
            if (file.exists) {
                importOptions = new ImportOptions(file);
                try { if (source.sequence) { importOptions.sequence = true; } } catch (ignoreSequence) {}
                try { if (source.forceAlphabetical) { importOptions.forceAlphabetical = true; } } catch (ignoreAlphabetical) {}
                footage = app.project.importFile(importOptions);
                applyFootageInterpretation(footage, source.interpretation, warnings, layerData);
                return footage;
            }
        } catch (error) {
            warn(warnings, "FOOTAGE_IMPORT_FAILED", error.toString(), {
                layer: layerData.name || "", path: wantedPath
            });
        }
        return null;
    }

    function applyFootageInterpretation(footage, data, warnings, layerData) {
        var main;
        var value;
        if (!footage || !data) { return; }
        try { main = footage.mainSource; } catch (ignoreMain) { main = null; }
        if (!main) { return; }
        try {
            value = enumFromData(data.alphaMode, typeof AlphaMode !== "undefined" ? AlphaMode : null);
            if (value !== null) { main.alphaMode = value; }
        } catch (ignoreAlpha) {}
        try { if (data.premulColor instanceof Array) { main.premulColor = data.premulColor; } } catch (ignorePremul) {}
        try { if (data.invertAlpha !== null && data.invertAlpha !== undefined) { main.invertAlpha = !!data.invertAlpha; } } catch (ignoreInvert) {}
        try { if (!main.isStill && data.conformFrameRate !== undefined) { main.conformFrameRate = number(data.conformFrameRate, 0); } } catch (ignoreRate) {}
        try {
            value = enumFromData(data.fieldSeparationType,
                typeof FieldSeparationType !== "undefined" ? FieldSeparationType : null);
            if (value !== null) { main.fieldSeparationType = value; }
        } catch (ignoreFields) {}
        try { if (data.highQualityFieldSeparation !== null && data.highQualityFieldSeparation !== undefined) {
            main.highQualityFieldSeparation = !!data.highQualityFieldSeparation;
        } } catch (ignoreHighQuality) {}
        try {
            value = enumFromData(data.removePulldown,
                typeof PulldownPhase !== "undefined" ? PulldownPhase : null);
            if (value !== null) { main.removePulldown = value; }
        } catch (ignorePulldown) {}
        try { if (data.loop !== undefined) { main.loop = Math.max(1, Math.round(number(data.loop, 1))); } } catch (ignoreLoop) {}
    }

    function makeTextLayer(comp, layerData) {
        var info = OPLUS.text && typeof OPLUS.text.creationInfo === "function" ?
            OPLUS.text.creationInfo(layerData.text || {}) : { text: "", boxText: false, boxTextSize: [500, 250] };
        if (info.vertical && info.boxText && typeof comp.layers.addVerticalBoxText === "function") {
            return comp.layers.addVerticalBoxText(info.boxTextSize || [500, 250]);
        }
        if (info.vertical && !info.boxText && typeof comp.layers.addVerticalText === "function") {
            return comp.layers.addVerticalText(info.text || "");
        }
        if (info.boxText && typeof comp.layers.addBoxText === "function") {
            return comp.layers.addBoxText(info.boxTextSize || [500, 250]);
        }
        return comp.layers.addText(info.text || "");
    }

    function createLayer(comp, layerData, options, warnings, sourceItems) {
        var type = String(layerData.type || "unknown");
        var source = layerData.source || {};
        var duration = Math.max(comp.frameDuration, number(source.duration,
            number(read(layerData.timing, "outPoint", comp.duration), comp.duration)));
        var width = clampDimension(source.width, comp.width);
        var height = clampDimension(source.height, comp.height);
        var pixelAspect = Math.max(0.01, Math.min(100, number(source.pixelAspect, comp.pixelAspect)));
        var color = source.color instanceof Array ? source.color : [0.2, 0.2, 0.2];
        var layer = null;
        var footage;
        if (type === "text") {
            layer = makeTextLayer(comp, layerData);
        } else if (type === "shape") {
            layer = comp.layers.addShape();
        } else if (type === "null") {
            layer = comp.layers.addNull(duration);
        } else if (type === "camera") {
            layer = comp.layers.addCamera(layerData.name || "Camera", [comp.width / 2, comp.height / 2]);
        } else if (type === "light") {
            layer = comp.layers.addLight(layerData.name || "Light", [comp.width / 2, comp.height / 2]);
        } else if (type === "solid" || type === "adjustment") {
            layer = comp.layers.addSolid(color, layerData.name || (type === "adjustment" ? "Adjustment Layer" : "Solid"),
                width, height, pixelAspect, duration);
            if (type === "adjustment") {
                try { layer.adjustmentLayer = true; } catch (ignoreAdjustment) {}
            }
        } else if (type === "av") {
            footage = source.sourceId && sourceItems ? sourceItems[source.sourceId] : null;
            if (!footage) { footage = resolveFootage(source, options, warnings, layerData); }
            if (footage) {
                layer = comp.layers.add(footage);
            } else {
                layer = comp.layers.addSolid(color, layerData.name || source.name || "Missing Footage",
                    width, height, pixelAspect, duration);
                warn(warnings, "FOOTAGE_PLACEHOLDER_CREATED",
                    "Source footage was unavailable; a solid placeholder was created.", {
                        layer: layerData.name || "", path: source.filePath || ""
                    });
            }
        } else {
            layer = comp.layers.addNull(duration);
            warn(warnings, "UNSUPPORTED_LAYER_PLACEHOLDER_CREATED",
                "An unsupported layer type was restored as a null layer.", {
                    layer: layerData.name || "", type: type
                });
        }
        try { layer.name = layerData.name || layer.name; } catch (ignoreName) {}
        try { layer.label = number(layerData.label, 0); } catch (ignoreLabel) {}
        try { layer.comment = String(layerData.comment || ""); } catch (ignoreComment) {}
        try { layer.locked = false; } catch (ignoreUnlock) {}
        try { if (layerData.threeDLayer !== undefined) { layer.threeDLayer = !!layerData.threeDLayer; } } catch (ignore3d) {}
        return layer;
    }

    function enumFromData(data, enumObject) {
        var name;
        var token;
        if (!data) { return null; }
        if (typeof data !== "object") { return data; }
        name = String(data.name || "");
        token = name.substring(name.lastIndexOf(".") + 1);
        try { if (enumObject && enumObject[token] !== undefined) { return enumObject[token]; } } catch (ignore) {}
        return data.value !== null && data.value !== undefined ? data.value : null;
    }

    function restoreParenting(records, byId, options, warnings) {
        var i;
        var record;
        var parent;
        if (options && options.preserveParenting === false) { return; }
        for (i = 0; i < records.length; i += 1) {
            record = records[i];
            if (!record.layer || !record.data.parentId) {
                if (record.data.parentIndex && !record.data.parentId) {
                    warn(warnings, "EXTERNAL_PARENT_NOT_RESTORED",
                        "The original parent was not included in the asset selection.", {
                            layer: record.data.name || "", parent: record.data.parentName || ""
                        });
                }
                continue;
            }
            parent = byId[record.data.parentId];
            if (!parent) {
                warn(warnings, "PARENT_NOT_FOUND", "The serialized parent layer was not created.", {
                    layer: record.data.name || "", parentId: record.data.parentId
                });
                continue;
            }
            try { record.layer.parent = parent; } catch (error) {
                warn(warnings, "PARENT_RESTORE_FAILED", error.toString(), {
                    layer: record.data.name || "", parentId: record.data.parentId
                });
            }
        }
    }

    function applyTiming(layer, data, timeOffset, warnings) {
        var timing = data.timing || {};
        try { layer.startTime = number(timing.startTime, 0) + timeOffset; } catch (errorStart) {
            warn(warnings, "START_TIME_RESTORE_FAILED", errorStart.toString(), { layer: data.name || "" });
        }
        try { layer.stretch = number(timing.stretch, 100); } catch (ignoreStretch) {}
        try { layer.inPoint = number(timing.inPoint, 0) + timeOffset; } catch (ignoreIn) {}
        try { layer.outPoint = number(timing.outPoint, layer.inPoint + 1) + timeOffset; } catch (ignoreOut) {}
    }

    function group(layer, matchName) {
        try { return layer.property(matchName); } catch (ignore) {}
        return null;
    }

    function offsetScalarProperty(property, delta) {
        var enabled;
        var i;
        var value;
        if (!property || !delta) { return; }
        try { enabled = property.expressionEnabled; if (enabled) { property.expressionEnabled = false; } } catch (ignoreExpression) { enabled = false; }
        try {
            if (property.numKeys > 0) {
                for (i = 1; i <= property.numKeys; i += 1) {
                    property.setValueAtKey(i, number(property.keyValue(i), 0) + delta);
                }
            } else {
                property.setValue(number(property.value, 0) + delta);
            }
        } finally {
            try { if (enabled) { property.expressionEnabled = true; } } catch (ignoreRestoreExpression) {}
        }
    }

    function offsetVectorProperty(property, offset) {
        var enabled;
        var i;
        var value;
        if (!property) { return; }
        try {
            if (property.isSeparationLeader && property.dimensionsSeparated) {
                offsetScalarProperty(property.getSeparationFollower(0), offset[0]);
                offsetScalarProperty(property.getSeparationFollower(1), offset[1]);
                return;
            }
        } catch (ignoreSeparation) {}
        try { enabled = property.expressionEnabled; if (enabled) { property.expressionEnabled = false; } } catch (ignoreExpression) { enabled = false; }
        try {
            if (property.numKeys > 0) {
                for (i = 1; i <= property.numKeys; i += 1) {
                    value = property.keyValue(i);
                    if (value instanceof Array && value.length >= 2) {
                        value[0] += offset[0];
                        value[1] += offset[1];
                        property.setValueAtKey(i, value);
                    }
                }
            } else {
                value = property.value;
                if (value instanceof Array && value.length >= 2) {
                    value[0] += offset[0];
                    value[1] += offset[1];
                    property.setValue(value);
                }
            }
        } finally {
            try { if (enabled) { property.expressionEnabled = true; } } catch (ignoreRestoreExpression) {}
        }
    }

    function centerLayer(layer, data, offset, warnings) {
        var transform;
        if (data.parentId || (!offset[0] && !offset[1])) { return; }
        try {
            transform = group(layer, "ADBE Transform Group");
            offsetVectorProperty(transform ? transform.property("ADBE Position") : null, offset);
            if (data.type === "camera") {
                offsetVectorProperty(transform ? transform.property("ADBE Point of Interest") : null, offset);
            }
        } catch (error) {
            warn(warnings, "CENTER_POSITION_FAILED", error.toString(), { layer: data.name || "" });
        }
    }

    function applyGroups(layer, data, options, warnings) {
        var target;
        var additional;
        var i;
        if (!OPLUS.serializer || typeof OPLUS.serializer.applyPropertyGroup !== "function") {
            throw new Error("OPLUS_SERIALIZER_NOT_LOADED: Property restoration is unavailable.");
        }
        target = group(layer, "ADBE Transform Group");
        if (target && data.transform) { OPLUS.serializer.applyPropertyGroup(target, data.transform, options, warnings); }
        target = group(layer, "ADBE Material Options Group");
        if (target && data.materialOptions) { OPLUS.serializer.applyPropertyGroup(target, data.materialOptions, options, warnings); }
        target = group(layer, "ADBE Audio Group");
        if (target && data.audio) { OPLUS.serializer.applyPropertyGroup(target, data.audio, options, warnings); }
        if (data.timeRemapEnabled) {
            try { if (layer.canSetTimeRemapEnabled) { layer.timeRemapEnabled = true; } } catch (errorEnableRemap) {
                warn(warnings, "TIME_REMAP_ENABLE_FAILED", errorEnableRemap.toString(), { layer: data.name || "" });
            }
        }
        target = group(layer, "ADBE Time Remapping");
        if (target && data.timeRemap) { OPLUS.serializer.applyProperty(target, data.timeRemap, options, warnings); }
        target = group(layer, "ADBE Marker");
        if (target && data.markers) { OPLUS.serializer.applyProperty(target, data.markers, options, warnings); }
        if (data.type === "camera") {
            target = group(layer, "ADBE Camera Options Group");
            if (target && data.cameraOptions) { OPLUS.serializer.applyPropertyGroup(target, data.cameraOptions, options, warnings); }
        }
        if (data.type === "light") {
            target = group(layer, "ADBE Light Options Group");
            if (target && data.lightOptions) { OPLUS.serializer.applyPropertyGroup(target, data.lightOptions, options, warnings); }
        }
        additional = data.additionalProperties || [];
        for (i = 0; i < additional.length; i += 1) {
            target = group(layer, additional[i].matchName || additional[i].name);
            if (!target) {
                try {
                    if (layer.canAddProperty(additional[i].matchName)) {
                        target = layer.addProperty(additional[i].matchName);
                    }
                } catch (ignoreAddAdditional) {}
            }
            if (!target) {
                warn(warnings, "ADDITIONAL_PROPERTY_NOT_FOUND",
                    "A stored layer property group is unavailable in this After Effects installation.", {
                        layer: data.name || "", property: additional[i].name || additional[i].matchName || ""
                    });
            } else if (additional[i].nodeType === "property") {
                OPLUS.serializer.applyProperty(target, additional[i], options, warnings);
            } else {
                OPLUS.serializer.applyPropertyGroup(target, additional[i], options, warnings);
            }
        }
    }

    function applyFlags(layer, data, warnings) {
        var value;
        try { layer.enabled = data.enabled !== false; } catch (ignore1) {}
        try { if (data.selected !== undefined) { layer.selected = !!data.selected; } } catch (ignoreSelected) {}
        try { layer.shy = !!data.shy; } catch (ignore2) {}
        try { layer.solo = !!data.solo; } catch (ignore3) {}
        try {
            value = enumFromData(data.autoOrient, typeof AutoOrientType !== "undefined" ? AutoOrientType : null);
            if (value !== null) { layer.autoOrient = value; }
        } catch (ignoreAutoOrient) {}
        try { if (data.threeDPerChar !== undefined) { layer.threeDPerChar = !!data.threeDPerChar; } } catch (ignorePerChar3d) {}
        try { if (data.environmentLayer !== undefined) { layer.environmentLayer = !!data.environmentLayer; } } catch (ignoreEnvironment) {}
        try { layer.motionBlur = !!data.motionBlur; } catch (ignore4) {}
        try { layer.frameBlending = !!data.frameBlending; } catch (ignoreFrameBlend) {}
        try {
            value = enumFromData(data.frameBlendingType,
                typeof FrameBlendingType !== "undefined" ? FrameBlendingType : null);
            if (value !== null) { layer.frameBlendingType = value; }
        } catch (ignoreFrameBlendType) {}
        try { layer.adjustmentLayer = !!data.adjustmentLayer; } catch (ignore5) {}
        try { layer.guideLayer = !!data.guideLayer; } catch (ignore6) {}
        try { layer.collapseTransformation = !!data.collapseTransformation; } catch (ignore7) {}
        try { layer.preserveTransparency = !!data.preserveTransparency; } catch (ignore8) {}
        try {
            value = enumFromData(data.quality, typeof LayerQuality !== "undefined" ? LayerQuality : null);
            if (value !== null) { layer.quality = value; }
        } catch (ignoreQuality) {}
        try {
            value = enumFromData(data.samplingQuality,
                typeof LayerSamplingQuality !== "undefined" ? LayerSamplingQuality : null);
            if (value !== null) { layer.samplingQuality = value; }
        } catch (ignoreSamplingQuality) {}
        try { if (data.audioEnabled !== null && data.audioEnabled !== undefined) { layer.audioEnabled = !!data.audioEnabled; } } catch (ignore9) {}
        try {
            value = enumFromData(data.blendingMode, typeof BlendingMode !== "undefined" ? BlendingMode : null);
            if (value !== null) { layer.blendingMode = value; }
        } catch (errorBlend) {
            warn(warnings, "BLEND_MODE_RESTORE_FAILED", errorBlend.toString(), { layer: data.name || "" });
        }
        if (data.type === "light") {
            try {
                value = enumFromData(data.lightType, typeof LightType !== "undefined" ? LightType : null);
                if (value !== null) { layer.lightType = value; }
            } catch (ignoreLightType) {}
        }
    }

    function restoreTrackMattes(records, byId, warnings) {
        var i;
        var record;
        var data;
        var matte;
        var type;
        var typeName;
        var externalMissing;
        for (i = 0; i < records.length; i += 1) {
            record = records[i];
            data = record.data;
            if (!data.trackMatteType) { continue; }
            typeName = String(data.trackMatteType.name || "").toUpperCase();
            if (typeName.indexOf("NO_TRACK") >= 0) { continue; }
            type = enumFromData(data.trackMatteType,
                typeof TrackMatteType !== "undefined" ? TrackMatteType : null);
            matte = data.trackMatteLayerId ? byId[data.trackMatteLayerId] : null;
            externalMissing = !data.trackMatteLayerId &&
                data.trackMatteLayerIndex !== null && data.trackMatteLayerIndex !== undefined;
            if (externalMissing) {
                warn(warnings, "EXTERNAL_TRACK_MATTE_NOT_RESTORED",
                    "The track matte layer was not included in the asset selection.", {
                        layer: data.name || "", matte: data.trackMatteLayerName || ""
                    });
                continue;
            }
            if (data.trackMatteLayerId && !matte) {
                warn(warnings, "TRACK_MATTE_LAYER_NOT_FOUND",
                    "The serialized track matte layer was not created.", {
                        layer: data.name || "", matte: data.trackMatteLayerName || ""
                    });
                continue;
            }
            if (!matte && data.trackMatteLayerId === undefined) {
                try {
                    if (record.layer.index > 1) { matte = record.layer.containingComp.layer(record.layer.index - 1); }
                } catch (ignoreLegacyMatte) {}
            }
            try {
                if (matte && typeof record.layer.setTrackMatte === "function") {
                    record.layer.setTrackMatte(matte, type);
                } else if (type !== null) {
                    record.layer.trackMatteType = type;
                }
            } catch (errorMatte) {
                warn(warnings, "TRACK_MATTE_RESTORE_FAILED", errorMatte.toString(), { layer: data.name || "" });
            }
        }
    }

    function applyLayer(record, propertyOptions, centerOffset, warnings) {
        var layer = record.layer;
        var data = record.data;
        applyTiming(layer, data, number(propertyOptions.timeOffset, 0), warnings);
        try { applyGroups(layer, data, propertyOptions, warnings); } catch (errorGroups) {
            warn(warnings, "LAYER_PROPERTIES_RESTORE_FAILED", errorGroups.toString(), { layer: data.name || "" });
        }
        if (data.type === "text" && data.text && OPLUS.text) {
            try { OPLUS.text.apply(layer, data.text, propertyOptions, warnings); } catch (errorText) {
                warn(warnings, "TEXT_RESTORE_FAILED", errorText.toString(), { layer: data.name || "" });
            }
        }
        if (data.type === "shape" && data.shape && OPLUS.shapes) {
            try { OPLUS.shapes.apply(layer, data.shape, propertyOptions, warnings); } catch (errorShape) {
                warn(warnings, "SHAPE_RESTORE_FAILED", errorShape.toString(), { layer: data.name || "" });
            }
        }
        if (data.masks && OPLUS.shapes) {
            try { OPLUS.shapes.applyMasks(layer, data.masks, propertyOptions, warnings); } catch (errorMasks) {
                warn(warnings, "MASKS_RESTORE_FAILED", errorMasks.toString(), { layer: data.name || "" });
            }
        }
        if (data.effects && OPLUS.effects) {
            try { OPLUS.effects.apply(layer, data.effects, propertyOptions, warnings); } catch (errorEffects) {
                warn(warnings, "EFFECTS_RESTORE_FAILED", errorEffects.toString(), { layer: data.name || "" });
            }
        }
        centerLayer(layer, data, centerOffset, warnings);
        applyFlags(layer, data, warnings);
    }

    function restoreLocks(records) {
        var i;
        for (i = 0; i < records.length; i += 1) {
            try { records[i].layer.locked = !!records[i].data.locked; } catch (ignore) {}
        }
    }

    function selectedLayersCopy(comp, layerIndices) {
        var result = [];
        var selected = comp.selectedLayers || [];
        var i;
        var layer;
        if (layerIndices instanceof Array && layerIndices.length) {
            for (i = 0; i < layerIndices.length; i += 1) {
                try {
                    layer = comp.layer(number(layerIndices[i], 0));
                    if (layer) { result.push(layer); }
                } catch (ignoreIndex) {}
            }
        } else {
            for (i = 0; i < selected.length; i += 1) { result.push(selected[i]); }
        }
        result.sort(function (a, b) { return b.index - a.index; });
        return result;
    }

    function removeReplacedLayers(layers, warnings) {
        var removed = 0;
        var i;
        var wasLocked;
        for (i = 0; i < layers.length; i += 1) {
            try {
                wasLocked = !!layers[i].locked;
                if (wasLocked) { layers[i].locked = false; }
                layers[i].remove();
                removed += 1;
            } catch (error) {
                try { if (wasLocked) { layers[i].locked = true; } } catch (ignoreRelock) {}
                warn(warnings, "REPLACE_LAYER_REMOVE_FAILED", error.toString(), {
                    layer: read(layers[i], "name", "")
                });
            }
        }
        return removed;
    }

    function applyCompositionSettings(comp, data) {
        data = data || {};
        try { comp.displayStartTime = number(data.displayStartTime, 0); } catch (ignoreStartTime) {}
        try { if (data.displayStartFrame !== undefined) { comp.displayStartFrame = number(data.displayStartFrame, 0); } } catch (ignoreStartFrame) {}
        try { comp.dropFrame = !!data.dropFrame; } catch (ignoreDropFrame) {}
        try { comp.workAreaStart = number(data.workAreaStart, 0); } catch (ignoreWorkStart) {}
        try { comp.workAreaDuration = number(data.workAreaDuration, comp.duration); } catch (ignoreWorkDuration) {}
        try { if (data.bgColor instanceof Array) { comp.bgColor = data.bgColor; } } catch (ignoreBg) {}
        try { if (data.renderer) { comp.renderer = data.renderer; } } catch (ignoreRenderer) {}
        try { if (data.resolutionFactor instanceof Array) { comp.resolutionFactor = data.resolutionFactor; } } catch (ignoreResolution) {}
        try { comp.preserveNestedFrameRate = !!data.preserveNestedFrameRate; } catch (ignoreNestedRate) {}
        try { comp.preserveNestedResolution = !!data.preserveNestedResolution; } catch (ignoreNestedResolution) {}
        try { comp.motionBlur = !!data.motionBlur; } catch (ignoreMotionBlur) {}
        try { comp.draft3d = !!data.draft3d; } catch (ignoreDraft) {}
        try { comp.frameBlending = !!data.frameBlending; } catch (ignoreFrameBlending) {}
        try { comp.hideShyLayers = !!data.hideShyLayers; } catch (ignoreShy) {}
        try { comp.shutterAngle = number(data.shutterAngle, 180); } catch (ignoreShutterAngle) {}
        try { comp.shutterPhase = number(data.shutterPhase, -90); } catch (ignoreShutterPhase) {}
        try { comp.motionBlurSamplesPerFrame = number(data.motionBlurSamplesPerFrame, 16); } catch (ignoreSamples) {}
        try { comp.motionBlurAdaptiveSampleLimit = number(data.motionBlurAdaptiveSampleLimit, 128); } catch (ignoreAdaptive) {}
    }

    function restoreCompositionLayers(comp, layerList, settings, warnings, sourceItems) {
        var records = [];
        var byId = {};
        var propertyOptions = { timeOffset: 0 };
        var i;
        var layerData;
        var layer;
        var key;
        for (key in settings) { if (settings.hasOwnProperty(key)) { propertyOptions[key] = settings[key]; } }
        layerList = layerList || [];
        for (i = layerList.length - 1; i >= 0; i -= 1) {
            layerData = layerList[i];
            try {
                layer = createLayer(comp, layerData, settings, warnings, sourceItems);
                records.unshift({ data: layerData, layer: layer });
                byId[layerData.id || ("layer-" + (i + 1))] = layer;
            } catch (errorCreate) {
                warn(warnings, "SOURCE_LAYER_CREATE_FAILED", errorCreate.toString(), {
                    composition: comp.name, layer: layerData.name || "", type: layerData.type || ""
                });
            }
        }
        propertyOptions.layerBySerializedId = byId;
        propertyOptions.sourceItems = sourceItems;
        restoreParenting(records, byId, settings, warnings);
        for (i = 0; i < records.length; i += 1) {
            try { applyLayer(records[i], propertyOptions, [0, 0], warnings); } catch (errorApply) {
                warn(warnings, "SOURCE_LAYER_RESTORE_FAILED", errorApply.toString(), {
                    composition: comp.name, layer: records[i].data.name || ""
                });
            }
        }
        restoreTrackMattes(records, byId, warnings);
        restoreLocks(records);
    }

    function buildSourceItems(data, settings, warnings) {
        var definitions = data.sources || [];
        var sourceItems = {};
        var i;
        var definition;
        var info;
        var item;
        for (i = 0; i < definitions.length; i += 1) {
            definition = definitions[i] || {};
            if (definition.kind === "composition") {
                info = definition.composition || definition;
                try {
                    item = app.project.items.addComp(
                        info.name || definition.name || "Otiner Precomp",
                        clampDimension(info.width, 1920), clampDimension(info.height, 1080),
                        Math.max(0.01, Math.min(100, number(info.pixelAspect, 1))),
                        Math.max(0.01, number(info.duration, 1)),
                        Math.max(1, number(info.frameRate, 25)));
                    sourceItems[definition.id] = item;
                    applyCompositionSettings(item, info);
                } catch (errorComp) {
                    warn(warnings, "SOURCE_COMPOSITION_CREATE_FAILED", errorComp.toString(), {
                        source: definition.name || definition.id || ""
                    });
                }
            }
        }
        for (i = 0; i < definitions.length; i += 1) {
            definition = definitions[i] || {};
            if (definition.kind === "footage") {
                item = resolveFootage(definition, settings, warnings, { name: definition.name || "Footage" });
                if (item) { sourceItems[definition.id] = item; }
            }
        }
        for (i = 0; i < definitions.length; i += 1) {
            definition = definitions[i] || {};
            if (definition.kind === "composition" && sourceItems[definition.id]) {
                restoreCompositionLayers(sourceItems[definition.id], definition.layers, settings, warnings, sourceItems);
            }
        }
        return sourceItems;
    }

    function importAsset(payload, options) {
        var unpacked = unpack(payload, options);
        var data = unpacked.data;
        var settings = unpacked.options;
        var comp = activeComp();
        var mode = normalizeMode(settings.mode);
        var selectedBefore;
        var records = [];
        var byId = {};
        var warnings = [];
        var timeOffset = 0;
        var centerOffset = [0, 0];
        var sourceCenter;
        var targetCenter;
        var propertyOptions = {};
        var i;
        var layerData;
        var layer;
        var undoStarted = false;
        var removed = 0;
        var result;
        var errorToThrow = null;
        var key;
        var sourceItems = {};
        if (!comp) {
            throw new Error("OPLUS_NO_ACTIVE_COMP: Open or select a destination composition first.");
        }
        if (data.layers.length === 0) {
            throw new Error("OPLUS_EMPTY_ASSET: The asset contains no layers.");
        }
        selectedBefore = selectedLayersCopy(comp, settings.replaceLayerIndices);
        if (mode === "replace" && selectedBefore.length === 0) {
            throw new Error("OPLUS_REPLACE_SELECTION_REQUIRED: Select at least one destination layer to replace.");
        }
        if (mode === "currentTime") {
            timeOffset = number(settings.targetTime !== undefined ? settings.targetTime : settings.currentTime,
                comp.time) - number(data.selectionStart, 0);
        }
        if (mode === "center") {
            sourceCenter = data.selectionCenter instanceof Array && data.selectionCenter.length >= 2 ?
                data.selectionCenter : [
                    number(read(data.composition, "width", comp.width), comp.width) / 2,
                    number(read(data.composition, "height", comp.height), comp.height) / 2
                ];
            if (settings.targetPosition instanceof Array && settings.targetPosition.length >= 2) {
                targetCenter = [number(settings.targetPosition[0], comp.width / 2),
                    number(settings.targetPosition[1], comp.height / 2)];
            } else {
                targetCenter = [comp.width / 2, comp.height / 2];
            }
            centerOffset = [targetCenter[0] - number(sourceCenter[0], targetCenter[0]),
                targetCenter[1] - number(sourceCenter[1], targetCenter[1])];
        }
        for (key in settings) { if (settings.hasOwnProperty(key)) { propertyOptions[key] = settings[key]; } }
        propertyOptions.timeOffset = timeOffset;
        try {
            app.beginUndoGroup("Otiner Studio - Import Asset");
            undoStarted = true;
            sourceItems = buildSourceItems(data, settings, warnings);
            for (i = data.layers.length - 1; i >= 0; i -= 1) {
                layerData = data.layers[i];
                try {
                    layer = createLayer(comp, layerData, settings, warnings, sourceItems);
                    records.unshift({ data: layerData, layer: layer });
                    byId[layerData.id || ("layer-" + (i + 1))] = layer;
                } catch (errorCreate) {
                    warn(warnings, "LAYER_CREATE_FAILED", errorCreate.toString(), {
                        layer: layerData.name || "", type: layerData.type || ""
                    });
                }
            }
            propertyOptions.layerBySerializedId = byId;
            propertyOptions.sourceItems = sourceItems;
            if (records.length === 0) {
                throw new Error("OPLUS_IMPORT_EMPTY: No layers could be created.");
            }
            restoreParenting(records, byId, settings, warnings);
            for (i = 0; i < records.length; i += 1) {
                try { applyLayer(records[i], propertyOptions, centerOffset, warnings); } catch (errorApply) {
                    warn(warnings, "LAYER_RESTORE_FAILED", errorApply.toString(), {
                        layer: records[i].data.name || ""
                    });
                }
            }
            restoreTrackMattes(records, byId, warnings);
            restoreLocks(records);
            if (mode === "replace") {
                if (records.length === data.layers.length) {
                    removed = removeReplacedLayers(selectedBefore, warnings);
                } else {
                    warn(warnings, "REPLACE_ABORTED_PARTIAL_IMPORT",
                        "The original selected layers were kept because part of the asset failed to import.", {
                            requested: data.layers.length, created: records.length
                        });
                }
            }
        } catch (fatalError) {
            errorToThrow = fatalError;
        } finally {
            if (undoStarted) {
                try { app.endUndoGroup(); } catch (ignoreUndo) {}
            }
        }
        if (errorToThrow) {
            log("importer.failed", {
                assetId: unpacked.assetId || "", error: errorToThrow.toString(), warningCount: warnings.length
            });
            throw errorToThrow;
        }
        result = {
            assetId: unpacked.assetId,
            mode: mode,
            layerCount: records.length,
            removedLayerCount: removed,
            timeOffset: timeOffset,
            positionOffset: centerOffset,
            layers: [],
            warnings: warnings
        };
        for (i = 0; i < records.length; i += 1) {
            result.layers.push({
                id: records[i].data.id || ("layer-" + (i + 1)),
                name: String(read(records[i].layer, "name", records[i].data.name || "")),
                index: number(read(records[i].layer, "index", 0), 0)
            });
        }
        log("importer.complete", {
            assetId: result.assetId || "", mode: mode, layerCount: result.layerCount,
            removedLayerCount: removed, warningCount: warnings.length
        });
        return result;
    }

    importer.importAsset = importAsset;
    importer.normalizeMode = normalizeMode;
}(typeof $ !== "undefined" && $.global ? $.global : this));
