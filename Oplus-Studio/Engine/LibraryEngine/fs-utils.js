'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');

var WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
var INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\x00-\x1f]/g;

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') {
        return false;
    }

    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function expandHome(input) {
    if (input === '~') {
        return os.homedir();
    }
    if (input.indexOf('~/') === 0 || input.indexOf('~\\') === 0) {
        return path.join(os.homedir(), input.slice(2));
    }
    return input;
}

function normalizeAbsolutePath(input, options) {
    options = options || {};
    if (typeof input !== 'string') {
        throw new TypeError((options.label || 'Path') + ' must be a string.');
    }

    var trimmed = input.trim();
    if (!trimmed) {
        if (options.allowEmpty) {
            return '';
        }
        throw new Error((options.label || 'Path') + ' cannot be empty.');
    }
    if (trimmed.indexOf('\x00') !== -1) {
        throw new Error((options.label || 'Path') + ' contains a null byte.');
    }

    var resolved = path.resolve(expandHome(trimmed));
    if (options.disallowFileSystemRoot && path.parse(resolved).root === resolved) {
        throw new Error((options.label || 'Path') + ' cannot be a filesystem root.');
    }
    return resolved;
}

function comparisonPath(input) {
    var normalized = path.resolve(input);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isPathInside(root, candidate, allowRoot) {
    var normalizedRoot = comparisonPath(root);
    var normalizedCandidate = comparisonPath(candidate);
    if (normalizedRoot === normalizedCandidate) {
        return Boolean(allowRoot);
    }
    var relative = path.relative(normalizedRoot, normalizedCandidate);
    return Boolean(relative) &&
        relative !== '..' &&
        relative.indexOf('..' + path.sep) !== 0 &&
        !path.isAbsolute(relative);
}

function assertPathInside(root, candidate, allowRoot, label) {
    if (!isPathInside(root, candidate, allowRoot)) {
        throw new Error((label || 'Path') + ' escapes the configured root.');
    }
    return path.resolve(candidate);
}

function safeJoin(root) {
    var rootPath = normalizeAbsolutePath(root, {
        label: 'Root path'
    });
    var segments = Array.prototype.slice.call(arguments, 1);
    var candidate = rootPath;

    segments.forEach(function (segment) {
        if (typeof segment !== 'string' || !segment || segment.indexOf('\x00') !== -1) {
            throw new Error('Path segments must be non-empty strings without null bytes.');
        }
        if (path.isAbsolute(segment)) {
            throw new Error('Absolute path segments are not allowed.');
        }
        candidate = path.resolve(candidate, segment);
    });

    return assertPathInside(rootPath, candidate, segments.length === 0, 'Joined path');
}

function validateAssetId(id) {
    return typeof id === 'string' &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id) &&
        id !== '.' &&
        id !== '..';
}

function assertAssetId(id) {
    if (!validateAssetId(id)) {
        throw new Error('Asset id must use only letters, numbers, dot, underscore, or hyphen (maximum 128 characters).');
    }
    return id;
}

function sanitizeFolderName(name) {
    if (typeof name !== 'string') {
        throw new TypeError('Asset name must be a string.');
    }
    var safeName = name
        .normalize ? name.normalize('NFKC') : name;
    safeName = safeName
        .replace(INVALID_FILENAME_CHARACTERS, '-')
        .replace(/\s+/g, ' ')
        .replace(/^[. ]+/g, '')
        .replace(/[. ]+$/g, '')
        .trim();

    if (!safeName || safeName === '.' || safeName === '..') {
        safeName = 'Untitled Asset';
    }
    if (WINDOWS_RESERVED_NAMES.test(safeName)) {
        safeName = '_' + safeName;
    }
    if (safeName.length > 80) {
        safeName = safeName.slice(0, 80).replace(/[. ]+$/g, '');
    }
    return safeName;
}

function randomToken(bytes) {
    return crypto.randomBytes(bytes || 8).toString('hex');
}

function generateId() {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    var bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = bytes.toString('hex');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20)
    ].join('-');
}

