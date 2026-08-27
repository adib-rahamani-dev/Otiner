#target aftereffects
(function () {
    var here = new File($.fileName).parent;
    var target = new File(here.fsName + "/native-host-smoke.jsx");
    var errorFile = new File(here.fsName + "/native-host-smoke-launch-error.txt");
    try {
        $.evalFile(target);
    } catch (error) {
        errorFile.encoding = "UTF-8";
        if (errorFile.open("w")) {
            errorFile.write("message=" + String(error.message || error) + "\nline=" +
                String(error.line || "") + "\nfile=" + String(error.fileName || ""));
            errorFile.close();
        }
        if ($.global.OPLUS_NATIVE_SMOKE_OWNS_INSTANCE === true) {
            try { app.quit(); } catch (ignore) {}
        }
    }
}());
