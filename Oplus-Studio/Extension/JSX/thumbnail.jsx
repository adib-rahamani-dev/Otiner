/* OPLUS Studio - preview provider architecture and PNG frame capture (ES3). */
(function (global) {
    var OPLUS = global.OPLUS = global.OPLUS || {};
    var thumbnail = OPLUS.thumbnail = OPLUS.thumbnail || {};
    var providers = thumbnail.providers = thumbnail.providers || {};

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

    function activeComp() {
        if (OPLUS.serializer && typeof OPLUS.serializer.getActiveComp === "function") {
            return OPLUS.serializer.getActiveComp();
        }
        try { if (app.project.activeItem instanceof CompItem) { return app.project.activeItem; } } catch (ignore) {}
        return null;
    }

    function ensureFolder(folder) {
        var parents = [];
        var current = folder;
        var i;
        if (!folder) { return false; }
        if (folder.exists) { return true; }
        try {
            if (OPLUS.util && typeof OPLUS.util.ensureFolder === "function") {
                OPLUS.util.ensureFolder(folder.fsName);
                if (folder.exists) { return true; }
            }
        } catch (ignoreUtil) {}
        while (current && !current.exists) {
            parents.push(current);
            try {
                if (!current.parent || current.parent.fsName === current.fsName) { break; }
                current = current.parent;
            } catch (ignoreParent) { break; }
        }
        for (i = parents.length - 1; i >= 0; i -= 1) {
            try { if (!parents[i].exists) { parents[i].create(); } } catch (ignoreCreate) {}
        }
        return folder.exists;
    }

    function captureSoloState(comp, isolateSelection) {
        var state = [];
        var selected = {};
        var selectedLayers;
        var i;
        var layer;
        if (!isolateSelection) { return state; }
        selectedLayers = comp.selectedLayers || [];
        if (!selectedLayers.length) { return state; }
        for (i = 0; i < selectedLayers.length; i += 1) {
            selected[selectedLayers[i].index] = true;
        }
        for (i = 1; i <= comp.numLayers; i += 1) {
            layer = comp.layer(i);
            state.push({ layer: layer, solo: !!read(layer, "solo", false) });
            try { layer.solo = !!selected[layer.index]; } catch (ignoreSolo) {}
        }
        return state;
    }

    function restoreSoloState(state) {
        var i;
        for (i = 0; i < state.length; i += 1) {
            try { state[i].layer.solo = state[i].solo; } catch (ignore) {}
        }
    }

    function representativeTime(comp, options) {
        var duration = Math.max(0, number(read(comp, "duration", 0), 0));
        var lastFrame = Math.max(0, duration - Math.max(0.000001, number(read(comp, "frameDuration", 1 / 30), 1 / 30)));
        var time;
        if (options.time !== undefined && options.time !== null) {
            time = number(options.time, 0);
        } else if (options.representativeTime === "middle") {
            time = duration / 2;
        } else if (options.representativeTime === "workAreaMiddle") {
            time = number(read(comp, "workAreaStart", 0), 0) +
                number(read(comp, "workAreaDuration", duration), duration) / 2;
        } else {
            time = number(read(comp, "time", 0), 0);
        }
        return Math.max(0, Math.min(lastFrame, time));
    }

    function pngProvider(comp, outputPath, options) {
        var file = new File(outputPath);
        var time = representativeTime(comp, options);
        var soloState = [];
        if (typeof comp.saveFrameToPng !== "function") {
            throw new Error("OPLUS_PNG_CAPTURE_UNAVAILABLE: This After Effects version does not expose saveFrameToPng().");
        }
        if (!ensureFolder(file.parent)) {
            throw new Error("OPLUS_PREVIEW_FOLDER_FAILED: Could not create " + file.parent.fsName);
        }
        try {
            soloState = captureSoloState(comp, options.isolateSelectedLayers !== false);
            comp.saveFrameToPng(time, file);
        } finally {
            restoreSoloState(soloState);
        }
        return {
            path: file.fsName,
            type: "png",
            time: time,
            pending: true,
            isolatedSelection: soloState.length > 0,
            width: number(read(comp, "width", 0), 0),
            height: number(read(comp, "height", 0), 0)
        };
    }

    function registerProvider(type, provider) {
        type = String(type || "").toLowerCase();
        if (!type || typeof provider !== "function") {
            throw new Error("OPLUS_INVALID_PREVIEW_PROVIDER: A type and function are required.");
        }
        providers[type] = provider;
        return true;
    }

    function typeForPath(outputPath, options) {
        var type = String(options.type || options.format || "").toLowerCase();
        var name;
        var dot;
        if (type) { return type === "jpeg" ? "jpg" : type; }
        name = String(outputPath || "").toLowerCase();
        dot = name.lastIndexOf(".");
        type = dot >= 0 ? name.substring(dot + 1) : "png";
        return type || "png";
    }

    function generate(comp, outputPath, options) {
        var type;
        var provider;
        var result;
        if (typeof comp === "string" || comp instanceof File) {
            options = outputPath || {};
            outputPath = comp instanceof File ? comp.fsName : comp;
            comp = activeComp();
        }
        options = options || {};
        comp = comp || activeComp();
        if (!comp) {
            throw new Error("OPLUS_NO_ACTIVE_COMP: Open or select a composition before generating a preview.");
        }
        if (!outputPath) {
            throw new Error("OPLUS_PREVIEW_PATH_REQUIRED: An output path is required.");
        }
        type = typeForPath(outputPath, options);
        provider = providers[type];
        if (typeof provider !== "function") {
            throw new Error("OPLUS_PREVIEW_FORMAT_UNAVAILABLE: No provider is registered for " + type + ".");
        }
        result = provider(comp, String(outputPath), options);
        log("thumbnail.generate", {
            path: result.path, type: type, time: result.time, pending: !!result.pending
        });
        return result;
    }

    function status(path) {
        var file = new File(path);
        return {
            path: file.fsName,
            exists: !!file.exists,
            size: file.exists ? number(read(file, "length", 0), 0) : 0,
            modified: file.exists ? String(read(file, "modified", "")) : null
        };
    }

    registerProvider("png", pngProvider);
    thumbnail.registerProvider = registerProvider;
    thumbnail.generate = generate;
    thumbnail.status = status;
    thumbnail.representativeTime = representativeTime;
}(typeof $ !== "undefined" && $.global ? $.global : this));
