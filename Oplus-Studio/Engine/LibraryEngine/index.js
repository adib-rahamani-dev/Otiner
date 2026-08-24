'use strict';

var fs = require('fs');
var path = require('path');
var Serializer = require('../Serializer');
var Logger = require('../Logger');
var utils = require('./fs-utils');

var DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: 1,
    libraryPath: '',
    autoThumbnail: true,
    defaultImportMode: 'original'
});
var DEFAULT_CATALOG = Object.freeze({
    schemaVersion: 1,
    revision: 0,
    updatedAt: null,
    assets: []
});
var IMPORT_MODES = [
    'original',
    'center',
    'currentTime',
    'originalTime',
    'replace'
];
var IMPORT_MODE_ALIASES = {
    keepOriginalPosition: 'original',
    centerComposition: 'center',
    keepOriginalTime: 'originalTime',
    replaceSelected: 'replace',
    replaceSelectedLayers: 'replace'
};
var EDITABLE_METADATA_FIELDS = [
    'name',
    'category',
    'tags',
    'description',
    'afterEffectsVersion',
    'favorite'
];

function defaultClock() {
    return new Date();
}

function clone(value) {
    return utils.stableClone(value);
}

function isoNow(clock) {
    var value = clock();
    if (!(value instanceof Date)) {
        value = new Date(value);
    }
    if (isNaN(value.getTime())) {
        throw new Error('Clock returned an invalid date.');
    }
    return value.toISOString();
}

function normalizeSettings(settings) {
    if (!utils.isPlainObject(settings)) {
        throw new Error('Settings must be a JSON object.');
    }
    var libraryPath = '';
    if (settings.libraryPath) {
        libraryPath = utils.normalizeAbsolutePath(String(settings.libraryPath), {
            label: 'Library path',
            disallowFileSystemRoot: true
        });
    }
    var defaultMode = settings.defaultImportMode || DEFAULT_SETTINGS.defaultImportMode;
    defaultMode = IMPORT_MODE_ALIASES[defaultMode] || defaultMode;
    if (IMPORT_MODES.indexOf(defaultMode) === -1) {
        throw new Error('Unsupported default import mode: ' + defaultMode);
    }
    return {
        schemaVersion: 1,
        libraryPath: libraryPath,
        autoThumbnail: typeof settings.autoThumbnail === 'undefined'
            ? DEFAULT_SETTINGS.autoThumbnail
            : Boolean(settings.autoThumbnail),
        defaultImportMode: defaultMode
    };
}

function validateCatalog(catalog) {
    var errors = [];
    if (!utils.isPlainObject(catalog)) {
        return ['Library catalog must be a JSON object.'];
    }
    if (!Array.isArray(catalog.assets)) {
        errors.push('Library catalog assets must be an array.');
        return errors;
    }
    var ids = {};
    catalog.assets.forEach(function (asset, index) {
        if (!utils.isPlainObject(asset)) {
            errors.push('Catalog asset at index ' + index + ' must be an object.');
            return;
        }
        if (!utils.validateAssetId(asset.id)) {
            errors.push('Catalog asset at index ' + index + ' has an invalid id.');
        } else if (ids[asset.id]) {
            errors.push('Catalog contains duplicate asset id ' + asset.id + '.');
        }
        ids[asset.id] = true;
        var hasRelativePath = typeof asset.relativePath === 'string' && asset.relativePath;
        var hasFolder = typeof asset.folder === 'string' && asset.folder;
        if (!hasRelativePath && !hasFolder) {
            errors.push('Catalog asset ' + (asset.id || index) + ' is missing relativePath or folder.');
        }
        if (hasFolder && (
            asset.folder === '.' ||
            asset.folder === '..' ||
            asset.folder.indexOf('/') !== -1 ||
            asset.folder.indexOf('\\') !== -1 ||
            asset.folder.indexOf('\x00') !== -1
        )) {
            errors.push('Catalog asset ' + (asset.id || index) + ' has an unsafe folder.');
        }
    });
    return errors;
}

function metadataToRecord(metadata, folderName) {
    return {
        id: metadata.id,
        name: metadata.name,
        category: metadata.category,
        tags: clone(metadata.tags || []),
        description: metadata.description || '',
        created: metadata.created,
        updated: metadata.updated || null,
        afterEffectsVersion: metadata.afterEffectsVersion || '',
        layerCount: Number(metadata.layerCount) || 0,
        thumbnail: metadata.thumbnail || 'preview.png',
        favorite: Boolean(metadata.favorite),
        folder: folderName,
        relativePath: ['Library', folderName].join('/')
    };
}

