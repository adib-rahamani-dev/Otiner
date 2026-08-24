'use strict';

var Serializer = require('../Serializer');
var utils = require('../LibraryEngine/fs-utils');

var MODES = Object.freeze({
    ORIGINAL: 'original',
    CENTER_COMPOSITION: 'center',
    CURRENT_TIME: 'currentTime',
    KEEP_ORIGINAL_TIME: 'originalTime',
    REPLACE_SELECTED: 'replace'
});
var MODE_VALUES = [
    MODES.ORIGINAL,
    MODES.CENTER_COMPOSITION,
    MODES.CURRENT_TIME,
    MODES.KEEP_ORIGINAL_TIME,
    MODES.REPLACE_SELECTED
];
var MODE_ALIASES = {
    original: MODES.ORIGINAL,
    keepOriginalPosition: MODES.ORIGINAL,
    'keep-original-position': MODES.ORIGINAL,
    center: MODES.CENTER_COMPOSITION,
    centerComposition: MODES.CENTER_COMPOSITION,
    'center-composition': MODES.CENTER_COMPOSITION,
    currentTime: MODES.CURRENT_TIME,
    'current-time': MODES.CURRENT_TIME,
    originalTime: MODES.KEEP_ORIGINAL_TIME,
    keepOriginalTime: MODES.KEEP_ORIGINAL_TIME,
    'keep-original-time': MODES.KEEP_ORIGINAL_TIME,
    replace: MODES.REPLACE_SELECTED,
    replaceSelected: MODES.REPLACE_SELECTED,
    replaceSelectedLayers: MODES.REPLACE_SELECTED,
    'replace-selected': MODES.REPLACE_SELECTED
};

function normalizeMode(mode) {
    var value = mode || MODES.ORIGINAL;
    if (MODE_VALUES.indexOf(value) !== -1) {
        return value;
    }
    if (MODE_ALIASES[value]) {
        return MODE_ALIASES[value];
    }
    var error = new Error('Unsupported import mode: ' + value);
    error.code = 'EIMPORTMODE';
    throw error;
}

function defaultClock() {
    return new Date();
}

function isoNow(clock) {
    var date = clock();
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    return date.toISOString();
}

function ImportEngine(options) {
    options = options || {};
    if (!options.libraryEngine) {
        throw new Error('ImportEngine requires a LibraryEngine instance.');
    }
    this.library = options.libraryEngine;
    this.serializer = options.serializer || this.library.serializer || new Serializer();
    this.logger = options.logger || this.library.logger;
    this.clock = typeof options.clock === 'function' ? options.clock : defaultClock;
    this.hostFunction = options.hostFunction || 'OPLUS_importAsset';
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(this.hostFunction)) {
        throw new Error('Host function name is unsafe.');
    }
}

ImportEngine.prototype.prepare = function (assetId, options) {
    options = options || {};
    var bundle = this.library.readAsset(assetId);
    var mode = normalizeMode(options.mode || this.library.getSettings().defaultImportMode);
    var validation = this.library.validateAsset(assetId);
    if (!validation.valid) {
        var validationError = new Error('Asset cannot be imported: ' + validation.errors.join(' '));
        validationError.code = 'EASSETCORRUPT';
        validationError.validationErrors = validation.errors;
        throw validationError;
    }
    var requestOptions = {};
    [
        'currentTime',
        'targetCompId',
        'targetCompName',
        'replaceLayerIndices',
        'preserveExpressions',
        'preserveParenting'
    ].forEach(function (key) {
        if (utils.hasOwn(options, key)) {
            requestOptions[key] = utils.stableClone(options[key]);
        }
    });

    var payload = {
        schemaVersion: 1,
        assetId: assetId,
        mode: mode,
        requestedAt: isoNow(this.clock),
        metadata: utils.stableClone(bundle.metadata),
        data: utils.stableClone(bundle.data),
        options: requestOptions
    };
    this.logger.info('import.prepare', {
        assetId: assetId,
        context: {
            mode: mode,
            layerCount: bundle.metadata.layerCount
        }
    });
    return payload;
};

ImportEngine.prototype.stringify = function (assetId, options) {
    return JSON.stringify(this.prepare(assetId, options));
};

ImportEngine.prototype.buildEvalScript = function (assetId, options) {
    var payload = this.stringify(assetId, options);
    return this.hostFunction + '(' + JSON.stringify(payload) + ')';
};

ImportEngine.prototype.parseHostResult = function (rawResult) {
    var result = this.serializer.parseHostPayload(rawResult);
    if (result.ok === false) {
        var errorMessage = result.error && result.error.message
            ? result.error.message
            : result.error || 'After Effects import failed.';
        var error = new Error(String(errorMessage));
        error.code = result.error && result.error.code ? result.error.code : 'EHOSTIMPORT';
        error.hostResult = result;
        throw error;
    }
    return result;
};

ImportEngine.prototype.execute = function (assetId, options, bridge, callback) {
    options = options || {};
    if (!bridge) {
        throw new TypeError('A CSInterface instance or evalScript function is required.');
    }
    var evaluator;
    var receiver = null;
    if (typeof bridge === 'function') {
        evaluator = bridge;
    } else if (typeof bridge.evalScript === 'function') {
        evaluator = bridge.evalScript;
        receiver = bridge;
    } else {
        throw new TypeError('Bridge must expose evalScript(script, callback).');
    }
    var done = typeof callback === 'function' ? callback : function () {};
    var script;
    try {
        script = this.buildEvalScript(assetId, options);
    } catch (error) {
        done(error);
        return null;
    }

    var self = this;
    var settled = false;
    function finish(error, value) {
        if (settled) {
            return;
        }
        settled = true;
        done(error, value);
    }
    try {
        evaluator.call(receiver, script, function (rawResult) {
            try {
                var result = self.parseHostResult(rawResult);
                self.logger.info('import.complete', {
                    assetId: assetId,
                    context: {
                        mode: normalizeMode(options.mode || self.library.getSettings().defaultImportMode)
                    }
                });
                finish(null, result);
            } catch (error) {
                self.logger.error('import.complete', {
                    assetId: assetId,
                    error: error
                });
                finish(error);
            }
        });
    } catch (error) {
        this.logger.error('import.execute', {
            assetId: assetId,
            error: error
        });
        finish(error);
    }
    return script;
};

ImportEngine.MODES = MODES;
ImportEngine.MODE_VALUES = MODE_VALUES;
ImportEngine.normalizeMode = normalizeMode;

ImportEngine.prototype.prepareImport = ImportEngine.prototype.prepare;
ImportEngine.prototype.buildHostRequest = ImportEngine.prototype.prepare;
ImportEngine.prototype.createEvalScript = ImportEngine.prototype.buildEvalScript;
ImportEngine.prototype.importAsset = ImportEngine.prototype.execute;

module.exports = ImportEngine;
