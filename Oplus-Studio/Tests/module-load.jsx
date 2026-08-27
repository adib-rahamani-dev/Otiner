#target aftereffects
(function () {
    var here = new File($.fileName).parent;
    var bootstrap = new File(here.parent.fsName + "/Extension/JSX/bootstrap.jsx");
    var report = new File(here.fsName + "/module-load-report.json");
    var result = { ok: false, afterEffectsVersion: String(app.version), error: null, moduleErrors: [] };
    try {
        $.evalFile(bootstrap);
        result.moduleErrors = OPLUS.moduleErrors || [];
        result.ok = result.moduleErrors.length === 0;
    } catch (error) {
        result.error = { message: String(error.message || error), line: error.line || null,
            fileName: String(error.fileName || "") };
    }
    report.encoding = "UTF-8";
    if (report.open("w")) {
        report.write(typeof OPLUS !== "undefined" && OPLUS.util ? OPLUS.util.stringify(result) : result.toSource());
        report.close();
    }
}());