function compareAssets(left, right) {
    var leftName = String(left.name || '').toLowerCase();
    var rightName = String(right.name || '').toLowerCase();
    if (leftName < rightName) {
        return -1;
    }
    if (leftName > rightName) {
        return 1;
    }
    return String(left.id).localeCompare(String(right.id));
}

function LibraryEngine(options) {
    options = options || {};
    var projectRoot = path.resolve(options.projectRoot || path.join(__dirname, '..', '..'));
    this.databaseDir = path.resolve(options.databaseDir || path.join(projectRoot, 'Database'));
    this.settingsPath = path.resolve(options.settingsPath || path.join(this.databaseDir, 'settings.json'));
    this.catalogPath = path.resolve(options.catalogPath || path.join(this.databaseDir, 'library.json'));
    this.clock = typeof options.clock === 'function' ? options.clock : defaultClock;
    this.idGenerator = typeof options.idGenerator === 'function' ? options.idGenerator : utils.generateId;
    this.logger = options.logger || new Logger({
        filePath: options.logPath || path.join(projectRoot, 'Logs', 'oplus.log')
    });
    this.serializer = options.serializer || new Serializer({
        logger: this.logger,
        clock: this.clock,
        maxPreviewBytes: options.maxPreviewBytes
    });
    this._settings = null;
    this._catalog = null;
}

LibraryEngine.prototype.initialize = function (options) {
    options = options || {};
    utils.ensureDirectory(this.databaseDir);
    if (!fs.existsSync(this.settingsPath)) {
        utils.writeJsonAtomic(this.settingsPath, DEFAULT_SETTINGS);
    }
    if (!fs.existsSync(this.catalogPath)) {
        utils.writeJsonAtomic(this.catalogPath, DEFAULT_CATALOG);
    }
    this._settings = this._readSettings();
    this._catalog = this._readCatalog();

    if (this._settings.libraryPath && options.createLibrary !== false) {
        utils.ensureDirectory(this._settings.libraryPath);
        utils.ensureDirectory(this.getAssetsRoot());
    }
    if (this._settings.libraryPath && options.refresh) {
        this.refresh();
    }
    this.logger.info('library.initialize', {
        context: {
            databaseDir: this.databaseDir,
            libraryPath: this._settings.libraryPath || null
        }
    });
    return this.status();
};

LibraryEngine.prototype._ensureInitialized = function () {
    if (!this._settings || !this._catalog) {
        this.initialize();
    }
};

LibraryEngine.prototype._readSettings = function () {
    return normalizeSettings(utils.readJsonFile(this.settingsPath, {
        requireObject: true
    }));
};

LibraryEngine.prototype._readCatalog = function () {
    var source = utils.readJsonFile(this.catalogPath, {
        requireObject: true
    });
    var errors = validateCatalog(source);
    if (errors.length) {
        var error = new Error('Library catalog is invalid: ' + errors.join(' '));
        error.code = 'ECATALOG';
        error.validationErrors = errors;
        throw error;
    }
    return {
        schemaVersion: Number(source.schemaVersion) || 1,
        revision: Math.max(0, Math.floor(Number(source.revision) || 0)),
        updatedAt: source.updatedAt || null,
        assets: source.assets.map(function (asset) {
            var normalized = clone(asset);
            if (!normalized.relativePath && normalized.folder) {
                normalized.relativePath = ['Library', normalized.folder].join('/');
            }
            if (!normalized.folder && normalized.relativePath) {
                normalized.folder = String(normalized.relativePath).replace(/\\/g, '/').split('/').pop();
            }
            return normalized;
        })
    };
};

LibraryEngine.prototype._writeCatalog = function (assets) {
    var previous = this._readCatalog();
    var next = {
        schemaVersion: 1,
        revision: previous.revision + 1,
        updatedAt: isoNow(this.clock),
        assets: assets.map(function (asset) {
            return clone(asset);
        })
    };
    var errors = validateCatalog(next);
    if (errors.length) {
        throw new Error('Refusing to write invalid catalog: ' + errors.join(' '));
    }
    utils.writeJsonAtomic(this.catalogPath, next);
    this._catalog = next;
    return clone(next);
};

