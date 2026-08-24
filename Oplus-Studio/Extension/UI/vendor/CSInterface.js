/*
 * Small, dependency-free subset of Adobe's CSInterface.js used by Oplus Studio.
 * It delegates directly to the CEP-injected window.__adobe_cep__ object and keeps
 * the panel testable in an ordinary browser where that object does not exist.
 */
(function (global) {
    'use strict';

    var SystemPath = {
        USER_DATA: 'userData',
        COMMON_FILES: 'commonFiles',
        MY_DOCUMENTS: 'myDocuments',
        APPLICATION: 'application',
        EXTENSION: 'extension',
        HOST_APPLICATION: 'hostApplication'
    };

    var ColorType = {
        RGB: 'rgb',
        GRADIENT: 'gradient',
        NONE: 'none'
    };

    function CSEvent(type, scope, appId, extensionId) {
        this.type = type || '';
        this.scope = scope || 'APPLICATION';
        this.appId = appId || '';
        this.extensionId = extensionId || '';
        this.data = '';
    }

    function cepHost() {
        return global.__adobe_cep__ || null;
    }

    function parseJson(value, fallback) {
        try {
            return typeof value === 'string' ? JSON.parse(value) : value;
        } catch (error) {
            return fallback;
        }
    }

    function CSInterface() {
        var cep = cepHost();
        this.hostEnvironment = cep && cep.getHostEnvironment
            ? parseJson(cep.getHostEnvironment(), {})
            : { appName: 'Browser', appVersion: '0', appLocale: 'en_US' };
    }

    CSInterface.prototype.getHostEnvironment = function () {
        var cep = cepHost();
        return cep && cep.getHostEnvironment
            ? parseJson(cep.getHostEnvironment(), this.hostEnvironment)
            : this.hostEnvironment;
    };

    CSInterface.prototype.getSystemPath = function (pathType) {
        var cep = cepHost();
        return cep && cep.getSystemPath ? decodeURI(cep.getSystemPath(pathType)) : '';
    };

    CSInterface.prototype.evalScript = function (script, callback) {
        var cep = cepHost();
        if (!cep || !cep.evalScript) {
            if (callback) {
                callback(JSON.stringify({
                    ok: false,
                    data: null,
                    error: { code: 'CEP_UNAVAILABLE', message: 'Adobe CEP host is unavailable.' }
                }));
            }
            return;
        }
        cep.evalScript(script, callback || function () {});
    };

    CSInterface.prototype.addEventListener = function (type, listener, obj) {
        var cep = cepHost();
        if (cep && cep.addEventListener) {
            cep.addEventListener(type, listener, obj);
        }
    };

    CSInterface.prototype.removeEventListener = function (type, listener, obj) {
        var cep = cepHost();
        if (cep && cep.removeEventListener) {
            cep.removeEventListener(type, listener, obj);
        }
    };

    CSInterface.prototype.dispatchEvent = function (event) {
        var cep = cepHost();
        if (cep && cep.dispatchEvent) {
            cep.dispatchEvent(event);
        }
    };

    CSInterface.prototype.openURLInDefaultBrowser = function (url) {
        var cep = cepHost();
        return cep && cep.util && cep.util.openURLInDefaultBrowser
            ? cep.util.openURLInDefaultBrowser(url)
            : false;
    };

    CSInterface.prototype.getApplicationID = function () {
        var env = this.getHostEnvironment();
        return env.appId || env.appName || '';
    };

    CSInterface.prototype.getExtensionID = function () {
        var cep = cepHost();
        return cep && cep.getExtensionId ? cep.getExtensionId() : 'studio.oplus.ae.panel';
    };

    CSInterface.prototype.getScaleFactor = function () {
        var cep = cepHost();
        return cep && cep.getScaleFactor ? cep.getScaleFactor() : 1;
    };

    CSInterface.prototype.setPanelFlyoutMenu = function (menu) {
        var cep = cepHost();
        if (cep && cep.invokeSync) {
            return cep.invokeSync('setPanelFlyoutMenu', menu);
        }
        return '';
    };

    global.SystemPath = SystemPath;
    global.ColorType = ColorType;
    global.CSEvent = CSEvent;
    global.CSInterface = CSInterface;
}(window));