function ensureDirectory(directoryPath) {
    var resolved = normalizeAbsolutePath(directoryPath, {
        label: 'Directory path'
    });
    fs.mkdirSync(resolved, {
        recursive: true
    });
    var stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        throw new Error('Expected a directory at ' + resolved);
    }
    return resolved;
}

function readJsonFile(filePath, options) {
    options = options || {};
    var resolved = normalizeAbsolutePath(filePath, {
        label: 'JSON file path'
    });
    try {
        var source = fs.readFileSync(resolved, 'utf8');
        if (source.charCodeAt(0) === 0xfeff) {
            source = source.slice(1);
        }
        var parsed = JSON.parse(source);
        if (options.requireObject && !isPlainObject(parsed)) {
            throw new Error('JSON root must be an object.');
        }
        return parsed;
    } catch (error) {
        if (error && error.code === 'ENOENT' && hasOwn(options, 'defaultValue')) {
            return options.defaultValue;
        }
        var wrapped = new Error('Could not read JSON file ' + resolved + ': ' + error.message);
        wrapped.code = error.code || 'EJSONREAD';
        wrapped.cause = error;
        throw wrapped;
    }
}

function stableClone(value, stack) {
    stack = stack || [];
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!isFinite(value)) {
            throw new Error('JSON cannot contain non-finite numbers.');
        }
        return value;
    }
    if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
        throw new Error('Value is not JSON serializable.');
    }
    if (stack.indexOf(value) !== -1) {
        throw new Error('Circular structures cannot be serialized.');
    }

    stack.push(value);
    var result;
    if (Array.isArray(value)) {
        result = value.map(function (entry) {
            return stableClone(entry, stack);
        });
    } else if (isPlainObject(value)) {
        result = {};
        Object.keys(value).sort().forEach(function (key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                throw new Error('Unsafe object key: ' + key);
            }
            result[key] = stableClone(value[key], stack);
        });
    } else if (Buffer.isBuffer(value)) {
        throw new Error('Buffer values must be stored separately from JSON.');
    } else {
        throw new Error('Only plain objects and arrays can be serialized.');
    }
    stack.pop();
    return result;
}

function stringifyJson(value, spacing) {
    return JSON.stringify(stableClone(value), null, typeof spacing === 'number' ? spacing : 2) + '\n';
}

function fsyncDirectory(directoryPath) {
    if (process.platform === 'win32') {
        return;
    }
    var descriptor;
    try {
        descriptor = fs.openSync(directoryPath, 'r');
        fs.fsyncSync(descriptor);
    } catch (ignore) {
        // Directory fsync is unavailable on some filesystems. File fsync still applies.
    } finally {
        if (typeof descriptor === 'number') {
            try {
                fs.closeSync(descriptor);
            } catch (ignoreClose) {
                // Best effort only.
            }
        }
    }
}

function replaceFile(tempPath, targetPath) {
    try {
        fs.renameSync(tempPath, targetPath);
        return;
    } catch (error) {
        if (!fs.existsSync(targetPath) || ['EEXIST', 'EPERM', 'EACCES'].indexOf(error.code) === -1) {
            throw error;
        }
    }

    var backupPath = targetPath + '.backup-' + randomToken(4);
    fs.renameSync(targetPath, backupPath);
    try {
        fs.renameSync(tempPath, targetPath);
        try {
            fs.unlinkSync(backupPath);
        } catch (ignoreBackupRemoval) {
            // A stale backup is safer than losing the target.
        }
    } catch (replaceError) {
        if (!fs.existsSync(targetPath) && fs.existsSync(backupPath)) {
            fs.renameSync(backupPath, targetPath);
        }
        throw replaceError;
    }
}

