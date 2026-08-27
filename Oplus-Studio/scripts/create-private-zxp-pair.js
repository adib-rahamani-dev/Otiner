'use strict';

var childProcess = require('child_process');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var projectRoot = path.resolve(__dirname, '..');
var packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
var toolPath = process.env.ZXPSIGNCMD_PATH ||
    path.join(projectRoot, 'tmp', 'zxp-tools', 'ZXPSignCmd.exe');
var privateRoot = path.join(projectRoot, 'private-signing');
var certificatePath = path.join(privateRoot, 'oplus-studio-private.p12');
var passwordPath = path.join(privateRoot, 'oplus-studio-private-password.txt');
var releaseRoot = path.join(projectRoot, 'release');
var timestampUrl = process.env.OPLUS_ZXP_TIMESTAMP || 'http://timestamp.digicert.com';
var outputs = [
    'Otiner-Studio-Windows-' + packageJson.version + '.zxp',
    'Otiner-Studio-macOS-' + packageJson.version + '.zxp'
];

function fail(message) {
    throw new Error(message);
}

function run(command, args, label) {
    var result = childProcess.spawnSync(command, args, {
        cwd: projectRoot,
        stdio: 'inherit'
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        fail(label + ' failed with exit code ' + result.status + '.');
    }
}

function ensureCertificate() {
    fs.mkdirSync(privateRoot, { recursive: true });
    if (fs.existsSync(certificatePath) && fs.existsSync(passwordPath)) {
        return fs.readFileSync(passwordPath, 'utf8').trim();
    }
    if (fs.existsSync(certificatePath) || fs.existsSync(passwordPath)) {
        fail('Private signing files are incomplete; refusing to overwrite them.');
    }
    var password = crypto.randomBytes(24).toString('base64url');
    run(toolPath, [
        '-selfSignedCert',
        'IR',
        'Tehran',
        'OplusStudio',
        'Oplus Studio Private Distribution',
        password,
        certificatePath,
        '-validityDays',
        '3650'
    ], 'Self-signed certificate creation');
    fs.writeFileSync(passwordPath, password + '\n', {
        encoding: 'utf8',
        mode: 384
    });
    return password;
}

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function main() {
    if (!fs.existsSync(toolPath)) {
        fail('ZXPSignCmd is missing: ' + toolPath);
    }
    var password = ensureCertificate();
    run(process.execPath, [path.join(__dirname, 'build.js')], 'Oplus Studio build');
    fs.mkdirSync(releaseRoot, { recursive: true });

    outputs.forEach(function (outputName) {
        var outputPath = path.join(releaseRoot, outputName);
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
        var signArguments = [
            '-sign',
            path.join(projectRoot, 'dist', 'studio.oplus.ae'),
            outputPath,
            certificatePath,
            password
        ];
        if (timestampUrl && timestampUrl.toLowerCase() !== 'none') {
            signArguments.push('-tsa', timestampUrl);
        }
        run(toolPath, signArguments, 'Signing ' + outputName);
        run(toolPath, ['-verify', outputPath, '-certinfo'], 'Verifying ' + outputName);
    });

    var checksums = outputs.map(function (outputName) {
        return sha256(path.join(releaseRoot, outputName)) + '  ' + outputName;
    }).join('\n') + '\n';
    fs.writeFileSync(path.join(releaseRoot, 'ZXP-SHA256SUMS.txt'), checksums, 'utf8');
    process.stdout.write('Created and verified both private-distribution ZXP files.\n');
    process.stdout.write('Private certificate files are in private-signing and must not be shared.\n');
}

try {
    main();
} catch (error) {
    process.stderr.write('Private ZXP packaging failed: ' + error.message + '\n');
    process.exitCode = 1;
}
