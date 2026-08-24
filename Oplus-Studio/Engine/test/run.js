'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Engine = require('..');

var tests = [];
var passed = 0;
var failed = 0;
var temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oplus-engine-'));

function test(name, callback) {
    tests.push({
        name: name,
        callback: callback
    });
}

function removeTemporaryRoot() {
    try {
        if (fs.existsSync(temporaryRoot)) {
            Engine.fsUtils.removeTreeSafe(os.tmpdir(), temporaryRoot);
        }
    } catch (error) {
        process.stderr.write('Could not clean temporary test directory: ' + error.message + '\n');
    }
}

function expectThrow(callback, messagePart) {
    var thrown = null;
    try {
        callback();
    } catch (error) {
        thrown = error;
    }
    assert.ok(thrown, 'Expected function to throw.');
    if (messagePart) {
        assert.ok(
            thrown.message.indexOf(messagePart) !== -1,
            'Expected error message to contain "' + messagePart + '", received "' + thrown.message + '".'
        );
    }
    return thrown;
}

process.on('exit', removeTemporaryRoot);

var databaseDir = path.join(temporaryRoot, 'Database');
var logsPath = path.join(temporaryRoot, 'Logs', 'oplus.log');
var libraryContainer = path.join(temporaryRoot, 'User Library');
var ids = ['asset-001', 'asset-002', 'asset-003'];
var idIndex = 0;
var clockTick = 0;

function clock() {
    clockTick += 1;
    return new Date(Date.UTC(2026, 0, 1, 0, 0, clockTick));
}

var engines = Engine.createEngines({
    projectRoot: temporaryRoot,
    databaseDir: databaseDir,
    logPath: logsPath,
    idGenerator: function () {
        var id = ids[idIndex];
        idIndex += 1;
        return id;
    },
    clock: clock
});

test('initializes default database without inventing a Documents path', function () {
    var settings = engines.library.getSettings();
    assert.strictEqual(settings.libraryPath, '');
    assert.strictEqual(settings.autoThumbnail, true);
    assert.strictEqual(settings.defaultImportMode, 'original');
    assert.strictEqual(engines.library.status().configured, false);
    assert.ok(fs.existsSync(path.join(databaseDir, 'settings.json')));
    assert.ok(fs.existsSync(path.join(databaseDir, 'library.json')));
});

test('rejects traversal, invalid ids, and unsafe removal roots', function () {
    expectThrow(function () {
        Engine.fsUtils.safeJoin(temporaryRoot, '..', 'escape');
    }, 'escapes');
    expectThrow(function () {
        Engine.fsUtils.assertAssetId('../asset');
    }, 'Asset id');
    expectThrow(function () {
        Engine.fsUtils.removeTreeSafe(temporaryRoot, temporaryRoot);
    }, 'escapes');
    assert.strictEqual(Engine.fsUtils.sanitizeFolderName('.Hidden Asset'), 'Hidden Asset');
});

test('persists and creates a configured library location', function () {
    var configured = engines.library.configureLibrary(libraryContainer);
    assert.strictEqual(configured.settings.libraryPath, path.resolve(libraryContainer));
    assert.ok(fs.statSync(path.join(libraryContainer, 'Library')).isDirectory());
    var persisted = JSON.parse(fs.readFileSync(path.join(databaseDir, 'settings.json'), 'utf8'));
    assert.strictEqual(persisted.libraryPath, path.resolve(libraryContainer));
    var aliased = engines.library.saveSettings({
        defaultImportMode: 'centerComposition'
    });
    assert.strictEqual(aliased.defaultImportMode, 'center');
    assert.strictEqual(
        JSON.parse(fs.readFileSync(path.join(databaseDir, 'settings.json'), 'utf8')).defaultImportMode,
        'center'
    );
    engines.library.saveSettings({
        defaultImportMode: 'original'
    });
});

