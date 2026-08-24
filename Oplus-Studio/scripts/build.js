'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var projectRoot = path.resolve(__dirname, '..');
var extensionSource = path.join(projectRoot, 'Extension');
var engineSource = path.join(projectRoot, 'Engine');
var databaseSource = path.join(projectRoot, 'Database');
var distRoot = path.join(projectRoot, 'dist');
var bundleName = 'studio.oplus.ae';
var bundleRoot = path.join(distRoot, bundleName);
var argumentsList = process.argv.slice(2);

function assertInside(root, candidate, allowRoot) {
    var resolvedRoot = path.resolve(root);
    var resolvedCandidate = path.resolve(candidate);
    if (allowRoot && resolvedRoot === resolvedCandidate) {
        return;
    }
    var relative = path.relative(resolvedRoot, resolvedCandidate);
    if (!relative || relative === '..' || relative.indexOf('..' + path.sep) === 0 || path.isAbsolute(relative)) {
        throw new Error('Unsafe build path: ' + resolvedCandidate);
    }
}

function removeTree(root, target) {
    assertInside(root, target, false);
    if (!fs.existsSync(target)) {
        return;
    }
    var stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
        fs.unlinkSync(target);
        return;
    }
    fs.readdirSync(target).forEach(function (name) {
        removeTree(root, path.join(target, name));
    });
    fs.rmdirSync(target);
}

function copyTree(source, target, options) {
    options = options || {};
    var stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
        throw new Error('Build sources cannot contain symbolic links: ' + source);
    }
    if (!stat.isDirectory()) {
        fs.mkdirSync(path.dirname(target), {
            recursive: true
        });
        fs.copyFileSync(source, target);
        fs.chmodSync(target, stat.mode);
        return;
    }
    fs.mkdirSync(target, {
        recursive: true
    });
    fs.readdirSync(source).sort().forEach(function (name) {
        if (options.exclude && options.exclude(source, name)) {
            return;
        }
        copyTree(path.join(source, name), path.join(target, name), options);
    });
}

function requireDirectory(directoryPath, label) {
    if (!fs.existsSync(directoryPath) || !fs.statSync(directoryPath).isDirectory()) {
        throw new Error(label + ' is missing: ' + directoryPath);
    }
}

function runChecks() {
    if (argumentsList.indexOf('--skip-check') !== -1) {
        return;
    }
    var result = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'check.js')], {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: 'inherit'
    });
    if (result.status !== 0) {
        throw new Error('Contract checks failed; build was not created.');
    }
}

function main() {
    requireDirectory(extensionSource, 'Extension source');
    requireDirectory(engineSource, 'Engine source');
    requireDirectory(databaseSource, 'Database defaults');
    runChecks();

    assertInside(projectRoot, distRoot, false);
    if (fs.existsSync(distRoot)) {
        if (fs.lstatSync(distRoot).isSymbolicLink()) {
            throw new Error('Refusing to clean a symbolic-link dist directory.');
        }
        removeTree(projectRoot, distRoot);
    }
    if (argumentsList.indexOf('--clean-only') !== -1) {
        process.stdout.write('Removed ' + distRoot + '\n');
        return;
    }

    fs.mkdirSync(bundleRoot, {
        recursive: true
    });
    copyTree(extensionSource, bundleRoot);
    copyTree(engineSource, path.join(bundleRoot, 'Engine'), {
        exclude: function (parent, name) {
            return path.resolve(parent) === path.resolve(engineSource) && name === 'test';
        }
    });
    copyTree(databaseSource, path.join(bundleRoot, 'Database'));
    fs.mkdirSync(path.join(bundleRoot, 'Logs'), {
        recursive: true
    });
    fs.mkdirSync(path.join(bundleRoot, 'Cache'), {
        recursive: true
    });

    var packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    var buildInfo = {
        name: packageJson.name,
        version: packageJson.version,
        bundleId: bundleName,
        target: 'After Effects 2025',
        cepRuntime: 12
    };
    fs.writeFileSync(
        path.join(bundleRoot, 'build-info.json'),
        JSON.stringify(buildInfo, null, 2) + '\n',
        'utf8'
    );
    process.stdout.write('Built CEP extension at ' + bundleRoot + '\n');
}

try {
    main();
} catch (error) {
    process.stderr.write('Build failed: ' + error.message + '\n');
    process.exitCode = 1;
}
