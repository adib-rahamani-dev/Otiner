'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var projectRoot = path.resolve(__dirname, '..');
var extensionRoot = path.join(projectRoot, 'Extension');
var failures = [];
var checks = 0;

function fail(message) {
    failures.push(message);
}

function pass() {
    checks += 1;
}

function requireFile(filePath, label) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        fail((label || 'Required file') + ' is missing: ' + path.relative(projectRoot, filePath));
        return false;
    }
    pass();
    return true;
}

function walk(directory, predicate, output) {
    output = output || [];
    if (!fs.existsSync(directory)) {
        return output;
    }
    fs.readdirSync(directory).sort().forEach(function (name) {
        if (name === 'node_modules' || name === 'dist' || name === '.git') {
            return;
        }
        var filePath = path.join(directory, name);
        var stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) {
            return;
        }
        if (stat.isDirectory()) {
            walk(filePath, predicate, output);
        } else if (!predicate || predicate(filePath)) {
            output.push(filePath);
        }
    });
    return output;
}

function assertInside(root, candidate, label) {
    var relative = path.relative(root, candidate);
    if (!relative || relative === '..' || relative.indexOf('..' + path.sep) === 0 || path.isAbsolute(relative)) {
        fail(label + ' escapes its root: ' + candidate);
        return false;
    }
    return true;
}

function extractTag(xml, tagName) {
    var expression = new RegExp('<' + tagName + '>([\\s\\S]*?)<\\/' + tagName + '>', 'i');
    var match = expression.exec(xml);
    return match ? match[1].trim() : '';
}

