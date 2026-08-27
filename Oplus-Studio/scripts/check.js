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

function checkTextContentRegression() {
    var textModule = fs.readFileSync(path.join(extensionRoot, 'JSX', 'text.jsx'), 'utf8');
    var hostSmoke = fs.readFileSync(path.join(projectRoot, 'Tests', 'host-smoke.jsx'), 'utf8');
    if (textModule.indexOf('textGroup.property(matchName)') === -1) {
        fail('Text serialization must resolve Source Text inside ADBE Text Properties.');
    } else {
        pass();
    }
    if (hostSmoke.indexOf('Text content restored exactly') === -1 ||
            hostSmoke.indexOf('.value.text === "Oplus Smoke"') === -1) {
        fail('Host smoke test must verify imported text content exactly.');
    } else {
        pass();
    }
    try {
        function TextDocument(text) {
            this.text = String(text || '');
            this.fontSize = 48;
            this.fillColor = [1, 1, 1];
        }
        function makeLayer(text) {
            var source = {
                value: new TextDocument(text),
                setValue: function (value) { this.value = value; }
            };
            var textGroup = {
                name: 'Text',
                property: function (matchName) {
                    return matchName === 'ADBE Text Document' ? source : null;
                }
            };
            return {
                source: source,
                property: function (matchName) {
                    return matchName === 'ADBE Text Properties' ? textGroup : null;
                }
            };
        }
        var context = {
            TextDocument: TextDocument,
            OPLUS: {
                serializer: {
                    jsonSafe: function (value) { return value; },
                    serializeProperty: function (property) {
                        return { value: { __oplusType: 'TextDocument', text: property.value.text } };
                    },
                    serializePropertyGroup: function () { return null; },
                    applyProperty: function (property, data) {
                        property.setValue(new TextDocument(data.value.text));
                    },
                    applyPropertyGroup: function () {}
                }
            }
        };
        vm.runInNewContext(textModule, context, { filename: 'text.jsx' });
        var sourceLayer = makeLayer('Otiner keeps this text');
        var serialized = context.OPLUS.text.serialize(sourceLayer, {}, []);
        var targetLayer = makeLayer('');
        context.OPLUS.text.apply(targetLayer, serialized, {}, []);
        if (serialized.document.text !== 'Otiner keeps this text' ||
                targetLayer.source.value.text !== 'Otiner keeps this text') {
            fail('Text round-trip regression: serialized/imported content became empty.');
        } else {
            pass();
        }
    } catch (error) {
        fail('Text round-trip regression harness failed: ' + error.message);
    }
}

function checkFullFidelityContracts() {
    var serializer = fs.readFileSync(path.join(extensionRoot, 'JSX', 'serializer.jsx'), 'utf8');
    var importer = fs.readFileSync(path.join(extensionRoot, 'JSX', 'importer.jsx'), 'utf8');
    var panel = fs.readFileSync(path.join(extensionRoot, 'UI', 'app.js'), 'utf8');
    var html = fs.readFileSync(path.join(extensionRoot, 'UI', 'index.html'), 'utf8');
    var textModule = fs.readFileSync(path.join(extensionRoot, 'JSX', 'text.jsx'), 'utf8');
    var nativeModule = fs.readFileSync(path.join(extensionRoot, 'JSX', 'native.jsx'), 'utf8');
    var bootstrap = fs.readFileSync(path.join(extensionRoot, 'JSX', 'bootstrap.jsx'), 'utf8');
    [
        [serializer, 'additionalProperties: serializeAdditionalGroups', 'All additional top-level AE property groups must be serialized.'],
        [serializer, 'property.propertyParameters', 'Dropdown effect labels must be serialized when AE exposes them.'],
        [serializer, 'function registerSource', 'Pre-compositions and footage sources must be registered recursively.'],
        [importer, 'function buildSourceItems', 'Stored pre-compositions and footage sources must be rebuilt before layers.'],
        [importer, 'source.packagedPath && options.assetDir', 'Imports must prefer self-contained packaged media.'],
        [textModule, 'characterStyleRuns', 'Per-character rich text style runs must be preserved.'],
        [textModule, 'paragraphStyleRuns', 'Per-paragraph rich text style runs must be preserved.'],
        [panel, 'function collectAssetMedia', 'Asset saving must collect external media.'],
        [panel, 'sha256File', 'Packaged media must include integrity hashes.'],
        [panel, 'function importSharedAssetPackage', 'The panel must be able to receive shared asset packages.'],
        [html, 'id="receive-button"', 'The shared-asset receiver must be exposed in the panel UI.'],
        [nativeModule, 'app.project.reduceProject([snapshotComp])', 'Exact saves must create a reduced native AEP snapshot.'],
        [nativeModule, 'strategy: "clipboard-isolated"', 'Exact saves must provide the isolated fast clipboard path.'],
        [nativeModule, 'NATIVE_FAST_PATH_FALLBACK', 'Fast native saves must retain an exact compatibility fallback.'],
        [nativeModule, 'findCachedComp(signature)', 'Repeated native imports must reuse a validated project cache.'],
        [nativeModule, 'sourceLayer.copyToComp(destination)', 'Exact imports must use After Effects native layer copying.'],
        [nativeModule, 'EFFECT_NOT_INSTALLED', 'Unavailable effects must be skipped with an explicit warning.'],
        [serializer, '__oplusType: "LayerReference"', 'Layer-control references must be remapped to imported layers.'],
        [serializer, 'nativeLayerIndices', 'Native save must reuse the already-resolved dependency layer list.'],
        [serializer, 'options.nativeOnly === true', 'Fast exact profiles must avoid redundant full property JSON traversal.'],
        [nativeModule, 'function addAsComposition', 'Native load must provide a safe single-precomposition path.'],
        [nativeModule, 'function copyLayersBatch', 'Editable native load must copy layers as one guarded batch.'],
        [nativeModule, 'allowLegacyLayerCopy === true', 'Crash-prone legacy layer copying must require explicit opt-in.'],
        [nativeModule, 'restoreOriginalNow(originalFile', 'Native save must restore the original project before returning.'],
        [bootstrap, 'Render only after the native snapshot', 'Thumbnail rendering must start only after native project restoration.'],
        [panel, 'copyFileWithSha256', 'Media collection must copy and hash in one bounded-memory pass.'],
        [panel, 'state.busy || state.statusBusy', 'Host status polling must pause during save and import operations.'],
        [html, 'value="safe-composition"', 'Save UI must expose the recommended Safe Composition profile.'],
        [html, 'id="import-structure-select"', 'Load UI must expose explicit structure choices.']
    ].forEach(function (contract) {
        if (contract[0].indexOf(contract[1]) === -1) {
            fail(contract[2]);
        } else {
            pass();
        }
    });
}

checkManifest();
checkBootstrapReferences();
checkHtmlReferences();
checkRequiredEngineFiles();
checkTextContentRegression();
checkFullFidelityContracts();
checkJavaScript();
checkExtendScript();
checkJson();

if (failures.length) {
    process.stderr.write('Otiner Studio contract check failed:\n\n');
    failures.forEach(function (message) {
        process.stderr.write('- ' + message + '\n');
    });
    process.stderr.write('\n' + failures.length + ' failure(s), ' + checks + ' check(s) passed.\n');
    process.exitCode = 1;
} else {
    process.stdout.write('Otiner Studio contract check passed (' + checks + ' checks).\n');
}