LibraryEngine.prototype.getSettings = function () {
    this._ensureInitialized();
    this._settings = this._readSettings();
    return clone(this._settings);
};

LibraryEngine.prototype.saveSettings = function (patch) {
    this._ensureInitialized();
    if (!utils.isPlainObject(patch)) {
        throw new TypeError('Settings patch must be a plain object.');
    }
    var current = this._readSettings();
    var merged = {
        schemaVersion: 1,
        libraryPath: utils.hasOwn(patch, 'libraryPath') ? patch.libraryPath : current.libraryPath,
        autoThumbnail: utils.hasOwn(patch, 'autoThumbnail') ? patch.autoThumbnail : current.autoThumbnail,
        defaultImportMode: utils.hasOwn(patch, 'defaultImportMode')
            ? patch.defaultImportMode
            : current.defaultImportMode
    };
    var normalized = normalizeSettings(merged);
    if (normalized.libraryPath) {
        utils.ensureDirectory(normalized.libraryPath);
        utils.ensureDirectory(utils.safeJoin(normalized.libraryPath, 'Library'));
    }
    utils.writeJsonAtomic(this.settingsPath, normalized);
    this._settings = normalized;
    this.logger.info('settings.save', {
        context: {
            libraryPath: normalized.libraryPath || null,
            autoThumbnail: normalized.autoThumbnail,
            defaultImportMode: normalized.defaultImportMode
        }
    });
    return clone(normalized);
};

LibraryEngine.prototype.configureLibrary = function (libraryPath, options) {
    options = options || {};
    var previousSettings = this.getSettings();
    var nextSettings = this.saveSettings({
        libraryPath: libraryPath,
        autoThumbnail: utils.hasOwn(options, 'autoThumbnail')
            ? options.autoThumbnail
            : previousSettings.autoThumbnail,
        defaultImportMode: options.defaultImportMode || previousSettings.defaultImportMode
    });
    var refreshResult = this.refresh();
    this.logger.info('library.configure', {
        context: {
            libraryPath: nextSettings.libraryPath,
            assetCount: refreshResult.assets.length
        }
    });
    return {
        settings: nextSettings,
        assets: refreshResult.assets,
        errors: refreshResult.errors
    };
};

LibraryEngine.prototype.getLibraryPath = function () {
    this._ensureInitialized();
    return this._settings.libraryPath || '';
};

LibraryEngine.prototype.getAssetsRoot = function () {
    this._ensureInitialized();
    if (!this._settings.libraryPath) {
        return '';
    }
    return utils.safeJoin(this._settings.libraryPath, 'Library');
};

LibraryEngine.prototype._requireLibrary = function () {
    var libraryPath = this.getLibraryPath();
    if (!libraryPath) {
        var error = new Error('Library location has not been configured.');
        error.code = 'ELIBRARYSETUP';
        throw error;
    }
    utils.ensureDirectory(libraryPath);
    var assetsRoot = utils.ensureDirectory(this.getAssetsRoot());
    return {
        libraryPath: libraryPath,
        assetsRoot: assetsRoot
    };
};

LibraryEngine.prototype.status = function () {
    this._ensureInitialized();
    var libraryPath = this.getLibraryPath();
    return {
        initialized: true,
        configured: Boolean(libraryPath),
        libraryPath: libraryPath,
        assetsRoot: libraryPath ? this.getAssetsRoot() : '',
        assetCount: this._catalog.assets.length,
        settingsPath: this.settingsPath,
        catalogPath: this.catalogPath,
        catalogRevision: this._catalog.revision
    };
};

LibraryEngine.prototype._catalogAssets = function () {
    this._catalog = this._readCatalog();
    return this._catalog.assets;
};