function writeBufferAtomic(filePath, buffer, options) {
    options = options || {};
    var resolved = normalizeAbsolutePath(filePath, {
        label: 'Output file path'
    });
    var directoryPath = ensureDirectory(path.dirname(resolved));
    var temporaryPath = path.join(
        directoryPath,
        '.' + path.basename(resolved) + '.' + process.pid + '.' + randomToken(6) + '.tmp'
    );
    var descriptor;

    try {
        descriptor = fs.openSync(temporaryPath, 'wx', options.mode || 0o600);
        fs.writeFileSync(descriptor, buffer);
        fs.fsyncSync(descriptor);
        fs.closeSync(descriptor);
        descriptor = undefined;
        replaceFile(temporaryPath, resolved);
        fsyncDirectory(directoryPath);
        return resolved;
    } catch (error) {
        if (typeof descriptor === 'number') {
            try {
                fs.closeSync(descriptor);
            } catch (ignoreClose) {
                // Continue cleanup.
            }
        }
        try {
            if (fs.existsSync(temporaryPath)) {
                fs.unlinkSync(temporaryPath);
            }
        } catch (ignoreCleanup) {
            // Preserve original error.
        }
        throw error;
    }
}

function writeJsonAtomic(filePath, value, options) {
    options = options || {};
    var text = stringifyJson(value, hasOwn(options, 'spacing') ? options.spacing : 2);
    return writeBufferAtomic(filePath, Buffer.from(text, 'utf8'), options);
}

function copyFileAtomic(sourcePath, targetPath, options) {
    options = options || {};
    var resolvedSource = normalizeAbsolutePath(sourcePath, {
        label: 'Source file path'
    });
    var stat = fs.statSync(resolvedSource);
    if (!stat.isFile()) {
        throw new Error('Preview source must be a regular file.');
    }
    if (options.maxBytes && stat.size > options.maxBytes) {
        throw new Error('Source file exceeds the maximum size of ' + options.maxBytes + ' bytes.');
    }
    return writeBufferAtomic(targetPath, fs.readFileSync(resolvedSource), options);
}

function removeTreeSafe(root, target) {
    var resolvedRoot = normalizeAbsolutePath(root, {
        label: 'Removal root',
        disallowFileSystemRoot: true
    });
    var resolvedTarget = normalizeAbsolutePath(target, {
        label: 'Removal target',
        disallowFileSystemRoot: true
    });
    assertPathInside(resolvedRoot, resolvedTarget, false, 'Removal target');

    if (!fs.existsSync(resolvedTarget)) {
        return false;
    }

    var stat = fs.lstatSync(resolvedTarget);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        fs.unlinkSync(resolvedTarget);
        return true;
    }
    fs.readdirSync(resolvedTarget).forEach(function (entry) {
        var child = path.join(resolvedTarget, entry);
        var childStat = fs.lstatSync(child);
        if (childStat.isSymbolicLink() || !childStat.isDirectory()) {
            fs.unlinkSync(child);
        } else {
            removeTreeSafe(resolvedRoot, child);
        }
    });
    fs.rmdirSync(resolvedTarget);
    return true;
}

function moveDirectory(sourcePath, targetPath) {
    var source = normalizeAbsolutePath(sourcePath, {
        label: 'Source directory'
    });
    var target = normalizeAbsolutePath(targetPath, {
        label: 'Target directory'
    });
    ensureDirectory(path.dirname(target));
    fs.renameSync(source, target);
    return target;
}

module.exports = {
    assertAssetId: assertAssetId,
    assertPathInside: assertPathInside,
    copyFileAtomic: copyFileAtomic,
    ensureDirectory: ensureDirectory,
    generateId: generateId,
    hasOwn: hasOwn,
    isPathInside: isPathInside,
    isPlainObject: isPlainObject,
    moveDirectory: moveDirectory,
    normalizeAbsolutePath: normalizeAbsolutePath,
    randomToken: randomToken,
    readJsonFile: readJsonFile,
    removeTreeSafe: removeTreeSafe,
    safeJoin: safeJoin,
    sanitizeFolderName: sanitizeFolderName,
    stableClone: stableClone,
    stringifyJson: stringifyJson,
    validateAssetId: validateAssetId,
    writeBufferAtomic: writeBufferAtomic,
    writeJsonAtomic: writeJsonAtomic
};
