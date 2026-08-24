'use strict';

var fs = require('fs');
var path = require('path');
var utils = require('../LibraryEngine/fs-utils');

var SCHEMA_VERSION = 1;
var DEFAULT_PREVIEW_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+3MxZ5wAAAABJRU5ErkJggg==',
    'base64'
);
var PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
var REQUIRED_METADATA_FIELDS = [
    'id',
    'name',
    'category',
    'tags',
    'description',
    'created',
    'afterEffectsVersion',
    'layerCount',
    'thumbnail'
];

function defaultClock() {
    return new Date();
}

function isoNow(clock) {
    var date = clock();
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    if (isNaN(date.getTime())) {
        throw new Error('Clock returned an invalid date.');
    }
    return date.toISOString();
}

function stringValue(value, fallback) {
    if (value === null || typeof value === 'undefined') {
        return fallback || '';
    }
    return String(value).trim();
}

function normalizeTags(tags) {
    if (typeof tags === 'string') {
        tags = tags.split(',');
    }
    if (!Array.isArray(tags)) {
        return [];
    }
    var seen = {};
    var result = [];
    tags.forEach(function (tag) {
        var normalized = stringValue(tag, '');
        var key = normalized.toLowerCase();
        if (normalized && !seen[key]) {
            seen[key] = true;
            result.push(normalized);
        }
    });
    return result;
}

function inspectJsonTree(root, options) {
    options = options || {};
    var maxDepth = options.maxDepth || 128;
    var maxNodes = options.maxNodes || 200000;
    var stack = [{
        value: root,
        depth: 0,
        path: '$'
    }];
    var seen = [];
    var nodes = 0;
    var errors = [];

    while (stack.length) {
        var item = stack.pop();
        var value = item.value;
        nodes += 1;
        if (nodes > maxNodes) {
            errors.push('JSON exceeds the maximum node count of ' + maxNodes + '.');
            break;
        }
        if (item.depth > maxDepth) {
            errors.push(item.path + ' exceeds the maximum nesting depth of ' + maxDepth + '.');
            continue;
        }
        if (value === null || typeof value === 'string' || typeof value === 'boolean') {
            continue;
        }
        if (typeof value === 'number') {
            if (!isFinite(value)) {
                errors.push(item.path + ' contains a non-finite number.');
            }
            continue;
        }
        if (typeof value !== 'object') {
            errors.push(item.path + ' contains a non-JSON value of type ' + typeof value + '.');
            continue;
        }
        if (Buffer.isBuffer(value)) {
            errors.push(item.path + ' contains a Buffer; binary data must be stored separately.');
            continue;
        }
        if (seen.indexOf(value) !== -1) {
            errors.push(item.path + ' contains a circular reference.');
            continue;
        }
        seen.push(value);

        if (Array.isArray(value)) {
            for (var arrayIndex = value.length - 1; arrayIndex >= 0; arrayIndex -= 1) {
                stack.push({
                    value: value[arrayIndex],
                    depth: item.depth + 1,
                    path: item.path + '[' + arrayIndex + ']'
                });
            }
            continue;
        }
        if (!utils.isPlainObject(value)) {
            errors.push(item.path + ' must be a plain object.');
            continue;
        }
        Object.keys(value).forEach(function (key) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
                errors.push(item.path + ' contains unsafe key ' + key + '.');
                return;
            }
            stack.push({
                value: value[key],
                depth: item.depth + 1,
                path: item.path + '.' + key
            });
        });
    }

    return errors;
}