function checkXmlShape(xml, filePath) {
    var source = xml
        .replace(/<\?[\s\S]*?\?>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
    var stack = [];
    var expression = /<\/?([A-Za-z_][A-Za-z0-9_.:-]*)\b[^>]*>/g;
    var match;
    while ((match = expression.exec(source))) {
        var token = match[0];
        var name = match[1];
        if (token.charAt(1) === '/') {
            var openName = stack.pop();
            if (openName !== name) {
                fail('Malformed XML in ' + path.relative(projectRoot, filePath) +
                    ': expected closing tag for ' + (openName || '(none)') + ', found ' + name + '.');
                return;
            }
        } else if (token.slice(-2) !== '/>') {
            stack.push(name);
        }
    }
    if (stack.length) {
        fail('Malformed XML in ' + path.relative(projectRoot, filePath) +
            ': unclosed tag ' + stack[stack.length - 1] + '.');
        return;
    }
    pass();
}

function checkManifest() {
    var manifestPath = path.join(extensionRoot, 'CSXS', 'manifest.xml');
    if (!requireFile(manifestPath, 'CEP manifest')) {
        return;
    }
    var xml = fs.readFileSync(manifestPath, 'utf8');
    checkXmlShape(xml, manifestPath);

    if (!/<Host\s+Name=["']AEFT["']\s+Version=["']\[25\.0,25\.99\]["']\s*\/>/i.test(xml)) {
        fail('Manifest must target After Effects AEFT [25.0,25.99].');
    } else {
        pass();
    }
    if (!/<RequiredRuntime\s+Name=["']CSXS["']\s+Version=["']12(?:\.0)?["']\s*\/>/i.test(xml)) {
        fail('Manifest must require CEP/CSXS 12.');
    } else {
        pass();
    }
    if (xml.indexOf('--enable-nodejs') === -1) {
        fail('Manifest must enable CEP Node.js for the CommonJS engines.');
    } else {
        pass();
    }

    ['MainPath', 'ScriptPath'].forEach(function (tagName) {
        var reference = extractTag(xml, tagName);
        if (!reference) {
            fail('Manifest is missing ' + tagName + '.');
            return;
        }
        var resolved = path.resolve(extensionRoot, reference);
        if (assertInside(extensionRoot, resolved, 'Manifest ' + tagName)) {
            requireFile(resolved, 'Manifest ' + tagName + ' target');
        }
    });

    var extensionListId = /<ExtensionList>[\s\S]*?<Extension\s+Id=["']([^"']+)["']/i.exec(xml);
    var dispatchId = /<DispatchInfoList>[\s\S]*?<Extension\s+Id=["']([^"']+)["']/i.exec(xml);
    if (!extensionListId || !dispatchId || extensionListId[1] !== dispatchId[1]) {
        fail('Manifest ExtensionList and DispatchInfoList ids must match.');
    } else {
        pass();
    }

    try {
        var packageVersion = JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
        ).version;
        var manifestVersion = /ExtensionBundleVersion=["']([^"']+)["']/i.exec(xml);
        if (!manifestVersion || manifestVersion[1] !== packageVersion) {
            fail('package.json and manifest ExtensionBundleVersion must match.');
        } else {
            pass();
        }
    } catch (error) {
        fail('Could not compare package and manifest versions: ' + error.message);
    }
}

function checkBootstrapReferences() {
    var bootstrapPath = path.join(extensionRoot, 'JSX', 'bootstrap.jsx');
    if (!requireFile(bootstrapPath, 'ExtendScript bootstrap')) {
        return;
    }
    var source = fs.readFileSync(bootstrapPath, 'utf8');
    var moduleExpression = /["']([^"'\/\\]+\.jsx)["']/gi;
    var match;
    var seen = {};
    while ((match = moduleExpression.exec(source))) {
        if (seen[match[1]]) {
            continue;
        }
        seen[match[1]] = true;
        requireFile(path.join(path.dirname(bootstrapPath), match[1]), 'Bootstrap JSX module');
    }

    try {
        var packageVersion = JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
        ).version;
        var bootstrapVersion = /OPLUS\.version\s*=\s*["']([^"']+)["']/.exec(source);
        if (!bootstrapVersion || bootstrapVersion[1] !== packageVersion) {
            fail('package.json and OPLUS.version in bootstrap.jsx must match.');
        } else {
            pass();
        }
    } catch (error) {
        fail('Could not compare package and bootstrap versions: ' + error.message);
    }
}

function checkHtmlReferences() {
    var htmlPath = path.join(extensionRoot, 'UI', 'index.html');
    if (!requireFile(htmlPath, 'Panel HTML')) {
        return;
    }
    var html = fs.readFileSync(htmlPath, 'utf8');
    var expression = /<(?:script|link|img)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
    var match;
    while ((match = expression.exec(html))) {
        var reference = match[1];
        if (!reference || reference.charAt(0) === '#' ||
            /^(?:https?:|data:|cep:|file:|javascript:)/i.test(reference)) {
            continue;
        }
        var cleanReference = reference.split(/[?#]/)[0];
        var resolved = path.resolve(path.dirname(htmlPath), cleanReference);
        if (assertInside(extensionRoot, resolved, 'HTML reference')) {
            requireFile(resolved, 'HTML reference target');
        }
    }
}

function checkJavaScript() {
    walk(projectRoot, function (filePath) {
        return path.extname(filePath).toLowerCase() === '.js';
    }).forEach(function (filePath) {
        var result = childProcess.spawnSync(process.execPath, ['--check', filePath], {
            encoding: 'utf8'
        });
        if (result.status !== 0) {
            fail('JavaScript syntax error in ' + path.relative(projectRoot, filePath) + ':\n' +
                (result.stderr || result.stdout || 'Unknown parser error'));
        } else {
            pass();
        }
    });
}

function checkExtendScript() {
    var jsxRoot = path.join(extensionRoot, 'JSX');
    walk(jsxRoot, function (filePath) {
        return path.extname(filePath).toLowerCase() === '.jsx';
    }).forEach(function (filePath) {
        var source = fs.readFileSync(filePath, 'utf8')
            .replace(/^\s*#(?:target|targetengine|include)\b.*$/gm, '');
        try {
            new vm.Script(source, {
                filename: filePath,
                displayErrors: true
            });
            pass();
        } catch (error) {
            fail('ExtendScript parse error in ' + path.relative(projectRoot, filePath) + ':\n' + error.message);
        }
    });
}

function checkJson() {
    [
        path.join(projectRoot, 'package.json'),
        path.join(projectRoot, 'Database', 'settings.json'),
        path.join(projectRoot, 'Database', 'library.json')
    ].forEach(function (filePath) {
        if (!requireFile(filePath, 'JSON file')) {
            return;
        }
        try {
            JSON.parse(fs.readFileSync(filePath, 'utf8'));
            pass();
        } catch (error) {
            fail('Invalid JSON in ' + path.relative(projectRoot, filePath) + ': ' + error.message);
        }
    });
}

function checkRequiredEngineFiles() {
    [
        'Engine/index.js',
        'Engine/LibraryEngine/index.js',
        'Engine/ImportEngine/index.js',
        'Engine/PreviewEngine/index.js',
        'Engine/Serializer/index.js',
        'Engine/Logger/index.js'
    ].forEach(function (relativePath) {
        requireFile(path.join(projectRoot, relativePath), 'Engine module');
    });
}

checkManifest();
checkBootstrapReferences();
checkHtmlReferences();
checkRequiredEngineFiles();
checkJavaScript();
checkExtendScript();
checkJson();

if (failures.length) {
    process.stderr.write('Oplus Studio contract check failed:\n\n');
    failures.forEach(function (message) {
        process.stderr.write('- ' + message + '\n');
    });
    process.stderr.write('\n' + failures.length + ' failure(s), ' + checks + ' check(s) passed.\n');
    process.exitCode = 1;
} else {
    process.stdout.write('Oplus Studio contract check passed (' + checks + ' checks).\n');
}