LibraryEngine.prototype.list = function (options) {
    options = options || {};
    var assets = this._catalogAssets().map(function (asset) {
        return clone(asset);
    });
    var category = options.category ? String(options.category).toLowerCase() : '';
    var query = options.query ? String(options.query).trim().toLowerCase() : '';
    var tags = Array.isArray(options.tags)
        ? options.tags.map(function (tag) { return String(tag).toLowerCase(); })
        : [];

    assets = assets.filter(function (asset) {
        if (options.favoritesOnly && !asset.favorite) {
            return false;
        }
        if (category && category !== 'all' && String(asset.category).toLowerCase() !== category) {
            return false;
        }
        var assetTags = (asset.tags || []).map(function (tag) {
            return String(tag).toLowerCase();
        });
        if (tags.length && !tags.every(function (tag) {
            return assetTags.indexOf(tag) !== -1;
        })) {
            return false;
        }
        if (query) {
            var haystack = [
                asset.name,
                asset.category,
                asset.description
            ].concat(asset.tags || []).join(' ').toLowerCase();
            if (haystack.indexOf(query) === -1) {
                return false;
            }
        }
        return true;
    });

    assets.sort(compareAssets);
    if (options.sort === 'createdDesc') {
        assets.sort(function (left, right) {
            return String(right.created).localeCompare(String(left.created));
        });
    }
    if (Number(options.limit) > 0) {
        assets = assets.slice(0, Math.floor(Number(options.limit)));
    }
    return assets;
};

LibraryEngine.prototype.search = function (query, options) {
    options = options || {};
    options.query = query;
    return this.list(options);
};

LibraryEngine.prototype.getAsset = function (id) {
    utils.assertAssetId(id);
    var assets = this._catalogAssets();
    for (var index = 0; index < assets.length; index += 1) {
        if (assets[index].id === id) {
            return clone(assets[index]);
        }
    }
    var error = new Error('Asset not found: ' + id);
    error.code = 'EASSETNOTFOUND';
    throw error;
};

LibraryEngine.prototype._resolveRecordDirectory = function (record) {
    var roots = this._requireLibrary();
    if (!record || typeof record.relativePath !== 'string') {
        throw new Error('Catalog record is missing a relative path.');
    }
    var normalizedRelative = record.relativePath.replace(/\\/g, '/');
    if (normalizedRelative.indexOf('Library/') !== 0 ||
        normalizedRelative.slice('Library/'.length).indexOf('/') !== -1) {
        throw new Error('Catalog record has an unsafe relative path.');
    }
    var directory = utils.safeJoin.apply(
        null,
        [roots.libraryPath].concat(normalizedRelative.split('/'))
    );
    utils.assertPathInside(roots.assetsRoot, directory, false, 'Asset directory');
    if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
        throw new Error('Asset directory cannot be a symbolic link.');
    }
    return directory;
};

LibraryEngine.prototype.getAssetDirectory = function (id) {
    return this._resolveRecordDirectory(this.getAsset(id));
};

LibraryEngine.prototype.readAsset = function (id, options) {
    options = options || {};
    var record = this.getAsset(id);
    var directory = this._resolveRecordDirectory(record);
    var bundle = this.serializer.readAssetBundle(directory, {
        root: this.getAssetsRoot(),
        strict: options.strict !== false
    });
    bundle.record = record;
    bundle.directory = directory;
    return bundle;
};

LibraryEngine.prototype._chooseFolderName = function (name, id) {
    var assetsRoot = this._requireLibrary().assetsRoot;
    var baseName = utils.sanitizeFolderName(name);
    var candidate = baseName;
    var suffix = 1;
    while (fs.existsSync(utils.safeJoin(assetsRoot, candidate))) {
        if (suffix === 1) {
            candidate = baseName + '-' + String(id).replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
        } else {
            candidate = baseName + '-' + suffix;
        }
        suffix += 1;
    }
    return candidate;
};

