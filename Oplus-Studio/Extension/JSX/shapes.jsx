/* OPLUS Studio - shape contents, vector paths, and masks (ExtendScript ES3). */
(function (global) {
    var OPLUS = global.OPLUS = global.OPLUS || {};
    var shapes = OPLUS.shapes = OPLUS.shapes || {};

    function read(object, name, fallback) {
        try {
            if (object !== null && object !== undefined && object[name] !== undefined) {
                return object[name];
            }
        } catch (ignore) {}
        return fallback;
    }

    function safe(value) {
        if (OPLUS.serializer && typeof OPLUS.serializer.jsonSafe === "function") {
            return OPLUS.serializer.jsonSafe(value);
        }
        if (value instanceof Array) {
            var result = [];
            var i;
            for (i = 0; i < value.length; i += 1) { result.push(safe(value[i])); }
            return result;
        }
        return value;
    }

    function log(operation, details) {
        try { if (typeof OPLUS.log === "function") { OPLUS.log(operation, details || {}); } } catch (ignore) {}
    }

    function warn(warnings, code, error, extra) {
        var item = { code: code, message: String(error || code) };
        var key;
        extra = extra || {};
        for (key in extra) { if (extra.hasOwnProperty(key)) { item[key] = extra[key]; } }
        if (warnings) { warnings.push(item); }
        log("shapes.warning", item);
    }

    function enumData(value) {
        var number = null;
        var name = null;
        try {
            number = Number(value);
            if (isNaN(number) || !isFinite(number)) { number = null; }
        } catch (ignore1) {}
        try { name = value.toString(); } catch (ignore2) {}
        return { value: number, name: name };
    }

    function shapeToObject(shape) {
        return {
            __oplusType: "Shape",
            closed: !!read(shape, "closed", false),
            vertices: safe(read(shape, "vertices", [])),
            inTangents: safe(read(shape, "inTangents", [])),
            outTangents: safe(read(shape, "outTangents", [])),
            featherSegLocs: safe(read(shape, "featherSegLocs", [])),
            featherRelSegLocs: safe(read(shape, "featherRelSegLocs", [])),
            featherRadii: safe(read(shape, "featherRadii", [])),
            featherInterps: safe(read(shape, "featherInterps", [])),
            featherTensions: safe(read(shape, "featherTensions", [])),
            featherTypes: safe(read(shape, "featherTypes", [])),
            featherRelCornerAngles: safe(read(shape, "featherRelCornerAngles", []))
        };
    }

    function objectToShape(data) {
        var shape;
        try {
            shape = new Shape();
            shape.closed = !!data.closed;
            shape.vertices = data.vertices || [];
            shape.inTangents = data.inTangents || [];
            shape.outTangents = data.outTangents || [];
            try { if (data.featherSegLocs) { shape.featherSegLocs = data.featherSegLocs; } } catch (ignore1) {}
            try { if (data.featherRelSegLocs) { shape.featherRelSegLocs = data.featherRelSegLocs; } } catch (ignore2) {}
            try { if (data.featherRadii) { shape.featherRadii = data.featherRadii; } } catch (ignore3) {}
            try { if (data.featherInterps) { shape.featherInterps = data.featherInterps; } } catch (ignore4) {}
            try { if (data.featherTensions) { shape.featherTensions = data.featherTensions; } } catch (ignore5) {}
            try { if (data.featherTypes) { shape.featherTypes = data.featherTypes; } } catch (ignore6) {}
            try { if (data.featherRelCornerAngles) { shape.featherRelCornerAngles = data.featherRelCornerAngles; } } catch (ignore7) {}
            return shape;
        } catch (ignore) {}
        return data;
    }

    function group(layer, matchName) {
        try { return layer.property(matchName); } catch (ignore) {}
        return null;
    }

    function serialize(layer, options, warnings) {
        var contents = group(layer, "ADBE Root Vectors Group");
        var result = { contents: null };
        if (!contents) { return result; }
        if (!OPLUS.serializer || typeof OPLUS.serializer.serializePropertyGroup !== "function") {
            warn(warnings, "SERIALIZER_UNAVAILABLE", "Shape serialization support was not loaded.", {
                layer: read(layer, "name", "")
            });
            return result;
        }
        try {
            result.contents = OPLUS.serializer.serializePropertyGroup(contents, options || {}, warnings);
        } catch (error) {
            warn(warnings, "SHAPE_CONTENTS_SERIALIZE_FAILED", error.toString(), {
                layer: read(layer, "name", "")
            });
        }
        return result;
    }

    function apply(layer, data, options, warnings) {
        var contents = group(layer, "ADBE Root Vectors Group");
        data = data || {};
        if (!contents || !data.contents) { return false; }
        if (!OPLUS.serializer || typeof OPLUS.serializer.applyPropertyGroup !== "function") {
            return false;
        }
        try {
            OPLUS.serializer.applyPropertyGroup(contents, data.contents, options || {}, warnings);
            return true;
        } catch (error) {
            warn(warnings, "SHAPE_CONTENTS_RESTORE_FAILED", error.toString(), {
                layer: read(layer, "name", "")
            });
        }
        return false;
    }

    function serializeMasks(layer, options, warnings) {
        var parade = group(layer, "ADBE Mask Parade");
        var result = [];
        var i;
        var mask;
        if (!parade || !OPLUS.serializer) { return result; }
        for (i = 1; i <= parade.numProperties; i += 1) {
            try {
                mask = parade.property(i);
                result.push({
                    name: String(read(mask, "name", "Mask " + i)),
                    matchName: String(read(mask, "matchName", "ADBE Mask Atom")),
                    propertyIndex: Number(read(mask, "propertyIndex", i)),
                    maskMode: enumData(read(mask, "maskMode", null)),
                    inverted: !!read(mask, "inverted", false),
                    locked: !!read(mask, "locked", false),
                    rotoBezier: !!read(mask, "rotoBezier", false),
                    color: safe(read(mask, "color", [1, 1, 1])),
                    maskMotionBlur: enumData(read(mask, "maskMotionBlur", null)),
                    maskFeatherFalloff: enumData(read(mask, "maskFeatherFalloff", null)),
                    properties: OPLUS.serializer.serializePropertyGroup(mask, options || {}, warnings)
                });
            } catch (error) {
                warn(warnings, "MASK_SERIALIZE_FAILED", error.toString(), {
                    layer: read(layer, "name", ""), maskIndex: i
                });
            }
        }
        return result;
    }

    function modeFromName(data, enumObject) {
        var name;
        var token;
        if (!data) { return null; }
        name = String(data.name || "");
        token = name.substring(name.lastIndexOf(".") + 1);
        try { if (enumObject && enumObject[token] !== undefined) { return enumObject[token]; } } catch (ignore) {}
        return data.value !== null && data.value !== undefined ? data.value : null;
    }

    function applyMasks(layer, list, options, warnings) {
        var parade = group(layer, "ADBE Mask Parade");
        var created = 0;
        var i;
        var mask;
        var data;
        var value;
        list = list || [];
        options = options || {};
        if (!list.length) { return created; }
        if (!parade) {
            warn(warnings, "MASK_PARADE_UNAVAILABLE", "This layer cannot contain masks.", {
                layer: read(layer, "name", "")
            });
            return created;
        }
        for (i = 0; i < list.length; i += 1) {
            data = list[i];
            try {
                mask = parade.addProperty(data.matchName || "ADBE Mask Atom");
                try { mask.name = data.name || ("Mask " + (i + 1)); } catch (ignoreName) {}
                try { mask.rotoBezier = !!data.rotoBezier; } catch (ignoreRoto) {}
                if (data.properties && OPLUS.serializer &&
                        typeof OPLUS.serializer.applyPropertyGroup === "function") {
                    OPLUS.serializer.applyPropertyGroup(mask, data.properties, options, warnings);
                }
                try {
                    value = modeFromName(data.maskMode, typeof MaskMode !== "undefined" ? MaskMode : null);
                    if (value !== null) { mask.maskMode = value; }
                } catch (ignoreMode) {}
                try { mask.inverted = !!data.inverted; } catch (ignoreInverted) {}
                try { mask.color = data.color || [1, 1, 1]; } catch (ignoreColor) {}
                try {
                    value = modeFromName(data.maskMotionBlur,
                        typeof MaskMotionBlur !== "undefined" ? MaskMotionBlur : null);
                    if (value !== null) { mask.maskMotionBlur = value; }
                } catch (ignoreMotionBlur) {}
                try {
                    value = modeFromName(data.maskFeatherFalloff,
                        typeof MaskFeatherFalloff !== "undefined" ? MaskFeatherFalloff : null);
                    if (value !== null) { mask.maskFeatherFalloff = value; }
                } catch (ignoreFalloff) {}
                try { mask.locked = !!data.locked; } catch (ignoreLocked) {}
                created += 1;
            } catch (error) {
                warn(warnings, "MASK_RESTORE_FAILED", error.toString(), {
                    layer: read(layer, "name", ""), mask: data.name || (i + 1)
                });
            }
        }
        return created;
    }

    shapes.shapeToObject = shapeToObject;
    shapes.objectToShape = objectToShape;
    shapes.serialize = serialize;
    shapes.apply = apply;
    shapes.serializeMasks = serializeMasks;
    shapes.applyMasks = applyMasks;
}(typeof $ !== "undefined" && $.global ? $.global : this));