test('creates a complete validated asset bundle atomically', function () {
    var record = engines.library.create({
        metadata: {
            name: 'Lower Third / Primary',
            category: 'Text',
            tags: ['Title', 'lower third', 'title'],
            description: 'Production lower third.',
            afterEffectsVersion: '25.0'
        },
        data: {
            schema: 'oplus.asset-data',
            schemaVersion: 1,
            composition: {
                width: 1920,
                height: 1080
            },
            layers: [{
                name: 'Headline',
                type: 'text',
                index: 1,
                transform: {
                    position: [960, 540]
                }
            }]
        }
    });
    assert.strictEqual(record.id, 'asset-001');
    assert.strictEqual(record.layerCount, 1);
    assert.deepStrictEqual(record.tags, ['Title', 'lower third']);
    var directory = engines.library.getAssetDirectory(record.id);
    assert.ok(fs.existsSync(path.join(directory, 'asset.json')));
    assert.ok(fs.existsSync(path.join(directory, 'data.json')));
    assert.ok(fs.existsSync(path.join(directory, 'preview.png')));
    assert.strictEqual(engines.library.validateAsset(record.id).valid, true);
});

test('supports list, search, category, tags, update, and favorites', function () {
    assert.strictEqual(engines.library.list().length, 1);
    assert.strictEqual(engines.library.search('production').length, 1);
    assert.strictEqual(engines.library.list({ category: 'text' }).length, 1);
    assert.strictEqual(engines.library.list({ tags: ['TITLE'] }).length, 1);
    assert.strictEqual(engines.library.list({ favoritesOnly: true }).length, 0);
    var favorite = engines.library.toggleFavorite('asset-001', true);
    assert.strictEqual(favorite.favorite, true);
    assert.strictEqual(engines.library.list({ favoritesOnly: true }).length, 1);
    var updated = engines.library.update('asset-001', {
        description: 'Updated description'
    });
    assert.strictEqual(updated.description, 'Updated description');
});

test('reads, validates, and exposes preview data', function () {
    var descriptor = engines.previews.describe('asset-001');
    assert.strictEqual(descriptor.formats.png.exists, true);
    assert.strictEqual(descriptor.formats.gif.status, 'reserved');
    var dataUrl = engines.previews.read('asset-001', {
        encoding: 'dataUrl'
    });
    assert.ok(dataUrl.indexOf('data:image/png;base64,') === 0);
    assert.strictEqual(engines.previews.validate(dataUrl, 'png').valid, true);
    var hostRequest = engines.previews.createHostRequest('asset-001', {
        width: 800,
        height: 450
    });
    assert.strictEqual(hostRequest.options.width, 800);
    assert.strictEqual(hostRequest.options.height, 450);
    expectThrow(function () {
        engines.previews.write('asset-001', Buffer.from('not a gif'), {
            format: 'gif'
        });
    }, 'reserved');
});

test('reads the CEP UI catalog folder field as a relativePath compatibility alias', function () {
    var catalogPath = path.join(databaseDir, 'library.json');
    var catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    catalog.assets.forEach(function (asset) {
        delete asset.relativePath;
    });
    Engine.fsUtils.writeJsonAtomic(catalogPath, catalog);
    assert.strictEqual(engines.library.getAsset('asset-001').relativePath.indexOf('Library/'), 0);
    assert.ok(fs.existsSync(engines.library.getAssetDirectory('asset-001')));
});