LibraryEngine.prototype.create = function (bundle, options) {
    options = options || {};
    var roots = this._requireLibrary();
    bundle = bundle || {};
    var suppliedMetadata = bundle.metadata || bundle.asset || bundle;
    var id = suppliedMetadata.id || this.idGenerator();
    utils.assertAssetId(id);
    if (this._catalogAssets().some(function (asset) { return asset.id === id; })) {
        var duplicateError = new Error('Asset id already exists: ' + id);
        duplicateError.code = 'EASSETEXISTS';
        throw duplicateError;
    }

    var prepared;
    try {
        prepared = this.serializer.prepareBundle({
            metadata: suppliedMetadata,
            data: bundle.data || bundle.layers || {},
            preview: bundle.preview || bundle.previewPath || null
        }, {
            id: id,
            previewEncoding: options.previewEncoding,
            enforceLayerCount: options.enforceLayerCount
        });
        prepared.metadata.id = id;
        var folderName = this._chooseFolderName(prepared.metadata.name, id);
        var finalDirectory = utils.safeJoin(roots.assetsRoot, folderName);
        var stagingDirectory = utils.safeJoin(
            roots.assetsRoot,
            '.oplus-stage-' + id.replace(/[^A-Za-z0-9]/g, '') + '-' + utils.randomToken(4)
        );
        var moved = false;
        try {
            utils.ensureDirectory(stagingDirectory);
            this.serializer.writeAssetBundle(stagingDirectory, prepared, {
                root: roots.assetsRoot,
                prepared: true
            });
            fs.renameSync(stagingDirectory, finalDirectory);
            moved = true;
            var record = metadataToRecord(prepared.metadata, folderName);
            var assets = this._catalogAssets();
            assets.push(record);
            this._writeCatalog(assets);
            this.logger.info('library.create', {
                assetId: id,
                context: {
                    name: record.name,
                    relativePath: record.relativePath,
                    layerCount: record.layerCount
                }
            });
            return clone(record);
        } catch (error) {
            try {
                if (moved && fs.existsSync(finalDirectory)) {
                    utils.removeTreeSafe(roots.assetsRoot, finalDirectory);
                } else if (fs.existsSync(stagingDirectory)) {
                    utils.removeTreeSafe(roots.assetsRoot, stagingDirectory);
                }
            } catch (cleanupError) {
                this.logger.error('library.create.cleanup', {
                    assetId: id,
                    error: cleanupError
                });
            }
            throw error;
        }
    } catch (error) {
        this.logger.error('library.create', {
            assetId: id,
            error: error
        });
        throw error;
    }
};

LibraryEngine.prototype.update = function (id, patch, options) {
    options = options || {};
    utils.assertAssetId(id);
    if (!utils.isPlainObject(patch)) {
        throw new TypeError('Asset patch must be a plain object.');
    }
    var stored = this.readAsset(id);
    var metadata = clone(stored.metadata);
    EDITABLE_METADATA_FIELDS.forEach(function (field) {
        if (utils.hasOwn(patch, field)) {
            metadata[field] = patch[field];
        }
    });
    metadata.id = id;
    metadata.created = stored.metadata.created;
    metadata.updated = isoNow(this.clock);
    var data = utils.hasOwn(patch, 'data') ? patch.data : stored.data;
    var preview = null;
    if (utils.hasOwn(patch, 'preview')) {
        preview = patch.preview;
    } else if (utils.hasOwn(patch, 'previewPath')) {
        preview = patch.previewPath;
    } else {
        preview = fs.readFileSync(stored.previewPath);
    }
    var prepared = this.serializer.prepareBundle({
        metadata: metadata,
        data: data,
        preview: preview
    }, {
        id: id,
        previewEncoding: options.previewEncoding,
        enforceLayerCount: options.enforceLayerCount
    });
    this.serializer.writeAssetBundle(stored.directory, prepared, {
        root: this.getAssetsRoot(),
        prepared: true
    });

    var folderName = path.basename(stored.directory);
    var nextRecord = metadataToRecord(prepared.metadata, folderName);
    var assets = this._catalogAssets().map(function (record) {
        return record.id === id ? nextRecord : record;
    });
    this._writeCatalog(assets);
    this.logger.info('library.update', {
        assetId: id,
        context: {
            name: nextRecord.name
        }
    });
    return clone(nextRecord);
};

LibraryEngine.prototype.toggleFavorite = function (id, favorite) {
    var current = this.getAsset(id);
    var nextValue = typeof favorite === 'undefined' ? !current.favorite : Boolean(favorite);
    return this.update(id, {
        favorite: nextValue
    });
};

