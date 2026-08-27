'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var projectRoot = path.resolve(__dirname, '..');
var packageInfo = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
var version = String(packageInfo.version);
var templateRoot = path.join(projectRoot, 'Installer', 'macOS', 'first-install');
var buildRoot = path.join(projectRoot, 'dist', 'studio.oplus.ae');
var releaseRoot = path.join(projectRoot, 'release');
var workRoot = path.join(releaseRoot, '.macos-first-install-work');
var folderName = 'Otiner Studio macOS ' + version;
var packageRoot = path.join(workRoot, folderName);
var appResources = path.join(packageRoot, 'Install Otiner Studio.app', 'Contents', 'Resources');
var outputPath = path.join(releaseRoot, 'Otiner-Studio-First-Install-macOS-' + version + '.zip');
var outputReadme = path.join(releaseRoot, 'INSTALL-macOS-FIRST-' + version + '-fa.txt');
var outputChecksum = path.join(releaseRoot, 'Otiner-Studio-First-Install-macOS-' + version + '-SHA256.txt');

function assertInside(root, candidate) {
    var relative = path.relative(path.resolve(root), path.resolve(candidate));
    if (!relative || relative === '..' || relative.indexOf('..' + path.sep) === 0 || path.isAbsolute(relative)) {
        throw new Error('Unsafe generated path: ' + candidate);
    }
}

function removeGenerated(target) {
    assertInside(releaseRoot, target);
    if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
    }
}

function copyTree(source, target) {
    var stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
        throw new Error('Symbolic links are not allowed in the macOS installer: ' + source);
    }
    if (stat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        fs.readdirSync(source).sort().forEach(function (name) {
            copyTree(path.join(source, name), path.join(target, name));
        });
        return;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}

function replaceTokens(filePath) {
    var source = fs.readFileSync(filePath, 'utf8')
        .replace(/__VERSION__/g, version)
        .replace(/__BUILD_VERSION__/g, version.replace(/[^0-9.]/g, ''));
    fs.writeFileSync(filePath, source, 'utf8');
}

function crcTable() {
    var table = [];
    var n;
    var c;
    var k;
    for (n = 0; n < 256; n += 1) {
        c = n;
        for (k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
}

var CRC_TABLE = crcTable();

function crc32(buffer) {
    var crc = 0xFFFFFFFF;
    var i;
    for (i = 0; i < buffer.length; i += 1) {
        crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
    var year = Math.max(1980, date.getFullYear());
    return {
        time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31),
        date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31)
    };
}

function collectEntries(root, prefix, output) {
    var names = fs.readdirSync(root).sort();
    names.forEach(function (name) {
        var absolute = path.join(root, name);
        var stat = fs.lstatSync(absolute);
        var relative = (prefix ? prefix + '/' : '') + name;
        if (stat.isSymbolicLink()) {
            throw new Error('Symbolic links are not allowed in ZIP: ' + absolute);
        }
        if (stat.isDirectory()) {
            output.push({ name: relative + '/', absolute: absolute, directory: true, stat: stat });
            collectEntries(absolute, relative, output);
        } else {
            output.push({ name: relative, absolute: absolute, directory: false, stat: stat });
        }
    });
}

function unixMode(entry) {
    if (entry.directory) { return 16877; } /* 040755 */
    if (/\.command$/i.test(entry.name) || /\/Contents\/MacOS\/[^/]+$/.test('/' + entry.name)) {
        return 33261; /* 0100755 */
    }
    return 33188; /* 0100644 */
}

function createUnixZip(sourceRoot, destination) {
    var entries = [];
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    var centralSize = 0;
    collectEntries(sourceRoot, folderName, entries);
    entries.forEach(function (entry) {
        var nameBuffer = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
        var raw = entry.directory ? Buffer.alloc(0) : fs.readFileSync(entry.absolute);
        var compressed = entry.directory ? raw : zlib.deflateRawSync(raw, { level: 9 });
        var checksum = crc32(raw);
        var stamp = dosDateTime(entry.stat.mtime);
        var flags = 0x0800;
        var method = entry.directory ? 0 : 8;
        var local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034B50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(flags, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(stamp.time, 10);
        local.writeUInt16LE(stamp.date, 12);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(nameBuffer.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, nameBuffer, compressed);

        var central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014B50, 0);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(flags, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(stamp.time, 12);
        central.writeUInt16LE(stamp.date, 14);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(nameBuffer.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(((((unixMode(entry) & 0xFFFF) << 16) | (entry.directory ? 0x10 : 0)) >>> 0), 38);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, nameBuffer);
        centralSize += central.length + nameBuffer.length;
        offset += local.length + nameBuffer.length + compressed.length;
    });

    var end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054B50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);

    var temporary = destination + '.tmp-' + process.pid;
    fs.writeFileSync(temporary, Buffer.concat(localParts.concat(centralParts).concat([end])));
    if (fs.existsSync(destination)) { fs.unlinkSync(destination); }
    fs.renameSync(temporary, destination);
}

var build = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'build.js')], {
    cwd: projectRoot,
    stdio: 'inherit'
});
if (build.status !== 0) {
    process.exit(build.status || 1);
}
if (!fs.existsSync(path.join(buildRoot, 'CSXS', 'manifest.xml'))) {
    throw new Error('Built extension is incomplete: ' + buildRoot);
}

fs.mkdirSync(releaseRoot, { recursive: true });
removeGenerated(workRoot);
fs.mkdirSync(packageRoot, { recursive: true });
copyTree(templateRoot, packageRoot);
copyTree(buildRoot, path.join(appResources, 'studio.oplus.ae'));
replaceTokens(path.join(packageRoot, 'Install Otiner Studio.app', 'Contents', 'Info.plist'));
replaceTokens(path.join(packageRoot, 'READ ME - MAC.txt'));
fs.copyFileSync(path.join(packageRoot, 'READ ME - MAC.txt'), outputReadme);
createUnixZip(packageRoot, outputPath);
removeGenerated(workRoot);

var hash = require('crypto').createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex').toUpperCase();
fs.writeFileSync(outputChecksum, hash + '  ' + path.basename(outputPath) + '\n', 'utf8');
process.stdout.write('Created: ' + outputPath + '\nSHA256: ' + hash + '\n');