test('builds an injection-safe import envelope and parses bridge results', function () {
    var request = engines.imports.prepare('asset-001', {
        mode: 'center-composition',
        currentTime: 4.5
    });
    assert.strictEqual(request.mode, 'center');
    assert.strictEqual(request.data.layers.length, 1);
    assert.strictEqual(request.options.currentTime, 4.5);
    var script = engines.imports.buildEvalScript('asset-001', {
        mode: 'currentTime'
    });
    assert.ok(script.indexOf('OPLUS_importAsset(') === 0);
    var callbackCalled = false;
    engines.imports.execute('asset-001', {
        mode: 'original'
    }, function (hostScript, callback) {
        assert.ok(hostScript.indexOf('OPLUS_importAsset(') === 0);
        callback(JSON.stringify({
            ok: true,
            data: {
                importedLayerCount: 1
            }
        }));
    }, function (error, result) {
        assert.ifError(error);
        assert.strictEqual(result.data.importedLayerCount, 1);
        callbackCalled = true;
    });
    assert.strictEqual(callbackCalled, true);
    expectThrow(function () {
        engines.imports.prepare('asset-001', {
            mode: 'arbitraryMode'
        });
    }, 'Unsupported import mode');
});

test('serializer rejects corrupt and non-JSON data', function () {
    var circular = {};
    circular.self = circular;
    var validation = Engine.Serializer.validateData({
        schemaVersion: 1,
        layers: [],
        circular: circular
    });
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.some(function (message) {
        return message.indexOf('circular') !== -1;
    }));
    expectThrow(function () {
        engines.serializer.prepareBundle({
            metadata: {
                id: 'asset-bad',
                name: 'Bad'
            },
            data: {
                layers: [{
                    value: Infinity
                }]
            }
        });
    }, 'non-finite');
});

test('atomic JSON replacement never leaves a temporary target', function () {
    var jsonPath = path.join(temporaryRoot, 'atomic', 'value.json');
    Engine.fsUtils.writeJsonAtomic(jsonPath, {
        value: 1
    });
    Engine.fsUtils.writeJsonAtomic(jsonPath, {
        value: 2
    });
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(jsonPath, 'utf8')), {
        value: 2
    });
    var leftovers = fs.readdirSync(path.dirname(jsonPath)).filter(function (name) {
        return name.indexOf('.tmp') !== -1;
    });
    assert.deepStrictEqual(leftovers, []);
});

test('refresh reconstructs the catalog from on-disk asset bundles', function () {
    Engine.fsUtils.writeJsonAtomic(path.join(databaseDir, 'library.json'), {
        schemaVersion: 1,
        revision: 50,
        updatedAt: null,
        assets: []
    });
    assert.strictEqual(engines.library.list().length, 0);
    var refreshed = engines.library.refresh();
    assert.strictEqual(refreshed.assets.length, 1);
    assert.deepStrictEqual(refreshed.errors, []);
    assert.strictEqual(refreshed.assets[0].id, 'asset-001');
});

test('soft delete removes catalog entry and keeps a recoverable trash copy', function () {
    var result = engines.library.delete('asset-001');
    assert.strictEqual(result.deleted, true);
    assert.strictEqual(result.permanent, false);
    assert.ok(result.trashPath);
    assert.ok(fs.existsSync(result.trashPath));
    assert.strictEqual(engines.library.list().length, 0);
});

test('logger writes structured required fields and survives bad destinations', function () {
    engines.logger.error('test.error', {
        assetId: 'asset-001',
        layer: 'Headline',
        property: 'Position',
        error: new Error('Example failure')
    });
    var entries = engines.logger.readEntries();
    assert.ok(entries.some(function (entry) {
        return entry.operation === 'test.error' &&
            entry.assetId === 'asset-001' &&
            entry.layer === 'Headline' &&
            entry.property === 'Position' &&
            entry.error.message === 'Example failure';
    }));
    var impossibleLogger = new Engine.Logger({
        filePath: temporaryRoot
    });
    assert.strictEqual(impossibleLogger.info('will.not.throw'), false);
});

tests.forEach(function (entry) {
    try {
        entry.callback();
        passed += 1;
        process.stdout.write('PASS ' + entry.name + '\n');
    } catch (error) {
        failed += 1;
        process.stderr.write('FAIL ' + entry.name + '\n');
        process.stderr.write((error.stack || error.message || String(error)) + '\n');
    }
});

process.stdout.write('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed) {
    process.exitCode = 1;
}
