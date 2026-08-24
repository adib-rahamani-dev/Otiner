/* OPLUS Studio - effect stack serializer/restorer (ExtendScript ES3). */
(function (global) {
    var OPLUS = global.OPLUS = global.OPLUS || {};
    var effects = OPLUS.effects = OPLUS.effects || {};

    function read(object, name, fallback) {
        try {
            if (object !== null && object !== undefined && object[name] !== undefined) {
                return object[name];
            }
        } catch (ignore) {}
        return fallback;
    }

    function log(operation, details) {
        try { if (typeof OPLUS.log === "function") { OPLUS.log(operation, details || {}); } } catch (ignore) {}
    }

    function warn(warnings, code, error, extra) {
        var item = { code: code, message: String(error || code) };
        var key;
        extra = extra || {};
        for (key in extra) {
            if (extra.hasOwnProperty(key)) { item[key] = extra[key]; }
        }
        if (warnings) { warnings.push(item); }
        log("effects.warning", item);
    }

    function paradeForLayer(layer) {
        try { return layer.property("ADBE Effect Parade"); } catch (ignore) {}
        return null;
    }

    function serialize(layer, options, warnings) {
        var parade = paradeForLayer(layer);
        var result = [];
        var i;
        var effect;
        var item;
        if (!parade) { return result; }
        if (!OPLUS.serializer || typeof OPLUS.serializer.serializePropertyGroup !== "function") {
            warn(warnings, "SERIALIZER_UNAVAILABLE", "Effect serialization support was not loaded.", {
                layer: read(layer, "name", "")
            });
            return result;
        }
        for (i = 1; i <= parade.numProperties; i += 1) {
            try {
                effect = parade.property(i);
                item = {
                    name: String(read(effect, "name", "Effect")),
                    matchName: String(read(effect, "matchName", "")),
                    propertyIndex: Number(read(effect, "propertyIndex", i)),
                    enabled: !!read(effect, "enabled", true),
                    active: !!read(effect, "active", true),
                    properties: OPLUS.serializer.serializePropertyGroup(effect, options || {}, warnings)
                };
                result.push(item);
            } catch (error) {
                warn(warnings, "EFFECT_SERIALIZE_FAILED", error.toString(), {
                    layer: read(layer, "name", ""), effectIndex: i
                });
            }
        }
        return result;
    }

    function addEffect(parade, data) {
        var effect = null;
        try {
            if (data.matchName && parade.canAddProperty(data.matchName)) {
                effect = parade.addProperty(data.matchName);
            }
        } catch (ignoreMatch) {}
        if (!effect) {
            try {
                if (data.name && parade.canAddProperty(data.name)) {
                    effect = parade.addProperty(data.name);
                }
            } catch (ignoreName) {}
        }
        return effect;
    }

    function apply(layer, list, options, warnings) {
        var parade = paradeForLayer(layer);
        var created = 0;
        var i;
        var effect;
        var data;
        list = list || [];
        options = options || {};
        if (!list.length) { return created; }
        if (!parade) {
            warn(warnings, "EFFECT_PARADE_UNAVAILABLE", "This layer cannot contain effects.", {
                layer: read(layer, "name", "")
            });
            return created;
        }
        for (i = 0; i < list.length; i += 1) {
            data = list[i];
            try {
                effect = addEffect(parade, data);
                if (!effect) {
                    warn(warnings, "EFFECT_NOT_INSTALLED",
                        "The effect is unavailable in this After Effects installation.", {
                            layer: read(layer, "name", ""),
                            effect: data.name || data.matchName,
                            matchName: data.matchName || ""
                        });
                    continue;
                }
                try { if (data.name) { effect.name = data.name; } } catch (ignoreRename) {}
                if (data.properties && OPLUS.serializer &&
                        typeof OPLUS.serializer.applyPropertyGroup === "function") {
                    OPLUS.serializer.applyPropertyGroup(effect, data.properties, options, warnings);
                }
                try { if (data.enabled !== undefined) { effect.enabled = !!data.enabled; } } catch (ignoreEnabled) {}
                created += 1;
            } catch (error) {
                warn(warnings, "EFFECT_RESTORE_FAILED", error.toString(), {
                    layer: read(layer, "name", ""), effect: data.name || data.matchName
                });
            }
        }
        log("effects.restore.complete", {
            layer: read(layer, "name", ""), requested: list.length, created: created
        });
        return created;
    }

    effects.serialize = serialize;
    effects.apply = apply;
    effects.getParade = paradeForLayer;
}(typeof $ !== "undefined" && $.global ? $.global : this));
