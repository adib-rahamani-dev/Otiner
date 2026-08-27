#target aftereffects

/* Disposable AE 2025 native-fidelity acceptance test. */
(function (global) {
    var testFile = new File($.fileName);
    var testsDir = testFile.parent;
    var root = testsDir.parent;
    var reportFile = new File(testsDir.fsName + "/native-host-smoke-report.json");
    var bootstrap = new File(root.fsName + "/Extension/JSX/bootstrap.jsx");
    var runId = String((new Date()).getTime());
    var tempRoot = new Folder(Folder.temp.fsName + "/OtinerNativeSmoke-" + runId);

    function writeRaw(value) {
        try {
            reportFile.encoding = "UTF-8";
            if (reportFile.open("w")) {
                reportFile.write(global.OPLUS && OPLUS.util ? OPLUS.util.stringify(value) : String(value));
                reportFile.close();
            }
        } catch (ignore) {}
    }

    function finish(report) {
        report.completed = (new Date()).toUTCString();
        report.passed = !report.error;
        writeRaw(report);
        if (global.OPLUS_NATIVE_SMOKE_OWNS_INSTANCE === true) {
            try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (ignoreClose) {}
            try { app.quit(); } catch (ignoreQuit) {}
        }
    }

    function installedDeepGlow() {
        var effects;
        var i;
        try { effects = app.effects; } catch (ignore) { effects = null; }
        if (!effects) { return null; }
        for (i = 0; i < effects.length; i += 1) {
            try {
                if (String(effects[i].displayName || "").toLowerCase().indexOf("deep glow") >= 0 ||
                        String(effects[i].matchName || "").toLowerCase().indexOf("deep glow") >= 0) {
                    return effects[i];
                }
            } catch (ignoreEffect) {}
        }
        return null;
    }

    function findComp(name) {
        var i;
        var item;
        for (i = 1; i <= app.project.numItems; i += 1) {
            item = app.project.item(i);
            try { if (item instanceof CompItem && item.name === name) { return item; } } catch (ignore) {}
        }
        return null;
    }

    global.OPLUS_NATIVE_SMOKE_CONTINUE = function () {
        var context = global.OPLUS_NATIVE_SMOKE_CONTEXT;
        var report = context.report;
        var comp;
        var result;
        var cachedResult;
        var byName = {};
        var i;
        var effect;
        try {
            comp = findComp(context.compName);
            if (!comp) { throw new Error("Original composition was not restored."); }
            comp.openInViewer();
            result = OPLUS.nativeCopy.importSelection(context.assetDir, context.snapshotCompName, { structure: "layers" });
            for (i = 0; i < result.layers.length; i += 1) {
                byName[result.layers[i].name] = comp.layer(result.layers[i].index);
            }
            var shape = byName["Native Stroke Shape"];
            var text = byName["Native Effect Text"];
            if (!shape || !text) { throw new Error("Native layers were not copied back."); }
            var stroke = shape.property("ADBE Root Vectors Group").property(1)
                .property("ADBE Vectors Group").property("ADBE Vector Graphic - Stroke");
            if (!stroke || Math.abs(stroke.property("ADBE Vector Stroke Width").value - 17) > 0.001) {
                throw new Error("Native shape stroke width was not preserved.");
            }
            var parade = text.property("ADBE Effect Parade");
            var sliderFound = false;
            var deepGlowFound = !context.deepGlowMatch;
            for (i = 1; i <= parade.numProperties; i += 1) {
                effect = parade.property(i);
                if (effect.matchName === "ADBE Slider Control" && Math.abs(effect.property(1).value - 42) < 0.001) {
                    sliderFound = true;
                }
                if (context.deepGlowMatch && effect.matchName === context.deepGlowMatch) { deepGlowFound = true; }
            }
            if (!sliderFound) { throw new Error("Native effect parameter was not preserved."); }
            if (!deepGlowFound) { throw new Error("Installed Deep Glow was not preserved."); }
            cachedResult = OPLUS.nativeCopy.importSelection(context.assetDir, context.snapshotCompName, { structure: "composition" });
            if (!cachedResult.cacheHit || cachedResult.structure !== "composition") {
                throw new Error("Second native import did not use the validated Safe Composition cache.");
            }
            report.layerCount = result.layerCount;
            report.warningCount = result.warnings.length;
            report.saveStrategy = context.saveStrategy;
            report.secondImportCacheHit = cachedResult.cacheHit;
            report.deepGlowInstalled = !!context.deepGlowMatch;
            report.checks = ["native.aep", "isolated save or exact fallback", "second-load cache", "shape stroke 17", "effect slider 42",
                context.deepGlowMatch ? "Deep Glow preserved" : "Deep Glow not installed; skipped"];
        } catch (error) {
            report.error = { message: String(error.message || error), line: error.line || null };
        }
        finish(report);
    };

    var report = {
        runId: runId,
        started: (new Date()).toUTCString(),
        afterEffectsVersion: String(app.version),
        passed: false,
        error: null,
        checks: []
    };
    try {
        if (!app.project || app.project.file || app.project.numItems !== 0) {
            report.error = { message: "A blank disposable After Effects instance is required." };
            report.completed = (new Date()).toUTCString();
            writeRaw(report);
            return;
        }
        global.OPLUS_NATIVE_SMOKE_OWNS_INSTANCE = true;
        tempRoot.create();
        var assetFolder = new Folder(tempRoot.fsName + "/Asset");
        assetFolder.create();
        $.evalFile(bootstrap);
        if (!OPLUS.nativeCopy || OPLUS.moduleErrors.length) {
            throw new Error("Otiner native module failed to load: " + OPLUS.util.stringify(OPLUS.moduleErrors));
        }
        var comp = app.project.items.addComp("Native Fidelity Smoke", 960, 540, 1, 4, 30);
        comp.openInViewer();
        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = "Native Stroke Shape";
        var rootGroup = shapeLayer.property("ADBE Root Vectors Group");
        var vectorGroup = rootGroup.addProperty("ADBE Vector Group");
        var vectors = vectorGroup.property("ADBE Vectors Group");
        vectors.addProperty("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size").setValue([240, 140]);
        var stroke = vectors.addProperty("ADBE Vector Graphic - Stroke");
        stroke.property("ADBE Vector Stroke Width").setValue(17);
        stroke.property("ADBE Vector Stroke Color").setValue([0.9, 0.3, 0.1, 1]);
        var textLayer = comp.layers.addText("Deep Glow Fidelity");
        textLayer.name = "Native Effect Text";
        var slider = textLayer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        slider.name = "Native Slider";
        slider.property(1).setValue(42);
        var deepGlow = installedDeepGlow();
        if (deepGlow && textLayer.property("ADBE Effect Parade").canAddProperty(deepGlow.matchName)) {
            textLayer.property("ADBE Effect Parade").addProperty(deepGlow.matchName);
        }
        shapeLayer.selected = true;
        textLayer.selected = true;
        app.project.save(new File(tempRoot.fsName + "/Source.aep"));
        var nativeResult = OPLUS.nativeCopy.saveSelection(assetFolder.fsName, "native-smoke", []);
        global.OPLUS_NATIVE_SMOKE_CONTEXT = {
            report: report,
            assetDir: assetFolder.fsName,
            compName: "Native Fidelity Smoke",
            snapshotCompName: nativeResult.compName,
            saveStrategy: nativeResult.strategy,
            deepGlowMatch: deepGlow ? String(deepGlow.matchName) : ""
        };
        app.scheduleTask("OPLUS_NATIVE_SMOKE_CONTINUE()", 4000, false);
    } catch (error) {
        report.error = { message: String(error.message || error), line: error.line || null };
        finish(report);
    }
}(typeof $ !== "undefined" && $.global ? $.global : this));
