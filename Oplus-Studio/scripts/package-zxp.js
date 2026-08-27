'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var projectRoot = path.resolve(__dirname, '..');
var packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
var toolPath = process.env.ZXPSIGNCMD_PATH || '';
var certificatePath = process.env.OPLUS_ZXP_CERTIFICATE || '';
var certificatePassword = process.env.OPLUS_ZXP_PASSWORD || '';
var timestampUrl = process.env.OPLUS_ZXP_TIMESTAMP || 'http://timestamp.digicert.com';
var releaseRoot = path.join(projectRoot, 'release');
var inputRoot = path.join(projectRoot, 'dist', 'studio.oplus.ae');
var outputName = process.env.OPLUS_ZXP_OUTPUT_NAME ||
    ('Otiner-Studio-' + packageJson.version + '.zxp');
if (path.basename(outputName) !== outputName || !/^[A-Za-z0-9._-]+\.zxp$/i.test(outputName)) {
    fail('OPLUS_ZXP_OUTPUT_NAME must be a safe .zxp filename without a directory.');
}
var outputPath = path.join(releaseRoot, outputName);

function fail(message) {
    process.stderr.write(message + '\n');
    process.exit(1);
}

if (!toolPath || !fs.existsSync(toolPath)) {
    fail('Set ZXPSIGNCMD_PATH to the full path of Adobe ZXPSignCmd.');
}
if (!certificatePath || !fs.existsSync(certificatePath)) {
    fail('Set OPLUS_ZXP_CERTIFICATE to the full path of the signing .p12 file.');
}
if (!certificatePassword) {
    fail('Set OPLUS_ZXP_PASSWORD in the current process environment.');
}

var build = childProcess.spawnSync(process.execPath, [path.join(__dirname, 'build.js')], {
    cwd: projectRoot,
    stdio: 'inherit'
});
if (build.status !== 0) {
    fail('Build failed; ZXP was not created.');
}

fs.mkdirSync(releaseRoot, { recursive: true });
var signArguments = ['-sign', inputRoot, outputPath, certificatePath, certificatePassword];
if (timestampUrl && timestampUrl.toLowerCase() !== 'none') {
    signArguments.push('-tsa', timestampUrl);
}
var sign = childProcess.spawnSync(toolPath, signArguments, {
    cwd: projectRoot,
    stdio: 'inherit'
});
if (sign.status !== 0) {
    fail('ZXPSignCmd signing failed.');
}

var verify = childProcess.spawnSync(toolPath, ['-verify', outputPath], {
    cwd: projectRoot,
    stdio: 'inherit'
});
if (verify.status !== 0) {
    fail('ZXPSignCmd verification failed.');
}

process.stdout.write('Created and verified: ' + outputPath + '\n');
