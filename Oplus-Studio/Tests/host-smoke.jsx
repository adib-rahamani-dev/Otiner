#target aftereffects

/*
 * Live After Effects acceptance smoke test.
 *
 * Run only in a disposable, blank AE session:
 *   AfterFX.com -r "<absolute path>/Tests/host-smoke.jsx"
 *
 * The script refuses to modify a saved or non-empty project. It creates a
 * temporary library, round-trips three representative layers, verifies Undo,
 * waits for the asynchronous PNG capture, writes host-smoke-report.json beside
 * this file, closes the disposable project without saving, and quits AE.
 */
(function (global) {
    var testFile = new File($.fileName);
    var testsDirectory = testFile.parent;
    var projectRoot = testsDirectory.parent;
    var bootstrap = new File(projectRoot.fsName + "/Extension/JSX/bootstrap.jsx");
    var reportFile = new File(testsDirectory.fsName + "/host-smoke-report.json");
    var runId = String(new Date().getTime());
    var tempRoot = new Folder(Folder.temp.fsName + "/OplusStudioHostSmoke-" + runId);

    function escapeJson(value) {
        return "\"" + String(value)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, "\\\"")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n") + "\"";
    }

    function emergencyJson(value) {
        var key;
        var parts = [];
        if (value === null || typeof value === "undefined") { return "null"; }
        if (typeof value === "string") { return escapeJson(value); }
        if (typeof value === "number") { return isFinite(value) ? String(value) : "null"; }
        if (typeof value === "boolean") { return value ? "true" : "false"; }
        if (value instanceof Array) {
            for (key = 0; key < value.length; key += 1) { parts.push(emergencyJson(value[key])); }
            return "[" + parts.join(",") + "]";
        }
        for (key in value) {
            if (!value.hasOwnProperty || value.hasOwnProperty(key)) {
                parts.push(escapeJson(key) + ":" + emergencyJson(value[key]));
            }
        }
        return "{" + parts.join(",") + "}";
    }

    function stringify(value) {
        try {
            if (global.OPLUS && OPLUS.util && OPLUS.util.stringify) {
                return OPLUS.util.stringify(value);
            }
        } catch (ignoreOplusJson) {}
        try {
            if (typeof JSON !== "undefined" && JSON.stringify) { return JSON.stringify(value); }
        } catch (ignoreNativeJson) {}
        return emergencyJson(value);
    }

    function writeReport(report) {
        var text = stringify(report);
        try {
            reportFile.encoding = "UTF-8";
            reportFile.lineFeed = "Unix";
            if (reportFile.open("w")) {
                reportFile.write(text);
                reportFile.close();
            }
        } catch (ignoreWrite) {}
        try { $.writeln("OPLUS_HOST_SMOKE_RESULT=" + text); } catch (ignoreConsole) {}
    }

    function assertion(report, name, passed, details) {
        report.checks.push({
            name: name,
            passed: !!passed,
            details: details === undefined ? null : details
        });
        if (!passed) { report.passed = false; }
    }

    function safeError(error) {
        return {
            message: String(error && (error.message || error.description) || error),
            line: error && error.line ? error.line : null,
            fileName: error && error.fileName ? String(error.fileName) : ""
        };
    }

    var report = {
        runId: runId,
        started: (new Date()).toUTCString(),
        completed: null,
        afterEffectsVersion: String(app.version),
        afterEffectsBuild: app.buildName ? String(app.buildName) : "",
        projectRoot: projectRoot.fsName,
        tempLibrary: tempRoot.fsName,
        passed: true,
        skipped: false,
        fatalError: null,
        checks: []
    };

    global.OPLUS_HOST_SMOKE_CONTEXT = {
        report: report,
        reportFile: reportFile,
        comp: null,
        tempRoot: tempRoot,
        originalLayerCount: 0,
        previewPath: ""
    };

    global.OPLUS_HOST_SMOKE_FINISH = function () {
        var context = global.OPLUS_HOST_SMOKE_CONTEXT;
        var finalReport = context.report;
        try {
            var preview = new File(context.previewPath);
            assertion(finalReport, "Preview PNG generated", preview.exists && preview.length > 0, {
                path: preview.fsName,
                exists: preview.exists,
                bytes: preview.exists ? preview.length : 0
            });
        } catch (previewError) {
            assertion(finalReport, "Preview PNG generated", false, safeError(previewError));
        }
        finalReport.completed = (new Date()).toUTCString();
        writeReport(finalReport);

        try {
            if (app.project) {
                app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
            }
        } catch (ignoreClose) {}
        try { app.quit(); } catch (ignoreQuit) {}
    };

    try {
        if (!app.project || app.project.file || app.project.numItems !== 0) {
            report.passed = false;
            report.skipped = true;
            report.fatalError = {
                message: "Host smoke test requires a blank, unsaved project and made no changes."
            };
            report.completed = (new Date()).toUTCString();
            writeReport(report);
            return;
        }

        assertion(report, "Bootstrap file exists", bootstrap.exists, bootstrap.fsName);
        if (!bootstrap.exists) { throw new Error("Bootstrap file is missing."); }
        $.evalFile(bootstrap);

        var pingEnvelope = OPLUS.util.parseJson(global.OPLUS_ping());
        assertion(report, "CEP bridge bootstrap responds", pingEnvelope.ok && pingEnvelope.data.connected, pingEnvelope);
        assertion(report, "All host modules loaded", pingEnvelope.ok && pingEnvelope.data.modulesLoaded, pingEnvelope.data.moduleErrors);

        var menuId = app.findMenuCommandId("Oplus Studio");
        assertion(report, "Oplus Studio registered in AE menus", menuId > 0, { menuCommandId: menuId });

        var comp = app.project.items.addComp("Oplus Host Smoke", 960, 540, 1, 4, 30);
        global.OPLUS_HOST_SMOKE_CONTEXT.comp = comp;
        comp.openInViewer();

        var shapeLayer = comp.layers.addShape();
        shapeLayer.name = "Smoke Shape";
        var contents = shapeLayer.property("ADBE Root Vectors Group");
        var group = contents.addProperty("ADBE Vector Group");
        group.name = "Smoke Rectangle";
        var groupContents = group.property("ADBE Vectors Group");
        var rectangle = groupContents.addProperty("ADBE Vector Shape - Rect");
        rectangle.property("ADBE Vector Rect Size").setValue([240, 140]);
        var fill = groupContents.addProperty("ADBE Vector Graphic - Fill");
        fill.property("ADBE Vector Fill Color").setValue([0.15, 0.65, 1, 1]);

        var textLayer = comp.layers.addText("Oplus Smoke");
        textLayer.name = "Smoke Text";
        var sourceText = textLayer.property("ADBE Text Properties").property("ADBE Text Document");
        var textDocument = sourceText.value;
        textDocument.fontSize = 72;
        textDocument.fillColor = [1, 1, 1];
        sourceText.setValue(textDocument);
        var opacity = textLayer.property("ADBE Transform Group").property("ADBE Opacity");
        opacity.expression = "value";
        opacity.expressionEnabled = true;
        var slider = textLayer.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
        slider.name = "Smoke Slider";
        slider.property(1).setValue(42);

        var mask = textLayer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mask.name = "Smoke Mask";
        var maskShape = new Shape();
        maskShape.vertices = [[-180, -70], [180, -70], [180, 70], [-180, 70]];
        maskShape.inTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
        maskShape.outTangents = [[0, 0], [0, 0], [0, 0], [0, 0]];
        maskShape.closed = true;
        mask.property("ADBE Mask Shape").setValue(maskShape);

        var controller = comp.layers.addNull(4);
        controller.name = "Smoke Controller";
        var position = controller.property("ADBE Transform Group").property("ADBE Position");
        position.setValueAtTime(0, [260, 270]);
        position.setValueAtTime(1, [700, 270]);
        textLayer.parent = controller;

        shapeLayer.selected = true;
        textLayer.selected = true;
        controller.selected = true;
        global.OPLUS_HOST_SMOKE_CONTEXT.originalLayerCount = comp.numLayers;

        var assetDirectory = tempRoot.fsName + "/Library/Host Smoke Asset";
        var previewPath = assetDirectory + "/preview.png";
        global.OPLUS_HOST_SMOKE_CONTEXT.previewPath = previewPath;
        var saveRequest = {
            assetDir: assetDirectory,
            metadata: {
                id: "host-smoke-" + runId,
                name: "Host Smoke Asset",
                category: "Animations",
                tags: ["smoke", "round-trip"],
                description: "Automated AE 2025 host smoke test"
            },
            settings: {
                libraryPath: tempRoot.fsName,
                autoThumbnail: true,
                defaultImportMode: "original"
            }
        };
        var saveEnvelope = OPLUS.util.parseJson(global.OPLUS_saveSelected(OPLUS.util.stringify(saveRequest)));
        assertion(report, "Save selected layers succeeds", saveEnvelope.ok, saveEnvelope.error || saveEnvelope.data);
        if (!saveEnvelope.ok) { throw new Error(saveEnvelope.error ? saveEnvelope.error.message : "Save failed."); }

        var assetFile = new File(assetDirectory + "/asset.json");
        var dataFile = new File(assetDirectory + "/data.json");
        assertion(report, "asset.json created", assetFile.exists && assetFile.length > 0, assetFile.fsName);
        assertion(report, "data.json created", dataFile.exists && dataFile.length > 0, dataFile.fsName);
        var assetJson = OPLUS.util.parseJson(OPLUS.util.readText(assetFile.fsName));
        var dataJson = OPLUS.util.parseJson(OPLUS.util.readText(dataFile.fsName));
        assertion(report, "Asset metadata is complete",
            assetJson.id === saveRequest.metadata.id && assetJson.layerCount === 3 &&
                assetJson.thumbnail === "preview.png",
            assetJson);
        var serializedKinds = {};
        var serializedLayerIndex;
        for (serializedLayerIndex = 0;
                dataJson.layers && serializedLayerIndex < dataJson.layers.length;
                serializedLayerIndex += 1) {
            serializedKinds[dataJson.layers[serializedLayerIndex].type] = dataJson.layers[serializedLayerIndex];
        }
        assertion(report, "Serialized layer data is complete",
            dataJson.layers && dataJson.layers.length === 3 &&
                serializedKinds.shape && serializedKinds.shape.shape &&
                serializedKinds.text && serializedKinds.text.text &&
                serializedKinds["null"] && serializedKinds["null"].transform,
            {
                layerCount: dataJson.layers ? dataJson.layers.length : 0,
                layerTypes: dataJson.layers ? [
                    dataJson.layers[0].type,
                    dataJson.layers[1].type,
                    dataJson.layers[2].type
                ] : [],
                warnings: dataJson.warnings || []
            });

        var importRequest = {
            dataPath: dataFile.fsName,
            mode: "currentTime",
            options: { mode: "currentTime", targetTime: 2 }
        };
        comp.time = 2;
        var importEnvelope = OPLUS.util.parseJson(global.OPLUS_importAsset(OPLUS.util.stringify(importRequest)));
        assertion(report, "Import succeeds", importEnvelope.ok, importEnvelope.error || importEnvelope.data);
        if (!importEnvelope.ok) { throw new Error(importEnvelope.error ? importEnvelope.error.message : "Import failed."); }
        assertion(report, "All saved layers restored",
            importEnvelope.data.layerCount === 3 && comp.numLayers === global.OPLUS_HOST_SMOKE_CONTEXT.originalLayerCount + 3,
            { result: importEnvelope.data, compLayerCount: comp.numLayers });

        var importedByName = {};
        var resultLayers = importEnvelope.data.layers || [];
        var layerIndex;
        for (layerIndex = 0; layerIndex < resultLayers.length; layerIndex += 1) {
            try {
                importedByName[resultLayers[layerIndex].name] = comp.layer(resultLayers[layerIndex].index);
            } catch (ignoreImportedLayer) {}
        }
        var importedText = importedByName["Smoke Text"];
        var importedController = importedByName["Smoke Controller"];
        assertion(report, "Parenting restored",
            importedText && importedController && importedText.parent === importedController,
            null);
        assertion(report, "Keyframes restored",
            importedController &&
                importedController.property("ADBE Transform Group").property("ADBE Position").numKeys === 2,
            null);
        assertion(report, "Expression restored",
            importedText &&
                importedText.property("ADBE Transform Group").property("ADBE Opacity").expression === "value",
            null);
        assertion(report, "Effect restored",
            importedText && importedText.property("ADBE Effect Parade").numProperties === 1,
            null);
        assertion(report, "Mask restored",
            importedText && importedText.property("ADBE Mask Parade").numProperties === 1,
            null);

        var undoId = app.findMenuCommandId("Undo OPLUS Studio - Import Asset");
        if (undoId <= 0) { undoId = 16; }
        app.executeCommand(undoId);
        assertion(report, "Import is one undoable operation",
            comp.numLayers === global.OPLUS_HOST_SMOKE_CONTEXT.originalLayerCount,
            { undoCommandId: undoId, layerCountAfterUndo: comp.numLayers });

        app.scheduleTask("OPLUS_HOST_SMOKE_FINISH()", 15000, false);
    } catch (error) {
        report.passed = false;
        report.fatalError = safeError(error);
        report.completed = (new Date()).toUTCString();
        writeReport(report);
        try {
            if (app.project) { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); }
        } catch (ignoreFatalClose) {}
        try { app.quit(); } catch (ignoreFatalQuit) {}
    }
}($.global));
