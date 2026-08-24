/* global CSInterface, SystemPath, require */
(function () {
  "use strict";

  var APP_NAME = "Oplus-Studio";
  var LIBRARY_SCHEMA_VERSION = 1;
  var CATEGORY_NAMES = ["Shapes", "Text", "Animations", "Effects", "Transitions", "Presets", "Compositions"];
  var IMPORT_MODES = ["original", "center", "currentTime", "originalTime", "replace"];
  var DEFAULT_SETTINGS = {
    libraryPath: "",
    autoThumbnail: true,
    defaultImportMode: "original"
  };

  var state = {
    cs: null,
    fs: null,
    path: null,
    childProcess: null,
    extensionPath: "",
    userDataPath: "",
    runtimeDataPath: "",
    settingsPath: "",
    settings: copyObject(DEFAULT_SETTINGS),
    libraryRoot: "",
    assetRoot: "",
    databaseRoot: "",
    assets: [],
    filteredAssets: [],
    selectedAssetId: null,
    activeCategory: "All",
    searchQuery: "",
    sortOrder: "updated-desc",
    bridgeReady: false,
    statusBusy: false,
    saveSummary: null,
    metadataMode: "create",
    dialogAssetId: null,
    lastFocus: null,
    busy: false,
    loadGeneration: 0
  };

  var dom = {};

  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    cacheDom();
    bindEvents();
    initEnvironment();
    state.settings = readSettings();
    applySettingsToControls();
    updateLibraryStatus();

    initializeBridge().then(function () {
      return refreshHostStatus();
    }).catch(function (error) {
      setConnection(false, getErrorMessage(error));
    });

    if (hasUsableLibrarySetting()) {
      activateLibrary(state.settings.libraryPath).catch(function (error) {
        showSetup(getErrorMessage(error));
      });
    } else {
      showSetup();
    }

    window.setInterval(function () {
      if (!document.hidden) {
        refreshHostStatus(true);
      }
    }, 15000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        refreshHostStatus(true);
      }
    });
  }

  function cacheDom() {
    var ids = [
      "app", "save-button", "settings-button", "search-input", "connection-pill", "connection-label",
      "ae-version", "project-status", "library-status", "asset-count", "category-list", "storage-label",
      "reveal-library-button", "view-title", "sort-select", "refresh-button", "library-state", "loading-state",
      "empty-state", "empty-title", "empty-copy", "empty-save-button", "error-state", "error-message", "retry-button",
      "asset-grid", "detail-pane", "detail-empty", "detail-content", "detail-preview", "detail-preview-fallback",
      "favorite-button", "detail-category", "detail-name", "edit-button", "detail-type", "detail-created",
      "detail-layers", "detail-version", "detail-tags", "detail-description", "import-mode-select", "import-button",
      "delete-button", "setup-screen", "setup-path-input", "setup-browse-button", "setup-validation",
      "setup-continue-button", "metadata-dialog", "metadata-dialog-eyebrow", "metadata-dialog-title", "metadata-form",
      "selection-summary", "asset-name-input", "asset-category-select", "asset-tags-input", "asset-description-input",
      "metadata-validation", "metadata-submit-button", "settings-dialog", "settings-form", "settings-path-input",
      "settings-browse-button", "auto-thumbnail-input", "default-mode-select", "settings-validation",
      "settings-submit-button", "confirm-dialog", "confirm-copy", "confirm-cancel-button", "confirm-delete-button",
      "toast-region"
    ];
    ids.forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (_, character) { return character.toUpperCase(); });
      dom[key] = document.getElementById(id);
    });
  }

  function bindEvents() {
    dom.saveButton.addEventListener("click", openSaveDialog);
    dom.emptySaveButton.addEventListener("click", openSaveDialog);
    dom.settingsButton.addEventListener("click", openSettingsDialog);
    dom.refreshButton.addEventListener("click", refreshEverything);
    dom.retryButton.addEventListener("click", refreshLibrary);
    dom.connectionPill.addEventListener("click", function () { refreshHostStatus(false); });
    dom.revealLibraryButton.addEventListener("click", revealLibrary);
    dom.searchInput.addEventListener("input", function () {
      state.searchQuery = dom.searchInput.value.trim().toLowerCase();
      applyFilters();
    });
    dom.sortSelect.addEventListener("change", function () {
      state.sortOrder = dom.sortSelect.value;
      applyFilters();
    });
    dom.categoryList.addEventListener("click", onCategoryClick);
    dom.assetGrid.addEventListener("click", onGridClick);
    dom.assetGrid.addEventListener("dblclick", onGridDoubleClick);
    dom.assetGrid.addEventListener("keydown", onGridKeyDown);

    dom.favoriteButton.addEventListener("click", function () { toggleFavorite(state.selectedAssetId); });
    dom.editButton.addEventListener("click", openEditDialog);
    dom.importButton.addEventListener("click", importSelectedAsset);
    dom.deleteButton.addEventListener("click", openDeleteConfirmation);
    dom.importModeSelect.addEventListener("change", function () {
      state.settings.defaultImportMode = dom.importModeSelect.value;
    });

    dom.setupPathInput.addEventListener("input", validateSetupInput);
    dom.setupBrowseButton.addEventListener("click", function () { browseForFolder(dom.setupPathInput, validateSetupInput); });
    dom.setupContinueButton.addEventListener("click", completeSetup);

    dom.metadataForm.addEventListener("submit", submitMetadataForm);
    dom.settingsForm.addEventListener("submit", submitSettingsForm);
    dom.settingsBrowseButton.addEventListener("click", function () { browseForFolder(dom.settingsPathInput); });
    dom.confirmCancelButton.addEventListener("click", function () { closeDialog("confirm-dialog"); });
    dom.confirmDeleteButton.addEventListener("click", deleteSelectedAsset);

    document.addEventListener("click", function (event) {
      var closeControl = event.target.closest("[data-close-dialog]");
      if (closeControl) {
        closeDialog(closeControl.getAttribute("data-close-dialog"));
      }
    });
    document.addEventListener("keydown", onGlobalKeyDown);
  }

  function initEnvironment() {
    try {
      if (typeof CSInterface === "function") {
        state.cs = new CSInterface();
      }
    } catch (error) {
      state.cs = null;
    }

    try {
      var nodeRequire = null;
      if (typeof window.require === "function") {
        nodeRequire = function (moduleName) { return window.require(moduleName); };
      } else if (window.cep_node && typeof window.cep_node.require === "function") {
        nodeRequire = function (moduleName) { return window.cep_node.require(moduleName); };
      } else if (typeof require === "function") {
        nodeRequire = function (moduleName) { return require(moduleName); };
      }
      if (nodeRequire) {
        state.fs = nodeRequire("fs");
        state.path = nodeRequire("path");
        try { state.childProcess = nodeRequire("child_process"); } catch (ignored) { state.childProcess = null; }
      }
    } catch (error) {
      state.fs = null;
      state.path = null;
    }

    if (state.cs) {
      try {
        state.extensionPath = stripFileScheme(state.cs.getSystemPath(getSystemPathValue("EXTENSION")));
        state.userDataPath = stripFileScheme(state.cs.getSystemPath(getSystemPathValue("USER_DATA")));
      } catch (ignored) {
        state.extensionPath = "";
        state.userDataPath = "";
      }
    }

    if (state.path && state.userDataPath) {
      state.runtimeDataPath = state.path.join(state.userDataPath, APP_NAME);
      state.settingsPath = state.path.join(state.runtimeDataPath, "settings.json");
    }

    if (!state.fs || !state.path) {
      showToast("CEP Node.js is unavailable. Enable Node in the extension manifest to use the library.", "error", 8000);
    }
  }

  function getSystemPathValue(name) {
    if (typeof SystemPath !== "undefined" && SystemPath[name]) {
      return SystemPath[name];
    }
    return name === "EXTENSION" ? "extension" : "userData";
  }

  function stripFileScheme(value) {
    var text = String(value || "");
    if (/^file:\/\//i.test(text)) {
      text = text.replace(/^file:\/\/\/?/i, "");
      try { text = decodeURIComponent(text); } catch (ignored) { /* Preserve the usable raw path. */ }
      if (/^\/[A-Za-z]:/.test(text)) { text = text.slice(1); }
    }
    return text;
  }

  function readSettings() {
    var settings = copyObject(DEFAULT_SETTINGS);
    var candidates = [];
    if (state.settingsPath) { candidates.push(state.settingsPath); }
    if (state.path && state.extensionPath) {
      candidates.push(state.path.join(state.extensionPath, "Database", "settings.json"));
    }
    for (var index = 0; index < candidates.length; index += 1) {
      try {
        if (state.fs && state.fs.existsSync(candidates[index])) {
          var parsed = readJsonFile(candidates[index]);
          settings = sanitizeSettings(parsed);
          if (settings.libraryPath) { break; }
        }
      } catch (error) {
        if (index === 0) {
          showToast("Settings could not be read; setup is required.", "error", 6500);
        }
      }
    }
    return settings;
  }

  function sanitizeSettings(input) {
    var source = input && typeof input === "object" ? input : {};
    var mode = IMPORT_MODES.indexOf(source.defaultImportMode) >= 0 ? source.defaultImportMode : DEFAULT_SETTINGS.defaultImportMode;
    return {
      libraryPath: typeof source.libraryPath === "string" ? source.libraryPath.trim() : "",
      autoThumbnail: source.autoThumbnail !== false,
      defaultImportMode: mode
    };
  }

  function applySettingsToControls() {
    dom.setupPathInput.value = state.settings.libraryPath || "";
    dom.settingsPathInput.value = state.settings.libraryPath || "";
    dom.autoThumbnailInput.checked = state.settings.autoThumbnail !== false;
    dom.defaultModeSelect.value = state.settings.defaultImportMode;
    dom.importModeSelect.value = state.settings.defaultImportMode;
    validateSetupInput();
  }

  function hasUsableLibrarySetting() {
    if (!state.fs || !state.path || !state.settings.libraryPath) { return false; }
    try {
      var resolved = state.path.resolve(state.settings.libraryPath);
      return state.fs.existsSync(resolved) && state.fs.statSync(resolved).isDirectory();
    } catch (ignored) {
      return false;
    }
  }

  function initializeBridge() {
    return new Promise(function (resolve, reject) {
      if (!state.cs) {
        reject(new Error("CSInterface is unavailable"));
        return;
      }
      setConnection(null, "Connecting to Oplus Engine…");
      if (!state.path || !state.extensionPath) {
        state.bridgeReady = true;
        resolve();
        return;
      }
      var bootstrapPath = state.path.join(state.extensionPath, "JSX", "bootstrap.jsx");
      var script = "$.evalFile(File(" + jsxString(bootstrapPath) + "))";
      state.cs.evalScript(script, function (result) {
        if (typeof result === "string" && /^EvalScript error\.?$/i.test(result.trim())) {
          reject(new Error("Could not load JSX/bootstrap.jsx"));
          return;
        }
        state.bridgeReady = true;
        resolve();
      });
    });
  }

  function callBridge(functionName, args) {
    return new Promise(function (resolve, reject) {
      if (!state.cs) {
        reject(new Error("After Effects bridge is unavailable"));
        return;
      }
      var parameters = (args || []).map(function (value) {
        var payload = typeof value === "string" ? value : JSON.stringify(value == null ? null : value);
        return jsxString(payload);
      }).join(",");
      var expression = functionName + "(" + parameters + ")";
      state.cs.evalScript(expression, function (rawResult) {
        if (isEvalScriptFailure(rawResult)) {
          reject(new Error("After Effects rejected " + functionName));
          return;
        }
        try {
          var envelope = parseEnvelope(rawResult);
          if (envelope.ok === false) {
            reject(new Error(normalizeBridgeError(envelope.error) || functionName + " failed"));
            return;
          }
          resolve(envelope.data);
        } catch (error) {
          reject(new Error("Invalid response from " + functionName + ": " + getErrorMessage(error)));
        }
      });
    });
  }

  function parseEnvelope(rawValue) {
    var value = rawValue;
    if (typeof value === "string") {
      value = value.trim();
      if (!value) { return { ok: true, data: null, error: null }; }
      value = JSON.parse(value);
      if (typeof value === "string" && /^[\[{]/.test(value.trim())) {
        value = JSON.parse(value);
      }
    }
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "ok")) {
      return value;
    }
    return { ok: true, data: value, error: null };
  }

  function normalizeBridgeError(error) {
    if (!error) { return ""; }
    if (typeof error === "string") { return error; }
    return error.message || error.description || error.code || JSON.stringify(error);
  }

  function isEvalScriptFailure(value) {
    return typeof value === "string" && (/^EvalScript error\.?$/i.test(value.trim()) || /^undefined$/i.test(value.trim()));
  }

  function jsxString(value) {
    return "\"" + String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/\"/g, "\\\"")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029") + "\"";
  }

  function refreshHostStatus(silent) {
    if (state.statusBusy || !state.cs) { return Promise.resolve(); }
    state.statusBusy = true;
    if (!silent) { setConnection(null, "Testing Oplus Engine…"); }
    return callBridge("OPLUS_ping").then(function (pingData) {
      return callBridge("OPLUS_getStatus", [state.settings.libraryPath || ""]).then(function (statusData) {
        var data = statusData && typeof statusData === "object" ? statusData : {};
        var ping = pingData && typeof pingData === "object" ? pingData : {};
        var version = data.afterEffectsVersion || data.aeVersion || data.version || ping.afterEffectsVersion || "Connected";
        var project = data.projectName || data.projectStatus || data.project || ping.projectStatus || "No project open";
        if (project && typeof project === "object") {
          project = project.name || project.status || (project.open ? "Untitled project" : "No project open");
        }
        dom.aeVersion.textContent = String(version);
        dom.projectStatus.textContent = String(project);
        dom.projectStatus.title = String(project);
        setConnection(true, "Oplus Engine Connected");
      });
    }).catch(function (error) {
      setConnection(false, silent ? "Engine disconnected" : getErrorMessage(error));
    }).then(function () {
      state.statusBusy = false;
    });
  }

  function setConnection(connected, label) {
    state.bridgeReady = connected === true;
    dom.connectionPill.classList.toggle("is-connected", connected === true);
    dom.connectionPill.classList.toggle("is-disconnected", connected === false);
    dom.connectionPill.classList.toggle("is-checking", connected == null);
    dom.connectionLabel.textContent = label || (connected ? "Oplus Engine Connected" : "Engine disconnected");
    dom.connectionPill.title = connected ? "Oplus Engine Connected — click to retest" : "Click to test the After Effects connection";
    updateActionAvailability();
  }

  function showSetup(errorMessage) {
    dom.setupScreen.hidden = false;
    dom.app.setAttribute("aria-hidden", "true");
    dom.app.setAttribute("aria-busy", "false");
    if (errorMessage) {
      setFieldMessage(dom.setupValidation, errorMessage);
    } else {
      clearFieldMessage(dom.setupValidation);
    }
    window.setTimeout(function () {
      if (dom.setupPathInput.value) { dom.setupContinueButton.focus(); }
      else { dom.setupBrowseButton.focus(); }
    }, 0);
  }

  function hideSetup() {
    dom.setupScreen.hidden = true;
    dom.app.removeAttribute("aria-hidden");
    dom.app.setAttribute("aria-busy", "false");
    clearFieldMessage(dom.setupValidation);
  }

  function validateSetupInput() {
    var value = dom.setupPathInput.value.trim();
    var valid = Boolean(value && state.fs && state.path);
    if (valid) {
      try {
        var resolved = state.path.resolve(stripOuterQuotes(value));
        valid = resolved !== state.path.parse(resolved).root;
      } catch (ignored) { valid = false; }
    }
    dom.setupContinueButton.disabled = !valid;
    if (value && !valid) {
      setFieldMessage(dom.setupValidation, state.fs ? "Choose a folder, not the root of a drive." : "CEP Node.js is required to create the library.");
    } else {
      clearFieldMessage(dom.setupValidation);
    }
    return valid;
  }

  function browseForFolder(input, callback) {
    var cepFs = window.cep && window.cep.fs;
    if (!cepFs) {
      showToast("Folder picker is unavailable. Enter an absolute path in the field.", "error");
      input.focus();
      return;
    }
    try {
      var initial = input.value.trim() || state.userDataPath || "";
      var result;
      if (typeof cepFs.showOpenDialogEx === "function") {
        result = cepFs.showOpenDialogEx(false, true, "Choose Oplus Library Location", initial, []);
      } else {
        result = cepFs.showOpenDialog(false, true, "Choose Oplus Library Location", initial, []);
      }
      if (result && result.err === 0 && result.data && result.data.length) {
        input.value = stripFileScheme(result.data[0]);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (callback) { callback(); }
      }
    } catch (error) {
      showToast("The folder picker could not open: " + getErrorMessage(error), "error");
    }
  }

  function completeSetup() {
    if (!validateSetupInput() || state.busy) { return; }
    var requestedPath = stripOuterQuotes(dom.setupPathInput.value.trim());
    setBusyButton(dom.setupContinueButton, true, "CREATING…");
    state.busy = true;
    initializeLibrary(requestedPath, {
      libraryPath: requestedPath,
      autoThumbnail: true,
      defaultImportMode: "original"
    }).then(function () {
      hideSetup();
      showToast("Library created and ready.", "success");
      return refreshLibrary();
    }).catch(function (error) {
      setFieldMessage(dom.setupValidation, getErrorMessage(error));
    }).then(function () {
      state.busy = false;
      setBusyButton(dom.setupContinueButton, false, "CREATE LIBRARY");
    });
  }

  function initializeLibrary(libraryPath, settings) {
    return new Promise(function (resolve, reject) {
      try {
        assertNodeAvailable();
        var resolved = validateLibraryRoot(libraryPath);
        ensureDirectory(resolved);
        var database = state.path.join(resolved, "Database");
        ensureDirectory(database);
        ensureDirectory(state.path.join(resolved, "Library"));
        ensureDirectory(state.path.join(resolved, "Cache"));
        ensureDirectory(state.path.join(resolved, "Logs"));

        var sanitized = sanitizeSettings(settings || {});
        sanitized.libraryPath = resolved;
        var libraryIndexPath = state.path.join(database, "library.json");
        if (!state.fs.existsSync(libraryIndexPath)) {
          writeJsonAtomic(libraryIndexPath, {
            schemaVersion: LIBRARY_SCHEMA_VERSION,
            updatedAt: new Date().toISOString(),
            assets: []
          });
        }
        writeJsonAtomic(state.path.join(database, "settings.json"), sanitized);
        writeRuntimeSettings(sanitized);

        state.settings = sanitized;
        configureLibraryPaths(resolved);
        applySettingsToControls();
        updateLibraryStatus();
        sendRuntimeSettings().then(resolve).catch(function () { resolve(); });
      } catch (error) {
        reject(error);
      }
    });
  }

  function activateLibrary(libraryPath) {
    return new Promise(function (resolve, reject) {
      try {
        var resolved = validateLibraryRoot(libraryPath);
        configureLibraryPaths(resolved);
        ensureDirectory(state.databaseRoot);
        ensureDirectory(state.assetRoot);
        ensureDirectory(state.path.join(resolved, "Cache"));
        ensureDirectory(state.path.join(resolved, "Logs"));
        state.settings.libraryPath = resolved;
        updateLibraryStatus();
        hideSetup();
        refreshLibrary().then(resolve).catch(reject);
        sendRuntimeSettings().catch(function () { /* Status UI communicates bridge errors. */ });
      } catch (error) {
        reject(error);
      }
    });
  }

  function validateLibraryRoot(value) {
    assertNodeAvailable();
    var text = stripOuterQuotes(String(value || "").trim());
    if (!text) { throw new Error("Choose a library location."); }
    var resolved = state.path.resolve(text);
    if (resolved === state.path.parse(resolved).root) {
      throw new Error("For safety, choose a folder inside the drive rather than the drive root.");
    }
    if (state.fs.existsSync(resolved) && !state.fs.statSync(resolved).isDirectory()) {
      throw new Error("The selected path is not a folder.");
    }
    return resolved;
  }

  function configureLibraryPaths(root) {
    state.libraryRoot = state.path.resolve(root);
    state.databaseRoot = state.path.join(state.libraryRoot, "Database");
    state.assetRoot = state.path.join(state.libraryRoot, "Library");
  }

  function sendRuntimeSettings() {
    if (!state.cs) { return Promise.resolve(); }
    return callBridge("OPLUS_setRuntimeSettings", [state.settings]).catch(function (error) {
      showToast("Settings saved locally, but After Effects did not acknowledge them: " + getErrorMessage(error), "error", 6500);
      throw error;
    });
  }

  function writeRuntimeSettings(settings) {
    if (!state.settingsPath) {
      throw new Error("The CEP user-data location is unavailable.");
    }
    ensureDirectory(state.runtimeDataPath);
    writeJsonAtomic(state.settingsPath, settings);
  }

  function updateLibraryStatus() {
    var label = state.settings.libraryPath || "Not configured";
    dom.libraryStatus.textContent = label;
    dom.libraryStatus.title = label;
    dom.storageLabel.textContent = state.settings.libraryPath ? "Local library" : "No library";
    updateActionAvailability();
  }

  function refreshEverything() {
    if (state.busy) { return; }
    spinRefreshButton(true);
    Promise.all([refreshLibrary(), refreshHostStatus(true)]).then(function () {
      showToast("Library refreshed.", "success", 2600);
    }).catch(function (error) {
      showToast(getErrorMessage(error), "error");
    }).then(function () {
      spinRefreshButton(false);
    });
  }

  function refreshLibrary() {
    var generation = ++state.loadGeneration;
    showLibraryState("loading");
    return new Promise(function (resolve, reject) {
      window.setTimeout(function () {
        try {
          assertNodeAvailable();
          if (!state.assetRoot) { throw new Error("No library location is configured."); }
          ensureDirectory(state.assetRoot);
          var entries = state.fs.readdirSync(state.assetRoot);
          var assets = [];
          var skipped = 0;
          entries.forEach(function (entryName) {
            try {
              var assetDirectory = state.path.join(state.assetRoot, entryName);
              var stat = state.fs.lstatSync(assetDirectory);
              if (!stat.isDirectory() || stat.isSymbolicLink()) { return; }
              var metadataPath = state.path.join(assetDirectory, "asset.json");
              if (!state.fs.existsSync(metadataPath)) { return; }
              var metadata = readJsonFile(metadataPath);
              var asset = normalizeAsset(metadata, entryName, assetDirectory, metadataPath, stat);
              assets.push(asset);
            } catch (ignored) {
              skipped += 1;
            }
          });
          if (generation !== state.loadGeneration) { resolve(); return; }
          state.assets = assets;
          if (state.selectedAssetId && !findAsset(state.selectedAssetId)) {
            state.selectedAssetId = null;
          }
          writeLibraryIndex();
          updateCategoryCounts();
          applyFilters();
          if (skipped) {
            showToast(skipped + " invalid asset " + (skipped === 1 ? "folder was" : "folders were") + " skipped.", "error", 5200);
          }
          resolve(assets);
        } catch (error) {
          if (generation === state.loadGeneration) {
            showLibraryError(error);
          }
          reject(error);
        }
      }, 20);
    });
  }

  function normalizeAsset(metadata, folderName, assetDirectory, metadataPath, folderStat) {
    var source = metadata && typeof metadata === "object" ? metadata : {};
    var id = cleanText(source.id, 160) || folderName;
    var tags = normalizeTags(source.tags);
    var thumbnailName = cleanText(source.thumbnail, 200) || "preview.png";
    if (state.path.basename(thumbnailName) !== thumbnailName) { thumbnailName = "preview.png"; }
    var dataName = cleanText(source.dataFile, 200) || "data.json";
    if (state.path.basename(dataName) !== dataName) { dataName = "data.json"; }
    return {
      id: id,
      name: cleanText(source.name, 100) || folderName,
      category: normalizeCategory(source.category),
      tags: tags,
      description: cleanText(source.description, 1000),
      created: normalizeDate(source.created || source.createdAt, folderStat.birthtime || folderStat.ctime),
      updated: normalizeDate(source.updated || source.updatedAt, folderStat.mtime),
      afterEffectsVersion: cleanText(source.afterEffectsVersion || source.aeVersion, 80),
      layerCount: normalizeLayerCount(source.layerCount),
      type: cleanText(source.type || source.assetType, 120) || normalizeCategory(source.category),
      thumbnail: thumbnailName,
      favorite: source.favorite === true,
      _folder: folderName,
      _assetDir: assetDirectory,
      _metadataPath: metadataPath,
      _dataPath: state.path.join(assetDirectory, dataName),
      _thumbnailPath: state.path.join(assetDirectory, thumbnailName),
      _raw: source
    };
  }

  function writeLibraryIndex() {
    if (!state.databaseRoot) { return; }
    try {
      ensureDirectory(state.databaseRoot);
      writeJsonAtomic(state.path.join(state.databaseRoot, "library.json"), {
        schemaVersion: LIBRARY_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        assets: state.assets.map(publicAssetRecord)
      });
    } catch (error) {
      showToast("Assets loaded, but the library index could not be updated.", "error", 5200);
    }
  }

  function publicAssetRecord(asset) {
    return {
      id: asset.id,
      name: asset.name,
      category: asset.category,
      tags: asset.tags.slice(),
      description: asset.description,
      created: asset.created,
      updated: asset.updated,
      afterEffectsVersion: asset.afterEffectsVersion,
      layerCount: asset.layerCount,
      type: asset.type,
      thumbnail: asset.thumbnail,
      favorite: asset.favorite,
      folder: asset._folder
    };
  }

  function applyFilters() {
    var query = state.searchQuery;
    var activeCategory = state.activeCategory;
    var filtered = state.assets.filter(function (asset) {
      var categoryMatches = activeCategory === "All" || (activeCategory === "Favorites" ? asset.favorite : asset.category.toLowerCase() === activeCategory.toLowerCase());
      if (!categoryMatches) { return false; }
      if (!query) { return true; }
      var searchable = [asset.name, asset.category, asset.type, asset.description].concat(asset.tags).join(" ").toLowerCase();
      return searchable.indexOf(query) >= 0;
    });
    filtered.sort(getSortFunction(state.sortOrder));
    state.filteredAssets = filtered;
    renderAssets();
  }

  function getSortFunction(order) {
    if (order === "name-asc") { return function (a, b) { return a.name.localeCompare(b.name); }; }
    if (order === "name-desc") { return function (a, b) { return b.name.localeCompare(a.name); }; }
    if (order === "created-desc") { return function (a, b) { return dateNumber(b.created) - dateNumber(a.created); }; }
    return function (a, b) { return dateNumber(b.updated) - dateNumber(a.updated); };
  }

  function renderAssets() {
    dom.assetGrid.textContent = "";
    if (!state.filteredAssets.length) {
      var searching = Boolean(state.searchQuery || state.activeCategory !== "All");
      dom.emptyTitle.textContent = searching ? "No matching assets" : "Your library is ready";
      dom.emptyCopy.textContent = searching ? "Try another search or category filter." : "Select layers in After Effects and save your first reusable asset.";
      dom.emptySaveButton.hidden = searching;
      showLibraryState("empty");
      renderDetail();
      return;
    }

    var fragment = document.createDocumentFragment();
    state.filteredAssets.forEach(function (asset) {
      fragment.appendChild(createAssetCard(asset));
    });
    dom.assetGrid.appendChild(fragment);
    showLibraryState("grid");
    renderDetail();
  }

  function createAssetCard(asset) {
    var card = document.createElement("article");
    card.className = "asset-card" + (asset.id === state.selectedAssetId ? " is-selected" : "");
    var selectControl = document.createElement("button");
    selectControl.type = "button";
    selectControl.className = "asset-card-select";
    selectControl.setAttribute("tabindex", asset.id === state.selectedAssetId || (!state.selectedAssetId && asset === state.filteredAssets[0]) ? "0" : "-1");
    selectControl.setAttribute("aria-label", asset.name + ", " + asset.category + ", " + asset.layerCount + " layers");
    selectControl.setAttribute("aria-pressed", asset.id === state.selectedAssetId ? "true" : "false");
    selectControl.dataset.assetId = asset.id;

    var thumb = document.createElement("div");
    thumb.className = "asset-thumb";
    var fallback = document.createElement("span");
    fallback.className = "asset-thumb-fallback";
    fallback.textContent = "OPLUS";
    thumb.appendChild(fallback);
    if (fileExists(asset._thumbnailPath)) {
      var image = document.createElement("img");
      image.alt = "";
      image.draggable = false;
      bindImage(image, fileUrl(asset._thumbnailPath, true));
      thumb.appendChild(image);
    }

    selectControl.appendChild(thumb);

    var copy = document.createElement("div");
    copy.className = "asset-card-copy";
    var title = document.createElement("strong");
    title.className = "asset-card-title";
    title.textContent = asset.name;
    title.title = asset.name;
    copy.appendChild(title);
    var metadata = document.createElement("div");
    metadata.className = "asset-card-meta";
    var category = document.createElement("span");
    category.className = "asset-card-category";
    category.textContent = asset.category;
    var layers = document.createElement("span");
    layers.className = "asset-card-layers";
    layers.textContent = asset.layerCount + " " + (asset.layerCount === 1 ? "layer" : "layers");
    metadata.appendChild(category);
    metadata.appendChild(layers);
    copy.appendChild(metadata);
    if (asset.tags.length) {
      var tagRow = document.createElement("div");
      tagRow.className = "asset-card-tags";
      asset.tags.slice(0, 2).forEach(function (tagName) {
        var tag = document.createElement("span");
        tag.className = "mini-tag";
        tag.textContent = tagName;
        tagRow.appendChild(tag);
      });
      copy.appendChild(tagRow);
    }
    selectControl.appendChild(copy);
    card.appendChild(selectControl);

    var favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "asset-favorite" + (asset.favorite ? " is-active" : "");
    favorite.dataset.favoriteId = asset.id;
    favorite.setAttribute("aria-label", asset.favorite ? "Remove " + asset.name + " from favorites" : "Add " + asset.name + " to favorites");
    favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9L6.6 20l1-6.1-4.4-4.3 6.1-.9L12 3.2Z"/></svg>';
    card.appendChild(favorite);
    return card;
  }

  function bindImage(image, source) {
    image.addEventListener("load", function () { image.classList.add("is-loaded"); });
    image.addEventListener("error", function () { image.classList.remove("is-loaded"); });
    image.src = source;
  }

  function onCategoryClick(event) {
    var button = event.target.closest("[data-category]");
    if (!button) { return; }
    state.activeCategory = button.dataset.category;
    Array.prototype.forEach.call(dom.categoryList.querySelectorAll("[data-category]"), function (item) {
      var active = item === button;
      item.classList.toggle("is-active", active);
      if (active) { item.setAttribute("aria-current", "page"); }
      else { item.removeAttribute("aria-current"); }
    });
    dom.viewTitle.textContent = state.activeCategory === "All" ? "All Assets" : state.activeCategory;
    applyFilters();
  }

  function onGridClick(event) {
    var favorite = event.target.closest("[data-favorite-id]");
    if (favorite) {
      event.stopPropagation();
      toggleFavorite(favorite.dataset.favoriteId);
      return;
    }
    var card = event.target.closest("[data-asset-id]");
    if (card) { selectAsset(card.dataset.assetId, true); }
  }

  function onGridDoubleClick(event) {
    if (event.target.closest("[data-favorite-id]")) { return; }
    var card = event.target.closest("[data-asset-id]");
    if (card) {
      selectAsset(card.dataset.assetId, false);
      importSelectedAsset();
    }
  }

  function onGridKeyDown(event) {
    var card = event.target.closest("[data-asset-id]");
    if (!card) { return; }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectAsset(card.dataset.assetId, true);
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(event.key) < 0) { return; }
    event.preventDefault();
    var cards = Array.prototype.slice.call(dom.assetGrid.querySelectorAll("[data-asset-id]"));
    var currentIndex = cards.indexOf(card);
    var columns = getGridColumnCount();
    var nextIndex = currentIndex;
    if (event.key === "ArrowLeft") { nextIndex -= 1; }
    if (event.key === "ArrowRight") { nextIndex += 1; }
    if (event.key === "ArrowUp") { nextIndex -= columns; }
    if (event.key === "ArrowDown") { nextIndex += columns; }
    nextIndex = Math.max(0, Math.min(cards.length - 1, nextIndex));
    cards.forEach(function (item) { item.setAttribute("tabindex", "-1"); });
    cards[nextIndex].setAttribute("tabindex", "0");
    cards[nextIndex].focus();
  }

  function getGridColumnCount() {
    var columns = window.getComputedStyle(dom.assetGrid).gridTemplateColumns;
    return Math.max(1, columns ? columns.split(" ").length : 1);
  }

  function selectAsset(assetId, focusCard) {
    if (!findAsset(assetId)) { return; }
    state.selectedAssetId = assetId;
    Array.prototype.forEach.call(dom.assetGrid.querySelectorAll("[data-asset-id]"), function (control) {
      var selected = control.dataset.assetId === assetId;
      control.closest(".asset-card").classList.toggle("is-selected", selected);
      control.setAttribute("aria-pressed", selected ? "true" : "false");
      control.setAttribute("tabindex", selected ? "0" : "-1");
      if (selected && focusCard) { control.focus(); }
    });
    renderDetail();
    dom.detailPane.classList.add("is-open");
  }

  function renderDetail() {
    var asset = findAsset(state.selectedAssetId);
    dom.detailEmpty.hidden = Boolean(asset);
    dom.detailContent.hidden = !asset;
    if (!asset) {
      dom.detailPane.classList.remove("is-open");
      updateActionAvailability();
      return;
    }
    dom.detailName.textContent = asset.name;
    dom.detailCategory.textContent = asset.category.toUpperCase();
    dom.detailType.textContent = asset.type || asset.category;
    dom.detailCreated.textContent = formatDate(asset.created);
    dom.detailLayers.textContent = String(asset.layerCount);
    dom.detailVersion.textContent = asset.afterEffectsVersion || "—";
    dom.detailDescription.textContent = asset.description || "No description provided.";
    dom.detailTags.textContent = "";
    if (asset.tags.length) {
      asset.tags.forEach(function (tagName) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = tagName;
        dom.detailTags.appendChild(tag);
      });
    } else {
      var noTags = document.createElement("span");
      noTags.className = "muted";
      noTags.textContent = "No tags";
      dom.detailTags.appendChild(noTags);
    }
    dom.favoriteButton.classList.toggle("is-active", asset.favorite);
    dom.favoriteButton.setAttribute("aria-label", asset.favorite ? "Remove from favorites" : "Add to favorites");
    dom.detailPreview.alt = asset.name + " preview";
    dom.detailPreview.classList.remove("is-loaded");
    if (fileExists(asset._thumbnailPath)) {
      bindImage(dom.detailPreview, fileUrl(asset._thumbnailPath, true));
    } else {
      dom.detailPreview.removeAttribute("src");
    }
    updateActionAvailability();
  }

  function toggleFavorite(assetId) {
    var asset = findAsset(assetId);
    if (!asset || state.busy) { return; }
    try {
      assertSafeAssetPath(asset._assetDir);
      var metadata = readJsonFile(asset._metadataPath);
      metadata.favorite = !asset.favorite;
      metadata.updated = new Date().toISOString();
      writeJsonAtomic(asset._metadataPath, metadata);
      asset.favorite = metadata.favorite;
      asset.updated = metadata.updated;
      writeLibraryIndex();
      updateCategoryCounts();
      applyFilters();
      if (findAsset(assetId)) { selectAsset(assetId, false); }
      showToast(metadata.favorite ? "Added to favorites." : "Removed from favorites.", "success", 2200);
    } catch (error) {
      showToast("Favorite could not be updated: " + getErrorMessage(error), "error");
    }
  }

  function openSaveDialog() {
    if (state.busy) { return; }
    if (!state.settings.libraryPath) {
      showSetup("Choose a library location before saving an asset.");
      return;
    }
    if (!state.bridgeReady) {
      showToast("Oplus Engine is not connected. Click the connection status to retry.", "error");
      return;
    }
    state.metadataMode = "create";
    state.dialogAssetId = null;
    state.saveSummary = null;
    dom.metadataDialogEyebrow.textContent = "NEW ASSET";
    dom.metadataDialogTitle.textContent = "Save selected layers";
    dom.metadataSubmitButton.textContent = "SAVE ASSET";
    dom.metadataSubmitButton.disabled = true;
    dom.metadataForm.reset();
    dom.assetCategorySelect.value = "Animations";
    dom.selectionSummary.className = "selection-summary";
    dom.selectionSummary.innerHTML = '<span class="spinner small" aria-hidden="true"></span><span>Inspecting selected layers…</span>';
    clearFieldMessage(dom.metadataValidation);
    openDialog("metadata-dialog", dom.assetNameInput);

    callBridge("OPLUS_getSelectedLayerSummary").then(function (summary) {
      state.saveSummary = normalizeSelectionSummary(summary);
      if (state.saveSummary.layerCount < 1) {
        throw new Error("Select at least one layer in an active composition.");
      }
      dom.selectionSummary.className = "selection-summary is-ready";
      dom.selectionSummary.textContent = state.saveSummary.layerCount + " selected " + (state.saveSummary.layerCount === 1 ? "layer" : "layers") + (state.saveSummary.compositionName ? " in “" + state.saveSummary.compositionName + "”" : "") + ".";
      dom.metadataSubmitButton.disabled = false;
      if (!dom.assetNameInput.value && state.saveSummary.layerNames.length === 1) {
        dom.assetNameInput.value = state.saveSummary.layerNames[0];
        dom.assetNameInput.select();
      }
      if (state.saveSummary.suggestedCategory && CATEGORY_NAMES.indexOf(state.saveSummary.suggestedCategory) >= 0) {
        dom.assetCategorySelect.value = state.saveSummary.suggestedCategory;
      }
    }).catch(function (error) {
      dom.selectionSummary.className = "selection-summary is-error";
      dom.selectionSummary.textContent = getErrorMessage(error);
      dom.metadataSubmitButton.disabled = true;
    });
  }

  function normalizeSelectionSummary(summary) {
    var source = summary && typeof summary === "object" ? summary : {};
    var selected = Array.isArray(source.selectedLayers) ? source.selectedLayers : (Array.isArray(source.layers) ? source.layers : []);
    var names = selected.map(function (item) { return typeof item === "string" ? item : cleanText(item.name, 100); }).filter(Boolean);
    if (!names.length && Array.isArray(source.layerNames)) { names = source.layerNames.map(function (name) { return cleanText(name, 100); }).filter(Boolean); }
    var count = Number(source.layerCount != null ? source.layerCount : (source.count != null ? source.count : selected.length));
    if (!isFinite(count) || count < 0) { count = names.length; }
    var types = Array.isArray(source.types) ? source.types : [];
    return {
      layerCount: Math.round(count),
      layerNames: names,
      types: types.map(function (type) { return cleanText(type, 80); }).filter(Boolean),
      compositionName: cleanText(source.compositionName || source.compName || source.composition, 100),
      suggestedCategory: cleanText(source.suggestedCategory, 80)
    };
  }

  function openEditDialog() {
    var asset = findAsset(state.selectedAssetId);
    if (!asset || state.busy) { return; }
    state.metadataMode = "edit";
    state.dialogAssetId = asset.id;
    dom.metadataDialogEyebrow.textContent = "EDIT ASSET";
    dom.metadataDialogTitle.textContent = "Edit metadata";
    dom.metadataSubmitButton.textContent = "SAVE CHANGES";
    dom.metadataSubmitButton.disabled = false;
    dom.assetNameInput.value = asset.name;
    dom.assetCategorySelect.value = CATEGORY_NAMES.indexOf(asset.category) >= 0 ? asset.category : "Presets";
    dom.assetTagsInput.value = asset.tags.join(", ");
    dom.assetDescriptionInput.value = asset.description;
    dom.selectionSummary.className = "selection-summary is-ready";
    dom.selectionSummary.textContent = asset.layerCount + " stored " + (asset.layerCount === 1 ? "layer" : "layers") + ". Layer data is not changed by metadata edits.";
    clearFieldMessage(dom.metadataValidation);
    openDialog("metadata-dialog", dom.assetNameInput);
  }

  function submitMetadataForm(event) {
    event.preventDefault();
    if (state.busy) { return; }
    var name = cleanText(dom.assetNameInput.value, 100);
    if (!name) {
      setFieldMessage(dom.metadataValidation, "Enter a name for the asset.");
      dom.assetNameInput.focus();
      return;
    }
    clearFieldMessage(dom.metadataValidation);
    var values = {
      name: name,
      category: normalizeCategory(dom.assetCategorySelect.value),
      tags: normalizeTags(dom.assetTagsInput.value),
      description: cleanText(dom.assetDescriptionInput.value, 1000)
    };
    if (state.metadataMode === "edit") {
      updateAssetMetadata(values);
    } else {
      saveNewAsset(values);
    }
  }

  function updateAssetMetadata(values) {
    var asset = findAsset(state.dialogAssetId);
    if (!asset) { setFieldMessage(dom.metadataValidation, "This asset no longer exists."); return; }
    state.busy = true;
    setBusyButton(dom.metadataSubmitButton, true, "SAVING…");
    try {
      assertSafeAssetPath(asset._assetDir);
      var metadata = readJsonFile(asset._metadataPath);
      metadata.name = values.name;
      metadata.category = values.category;
      metadata.tags = values.tags;
      metadata.description = values.description;
      metadata.updated = new Date().toISOString();
      writeJsonAtomic(asset._metadataPath, metadata);
      appendUiLog("EDIT_METADATA", asset.id, null);
      closeDialog("metadata-dialog", true);
      refreshLibrary().then(function () {
        selectAsset(asset.id, false);
        showToast("Asset metadata updated.", "success");
      });
    } catch (error) {
      setFieldMessage(dom.metadataValidation, getErrorMessage(error));
    }
    state.busy = false;
    setBusyButton(dom.metadataSubmitButton, false, "SAVE CHANGES");
  }

  function saveNewAsset(values) {
    if (!state.saveSummary || state.saveSummary.layerCount < 1) {
      setFieldMessage(dom.metadataValidation, "Select at least one layer before saving.");
      return;
    }
    var assetDirectory;
    var assetId = createAssetId();
    var now = new Date().toISOString();
    try {
      assetDirectory = createUniqueAssetDirectory(values.name);
    } catch (error) {
      setFieldMessage(dom.metadataValidation, getErrorMessage(error));
      return;
    }

    var metadata = {
      id: assetId,
      name: values.name,
      category: values.category,
      tags: values.tags,
      description: values.description,
      created: now,
      updated: now,
      afterEffectsVersion: dom.aeVersion.textContent === "—" ? "" : dom.aeVersion.textContent,
      layerCount: state.saveSummary.layerCount,
      type: state.saveSummary.types.length ? state.saveSummary.types.join(", ") : values.category,
      thumbnail: "preview.png",
      favorite: false
    };
    var previewPath = state.path.join(assetDirectory, "preview.png");
    var dataPath = state.path.join(assetDirectory, "data.json");
    var metadataPath = state.path.join(assetDirectory, "asset.json");
    var request = {
      assetDir: assetDirectory,
      assetPath: assetDirectory,
      metadataPath: metadataPath,
      dataPath: dataPath,
      previewPath: previewPath,
      metadata: metadata,
      settings: copyObject(state.settings),
      options: {
        autoThumbnail: state.settings.autoThumbnail !== false
      }
    };

    state.busy = true;
    setBusyButton(dom.metadataSubmitButton, true, "SAVING…");
    callBridge("OPLUS_saveSelected", [request]).then(function (result) {
      if (!fileExists(metadataPath)) {
        var responseMetadata = result && result.metadata && typeof result.metadata === "object" ? result.metadata : {};
        writeJsonAtomic(metadataPath, mergeObjects(metadata, responseMetadata));
      }
      if (!state.settings.autoThumbnail) { return false; }
      dom.selectionSummary.className = "selection-summary";
      dom.selectionSummary.innerHTML = '<span class="spinner small" aria-hidden="true"></span><span>Finalizing preview…</span>';
      return waitForFile(previewPath, 25000);
    }).then(function (previewReady) {
      appendUiLog("SAVE", assetId, null);
      closeDialog("metadata-dialog", true);
      return refreshLibrary().then(function () {
        selectAsset(assetId, false);
        if (state.settings.autoThumbnail && !previewReady) {
          showToast("Asset saved. The preview is still being generated; refresh shortly.", "success", 6500);
        } else {
          showToast("“" + values.name + "” saved to the library.", "success");
        }
      });
    }).catch(function (error) {
      appendUiLog("SAVE", assetId, error);
      cleanupEmptyDirectory(assetDirectory);
      setFieldMessage(dom.metadataValidation, getErrorMessage(error));
      dom.selectionSummary.className = "selection-summary is-error";
      dom.selectionSummary.textContent = "Save failed. Your After Effects project was not modified.";
    }).then(function () {
      state.busy = false;
      setBusyButton(dom.metadataSubmitButton, false, "SAVE ASSET");
    });
  }

  function waitForFile(targetPath, timeoutMs) {
    return new Promise(function (resolve) {
      var started = Date.now();
      var delay = 120;
      function check() {
        if (fileExists(targetPath)) {
          try {
            var stat = state.fs.statSync(targetPath);
            if (stat.size > 0) { resolve(true); return; }
          } catch (ignored) { /* The writer may still own the file. */ }
        }
        if (Date.now() - started >= timeoutMs) { resolve(false); return; }
        delay = Math.min(Math.round(delay * 1.45), 1500);
        window.setTimeout(check, delay);
      }
      check();
    });
  }

  function importSelectedAsset() {
    var asset = findAsset(state.selectedAssetId);
    if (!asset || state.busy) { return; }
    if (!state.bridgeReady) {
      showToast("Oplus Engine is not connected. Click the connection status to retry.", "error");
      return;
    }
    if (!fileExists(asset._dataPath)) {
      showToast("This asset has no data.json file and cannot be imported.", "error");
      return;
    }
    try { assertSafeAssetPath(asset._assetDir); } catch (error) { showToast(getErrorMessage(error), "error"); return; }
    var mode = IMPORT_MODES.indexOf(dom.importModeSelect.value) >= 0 ? dom.importModeSelect.value : "original";
    var request = {
      assetId: asset.id,
      assetDir: asset._assetDir,
      assetPath: asset._assetDir,
      dataPath: asset._dataPath,
      mode: mode,
      options: { mode: mode }
    };
    state.busy = true;
    setBusyButton(dom.importButton, true, "IMPORTING…");
    callBridge("OPLUS_importAsset", [request]).then(function (result) {
      appendUiLog("IMPORT", asset.id, null);
      var count = result && (result.layerCount || result.importedLayerCount || result.count);
      showToast("“" + asset.name + "” imported" + (count ? " (" + count + " layers)" : "") + ". Use Undo in After Effects to revert.", "success", 5200);
      return refreshHostStatus(true);
    }).catch(function (error) {
      appendUiLog("IMPORT", asset.id, error);
      showToast("Import failed: " + getErrorMessage(error), "error", 7000);
    }).then(function () {
      state.busy = false;
      setBusyButton(dom.importButton, false, "IMPORT");
      updateActionAvailability();
    });
  }

  function openDeleteConfirmation() {
    var asset = findAsset(state.selectedAssetId);
    if (!asset || state.busy) { return; }
    dom.confirmCopy.textContent = "This removes “" + asset.name + "” from the active library and moves its folder to .Trash for manual recovery.";
    openDialog("confirm-dialog", dom.confirmCancelButton);
  }

  function deleteSelectedAsset() {
    var asset = findAsset(state.selectedAssetId);
    if (!asset || state.busy) { return; }
    state.busy = true;
    setBusyButton(dom.confirmDeleteButton, true, "DELETING…");
    try {
      moveAssetToTrash(asset._assetDir);
      appendUiLog("DELETE", asset.id, null);
      state.selectedAssetId = null;
      closeDialog("confirm-dialog", true);
      refreshLibrary().then(function () {
        showToast("“" + asset.name + "” moved to .Trash.", "success");
      });
    } catch (error) {
      appendUiLog("DELETE", asset.id, error);
      showToast("Asset could not be deleted: " + getErrorMessage(error), "error");
    }
    state.busy = false;
    setBusyButton(dom.confirmDeleteButton, false, "DELETE");
  }

  function openSettingsDialog() {
    if (state.busy) { return; }
    applySettingsToControls();
    clearFieldMessage(dom.settingsValidation);
    openDialog("settings-dialog", dom.settingsPathInput);
  }

  function submitSettingsForm(event) {
    event.preventDefault();
    if (state.busy) { return; }
    var newSettings = sanitizeSettings({
      libraryPath: stripOuterQuotes(dom.settingsPathInput.value.trim()),
      autoThumbnail: dom.autoThumbnailInput.checked,
      defaultImportMode: dom.defaultModeSelect.value
    });
    var validated;
    try {
      validated = validateLibraryRoot(newSettings.libraryPath);
      newSettings.libraryPath = validated;
    } catch (error) {
      setFieldMessage(dom.settingsValidation, getErrorMessage(error));
      return;
    }
    state.busy = true;
    setBusyButton(dom.settingsSubmitButton, true, "SAVING…");
    initializeLibrary(validated, newSettings).then(function () {
      closeDialog("settings-dialog", true);
      return refreshLibrary();
    }).then(function () {
      showToast("Settings saved.", "success");
      return refreshHostStatus(true);
    }).catch(function (error) {
      setFieldMessage(dom.settingsValidation, getErrorMessage(error));
    }).then(function () {
      state.busy = false;
      setBusyButton(dom.settingsSubmitButton, false, "SAVE SETTINGS");
    });
  }

  function openDialog(id, initialFocus) {
    var dialog = document.getElementById(id);
    if (!dialog) { return; }
    state.lastFocus = document.activeElement;
    dialog.hidden = false;
    window.setTimeout(function () {
      if (initialFocus && !initialFocus.disabled) { initialFocus.focus(); }
      else {
        var focusable = getFocusable(dialog);
        if (focusable.length) { focusable[0].focus(); }
      }
    }, 0);
  }

  function closeDialog(id, force) {
    var dialog = document.getElementById(id);
    if (!dialog || dialog.hidden || (state.busy && !force)) { return; }
    dialog.hidden = true;
    clearFieldMessage(dom.metadataValidation);
    clearFieldMessage(dom.settingsValidation);
    if (state.lastFocus && document.documentElement.contains(state.lastFocus)) {
      state.lastFocus.focus();
    }
    state.lastFocus = null;
  }

  function onGlobalKeyDown(event) {
    var openModal = document.querySelector(".modal-backdrop:not([hidden])");
    if (openModal) {
      if (event.key === "Escape" && !state.busy) {
        event.preventDefault();
        closeDialog(openModal.id);
        return;
      }
      if (event.key === "Tab") { trapFocus(event, openModal); }
      return;
    }
    var targetName = event.target && event.target.tagName ? event.target.tagName.toLowerCase() : "";
    var isEditing = targetName === "input" || targetName === "textarea" || targetName === "select" || (event.target && event.target.isContentEditable);
    if (event.key === "/" && !isEditing) {
      event.preventDefault();
      dom.searchInput.focus();
      dom.searchInput.select();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      openSaveDialog();
    }
    if (event.key === "Escape" && dom.detailPane.classList.contains("is-open")) {
      dom.detailPane.classList.remove("is-open");
    }
  }

  function trapFocus(event, container) {
    var focusable = getFocusable(container);
    if (!focusable.length) { event.preventDefault(); return; }
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getFocusable(container) {
    return Array.prototype.slice.call(container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(function (element) {
      return element.offsetParent !== null;
    });
  }

  function updateCategoryCounts() {
    var counts = { All: state.assets.length, Favorites: 0 };
    CATEGORY_NAMES.forEach(function (category) { counts[category] = 0; });
    state.assets.forEach(function (asset) {
      if (asset.favorite) { counts.Favorites += 1; }
      if (Object.prototype.hasOwnProperty.call(counts, asset.category)) { counts[asset.category] += 1; }
    });
    dom.assetCount.textContent = String(state.assets.length);
    Array.prototype.forEach.call(document.querySelectorAll("[data-count]"), function (element) {
      element.textContent = String(counts[element.dataset.count] || 0);
    });
  }

  function updateActionAvailability() {
    var hasLibrary = Boolean(state.settings.libraryPath && state.assetRoot);
    var selected = Boolean(findAsset(state.selectedAssetId));
    dom.saveButton.disabled = state.busy || !hasLibrary || !state.bridgeReady;
    dom.importButton.disabled = state.busy || !selected || !state.bridgeReady;
    dom.deleteButton.disabled = state.busy || !selected;
    dom.editButton.disabled = state.busy || !selected;
    dom.favoriteButton.disabled = state.busy || !selected;
    dom.refreshButton.disabled = state.busy || !hasLibrary;
  }

  function showLibraryState(view) {
    dom.libraryState.hidden = view === "grid";
    dom.loadingState.hidden = view !== "loading";
    dom.emptyState.hidden = view !== "empty";
    dom.errorState.hidden = view !== "error";
    dom.assetGrid.hidden = view !== "grid";
  }

  function showLibraryError(error) {
    dom.errorMessage.textContent = getErrorMessage(error);
    showLibraryState("error");
  }

  function revealLibrary() {
    if (!state.libraryRoot) { showToast("No library location is configured.", "error"); return; }
    try {
      if (window.cep && window.cep.util && typeof window.cep.util.openURLInDefaultBrowser === "function") {
        window.cep.util.openURLInDefaultBrowser(fileUrl(state.libraryRoot, false));
        return;
      }
      if (state.childProcess) {
        if (navigator.platform.toLowerCase().indexOf("win") >= 0) {
          state.childProcess.spawn("explorer.exe", [state.libraryRoot], { detached: true });
        } else {
          state.childProcess.spawn("open", [state.libraryRoot], { detached: true });
        }
        return;
      }
      throw new Error("Folder reveal is unavailable");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }

  function createUniqueAssetDirectory(assetName) {
    assertNodeAvailable();
    ensureDirectory(state.assetRoot);
    var baseName = sanitizeFolderName(assetName) || "Untitled Asset";
    var candidate = state.path.join(state.assetRoot, baseName);
    var suffix = 2;
    while (state.fs.existsSync(candidate)) {
      candidate = state.path.join(state.assetRoot, baseName + " " + suffix);
      suffix += 1;
      if (suffix > 9999) { throw new Error("Could not create a unique asset folder."); }
    }
    assertSafeAssetPath(candidate, true);
    state.fs.mkdirSync(candidate);
    return candidate;
  }

  function sanitizeFolderName(value) {
    var name = String(value || "").replace(/[<>:\"/\\|?*\x00-\x1F]/g, " ").replace(/[. ]+$/g, "").replace(/\s+/g, " ").trim();
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) { name = "_" + name; }
    return name.slice(0, 90);
  }

  function createAssetId() {
    var date = new Date();
    var stamp = date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    var random = Math.random().toString(36).slice(2, 8);
    return "oplus-" + stamp + "-" + random;
  }

  function assertSafeAssetPath(targetPath, allowMissing) {
    assertNodeAvailable();
    if (!state.assetRoot) { throw new Error("The asset library is not configured."); }
    var root = state.path.resolve(state.assetRoot);
    var target = state.path.resolve(targetPath);
    if (state.path.dirname(target) !== root || target === root) {
      throw new Error("Unsafe asset path was blocked.");
    }
    if (!allowMissing && !state.fs.existsSync(target)) {
      throw new Error("The asset folder no longer exists.");
    }
    if (state.fs.existsSync(target) && state.fs.lstatSync(target).isSymbolicLink()) {
      throw new Error("Symbolic-link asset folders are not supported.");
    }
    return target;
  }

  function cleanupEmptyDirectory(directory) {
    try {
      if (!directory || !state.fs.existsSync(directory)) { return; }
      assertSafeAssetPath(directory);
      if (state.fs.readdirSync(directory).length === 0) { state.fs.rmdirSync(directory); }
    } catch (ignored) { /* Keep partial data for diagnosis; never destroy it automatically. */ }
  }

  function moveAssetToTrash(directory) {
    var source = assertSafeAssetPath(directory);
    var trashRoot = state.path.join(state.libraryRoot, ".Trash");
    ensureDirectory(trashRoot);
    var baseName = state.path.basename(source) + "-" + new Date().toISOString().replace(/[:.]/g, "-");
    var destination = state.path.join(trashRoot, baseName);
    var suffix = 2;
    while (state.fs.existsSync(destination)) {
      destination = state.path.join(trashRoot, baseName + "-" + suffix);
      suffix += 1;
    }
    if (state.path.dirname(state.path.resolve(destination)) !== state.path.resolve(trashRoot)) {
      throw new Error("Unsafe trash path was blocked.");
    }

    var moved = false;
    try {
      state.fs.renameSync(source, destination);
      moved = true;
      if (state.fs.existsSync(source) || !state.fs.existsSync(destination)) {
        throw new Error("The asset move could not be verified.");
      }
      return destination;
    } catch (error) {
      if (moved && state.fs.existsSync(destination) && !state.fs.existsSync(source)) {
        try {
          state.fs.renameSync(destination, source);
        } catch (rollbackError) {
          throw new Error(getErrorMessage(error) + " Rollback also failed: " + getErrorMessage(rollbackError));
        }
      }
      throw error;
    }
  }

  function readJsonFile(filePath) {
    var content = state.fs.readFileSync(filePath, "utf8");
    if (content.charCodeAt(0) === 0xFEFF) { content = content.slice(1); }
    return JSON.parse(content);
  }

  function writeJsonAtomic(filePath, value) {
    assertNodeAvailable();
    ensureDirectory(state.path.dirname(filePath));
    var tempPath = filePath + ".tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    var backupPath = filePath + ".bak";
    var hadOriginal = state.fs.existsSync(filePath);
    state.fs.writeFileSync(tempPath, JSON.stringify(value, null, 2) + "\n", "utf8");
    try {
      if (hadOriginal) {
        safeUnlink(backupPath);
        state.fs.renameSync(filePath, backupPath);
      }
      state.fs.renameSync(tempPath, filePath);
      safeUnlink(backupPath);
    } catch (error) {
      safeUnlink(tempPath);
      if (!state.fs.existsSync(filePath) && state.fs.existsSync(backupPath)) {
        try { state.fs.renameSync(backupPath, filePath); } catch (ignored) { /* Preserve backup for manual recovery. */ }
      }
      throw error;
    }
  }

  function safeUnlink(filePath) {
    try { if (state.fs.existsSync(filePath)) { state.fs.unlinkSync(filePath); } } catch (ignored) { /* Best-effort cleanup. */ }
  }

  function ensureDirectory(directory) {
    if (state.fs.existsSync(directory)) {
      if (!state.fs.statSync(directory).isDirectory()) { throw new Error(directory + " is not a folder."); }
      return;
    }
    if (typeof state.fs.mkdirSync === "function") {
      try { state.fs.mkdirSync(directory, { recursive: true }); return; } catch (error) {
        if (!state.fs.existsSync(directory)) { throw error; }
      }
    }
  }

  function fileExists(filePath) {
    try { return Boolean(filePath && state.fs && state.fs.existsSync(filePath) && state.fs.statSync(filePath).isFile()); }
    catch (ignored) { return false; }
  }

  function fileUrl(filePath, cacheBust) {
    var normalized = String(filePath || "").replace(/\\/g, "/");
    var prefix = normalized.indexOf("//") === 0 ? "file:" : "file:///";
    var url = prefix + encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F");
    if (cacheBust && state.fs) {
      try { url += "?v=" + Math.floor(state.fs.statSync(filePath).mtimeMs || Date.now()); } catch (ignored) { url += "?v=" + Date.now(); }
    }
    return url;
  }

  function appendUiLog(operation, assetId, error) {
    try {
      if (!state.libraryRoot || !state.fs) { return; }
      var logDirectory = state.path.join(state.libraryRoot, "Logs");
      ensureDirectory(logDirectory);
      var line = JSON.stringify({
        date: new Date().toISOString(),
        source: "CEP UI",
        operation: operation,
        assetId: assetId || null,
        error: error ? getErrorMessage(error) : null
      }) + "\n";
      state.fs.appendFileSync(state.path.join(logDirectory, "oplus.log"), line, "utf8");
    } catch (ignored) { /* Logging can never interrupt an asset operation. */ }
  }

  function findAsset(assetId) {
    if (!assetId) { return null; }
    for (var index = 0; index < state.assets.length; index += 1) {
      if (state.assets[index].id === assetId) { return state.assets[index]; }
    }
    return null;
  }

  function normalizeCategory(value) {
    var category = cleanText(value, 80) || "Presets";
    for (var index = 0; index < CATEGORY_NAMES.length; index += 1) {
      if (CATEGORY_NAMES[index].toLowerCase() === category.toLowerCase()) { return CATEGORY_NAMES[index]; }
    }
    return category;
  }

  function normalizeTags(value) {
    var values = Array.isArray(value) ? value : String(value || "").split(",");
    var unique = [];
    values.forEach(function (item) {
      var tag = cleanText(item, 40);
      if (tag && unique.map(function (existing) { return existing.toLowerCase(); }).indexOf(tag.toLowerCase()) < 0) {
        unique.push(tag);
      }
    });
    return unique.slice(0, 20);
  }

  function normalizeLayerCount(value) {
    var number = Number(value);
    return isFinite(number) && number >= 0 ? Math.round(number) : 0;
  }

  function normalizeDate(value, fallback) {
    var date = new Date(value || fallback || Date.now());
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function cleanText(value, maximumLength) {
    return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maximumLength || 1000);
  }

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) { return "—"; }
    try { return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
    catch (ignored) { return date.toISOString().slice(0, 10); }
  }

  function dateNumber(value) {
    var number = new Date(value).getTime();
    return isNaN(number) ? 0 : number;
  }

  function assertNodeAvailable() {
    if (!state.fs || !state.path) { throw new Error("CEP Node.js is unavailable. Verify the manifest enables Node.js."); }
  }

  function setFieldMessage(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function clearFieldMessage(element) {
    element.textContent = "";
    element.hidden = true;
  }

  function setBusyButton(button, busy, label) {
    if (!button.dataset.defaultLabel) { button.dataset.defaultLabel = button.textContent.trim(); }
    button.disabled = busy;
    button.textContent = busy ? label : (label || button.dataset.defaultLabel);
    updateActionAvailability();
  }

  function spinRefreshButton(spinning) {
    var svg = dom.refreshButton.querySelector("svg");
    if (svg) { svg.style.animation = spinning ? "spin .7s linear infinite" : ""; }
    dom.refreshButton.disabled = spinning;
  }

  function showToast(message, type, duration) {
    if (!dom.toastRegion) { return; }
    var toast = document.createElement("div");
    toast.className = "toast" + (type ? " is-" + type : "");
    toast.setAttribute("role", type === "error" ? "alert" : "status");
    var icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = type === "success" ? "✓" : (type === "error" ? "!" : "i");
    var copy = document.createElement("span");
    copy.textContent = message;
    var close = document.createElement("button");
    close.className = "toast-close";
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss notification");
    close.textContent = "×";
    close.addEventListener("click", function () { removeToast(toast); });
    toast.appendChild(icon);
    toast.appendChild(copy);
    toast.appendChild(close);
    dom.toastRegion.appendChild(toast);
    window.setTimeout(function () { removeToast(toast); }, duration || 4200);
  }

  function removeToast(toast) {
    if (toast && toast.parentNode) { toast.parentNode.removeChild(toast); }
  }

  function getErrorMessage(error) {
    if (!error) { return "Unknown error"; }
    if (typeof error === "string") { return error; }
    return error.message || error.description || String(error);
  }

  function copyObject(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function mergeObjects(base, extra) {
    var output = copyObject(base || {});
    Object.keys(extra || {}).forEach(function (key) { output[key] = extra[key]; });
    return output;
  }

  function stripOuterQuotes(value) {
    return String(value || "").replace(/^([\"'])(.*)\1$/, "$2");
  }
}());
