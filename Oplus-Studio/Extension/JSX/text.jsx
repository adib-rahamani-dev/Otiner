/* OPLUS Studio - text document and animator support (ExtendScript ES3). */
(function (global) {
    var OPLUS = global.OPLUS = global.OPLUS || {};
    var textApi = OPLUS.text = OPLUS.text || {};

    var scalarFields = [
        "font", "fontSize", "fauxBold", "fauxItalic", "allCaps", "smallCaps",
        "superscript", "subscript", "applyFill", "applyStroke", "strokeWidth",
        "strokeOverFill", "tracking", "leading", "autoLeading", "baselineShift",
        "tsume", "horizontalScale", "verticalScale", "firstLineIndent", "startIndent",
        "endIndent", "spaceBefore", "spaceAfter", "everyLineComposer", "ligature",
        "noBreak", "hangingRoman", "autoHyphenate", "kerning", "boxInsetSpacing",
        "boxFirstBaselineAlignmentMinimum"
    ];
    var colorFields = ["fillColor", "strokeColor"];
    var enumFields = [
        "justification", "digitSet", "baselineDirection", "direction", "lineJoinType",
        "autoKernType", "leadingType", "composerEngine", "fontBaselineOption", "fontCapsOption",
        "boxAutoFitPolicy", "boxVerticalAlignment",
        "boxFirstBaselineAlignment", "lineOrientation"
    ];
    var enumObjects = {
        justification: "ParagraphJustification",
        digitSet: "DigitSet",
        baselineDirection: "BaselineDirection",
        direction: "ParagraphDirection",
        lineJoinType: "LineJoinType",
        autoKernType: "AutoKernType",
        leadingType: "LeadingType",
        composerEngine: "ComposerEngine",
        fontBaselineOption: "FontBaselineOption",
        fontCapsOption: "FontCapsOption",
        boxAutoFitPolicy: "BoxAutoFitPolicy",
        boxVerticalAlignment: "BoxVerticalAlignment",
        boxFirstBaselineAlignment: "BoxFirstBaselineAlignment",
        lineOrientation: "LineOrientation"
    };
    var infoFields = [
        "fontFamily", "fontStyle", "fontLocation", "pointText", "boxText", "boxTextSize",
        "boxTextPos", "boxFirstBaselineAlignmentMinimum", "baselineLocs"
    ];

    function read(object, name, fallback) {
        try {
            if (object !== null && object !== undefined && object[name] !== undefined) {
                return object[name];
            }
        } catch (ignore) {}
        return fallback;
    }

    function safeJson(value) {
        if (OPLUS.serializer && typeof OPLUS.serializer.jsonSafe === "function") {
            return OPLUS.serializer.jsonSafe(value);
        }
        if (value instanceof Array) {
            var out = [];
            var i;
            for (i = 0; i < value.length; i += 1) { out.push(safeJson(value[i])); }
            return out;
        }
        if (typeof value === "number" || typeof value === "string" || typeof value === "boolean" || value === null) {
            return value;
        }
        return null;
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

    function log(operation, details) {
        try { if (typeof OPLUS.log === "function") { OPLUS.log(operation, details || {}); } } catch (ignore) {}
    }

    function warn(warnings, code, error, extra) {
        var item = { code: code, message: String(error || code) };
        var key;
        extra = extra || {};
        for (key in extra) { if (extra.hasOwnProperty(key)) { item[key] = extra[key]; } }
        if (warnings) { warnings.push(item); }
        log("text.warning", item);
    }

    function documentToObject(document) {
        var data = {
            __oplusType: "TextDocument",
            text: String(read(document, "text", ""))
        };
        var i;
        var value;
        for (i = 0; i < scalarFields.length; i += 1) {
            value = read(document, scalarFields[i], undefined);
            if (value !== undefined) { data[scalarFields[i]] = safeJson(value); }
        }
        for (i = 0; i < colorFields.length; i += 1) {
            value = read(document, colorFields[i], undefined);
            if (value !== undefined) { data[colorFields[i]] = safeJson(value); }
        }
        for (i = 0; i < enumFields.length; i += 1) {
            value = read(document, enumFields[i], undefined);
            if (value !== undefined) { data[enumFields[i]] = enumData(value); }
        }
        for (i = 0; i < infoFields.length; i += 1) {
            value = read(document, infoFields[i], undefined);
            if (value !== undefined) { data[infoFields[i]] = safeJson(value); }
        }
        return data;
    }

    function enumFromData(data, field) {
        var enumObject;
        var name;
        var token;
        if (data === null || data === undefined) { return data; }
        if (typeof data !== "object") { return data; }
        name = String(data.name || "");
        token = name.substring(name.lastIndexOf(".") + 1);
        try {
            enumObject = global[enumObjects[field]];
            if (enumObject && enumObject[token] !== undefined) { return enumObject[token]; }
        } catch (ignore) {}
        if (data.value !== null && data.value !== undefined) { return data.value; }
        return data.name;
    }

    function objectToDocument(data, sourceProperty, warnings) {
        var document;
        var i;
        var field;
        data = data || { text: "" };
        try {
            document = sourceProperty ? sourceProperty.value : null;
        } catch (ignoreExisting) { document = null; }
        try {
            if (!document) { document = new TextDocument(String(data.text || "")); }
            document.text = String(data.text || "");
        } catch (errorCreate) {
            warn(warnings, "TEXT_DOCUMENT_CREATE_FAILED", errorCreate.toString());
            return String(data.text || "");
        }
        for (i = 0; i < scalarFields.length; i += 1) {
            field = scalarFields[i];
            if (data[field] !== undefined) {
                try { document[field] = data[field]; } catch (errorScalar) {
                    if (field === "font") {
                        warn(warnings, "FONT_UNAVAILABLE", errorScalar.toString(), { font: data[field] });
                    }
                }
            }
        }
        for (i = 0; i < colorFields.length; i += 1) {
            field = colorFields[i];
            if (data[field] !== undefined) {
                try { document[field] = data[field]; } catch (ignoreColor) {}
            }
        }
        for (i = 0; i < enumFields.length; i += 1) {
            field = enumFields[i];
            if (data[field] !== undefined) {
                try { document[field] = enumFromData(data[field], field); } catch (ignoreEnum) {}
            }
        }
        try { if (data.boxTextSize instanceof Array) { document.boxTextSize = data.boxTextSize; } } catch (ignoreBoxSize) {}
        try { if (data.boxTextPos instanceof Array) { document.boxTextPos = data.boxTextPos; } } catch (ignoreBoxPos) {}
        return document;
    }

    function property(layer, matchName) {
        try { return layer.property(matchName); } catch (ignore) {}
        return null;
    }

    function currentDocument(source) {
        try { return source.value; } catch (ignore) {}
        return null;
    }

    function serialize(layer, options, warnings) {
        var textGroup = property(layer, "ADBE Text Properties");
        var source = property(layer, "ADBE Text Document");
        var animators = property(layer, "ADBE Text Animators");
        var pathOptions = property(layer, "ADBE Text Path Options");
        var moreOptions = property(layer, "ADBE Text More Options");
        var document = source ? currentDocument(source) : null;
        var data = {
            document: document ? documentToObject(document) : { __oplusType: "TextDocument", text: "" },
            source: null,
            animators: null,
            pathOptions: null,
            moreOptions: null
        };
        if (!OPLUS.serializer) { return data; }
        try {
            if (source) { data.source = OPLUS.serializer.serializeProperty(source, options || {}, warnings); }
            if (animators) { data.animators = OPLUS.serializer.serializePropertyGroup(animators, options || {}, warnings); }
            if (pathOptions) { data.pathOptions = OPLUS.serializer.serializePropertyGroup(pathOptions, options || {}, warnings); }
            if (moreOptions) { data.moreOptions = OPLUS.serializer.serializePropertyGroup(moreOptions, options || {}, warnings); }
            if (textGroup) { data.groupName = String(read(textGroup, "name", "Text")); }
        } catch (error) {
            warn(warnings, "TEXT_SERIALIZE_FAILED", error.toString(), { layer: read(layer, "name", "") });
        }
        return data;
    }

    function apply(layer, data, options, warnings) {
        var source;
        var animators;
        var pathOptions;
        var moreOptions;
        data = data || {};
        options = options || {};
        source = property(layer, "ADBE Text Document");
        if (source) {
            try {
                if (data.source && OPLUS.serializer && typeof OPLUS.serializer.applyProperty === "function") {
                    OPLUS.serializer.applyProperty(source, data.source, options, warnings);
                } else if (data.document) {
                    source.setValue(objectToDocument(data.document, source, warnings));
                }
            } catch (errorSource) {
                warn(warnings, "TEXT_SOURCE_RESTORE_FAILED", errorSource.toString(), { layer: read(layer, "name", "") });
            }
        }
        if (OPLUS.serializer && typeof OPLUS.serializer.applyPropertyGroup === "function") {
            animators = property(layer, "ADBE Text Animators");
            pathOptions = property(layer, "ADBE Text Path Options");
            moreOptions = property(layer, "ADBE Text More Options");
            try { if (animators && data.animators) { OPLUS.serializer.applyPropertyGroup(animators, data.animators, options, warnings); } } catch (errorAnimators) {
                warn(warnings, "TEXT_ANIMATOR_RESTORE_FAILED", errorAnimators.toString(), { layer: read(layer, "name", "") });
            }
            try { if (pathOptions && data.pathOptions) { OPLUS.serializer.applyPropertyGroup(pathOptions, data.pathOptions, options, warnings); } } catch (errorPath) {
                warn(warnings, "TEXT_PATH_OPTIONS_RESTORE_FAILED", errorPath.toString(), { layer: read(layer, "name", "") });
            }
            try { if (moreOptions && data.moreOptions) { OPLUS.serializer.applyPropertyGroup(moreOptions, data.moreOptions, options, warnings); } } catch (errorMore) {
                warn(warnings, "TEXT_MORE_OPTIONS_RESTORE_FAILED", errorMore.toString(), { layer: read(layer, "name", "") });
            }
        }
        return true;
    }

    function creationInfo(data) {
        var document = data && data.document ? data.document : {};
        var orientation = document.lineOrientation && document.lineOrientation.name ?
            String(document.lineOrientation.name).toUpperCase() : "";
        return {
            text: String(document.text || ""),
            boxText: !!document.boxText,
            boxTextSize: document.boxTextSize instanceof Array ? document.boxTextSize : [500, 250],
            vertical: orientation.indexOf("VERTICAL") >= 0
        };
    }

    textApi.documentToObject = documentToObject;
    textApi.objectToDocument = objectToDocument;
    textApi.serialize = serialize;
    textApi.apply = apply;
    textApi.creationInfo = creationInfo;
}(typeof $ !== "undefined" && $.global ? $.global : this));
