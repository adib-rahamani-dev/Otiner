'use strict';

var fs = require('fs');
var path = require('path');
var utils = require('../LibraryEngine/fs-utils');

function defaultClock() {
    return new Date();
}

function toIsoDate(clock) {
    var value;
    try {
        value = clock();
        if (!(value instanceof Date)) {
            value = new Date(value);
        }
        if (isNaN(value.getTime())) {
            throw new Error('Invalid date');
        }
        return value.toISOString();
    } catch (ignore) {
        return new Date().toISOString();
    }
}

function normalizeError(error) {
    if (!error) {
        return null;
    }
    if (typeof error === 'string') {
        return {
            message: error
        };
    }
    return {
        name: error.name || 'Error',
        message: error.message || String(error),
        code: error.code || null,
        stack: error.stack || null
    };
}

function copyContext(input) {
    if (!input || typeof input !== 'object') {
        return {};
    }
    var output = {};
    Object.keys(input).forEach(function (key) {
        if (key !== 'error' && typeof input[key] !== 'undefined') {
            output[key] = input[key];
        }
    });
    return output;
}

function safeLine(entry) {
    try {
        return JSON.stringify(utils.stableClone(entry)) + '\n';
    } catch (serializationError) {
        return JSON.stringify({
            date: entry.date,
            level: 'error',
            operation: 'logger.serialization',
            error: normalizeError(serializationError)
        }) + '\n';
    }
}

function Logger(options) {
    options = options || {};
    this.filePath = path.resolve(options.filePath || path.join(__dirname, '..', '..', 'Logs', 'oplus.log'));
    this.maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : 5 * 1024 * 1024;
    this.maxBackups = Number(options.maxBackups) >= 0 ? Math.floor(Number(options.maxBackups)) : 3;
    this.clock = typeof options.clock === 'function' ? options.clock : defaultClock;
    this.console = options.console || null;
    this.baseContext = copyContext(options.baseContext);
}

Logger.prototype._rotateIfNeeded = function (nextBytes) {
    var size = 0;
    try {
        size = fs.statSync(this.filePath).size;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }
    if (size + nextBytes <= this.maxBytes) {
        return;
    }

    var index;
    if (this.maxBackups === 0) {
        fs.writeFileSync(this.filePath, '', 'utf8');
        return;
    }

    for (index = this.maxBackups; index >= 1; index -= 1) {
        var source = index === 1 ? this.filePath : this.filePath + '.' + (index - 1);
        var target = this.filePath + '.' + index;
        if (!fs.existsSync(source)) {
            continue;
        }
        if (fs.existsSync(target)) {
            fs.unlinkSync(target);
        }
        fs.renameSync(source, target);
    }
};

Logger.prototype.log = function (operation, details, level) {
    details = details || {};
    var context = copyContext(this.baseContext);
    var suppliedContext = copyContext(details.context);
    Object.keys(suppliedContext).forEach(function (key) {
        context[key] = suppliedContext[key];
    });

    var entry = {
        date: toIsoDate(this.clock),
        level: level || details.level || 'info',
        operation: typeof operation === 'string' && operation ? operation : 'unknown',
        assetId: details.assetId || null,
        layer: details.layer || null,
        property: details.property || null,
        message: details.message || null,
        error: normalizeError(details.error),
        context: context
    };
    var line = safeLine(entry);

    try {
        utils.ensureDirectory(path.dirname(this.filePath));
        this._rotateIfNeeded(Buffer.byteLength(line, 'utf8'));
        fs.appendFileSync(this.filePath, line, {
            encoding: 'utf8',
            mode: 0o600
        });
    } catch (loggingError) {
        if (this.console && typeof this.console.error === 'function') {
            try {
                this.console.error('Oplus Logger could not write: ' + loggingError.message);
            } catch (ignoreConsole) {
                // Logging must never crash the host panel.
            }
        }
        return false;
    }
    return entry;
};

Logger.prototype.info = function (operation, details) {
    return this.log(operation, details, 'info');
};

Logger.prototype.warn = function (operation, details) {
    return this.log(operation, details, 'warn');
};

Logger.prototype.error = function (operation, details) {
    return this.log(operation, details, 'error');
};

Logger.prototype.child = function (baseContext) {
    var merged = copyContext(this.baseContext);
    var additional = copyContext(baseContext);
    Object.keys(additional).forEach(function (key) {
        merged[key] = additional[key];
    });
    return new Logger({
        filePath: this.filePath,
        maxBytes: this.maxBytes,
        maxBackups: this.maxBackups,
        clock: this.clock,
        console: this.console,
        baseContext: merged
    });
};

Logger.prototype.readEntries = function (limit) {
    try {
        if (!fs.existsSync(this.filePath)) {
            return [];
        }
        var entries = fs.readFileSync(this.filePath, 'utf8')
            .split(/\r?\n/)
            .filter(Boolean)
            .map(function (line) {
                try {
                    return JSON.parse(line);
                } catch (error) {
                    return {
                        level: 'error',
                        operation: 'logger.parse',
                        message: 'Malformed log entry',
                        raw: line
                    };
                }
            });
        if (Number(limit) > 0) {
            return entries.slice(-Math.floor(Number(limit)));
        }
        return entries;
    } catch (error) {
        return [];
    }
};

Logger.noop = {
    log: function () {
        return false;
    },
    info: function () {
        return false;
    },
    warn: function () {
        return false;
    },
    error: function () {
        return false;
    },
    readEntries: function () {
        return [];
    },
    child: function () {
        return Logger.noop;
    }
};

Logger.normalizeError = normalizeError;

module.exports = Logger;