LibraryEngine.prototype.delete = function (id, options) {
    options = options || {};
    var roots = this._requireLibrary();
    var record = this.getAsset(id);
    var directory = this._resolveRecordDirectory(record);
    var trashRoot = utils.ensureDirectory(utils.safeJoin(roots.libraryPath, '.Trash'));
    var trashName = path.basename(directory) + '-' +
        new Date().toISOString().replace(/[:.]/g, '-') + '-' + utils.randomToken(3);
    var trashDirectory = utils.safeJoin(trashRoot, trashName);
    var moved = false;

    try {
        if (fs.existsSync(directory)) {
            fs.renameSync(directory, trashDirectory);
            moved = true;
        }
        var assets = this._catalogAssets().filter(function (asset) {
            return asset.id !== id;
        });
        this._writeCatalog(assets);
    } catch (error) {
        if (moved && fs.existsSync(trashDirectory) && !fs.existsSync(directory)) {
            try {
                fs.renameSync(trashDirectory, directory);
            } catch (restoreError) {
                this.logger.error('library.delete.restore', {
                    assetId: id,
                    error: restoreError
                });
            }
        }
        this.logger.error('library.delete', {
            assetId: id,
            error: error
        });
        throw error;
    }

    var permanent = Boolean(options.permanent);
    if (permanent && moved) {
        utils.removeTreeSafe(trashRoot, trashDirectory);
    }
    this.logger.info('library.delete', {
        assetId: id,
        context: {
            permanent: permanent,
            trashPath: moved && !permanent ? trashDirectory : null
        }
    });
    return {
        deleted: true,
        id: id,
        permanent: permanent,
        trashPath: moved && !permanent ? trashDirectory : null
    };
};

LibraryEngine.prototype.refresh = function () {
    var roots = this._requireLibrary();
    var assets = [];
    var errors = [];
    var seenIds = {};
    var self = this;
    fs.readdirSync(roots.assetsRoot).sort().forEach(function (folderName) {
        if (!folderName || folderName.charAt(0) === '.') {
            return;
        }
        var directory = utils.safeJoin(roots.assetsRoot, folderName);
        var stat;
        try {
            stat = fs.lstatSync(directory);
            if (!stat.isDirectory() || stat.isSymbolicLink()) {
                return;
            }
            var bundle = self.serializer.readAssetBundle(directory, {
                root: roots.assetsRoot,
                strict: false
            });
            var metadataValidation = Serializer.validateMetadata(bundle.metadata);
            var dataValidation = Serializer.validateData(bundle.data);
            var validationErrors = metadataValidation.errors.concat(dataValidation.errors);
            if (validationErrors.length) {
                throw new Error(validationErrors.join(' '));
            }
            if (seenIds[bundle.metadata.id]) {
                throw new Error('Duplicate asset id ' + bundle.metadata.id + '.');
            }
            seenIds[bundle.metadata.id] = true;
            assets.push(metadataToRecord(bundle.metadata, folderName));
        } catch (error) {
            errors.push({
                folder: folderName,
                error: error.message
            });
            self.logger.error('library.refresh.asset', {
                error: error,
                context: {
                    folder: folderName
                }
            });
        }
    });
    assets.sort(compareAssets);
    this._writeCatalog(assets);
    this.logger.info('library.refresh', {
        context: {
            assetCount: assets.length,
            errorCount: errors.length
        }
    });
    return {
        assets: clone(assets),
        errors: errors
    };
};

LibraryEngine.prototype.validateAsset = function (id) {
    var errors = [];
    var bundle;
    try {
        bundle = this.readAsset(id, {
            strict: false
        });
        errors = errors.concat(bundle.validation.metadata.errors);
        errors = errors.concat(bundle.validation.data.errors);
        if (!bundle.previewExists) {
            errors.push('Preview file is missing.');
        } else {
            try {
                Serializer.assertPng(fs.readFileSync(bundle.previewPath), this.serializer.maxPreviewBytes);
            } catch (error) {
                errors.push(error.message);
            }
        }
        if (bundle.metadata.layerCount !== bundle.data.layers.length) {
            errors.push('asset.json layerCount does not match data.json layers.');
        }
    } catch (error) {
        errors.push(error.message);
    }
    return {
        valid: errors.length === 0,
        errors: errors,
        asset: bundle ? clone(bundle.metadata) : null
    };
};

LibraryEngine.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
LibraryEngine.DEFAULT_CATALOG = DEFAULT_CATALOG;
LibraryEngine.IMPORT_MODES = IMPORT_MODES;
LibraryEngine.IMPORT_MODE_ALIASES = IMPORT_MODE_ALIASES;
LibraryEngine.normalizeSettings = normalizeSettings;
LibraryEngine.validateCatalog = validateCatalog;

LibraryEngine.prototype.createAsset = LibraryEngine.prototype.create;
LibraryEngine.prototype.updateAsset = LibraryEngine.prototype.update;
LibraryEngine.prototype.deleteAsset = LibraryEngine.prototype.delete;
LibraryEngine.prototype.listAssets = LibraryEngine.prototype.list;

module.exports = LibraryEngine;
