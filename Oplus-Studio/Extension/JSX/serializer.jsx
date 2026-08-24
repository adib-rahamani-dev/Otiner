/*
 * OPLUS Studio - After Effects selection serializer
 * ExtendScript / ECMAScript 3 compatible.
 */
(function (global) {
    var OPLUS = global.OPLUS = global.OPLUS || {};
    var serializer = OPLUS.serializer = OPLUS.serializer || {};

    function log(operation, details) {
        try {
            if (typeof OPLUS.log === "function") {
                OPLUS.log(operation, details || {});
            }
        } catch (ignore) {}
    }

    function warning(list, code, message, details) {
        var item = { code: code, message: String(message || code) };
        var key;
        details = details || {};
        for (key in details) {
            if (details.hasOwnProperty(key)) {
                item[key] = details[key];
            }
        }
        if (list) {
            list.push(item);
        }
        log("serializer.warning", item);
    }

    function read(object, name, fallback) {
        try {
            if (object !== null && object !== undefined && object[name] !== undefined) {
                return object[name];
            }
        } catch (ignore) {}
        return fallback;
    }

    function call(fn, fallback) {
        try {
            return fn();
        } catch (ignore) {
            return fallback;
        }
    }

    function enumName(value) {
        if (value === null || value === undefined) {
            return null;
        }
        try {
            return value.toString();
        } catch (ignore) {}
        return String(value);
    }

    function enumValue(value) {
        var number;
        if (value === null || value === undefined) {
            return null;
        }
        try {
            number = Number(value);
            if (!isNaN(number) && isFinite(number)) {
                return number;
            }
        } catch (ignore) {}
        return null;
    }

    function finiteNumber(value, fallback) {
        var number = Number(value);
        return (!isNaN(number) && isFinite(number)) ? number : fallback;
    }

    function jsonSafe(value, depth) {
        var result;
        var key;
        var i;
        var type;
        depth = depth || 0;
        if (depth > 24 || value === undefined || value === null) {
            return null;
        }
        type = typeof value;
        if (type === "string" || type === "boolean") {
            return value;
        }
        if (type === "number") {
            return (!isNaN(value) && isFinite(value)) ? value : null;
        }
        if (value instanceof Array) {
            result = [];
            for (i = 0; i < value.length; i += 1) {
                result.push(jsonSafe(value[i], depth + 1));
            }
            return result;
        }
        if (type === "object") {
            result = {};
            for (key in value) {
                if (value.hasOwnProperty(key) && typeof value[key] !== "function") {
                    result[key] = jsonSafe(value[key], depth + 1);
                }
            }
            return result;
        }
        return String(value);
    }

    function isTextDocument(value) {
        try {
            return typeof TextDocument !== "undefined" && value instanceof TextDocument;
        } catch (ignore) {}
        return value && typeof value.text === "string" && value.fontSize !== undefined;
    }

    function isShapeValue(value) {
        return value && value.vertices instanceof Array &&
            value.inTangents instanceof Array && value.outTangents instanceof Array;
    }

    function shapeToObject(value) {
        if (OPLUS.shapes && typeof OPLUS.shapes.shapeToObject === "function") {
            return OPLUS.shapes.shapeToObject(value);
        }
        return {
            __oplusType: "Shape",
            closed: !!read(value, "closed", false),
            vertices: jsonSafe(read(value, "vertices", [])),
            inTangents: jsonSafe(read(value, "inTangents", [])),
            outTangents: jsonSafe(read(value, "outTangents", [])),
            featherSegLocs: jsonSafe(read(value, "featherSegLocs", [])),
            featherRelSegLocs: jsonSafe(read(value, "featherRelSegLocs", [])),
            featherRadii: jsonSafe(read(value, "featherRadii", [])),
            featherInterps: jsonSafe(read(value, "featherInterps", [])),
            featherTensions: jsonSafe(read(value, "featherTensions", [])),
            featherTypes: jsonSafe(read(value, "featherTypes", [])),
            featherRelCornerAngles: jsonSafe(read(value, "featherRelCornerAngles", []))
        };
    }

    function markerToObject(value) {
        var parameters = [];
        try {
            parameters = value.getParameters();
        } catch (ignore) {}
        return {
            __oplusType: "MarkerValue",
            comment: read(value, "comment", ""),
            chapter: read(value, "chapter", ""),
            cuePointName: read(value, "cuePointName", ""),
            eventCuePoint: !!read(value, "eventCuePoint", false),
            url: read(value, "url", ""),
            frameTarget: read(value, "frameTarget", ""),
            duration: finiteNumber(read(value, "duration", 0), 0),
            protectedRegion: !!read(value, "protectedRegion", false),
            label: finiteNumber(read(value, "label", 0), 0),
            parameters: jsonSafe(parameters)
        };
    }

    function valueToJson(value, property, warnings) {
        var converted;
        if (value === undefined || value === null) {
            return null;
        }
        if (isTextDocument(value)) {
            if (OPLUS.text && typeof OPLUS.text.documentToObject === "function") {
                return OPLUS.text.documentToObject(value);
            }
            return { __oplusType: "TextDocument", text: String(read(value, "text", "")) };
        }
        if (isShapeValue(value)) {
            return shapeToObject(value);
        }
        try {
            if (typeof MarkerValue !== "undefined" && value instanceof MarkerValue) {
                return markerToObject(value);
            }
        } catch (ignoreMarker) {}
        if (typeof value === "number" || typeof value === "string" ||
                typeof value === "boolean" || value instanceof Array) {
            return jsonSafe(value);
        }
        try {
            if (OPLUS.util && typeof OPLUS.util.propertyValueToJson === "function") {
                converted = OPLUS.util.propertyValueToJson(value, property);
                if (converted !== undefined) {
                    return jsonSafe(converted);
                }
            }
        } catch (error) {
            warning(warnings, "VALUE_CONVERSION_FAILED", error.toString(), {
                property: read(property, "name", "")
            });
        }
        return jsonSafe(value);
    }

    function objectToShape(data) {
        var shape;
        if (OPLUS.shapes && typeof OPLUS.shapes.objectToShape === "function") {
            return OPLUS.shapes.objectToShape(data);
        }
        try {
            shape = new Shape();
            shape.closed = !!data.closed;
            shape.vertices = data.vertices || [];
            shape.inTangents = data.inTangents || [];
            shape.outTangents = data.outTangents || [];
            try { shape.featherSegLocs = data.featherSegLocs || []; } catch (ignore1) {}
            try { shape.featherRelSegLocs = data.featherRelSegLocs || []; } catch (ignore2) {}
            try { shape.featherRadii = data.featherRadii || []; } catch (ignore3) {}
            try { shape.featherInterps = data.featherInterps || []; } catch (ignore4) {}
            try { shape.featherTensions = data.featherTensions || []; } catch (ignore5) {}
            try { shape.featherTypes = data.featherTypes || []; } catch (ignore6) {}
            try { shape.featherRelCornerAngles = data.featherRelCornerAngles || []; } catch (ignore7) {}
            return shape;
        } catch (ignore) {}
        return data;
    }

    function objectToMarker(data) {
        var marker;
        try {
            marker = new MarkerValue(data.comment || "", data.chapter || "",
                data.url || "", data.frameTarget || "", data.cuePointName || "",
                data.parameters || []);
            try { marker.eventCuePoint = !!data.eventCuePoint; } catch (ignore1) {}
            try { marker.duration = finiteNumber(data.duration, 0); } catch (ignore2) {}
            try { marker.protectedRegion = !!data.protectedRegion; } catch (ignore3) {}
            try { marker.label = finiteNumber(data.label, 0); } catch (ignore4) {}
            return marker;
        } catch (ignore) {}
        return data.comment || "";
    }

    function valueFromJson(data, property) {
        if (data === null || data === undefined) {
            return data;
        }
        if (data instanceof Array || typeof data !== "object") {
            return data;
        }
        if (data.__oplusType === "Shape") {
            return objectToShape(data);
        }
        if (data.__oplusType === "TextDocument") {
            if (OPLUS.text && typeof OPLUS.text.objectToDocument === "function") {
                return OPLUS.text.objectToDocument(data, property);
            }
            try {
                return new TextDocument(data.text || "");
            } catch (ignoreText) {
                return data.text || "";
            }
        }
        if (data.__oplusType === "MarkerValue") {
            return objectToMarker(data);
        }
        return data;
    }

    function easeToObject(ease) {
        return {
            speed: finiteNumber(read(ease, "speed", 0), 0),
            influence: finiteNumber(read(ease, "influence", 33.333), 33.333)
        };
    }

    function easesToObjects(eases) {
        var result = [];
        var i;
        if (!eases) {
            return result;
        }
        for (i = 0; i < eases.length; i += 1) {
            result.push(easeToObject(eases[i]));
        }
        return result;
    }

    function serializeKey(property, keyIndex, warnings) {
        var item = {
            time: finiteNumber(call(function () { return property.keyTime(keyIndex); }, 0), 0),
            value: null,
            inInterpolation: null,
            outInterpolation: null,
            inTemporalEase: [],
            outTemporalEase: []
        };
        try {
            item.value = valueToJson(property.keyValue(keyIndex), property, warnings);
        } catch (error) {
            item.valueUnavailable = true;
            warning(warnings, "KEY_VALUE_UNAVAILABLE", error.toString(), {
                property: read(property, "name", ""), key: keyIndex
            });
        }
        item.inInterpolation = {
            value: enumValue(call(function () { return property.keyInInterpolationType(keyIndex); }, null)),
            name: enumName(call(function () { return property.keyInInterpolationType(keyIndex); }, null))
        };
        item.outInterpolation = {
            value: enumValue(call(function () { return property.keyOutInterpolationType(keyIndex); }, null)),
            name: enumName(call(function () { return property.keyOutInterpolationType(keyIndex); }, null))
        };
        item.inTemporalEase = easesToObjects(call(function () {
            return property.keyInTemporalEase(keyIndex);
        }, []));
        item.outTemporalEase = easesToObjects(call(function () {
            return property.keyOutTemporalEase(keyIndex);
        }, []));
        item.temporalContinuous = !!call(function () {
            return property.keyTemporalContinuous(keyIndex);
        }, false);
        item.temporalAutoBezier = !!call(function () {
            return property.keyTemporalAutoBezier(keyIndex);
        }, false);
        item.spatialContinuous = !!call(function () {
            return property.keySpatialContinuous(keyIndex);
        }, false);
        item.spatialAutoBezier = !!call(function () {
            return property.keySpatialAutoBezier(keyIndex);
        }, false);
        item.roving = !!call(function () { return property.keyRoving(keyIndex); }, false);
        item.inSpatialTangent = jsonSafe(call(function () {
            return property.keyInSpatialTangent(keyIndex);
        }, null));
        item.outSpatialTangent = jsonSafe(call(function () {
            return property.keyOutSpatialTangent(keyIndex);
        }, null));
        item.label = finiteNumber(call(function () { return property.keyLabel(keyIndex); }, 0), 0);
        return item;
    }

    function isProperty(object) {
        return object && read(object, "numKeys", undefined) !== undefined &&
            read(object, "propertyValueType", undefined) !== undefined;
    }

    function serializeProperty(property, options, warnings) {
        var item;
        var keyCount;
        var i;
        var rawValue;
        options = options || {};
        item = {
            nodeType: "property",
            name: String(read(property, "name", "")),
            matchName: String(read(property, "matchName", "")),
            propertyIndex: finiteNumber(read(property, "propertyIndex", 0), 0),
            propertyValueType: {
                value: enumValue(read(property, "propertyValueType", null)),
                name: enumName(read(property, "propertyValueType", null))
            },
            canVaryOverTime: !!read(property, "canVaryOverTime", false),
            enabled: read(property, "enabled", null),
            keys: []
        };
        keyCount = finiteNumber(read(property, "numKeys", 0), 0);
        if (keyCount > 0) {
            for (i = 1; i <= keyCount; i += 1) {
                item.keys.push(serializeKey(property, i, warnings));
            }
        } else if (String(item.propertyValueType.name || "").toUpperCase().indexOf("NO_VALUE") >= 0) {
            item.valueUnavailable = true;
        } else {
            try {
                rawValue = property.value;
                try {
                    if (property.canSetExpression && property.expressionEnabled &&
                            typeof property.valueAtTime === "function") {
                        rawValue = property.valueAtTime(0, true);
                    }
                } catch (ignorePreExpression) {}
                item.value = valueToJson(rawValue, property, warnings);
            } catch (error) {
                item.valueUnavailable = true;
                warning(warnings, "PROPERTY_VALUE_UNAVAILABLE", error.toString(), {
                    property: item.name, matchName: item.matchName
                });
            }
        }
        try {
            if (property.isSeparationLeader) {
                item.dimensionsSeparated = !!property.dimensionsSeparated;
                if (item.dimensionsSeparated) {
                    item.separationFollowers = [];
                    for (i = 0; i < property.value.length; i += 1) {
                        item.separationFollowers.push(serializeProperty(
                            property.getSeparationFollower(i), options, warnings));
                    }
                }
            }
        } catch (ignoreSeparation) {}
        if (options.includeExpressions !== false) {
            try {
                if (property.canSetExpression) {
                    item.expression = String(property.expression || "");
                    item.expressionEnabled = !!property.expressionEnabled;
                    if (property.expressionError) {
                        item.expressionError = String(property.expressionError);
                    }
                }
            } catch (errorExpression) {
                warning(warnings, "EXPRESSION_READ_FAILED", errorExpression.toString(), {
                    property: item.name
                });
            }
        }
        return item;
    }

    function serializePropertyGroup(group, options, warnings) {
        var item = {
            nodeType: "group",
            name: String(read(group, "name", "")),
            matchName: String(read(group, "matchName", "")),
            propertyIndex: finiteNumber(read(group, "propertyIndex", 0), 0),
            propertyType: {
                value: enumValue(read(group, "propertyType", null)),
                name: enumName(read(group, "propertyType", null))
            },
            children: []
        };
        var count = finiteNumber(read(group, "numProperties", 0), 0);
        var i;
        var child;
        for (i = 1; i <= count; i += 1) {
            try {
                child = group.property(i);
                if (isProperty(child)) {
                    item.children.push(serializeProperty(child, options, warnings));
                } else if (child) {
                    item.children.push(serializePropertyGroup(child, options, warnings));
                }
            } catch (error) {
                warning(warnings, "PROPERTY_GROUP_READ_FAILED", error.toString(), {
                    group: item.name, propertyIndex: i
                });
            }
        }
        return item;
    }

    function layerType(layer) {
        try { if (layer instanceof TextLayer) { return "text"; } } catch (ignore1) {}
        try { if (layer instanceof ShapeLayer) { return "shape"; } } catch (ignore2) {}
        try { if (layer instanceof CameraLayer) { return "camera"; } } catch (ignore3) {}
        try { if (layer instanceof LightLayer) { return "light"; } } catch (ignore4) {}
        if (read(layer, "nullLayer", false)) { return "null"; }
        if (read(layer, "adjustmentLayer", false)) { return "adjustment"; }
        try {
            if (layer.source && layer.source.mainSource &&
                    typeof SolidSource !== "undefined" && layer.source.mainSource instanceof SolidSource) {
                return "solid";
            }
        } catch (ignore5) {}
        try { if (layer instanceof AVLayer) { return "av"; } } catch (ignore6) {}
        return "unknown";
    }

    function solidSource(layer) {
        var source;
        var main;
        try {
            source = layer.source;
            main = source.mainSource;
            return {
                name: String(read(source, "name", read(layer, "name", "Solid"))),
                width: finiteNumber(read(source, "width", 100), 100),
                height: finiteNumber(read(source, "height", 100), 100),
                pixelAspect: finiteNumber(read(source, "pixelAspect", 1), 1),
                duration: finiteNumber(read(source, "duration", read(layer, "outPoint", 1)), 1),
                color: jsonSafe(read(main, "color", [0, 0, 0]))
            };
        } catch (ignore) {}
        return null;
    }

    function sourceInfo(layer, type) {
        var source;
        if (type === "solid" || type === "adjustment") {
            return solidSource(layer);
        }
        if (type === "av") {
            try {
                source = layer.source;
                return {
                    name: String(read(source, "name", "")),
                    width: finiteNumber(read(source, "width", 100), 100),
                    height: finiteNumber(read(source, "height", 100), 100),
                    pixelAspect: finiteNumber(read(source, "pixelAspect", 1), 1),
                    duration: finiteNumber(read(source, "duration", 1), 1),
                    filePath: call(function () { return source.file.fsName; }, null),
                    missingFootage: !!call(function () { return source.footageMissing; }, false)
                };
            } catch (ignore) {}
        }
        return null;
    }

    function groupByMatchName(layer, matchName) {
        try { return layer.property(matchName); } catch (ignore) {}
        return null;
    }

    function serializeOptionalGroup(layer, matchName, options, warnings) {
        var group = groupByMatchName(layer, matchName);
        return group ? serializePropertyGroup(group, options, warnings) : null;
    }

    function serializeOptionalProperty(layer, matchName, options, warnings) {
        var property = groupByMatchName(layer, matchName);
        return property && isProperty(property) ? serializeProperty(property, options, warnings) : null;
    }

    function serializeLayer(layer, idByIndex, options, warnings) {
        var type = layerType(layer);
        var parent = read(layer, "parent", null);
        var trackMatteLayer = read(layer, "trackMatteLayer", null);
        var index = finiteNumber(read(layer, "index", 0), 0);
        var item = {
            id: idByIndex[index] || ("layer-" + index),
            aeLayerId: finiteNumber(read(layer, "id", 0), 0),
            index: index,
            name: String(read(layer, "name", "Layer")),
            type: type,
            parentId: parent ? (idByIndex[finiteNumber(read(parent, "index", 0), 0)] || null) : null,
            parentIndex: parent ? finiteNumber(read(parent, "index", 0), 0) : null,
            parentName: parent ? String(read(parent, "name", "")) : null,
            enabled: !!read(layer, "enabled", true),
            locked: !!read(layer, "locked", false),
            shy: !!read(layer, "shy", false),
            solo: !!read(layer, "solo", false),
            threeDLayer: !!read(layer, "threeDLayer", false),
            motionBlur: !!read(layer, "motionBlur", false),
            frameBlending: !!read(layer, "frameBlending", false),
            frameBlendingType: {
                value: enumValue(read(layer, "frameBlendingType", null)),
                name: enumName(read(layer, "frameBlendingType", null))
            },
            adjustmentLayer: !!read(layer, "adjustmentLayer", false),
            guideLayer: !!read(layer, "guideLayer", false),
            collapseTransformation: !!read(layer, "collapseTransformation", false),
            preserveTransparency: !!read(layer, "preserveTransparency", false),
            audioEnabled: read(layer, "audioEnabled", null),
            label: finiteNumber(read(layer, "label", 0), 0),
            comment: String(read(layer, "comment", "")),
            blendingMode: {
                value: enumValue(read(layer, "blendingMode", null)),
                name: enumName(read(layer, "blendingMode", null))
            },
            trackMatteType: {
                value: enumValue(read(layer, "trackMatteType", null)),
                name: enumName(read(layer, "trackMatteType", null))
            },
            trackMatteLayerId: trackMatteLayer ?
                (idByIndex[finiteNumber(read(trackMatteLayer, "index", 0), 0)] || null) : null,
            trackMatteLayerIndex: trackMatteLayer ?
                finiteNumber(read(trackMatteLayer, "index", 0), 0) : null,
            trackMatteLayerName: trackMatteLayer ? String(read(trackMatteLayer, "name", "")) : null,
            timeRemapEnabled: !!read(layer, "timeRemapEnabled", false),
            timing: {
                startTime: finiteNumber(read(layer, "startTime", 0), 0),
                inPoint: finiteNumber(read(layer, "inPoint", 0), 0),
                outPoint: finiteNumber(read(layer, "outPoint", 0), 0),
                stretch: finiteNumber(read(layer, "stretch", 100), 100)
            },
            source: sourceInfo(layer, type),
            transform: serializeOptionalGroup(layer, "ADBE Transform Group", options, warnings),
            materialOptions: serializeOptionalGroup(layer, "ADBE Material Options Group", options, warnings),
            audio: serializeOptionalGroup(layer, "ADBE Audio Group", options, warnings),
            timeRemap: serializeOptionalProperty(layer, "ADBE Time Remapping", options, warnings),
            markers: serializeOptionalProperty(layer, "ADBE Marker", options, warnings),
            effects: [],
            masks: []
        };

        if (options.includeEffects !== false && OPLUS.effects &&
                typeof OPLUS.effects.serialize === "function") {
            item.effects = OPLUS.effects.serialize(layer, options, warnings);
        }
        if (options.includeMasks !== false && OPLUS.shapes &&
                typeof OPLUS.shapes.serializeMasks === "function") {
            item.masks = OPLUS.shapes.serializeMasks(layer, options, warnings);
        }
        if (type === "text" && OPLUS.text && typeof OPLUS.text.serialize === "function") {
            item.text = OPLUS.text.serialize(layer, options, warnings);
        }
        if (type === "shape" && OPLUS.shapes && typeof OPLUS.shapes.serialize === "function") {
            item.shape = OPLUS.shapes.serialize(layer, options, warnings);
        }
        if (type === "camera") {
            item.cameraOptions = serializeOptionalGroup(layer, "ADBE Camera Options Group", options, warnings);
        }
        if (type === "light") {
            item.lightOptions = serializeOptionalGroup(layer, "ADBE Light Options Group", options, warnings);
            item.lightType = {
                value: enumValue(read(layer, "lightType", null)),
                name: enumName(read(layer, "lightType", null))
            };
        }
        return item;
    }

    function activeComp() {
        var item;
        try { item = app.project.activeItem; } catch (ignore) { item = null; }
        try {
            if (item && item instanceof CompItem) {
                return item;
            }
        } catch (ignoreType) {}
        return null;
    }

    function normalizeOptions(options) {
        if (typeof options === "string") {
            try {
                if (OPLUS.util && typeof OPLUS.util.parseJson === "function") {
                    return OPLUS.util.parseJson(options) || {};
                }
                if (typeof JSON !== "undefined" && JSON.parse) {
                    return JSON.parse(options) || {};
                }
            } catch (ignore) {}
            return {};
        }
        return options || {};
    }

    function selectedRootCenter(layers, time) {
        var minX = null;
        var minY = null;
        var maxX = null;
        var maxY = null;
        var i;
        var layer;
        var parent;
        var transform;
        var position;
        var value;
        for (i = 0; i < layers.length; i += 1) {
            layer = layers[i];
            parent = read(layer, "parent", null);
            /* Child coordinates are local; selected children move with their selected root. */
            if (parent) { continue; }
            try {
                transform = layer.property("ADBE Transform Group");
                position = transform ? transform.property("ADBE Position") : null;
                if (!position) { continue; }
                value = typeof position.valueAtTime === "function" ? position.valueAtTime(time, false) : position.value;
                if (!(value instanceof Array) || value.length < 2) { continue; }
                minX = minX === null ? value[0] : Math.min(minX, value[0]);
                minY = minY === null ? value[1] : Math.min(minY, value[1]);
                maxX = maxX === null ? value[0] : Math.max(maxX, value[0]);
                maxY = maxY === null ? value[1] : Math.max(maxY, value[1]);
            } catch (ignorePosition) {}
        }
        return minX === null ? null : [(minX + maxX) / 2, (minY + maxY) / 2];
    }

    function serializeSelection(options) {
        var comp = activeComp();
        var selected;
        var layers = [];
        var idByIndex = {};
        var warnings = [];
        var selectionStart = null;
        var selectionEnd = null;
        var i;
        var layer;
        var result;
        options = normalizeOptions(options);
        if (!comp) {
            throw new Error("OPLUS_NO_ACTIVE_COMP: Open or select a composition first.");
        }
        selected = comp.selectedLayers;
        if (!selected || selected.length === 0) {
            throw new Error("OPLUS_NO_SELECTED_LAYERS: Select at least one supported layer.");
        }
        for (i = 0; i < selected.length; i += 1) {
            layers.push(selected[i]);
        }
        layers.sort(function (a, b) { return a.index - b.index; });
        for (i = 0; i < layers.length; i += 1) {
            idByIndex[layers[i].index] = "layer-" + (i + 1);
        }
        result = {
            schema: "oplus.asset-data",
            schemaVersion: 1,
            serializedAt: (OPLUS.util && typeof OPLUS.util.nowIso === "function") ?
                OPLUS.util.nowIso() : (new Date()).toUTCString(),
            afterEffectsVersion: String(call(function () { return app.version; }, "")),
            composition: {
                name: String(read(comp, "name", "")),
                width: finiteNumber(read(comp, "width", 1920), 1920),
                height: finiteNumber(read(comp, "height", 1080), 1080),
                pixelAspect: finiteNumber(read(comp, "pixelAspect", 1), 1),
                duration: finiteNumber(read(comp, "duration", 0), 0),
                frameRate: finiteNumber(read(comp, "frameRate", 0), 0),
                displayStartTime: finiteNumber(read(comp, "displayStartTime", 0), 0),
                workAreaStart: finiteNumber(read(comp, "workAreaStart", 0), 0),
                workAreaDuration: finiteNumber(read(comp, "workAreaDuration", 0), 0),
                time: finiteNumber(read(comp, "time", 0), 0)
            },
            layerCount: 0,
            selectionStart: 0,
            selectionEnd: 0,
            selectionCenter: selectedRootCenter(layers, finiteNumber(read(comp, "time", 0), 0)),
            layers: [],
            warnings: warnings
        };
        for (i = 0; i < layers.length; i += 1) {
            layer = layers[i];
            try {
                result.layers.push(serializeLayer(layer, idByIndex, options, warnings));
                if (selectionStart === null || layer.inPoint < selectionStart) {
                    selectionStart = layer.inPoint;
                }
                if (selectionEnd === null || layer.outPoint > selectionEnd) {
                    selectionEnd = layer.outPoint;
                }
            } catch (error) {
                warning(warnings, "LAYER_SERIALIZE_FAILED", error.toString(), {
                    layer: String(read(layer, "name", "")), index: read(layer, "index", 0)
                });
            }
        }
        if (result.layers.length === 0) {
            throw new Error("OPLUS_SERIALIZE_EMPTY: None of the selected layers could be serialized.");
        }
        result.layerCount = result.layers.length;
        result.selectionStart = selectionStart === null ? 0 : finiteNumber(selectionStart, 0);
        result.selectionEnd = selectionEnd === null ? result.selectionStart : finiteNumber(selectionEnd, result.selectionStart);
        log("serializer.selection.complete", {
            composition: result.composition.name,
            layerCount: result.layerCount,
            warningCount: warnings.length
        });
        return result;
    }

    function interpolationFromData(data) {
        var name = data && data.name ? String(data.name).toUpperCase() : "";
        try {
            if (name.indexOf("HOLD") >= 0) { return KeyframeInterpolationType.HOLD; }
            if (name.indexOf("BEZIER") >= 0) { return KeyframeInterpolationType.BEZIER; }
            if (name.indexOf("LINEAR") >= 0) { return KeyframeInterpolationType.LINEAR; }
        } catch (ignore) {}
        return data && data.value !== null && data.value !== undefined ? data.value : null;
    }

    function objectsToEases(items) {
        var result = [];
        var i;
        items = items || [];
        for (i = 0; i < items.length; i += 1) {
            try {
                result.push(new KeyframeEase(finiteNumber(items[i].speed, 0),
                    Math.max(0.1, Math.min(100, finiteNumber(items[i].influence, 33.333)))));
            } catch (ignore) {}
        }
        return result;
    }

    function removeAllKeys(property) {
        var i;
        try {
            for (i = property.numKeys; i >= 1; i -= 1) {
                property.removeKey(i);
            }
        } catch (ignore) {}
    }

    function setExpression(property, data, options, warnings) {
        if (data.expression === undefined || (options && options.preserveExpressions === false)) {
            return;
        }
        try {
            if (property.canSetExpression) {
                property.expression = String(data.expression || "");
                property.expressionEnabled = !!data.expressionEnabled && data.expression !== "";
            }
        } catch (error) {
            warning(warnings, "EXPRESSION_RESTORE_FAILED", error.toString(), {
                property: data.name || data.matchName
            });
        }
    }

    function applyKeyAttributes(property, keyIndex, key, warnings) {
        var inType = interpolationFromData(key.inInterpolation);
        var outType = interpolationFromData(key.outInterpolation);
        var inEase;
        var outEase;
        try {
            if (inType !== null && outType !== null) {
                property.setInterpolationTypeAtKey(keyIndex, inType, outType);
            }
        } catch (errorInterp) {
            warning(warnings, "KEY_INTERPOLATION_RESTORE_FAILED", errorInterp.toString(), {
                property: read(property, "name", ""), key: keyIndex
            });
        }
        try {
            inEase = objectsToEases(key.inTemporalEase);
            outEase = objectsToEases(key.outTemporalEase);
            if (inEase.length && outEase.length) {
                property.setTemporalEaseAtKey(keyIndex, inEase, outEase);
            }
        } catch (errorEase) {
            warning(warnings, "KEY_EASE_RESTORE_FAILED", errorEase.toString(), {
                property: read(property, "name", ""), key: keyIndex
            });
        }
        try { property.setTemporalContinuousAtKey(keyIndex, !!key.temporalContinuous); } catch (ignore1) {}
        try { property.setTemporalAutoBezierAtKey(keyIndex, !!key.temporalAutoBezier); } catch (ignore2) {}
        try {
            if (key.inSpatialTangent && key.outSpatialTangent) {
                property.setSpatialTangentsAtKey(keyIndex, key.inSpatialTangent, key.outSpatialTangent);
            }
        } catch (ignore3) {}
        try { property.setSpatialContinuousAtKey(keyIndex, !!key.spatialContinuous); } catch (ignore4) {}
        try { property.setSpatialAutoBezierAtKey(keyIndex, !!key.spatialAutoBezier); } catch (ignore5) {}
        try { property.setRovingAtKey(keyIndex, !!key.roving); } catch (ignore6) {}
        try { if (key.label) { property.setLabelAtKey(keyIndex, key.label); } } catch (ignore7) {}
    }

    function applyProperty(property, data, options, warnings) {
        var keys;
        var timeOffset;
        var i;
        var keyIndex;
        options = options || {};
        if (!property || !data) {
            return false;
        }
        try {
            if (data.dimensionsSeparated !== undefined && property.isSeparationLeader) {
                property.dimensionsSeparated = !!data.dimensionsSeparated;
            }
        } catch (ignoreSeparation) {}
        keys = data.keys || [];
        timeOffset = finiteNumber(options.timeOffset, 0);
        if (data.dimensionsSeparated && data.separationFollowers &&
                data.separationFollowers.length) {
            /* A separated leader is read-only. Its followers are restored below. */
        } else if (keys.length > 0) {
            removeAllKeys(property);
            for (i = 0; i < keys.length; i += 1) {
                if (keys[i].valueUnavailable) {
                    continue;
                }
                try {
                    property.setValueAtTime(finiteNumber(keys[i].time, 0) + timeOffset,
                        valueFromJson(keys[i].value, property));
                    keyIndex = property.nearestKeyIndex(finiteNumber(keys[i].time, 0) + timeOffset);
                    applyKeyAttributes(property, keyIndex, keys[i], warnings);
                } catch (errorKey) {
                    warning(warnings, "KEY_RESTORE_FAILED", errorKey.toString(), {
                        property: data.name || data.matchName, key: i + 1
                    });
                }
            }
        } else if (!data.valueUnavailable && data.value !== undefined) {
            try {
                property.setValue(valueFromJson(data.value, property));
            } catch (errorValue) {
                warning(warnings, "PROPERTY_RESTORE_FAILED", errorValue.toString(), {
                    property: data.name || data.matchName
                });
            }
        }
        if (data.separationFollowers && data.separationFollowers.length) {
            for (i = 0; i < data.separationFollowers.length; i += 1) {
                try {
                    applyProperty(property.getSeparationFollower(i),
                        data.separationFollowers[i], options, warnings);
                } catch (errorFollower) {
                    warning(warnings, "SEPARATED_DIMENSION_RESTORE_FAILED", errorFollower.toString(), {
                        property: data.name || data.matchName, dimension: i
                    });
                }
            }
        }
        setExpression(property, data, options, warnings);
        return true;
    }

    function isDynamicGroup(group) {
        var matchName = String(read(group, "matchName", ""));
        return matchName === "ADBE Root Vectors Group" || matchName === "ADBE Vectors Group" ||
            matchName === "ADBE Effect Parade" || matchName === "ADBE Mask Parade" ||
            matchName === "ADBE Text Animators" || matchName === "ADBE Text Animator Properties" ||
            matchName === "ADBE Text Selectors";
    }

    function findOrCreateChild(parent, childData, dynamic, warnings) {
        var child = null;
        var matchName = childData.matchName || "";
        if (dynamic && matchName) {
            try {
                if (parent.canAddProperty(matchName)) {
                    child = parent.addProperty(matchName);
                }
            } catch (errorAddDynamic) {
                warning(warnings, "PROPERTY_ADD_FAILED", errorAddDynamic.toString(), {
                    group: read(parent, "name", ""), property: childData.name || matchName
                });
            }
        }
        if (!child && matchName) {
            try { child = parent.property(matchName); } catch (ignoreMatch) {}
        }
        if (!child && childData.name) {
            try { child = parent.property(childData.name); } catch (ignoreName) {}
        }
        if (!child && childData.propertyIndex) {
            try { child = parent.property(childData.propertyIndex); } catch (ignoreIndex) {}
        }
        if (!child && matchName) {
            try {
                if (parent.canAddProperty(matchName)) {
                    child = parent.addProperty(matchName);
                }
            } catch (errorAdd) {
                warning(warnings, "PROPERTY_ADD_FAILED", errorAdd.toString(), {
                    group: read(parent, "name", ""), property: childData.name || matchName
                });
            }
        }
        return child;
    }

    function applyPropertyGroup(targetGroup, groupData, options, warnings) {
        var children;
        var dynamic;
        var i;
        var target;
        var childData;
        if (!targetGroup || !groupData) {
            return false;
        }
        children = groupData.children || [];
        dynamic = isDynamicGroup(targetGroup);
        for (i = 0; i < children.length; i += 1) {
            childData = children[i];
            target = findOrCreateChild(targetGroup, childData, dynamic, warnings);
            if (!target) {
                warning(warnings, "PROPERTY_NOT_FOUND", "The target property could not be found or created.", {
                    group: read(targetGroup, "name", ""), property: childData.name || childData.matchName
                });
                continue;
            }
            try {
                if (childData.name && target.name !== childData.name && target.canSetName !== false) {
                    target.name = childData.name;
                }
            } catch (ignoreRename) {}
            if (childData.nodeType === "property") {
                applyProperty(target, childData, options, warnings);
            } else {
                applyPropertyGroup(target, childData, options, warnings);
            }
        }
        return true;
    }

    serializer.jsonSafe = jsonSafe;
    serializer.valueToJson = valueToJson;
    serializer.valueFromJson = valueFromJson;
    serializer.serializeProperty = serializeProperty;
    serializer.serializePropertyGroup = serializePropertyGroup;
    serializer.applyProperty = applyProperty;
    serializer.applyPropertyGroup = applyPropertyGroup;
    serializer.serializeLayer = serializeLayer;
    serializer.serializeSelection = serializeSelection;
    serializer.getActiveComp = activeComp;
    serializer.layerType = layerType;
}(typeof $ !== "undefined" && $.global ? $.global : this));
