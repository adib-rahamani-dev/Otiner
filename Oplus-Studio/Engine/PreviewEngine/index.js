'use strict';

var fs = require('fs');
var path = require('path');
var Serializer = require('../Serializer');

var FORMATS = Object.freeze({
    png: {
        filename: 'preview.png',
        mimeType: 'image/png',
        status: 'supported'
    },
    gif: {
        filename: 'preview.gif',
        mimeType: 'image/gif',
        status: 'reserved'
    },
    mp4: {
        filename: 'preview.mp4',
        mimeType: 'video/mp4',
        status: 'reserved'
    }
});

function normalizeFormat(format) {
    var value = String(format || 'png').toLowerCase();
    if (!FORMATS[value]) {
        throw new Error('Unsupported preview format: ' + value);
    }
    return value;
}

function PreviewEngine(options) {
    options = options || {};
    if (!options.libraryEngine) {
        throw new Error('PreviewEngine requires a LibraryEngine instance.');
    }
    this.library = options.libraryEngine;
    this.logger = options.logger || this.library.logger;
    this.maxPreviewBytes = Number(options.maxPreviewBytes) > 0
        ? Number(options.maxPreviewBytes)
        : 25 * 1024 * 1024;
}

PreviewEngine.prototype.getPath = function (assetId, format) {
    format = normalizeFormat(format);
    var directory = this.library.getAssetDirectory(assetId);
    return path.join(directory, FORMATS[format].filename);
};

PreviewEngine.prototype.describe = function (assetId) {
    var result = {
        assetId: assetId,
        formats: {}
    };
    var self = this;
    Object.keys(FORMATS).forEach(function (format) {
        var filePath = self.getPath(assetId, format);
        var exists = fs.existsSync(filePath);
        var size = exists ? fs.statSync(filePath).size : 0;
        result.formats[format] = {
            path: filePath,
            exists: exists,
            bytes: size,
            mimeType: FORMATS[format].mimeType,
            status: FORMATS[format].status
        };
    });
    return result;
};

PreviewEngine.prototype.validate = function (input, format) {
    format = normalizeFormat(format);
    var buffer;
    if (Buffer.isBuffer(input)) {
        buffer = input;
    } else if (typeof input === 'string') {
        if (input.indexOf('data:') === 0) {
            var comma = input.indexOf(',');
            if (comma === -1 || input.slice(0, comma).indexOf(';base64') === -1) {
                return {
                    valid: false,
                    errors: ['Preview data URL must use base64 encoding.']
                };
            }
            buffer = Buffer.from(input.slice(comma + 1), 'base64');
        } else {
            try {
                buffer = fs.readFileSync(path.resolve(input));
            } catch (error) {
                return {
                    valid: false,
                    errors: [error.message]
                };
            }
        }
    } else {
        return {
            valid: false,
            errors: ['Preview must be a Buffer, path, or base64 data URL.']
        };
    }

    var errors = [];
    if (buffer.length > this.maxPreviewBytes) {
        errors.push('Preview exceeds the maximum size of ' + this.maxPreviewBytes + ' bytes.');
    }
    if (format === 'png') {
        try {
            Serializer.assertPng(buffer, this.maxPreviewBytes);
        } catch (error) {
            errors.push(error.message);
        }
    } else if (format === 'gif') {
        var gifHeader = buffer.slice(0, 6).toString('ascii');
        if (gifHeader !== 'GIF87a' && gifHeader !== 'GIF89a') {
            errors.push('Preview does not have a GIF signature.');
        }
    } else if (format === 'mp4') {
        if (buffer.length < 12 || buffer.slice(4, 8).toString('ascii') !== 'ftyp') {
            errors.push('Preview does not have an MP4 file type box.');
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors,
        bytes: buffer.length,
        buffer: errors.length ? null : buffer
    };
};

PreviewEngine.prototype.write = function (assetId, input, options) {
    options = options || {};
    var format = normalizeFormat(options.format);
    if (format !== 'png') {
        var unsupported = new Error(
            format.toUpperCase() + ' preview storage is reserved but generation is not enabled in version 1.'
        );
        unsupported.code = 'EPREVIEWRESERVED';
        throw unsupported;
    }
    var validation = this.validate(input, format);
    if (!validation.valid) {
        var error = new Error('Invalid preview: ' + validation.errors.join(' '));
        error.code = 'EPREVIEW';
        error.validationErrors = validation.errors;
        throw error;
    }

    var record = this.library.update(assetId, {
        preview: validation.buffer
    });
    var previewPath = this.getPath(assetId, format);
    this.logger.info('preview.write', {
        assetId: assetId,
        context: {
            bytes: validation.bytes,
            path: previewPath
        }
    });
    return {
        asset: record,
        path: previewPath,
        bytes: validation.bytes,
        mimeType: FORMATS[format].mimeType
    };
};

PreviewEngine.prototype.read = function (assetId, options) {
    options = options || {};
    var format = normalizeFormat(options.format);
    var previewPath = this.getPath(assetId, format);
    var buffer = fs.readFileSync(previewPath);
    var validation = this.validate(buffer, format);
    if (!validation.valid) {
        throw new Error('Stored preview is invalid: ' + validation.errors.join(' '));
    }
    if (options.encoding === 'base64') {
        return buffer.toString('base64');
    }
    if (options.encoding === 'dataUrl') {
        return 'data:' + FORMATS[format].mimeType + ';base64,' + buffer.toString('base64');
    }
    return buffer;
};

PreviewEngine.prototype.createHostRequest = function (assetId, options) {
    options = options || {};
    var request = {
        assetId: assetId,
        format: 'png',
        outputPath: this.getPath(assetId, 'png'),
        options: {
            width: Math.max(16, Math.min(2048, Math.floor(Number(options.width) || 640))),
            height: Math.max(16, Math.min(2048, Math.floor(Number(options.height) || 360)))
        }
    };
    return request;
};

PreviewEngine.prototype.createEvalScript = function (assetId, options) {
    var request = this.createHostRequest(assetId, options);
    return 'OPLUS_generateThumbnail(' + JSON.stringify(JSON.stringify(request)) + ')';
};

PreviewEngine.FORMATS = FORMATS;
PreviewEngine.normalizeFormat = normalizeFormat;

PreviewEngine.prototype.getPreviewPath = PreviewEngine.prototype.getPath;
PreviewEngine.prototype.savePreview = PreviewEngine.prototype.write;
PreviewEngine.prototype.readPreview = PreviewEngine.prototype.read;

module.exports = PreviewEngine;
