'use strict';

var path = require('path');
var LibraryEngine = require('./LibraryEngine');
var ImportEngine = require('./ImportEngine');
var PreviewEngine = require('./PreviewEngine');
var Serializer = require('./Serializer');
var Logger = require('./Logger');
var fsUtils = require('./LibraryEngine/fs-utils');

function createEngines(options) {
    options = options || {};
    var projectRoot = path.resolve(options.projectRoot || path.join(__dirname, '..'));
    var logger = options.logger || new Logger({
        filePath: options.logPath || path.join(projectRoot, 'Logs', 'oplus.log'),
        maxBytes: options.maxLogBytes,
        maxBackups: options.maxLogBackups,
        clock: options.clock,
        console: options.console
    });
    var serializer = options.serializer || new Serializer({
        logger: logger,
        clock: options.clock,
        maxPreviewBytes: options.maxPreviewBytes
    });
    var library = options.libraryEngine || new LibraryEngine({
        projectRoot: projectRoot,
        databaseDir: options.databaseDir,
        settingsPath: options.settingsPath,
        catalogPath: options.catalogPath,
        logPath: options.logPath,
        logger: logger,
        serializer: serializer,
        clock: options.clock,
        idGenerator: options.idGenerator,
        maxPreviewBytes: options.maxPreviewBytes
    });
    var previews = options.previewEngine || new PreviewEngine({
        libraryEngine: library,
        logger: logger,
        maxPreviewBytes: options.maxPreviewBytes
    });
    var imports = options.importEngine || new ImportEngine({
        libraryEngine: library,
        serializer: serializer,
        logger: logger,
        clock: options.clock,
        hostFunction: options.importHostFunction
    });

    if (options.initialize !== false) {
        library.initialize({
            createLibrary: options.createLibrary !== false,
            refresh: Boolean(options.refresh)
        });
    }
    return {
        library: library,
        imports: imports,
        previews: previews,
        serializer: serializer,
        logger: logger
    };
}

module.exports = {
    createEngines: createEngines,
    LibraryEngine: LibraryEngine,
    ImportEngine: ImportEngine,
    PreviewEngine: PreviewEngine,
    Serializer: Serializer,
    Logger: Logger,
    fsUtils: fsUtils
};