function validateMetadata(metadata, options) {
    options = options || {};
    var errors = [];
    if (!utils.isPlainObject(metadata)) {
        return {
            valid: false,
            errors: ['Asset metadata must be a plain object.']
        };
    }

    if (!options.allowMissingId && !utils.validateAssetId(metadata.id)) {
        errors.push('id is missing or invalid.');
    } else if (metadata.id && !utils.validateAssetId(metadata.id)) {
        errors.push('id is invalid.');
    }
    if (!stringValue(metadata.name, '')) {
        errors.push('name is required.');
    }
    if (metadata.name && String(metadata.name).length > 200) {
        errors.push('name cannot exceed 200 characters.');
    }
    if (metadata.category && String(metadata.category).length > 100) {
        errors.push('category cannot exceed 100 characters.');
    }
    if (metadata.description && String(metadata.description).length > 5000) {
        errors.push('description cannot exceed 5000 characters.');
    }
    if (typeof metadata.tags !== 'undefined' && !Array.isArray(metadata.tags) && typeof metadata.tags !== 'string') {
        errors.push('tags must be an array or comma-separated string.');
    }
    if (typeof metadata.layerCount !== 'undefined') {
        var layerCount = Number(metadata.layerCount);
        if (!isFinite(layerCount) || layerCount < 0 || Math.floor(layerCount) !== layerCount) {
            errors.push('layerCount must be a non-negative integer.');
        }
    }
    if (metadata.created && isNaN(Date.parse(metadata.created))) {
        errors.push('created must be a valid ISO date.');
    }
    if (metadata.updated && isNaN(Date.parse(metadata.updated))) {
        errors.push('updated must be a valid ISO date.');
    }
    if (metadata.thumbnail && path.basename(metadata.thumbnail) !== metadata.thumbnail) {
        errors.push('thumbnail must be a filename, not a path.');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function normalizeMetadata(metadata, data, options) {
    options = options || {};
    metadata = metadata || {};
    data = data || {};
    var layers = Array.isArray(data.layers) ? data.layers : [];
    var now = isoNow(options.clock || defaultClock);
    var created = metadata.created && !isNaN(Date.parse(metadata.created))
        ? new Date(metadata.created).toISOString()
        : now;
    var result = {
        id: stringValue(metadata.id, options.id || ''),
        name: stringValue(metadata.name, 'Untitled Asset'),
        category: stringValue(metadata.category, 'Uncategorized'),
        tags: normalizeTags(metadata.tags),
        description: stringValue(metadata.description, ''),
        created: created,
        afterEffectsVersion: stringValue(metadata.afterEffectsVersion, ''),
        layerCount: typeof metadata.layerCount === 'undefined'
            ? layers.length
            : Math.max(0, Math.floor(Number(metadata.layerCount) || 0)),
        thumbnail: path.basename(stringValue(metadata.thumbnail, 'preview.png')) || 'preview.png'
    };

    if (metadata.updated) {
        result.updated = !isNaN(Date.parse(metadata.updated))
            ? new Date(metadata.updated).toISOString()
            : now;
    }
    if (typeof metadata.favorite !== 'undefined') {
        result.favorite = Boolean(metadata.favorite);
    }
    return result;
}

function normalizeData(data) {
    if (Array.isArray(data)) {
        data = {
            layers: data
        };
    }
    if (!utils.isPlainObject(data)) {
        throw new TypeError('Asset data must be a plain object or layer array.');
    }

    var normalized = utils.stableClone(data);
    if (!normalized.schema) {
        normalized.schema = 'oplus.asset-data';
    }
    normalized.schemaVersion = Number(normalized.schemaVersion) || SCHEMA_VERSION;
    if (!Array.isArray(normalized.layers)) {
        normalized.layers = [];
    }
    normalized.layerCount = normalized.layers.length;
    return normalized;
}

function validateData(data) {
    var errors = [];
    if (!utils.isPlainObject(data)) {
        errors.push('Asset data must be a plain object.');
    } else {
        errors = errors.concat(inspectJsonTree(data));
        if (typeof data.schemaVersion !== 'undefined' &&
            (!isFinite(Number(data.schemaVersion)) || Number(data.schemaVersion) < 1)) {
            errors.push('schemaVersion must be a positive number.');
        }
        if (typeof data.layers !== 'undefined' && !Array.isArray(data.layers)) {
            errors.push('layers must be an array.');
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

function previewBufferFromInput(input, options) {
    options = options || {};
    if (!input) {
        return Buffer.from(DEFAULT_PREVIEW_PNG);
    }
    if (Buffer.isBuffer(input)) {
        return Buffer.from(input);
    }
    if (typeof input !== 'string') {
        throw new TypeError('Preview must be a Buffer, file path, base64 string, or data URL.');
    }
    if (input.indexOf('data:image/png;base64,') === 0) {
        return Buffer.from(input.slice('data:image/png;base64,'.length), 'base64');
    }
    if (options.previewEncoding === 'base64') {
        return Buffer.from(input, 'base64');
    }
    return fs.readFileSync(path.resolve(input));
}

function assertPng(buffer, maxBytes) {
    if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) {
        throw new Error('Preview is not a valid PNG file.');
    }
    if (maxBytes && buffer.length > maxBytes) {
        throw new Error('Preview exceeds the maximum size of ' + maxBytes + ' bytes.');
    }
    for (var index = 0; index < PNG_SIGNATURE.length; index += 1) {
        if (buffer[index] !== PNG_SIGNATURE[index]) {
            throw new Error('Preview does not have a PNG signature.');
        }
    }
    return true;
}

function Serializer(options) {
    options = options || {};
    this.logger = options.logger || {
        info: function () {},
        error: function () {}
    };
    this.clock = typeof options.clock === 'function' ? options.clock : defaultClock;
    this.maxPreviewBytes = Number(options.maxPreviewBytes) > 0
        ? Number(options.maxPreviewBytes)
        : 25 * 1024 * 1024;
}

Serializer.prototype.prepareBundle = function (bundle, options) {
    options = options || {};
    bundle = bundle || {};
    var data = normalizeData(bundle.data || bundle.layers || {});
    var metadata = normalizeMetadata(bundle.metadata || bundle.asset || bundle, data, {
        id: options.id,
        clock: this.clock
    });
    var metadataValidation = validateMetadata(metadata);
    var dataValidation = validateData(data);
    var errors = metadataValidation.errors.concat(dataValidation.errors);
    if (metadata.layerCount !== data.layers.length && options.enforceLayerCount) {
        errors.push('layerCount does not match data.layers length.');
    } else {
        metadata.layerCount = data.layers.length;
    }
    if (errors.length) {
        var validationError = new Error('Asset bundle is invalid: ' + errors.join(' '));
        validationError.code = 'EASSETVALIDATION';
        validationError.validationErrors = errors;
        throw validationError;
    }

    var preview = previewBufferFromInput(bundle.preview || bundle.previewPath || null, options);
    assertPng(preview, this.maxPreviewBytes);
    return {
        metadata: metadata,
        data: data,
        preview: preview
    };
};

Serializer.prototype.validateBundle = function (bundle) {
    var errors = [];
    if (!bundle || typeof bundle !== 'object') {
        return {
            valid: false,
            errors: ['Asset bundle is required.']
        };
    }
    errors = errors.concat(validateMetadata(bundle.metadata || {}).errors);
    errors = errors.concat(validateData(bundle.data || {}).errors);
    if (bundle.preview) {
        try {
            assertPng(previewBufferFromInput(bundle.preview), this.maxPreviewBytes);
        } catch (error) {
            errors.push(error.message);
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors
    };
};

Serializer.prototype.writeAssetBundle = function (assetDirectory, bundle, options) {
    options = options || {};
    var directory = utils.normalizeAbsolutePath(assetDirectory, {
        label: 'Asset directory',
        disallowFileSystemRoot: true
    });
    if (options.root) {
        utils.assertPathInside(options.root, directory, false, 'Asset directory');
    }
    var prepared = options.prepared ? bundle : this.prepareBundle(bundle, options);
    utils.ensureDirectory(directory);
    utils.writeJsonAtomic(path.join(directory, 'asset.json'), prepared.metadata);
    utils.writeJsonAtomic(path.join(directory, 'data.json'), prepared.data);
    utils.writeBufferAtomic(path.join(directory, 'preview.png'), prepared.preview || DEFAULT_PREVIEW_PNG);
    this.logger.info('serializer.write', {
        assetId: prepared.metadata.id,
        context: {
            directory: directory,
            layerCount: prepared.metadata.layerCount
        }
    });
    return {
        directory: directory,
        metadata: prepared.metadata,
        data: prepared.data,
        previewPath: path.join(directory, 'preview.png')
    };
};

Serializer.prototype.readAssetBundle = function (assetDirectory, options) {
    options = options || {};
    var directory = utils.normalizeAbsolutePath(assetDirectory, {
        label: 'Asset directory',
        disallowFileSystemRoot: true
    });
    if (options.root) {
        utils.assertPathInside(options.root, directory, false, 'Asset directory');
    }
    var metadata = utils.readJsonFile(path.join(directory, 'asset.json'), {
        requireObject: true
    });
    var data = utils.readJsonFile(path.join(directory, 'data.json'), {
        requireObject: true
    });
    var validation = {
        metadata: validateMetadata(metadata),
        data: validateData(data)
    };
    var errors = validation.metadata.errors.concat(validation.data.errors);
    if (errors.length && options.strict !== false) {
        var error = new Error('Stored asset is invalid: ' + errors.join(' '));
        error.code = 'EASSETCORRUPT';
        error.validationErrors = errors;
        throw error;
    }

    var previewPath = path.join(directory, path.basename(metadata.thumbnail || 'preview.png'));
    return {
        metadata: metadata,
        data: data,
        previewPath: previewPath,
        previewExists: fs.existsSync(previewPath),
        validation: validation
    };
};

Serializer.prototype.parseHostPayload = function (payload) {
    var parsed = payload;
    if (typeof payload === 'string') {
        var source = payload.trim();
        if (!source) {
            throw new Error('Host returned an empty response.');
        }
        try {
            parsed = JSON.parse(source);
        } catch (error) {
            var wrapped = new Error('Host returned malformed JSON: ' + error.message);
            wrapped.code = 'EHOSTJSON';
            wrapped.raw = source;
            throw wrapped;
        }
    }
    if (!utils.isPlainObject(parsed)) {
        throw new Error('Host response must be an object.');
    }
    return parsed;
};

Serializer.prototype.stringify = function (value) {
    return utils.stringifyJson(value, 0).trim();
};

Serializer.SCHEMA_VERSION = SCHEMA_VERSION;
Serializer.DEFAULT_PREVIEW_PNG = DEFAULT_PREVIEW_PNG;
Serializer.PNG_SIGNATURE = PNG_SIGNATURE;
Serializer.REQUIRED_METADATA_FIELDS = REQUIRED_METADATA_FIELDS;
Serializer.assertPng = assertPng;
Serializer.inspectJsonTree = inspectJsonTree;
Serializer.normalizeData = normalizeData;
Serializer.normalizeMetadata = normalizeMetadata;
Serializer.normalizeTags = normalizeTags;
Serializer.validateData = validateData;
Serializer.validateMetadata = validateMetadata;

module.exports = Serializer;
