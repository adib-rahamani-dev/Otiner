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
    os: null,
    processEnv: null,
    childProcess: null,
    crypto: null,
    Buffer: null,
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
      "app", "save-button", "receive-button", "update-button", "settings-button", "search-input", "connection-pill", "connection-label",
      "ae-version", "project-status", "library-status", "asset-count", "category-list", "storage-label",
      "reveal-library-button", "view-title", "sort-select", "refresh-button", "library-state", "loading-state",
      "empty-state", "empty-title", "empty-copy", "empty-save-button", "error-state", "error-message", "retry-button",
      "asset-grid", "detail-pane", "detail-empty", "detail-content", "detail-preview", "detail-preview-fallback",
      "favorite-button", "detail-category", "detail-name", "edit-button", "detail-type", "detail-created",
      "detail-layers", "detail-version", "detail-tags", "detail-description", "import-structure-select", "import-mode-select", "import-button", "share-button",
      "delete-button", "setup-screen", "setup-path-input", "setup-browse-button", "setup-validation",
      "setup-continue-button", "metadata-dialog", "metadata-dialog-eyebrow", "metadata-dialog-title", "metadata-form",
      "selection-summary", "save-profile-field", "save-profile-select", "save-profile-help", "asset-name-input", "asset-category-select", "asset-tags-input", "asset-description-input",
      "metadata-validation", "metadata-submit-button", "settings-dialog", "settings-form", "settings-path-input",
      "settings-browse-button", "auto-thumbnail-input", "default-mode-select", "settings-validation",
      "settings-submit-button", "update-dialog", "update-drop-zone", "update-choose-button", "update-status",
      "confirm-dialog", "confirm-copy", "confirm-cancel-button", "confirm-delete-button",
      "toast-region"
    ];
    ids.forEach(function (id) {
      var key = id.replace(/-([a-z])/g, function (_, character) { return character.toUpperCase(); });
      dom[key] = document.getElementById(id);
    });
  }

  function bindEvents() {
    dom.saveButton.addEventListener("click", openSaveDialog);
    dom.receiveButton.addEventListener("click", chooseSharedAssetFile);
    dom.updateButton.addEventListener("click", openUpdateDialog);
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
    dom.shareButton.addEventListener("click", shareSelectedAsset);
    dom.deleteButton.addEventListener("click", openDeleteConfirmation);
    dom.importModeSelect.addEventListener("change", function () {
      state.settings.defaultImportMode = dom.importModeSelect.value;
    });
    dom.saveProfileSelect.addEventListener("change", updateSaveProfileHelp);

    dom.setupPathInput.addEventListener("input", validateSetupInput);
    dom.setupBrowseButton.addEventListener("click", function () { browseForFolder(dom.setupPathInput, validateSetupInput); });
    dom.setupContinueButton.addEventListener("click", completeSetup);

    dom.metadataForm.addEventListener("submit", submitMetadataForm);
    dom.settingsForm.addEventListener("submit", submitSettingsForm);
    dom.settingsBrowseButton.addEventListener("click", function () { browseForFolder(dom.settingsPathInput); });
    dom.confirmCancelButton.addEventListener("click", function () { closeDialog("confirm-dialog"); });
    dom.confirmDeleteButton.addEventListener("click", deleteSelectedAsset);
    dom.updateChooseButton.addEventListener("click", chooseUpdateFile);
    dom.updateDropZone.addEventListener("dragenter", onUpdateDragOver);
    dom.updateDropZone.addEventListener("dragover", onUpdateDragOver);
    dom.updateDropZone.addEventListener("dragleave", onUpdateDragLeave);
    dom.updateDropZone.addEventListener("drop", onUpdateDrop);
    dom.updateDropZone.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        chooseUpdateFile();
      }
    });

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
        state.os = nodeRequire("os");
        state.processEnv = nodeRequire("process").env;
        try { state.Buffer = nodeRequire("buffer").Buffer; } catch (ignoredBuffer) { state.Buffer = null; }
        try { state.crypto = nodeRequire("crypto"); } catch (ignoredCrypto) { state.crypto = null; }
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
      setConnection(null, "Connecting to Otiner Engine…");
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
    /* Never queue a second evalScript while AE is saving, reopening, or importing.
     * Competing status calls during those operations are a common source of stalls. */
    if (state.busy || state.statusBusy || !state.cs) { return Promise.resolve(); }
    state.statusBusy = true;
    if (!silent) { setConnection(null, "Testing Otiner Engine…"); }
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
        setConnection(true, "Otiner Engine Connected");
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
    dom.connectionLabel.textContent = label || (connected ? "Otiner Engine Connected" : "Engine disconnected");
    dom.connectionPill.title = connected ? "Otiner Engine Connected — click to retest" : "Click to test the After Effects connection";
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
        result = cepFs.showOpenDialogEx(false, true, "Choose Otiner Library Location", initial, []);
      } else {
        result = cepFs.showOpenDialog(false, true, "Choose Otiner Library Location", initial, []);
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
    fallback.textContent = "OTINER";
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
      showToast("Otiner Engine is not connected. Click the connection status to retry.", "error");
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
    dom.saveProfileField.hidden = false;
    dom.saveProfileSelect.value = "safe-composition";
    updateSaveProfileHelp();
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

  function updateSaveProfileHelp() {
    var profile = dom.saveProfileSelect.value;
    if (profile === "editable-native") {
      dom.saveProfileHelp.textContent = "Fast exact save. Loads as editable native layers using one batch operation; Safe Precomposition remains available at Load time.";
    } else if (profile === "maximum-compatibility") {
      dom.saveProfileHelp.textContent = "Slowest archive mode. Stores native AEP, full property JSON and packaged Media immediately for maximum fallback compatibility.";
    } else {
      dom.saveProfileHelp.textContent = "Fastest exact save. Loads as one native Precomp and collects Media only when you Share.";
    }
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
    dom.saveProfileField.hidden = true;
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
      description: cleanText(dom.assetDescriptionInput.value, 1000),
      saveProfile: dom.saveProfileSelect.value || "safe-composition"
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
    var mediaSummary = { copied: 0, missing: 0, bytes: 0 };
    var collectMediaNow = values.saveProfile === "maximum-compatibility";
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
      saveProfile: values.saveProfile,
      defaultLoadStructure: values.saveProfile === "safe-composition" ? "composition" : "layers",
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
        autoThumbnail: state.settings.autoThumbnail !== false,
        exactNative: true,
        saveProfile: values.saveProfile
      }
    };

    state.busy = true;
    setBusyButton(dom.metadataSubmitButton, true, "SAVING…");
    callBridge("OPLUS_saveSelected", [request]).then(function (result) {
      if (!fileExists(metadataPath)) {
        var responseMetadata = result && result.metadata && typeof result.metadata === "object" ? result.metadata : {};
        writeJsonAtomic(metadataPath, mergeObjects(metadata, responseMetadata));
      }
      if (collectMediaNow) {
      dom.selectionSummary.className = "selection-summary";
      dom.selectionSummary.innerHTML = '<span class="spinner small" aria-hidden="true"></span><span>Collecting source media and dependencies…</span>';
      mediaSummary = collectAssetMedia(dataPath, assetDirectory);
      try {
        var savedMetadata = readJsonFile(metadataPath);
        savedMetadata.mediaFileCount = mediaSummary.copied;
        savedMetadata.missingMediaCount = mediaSummary.missing;
        savedMetadata.updated = new Date().toISOString();
        writeJsonAtomic(metadataPath, savedMetadata);
      } catch (ignoredMetadata) { /* data.json remains authoritative. */ }
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
        } else if (mediaSummary.missing) {
          showToast("Asset saved, but " + mediaSummary.missing + " source media file(s) were already missing.", "error", 7500);
        } else {
          showToast("“" + values.name + "” saved as " +
            (values.saveProfile === "safe-composition" ? "Safe Composition" :
              (values.saveProfile === "editable-native" ? "Editable Native" : "Maximum Compatibility")) +
            (mediaSummary.copied ? " with " + mediaSummary.copied + " media file(s)." : "."), "success", 6200);
        }
      });
    }).catch(function (error) {
      appendUiLog("SAVE", assetId, error);
      try { removeTreeInside(state.assetRoot, assetDirectory); } catch (ignoredCleanup) { cleanupEmptyDirectory(assetDirectory); }
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

  function sha256File(filePath) {
    if (!state.crypto) { return ""; }
    var hash = state.crypto.createHash("sha256");
    if (!state.Buffer) {
      hash.update(state.fs.readFileSync(filePath));
      return hash.digest("hex");
    }
    var descriptor = state.fs.openSync(filePath, "r");
    var buffer = state.Buffer.alloc(4 * 1024 * 1024);
    var bytesRead;
    try {
      do {
        bytesRead = state.fs.readSync(descriptor, buffer, 0, buffer.length, null);
        if (bytesRead > 0) { hash.update(buffer.slice(0, bytesRead)); }
      } while (bytesRead > 0);
    } finally {
      state.fs.closeSync(descriptor);
    }
    return hash.digest("hex");
  }

  function copyFileWithSha256(sourceFile, targetFile) {
    if (!state.Buffer || !state.crypto) {
      state.fs.copyFileSync(sourceFile, targetFile);
      return sha256File(targetFile);
    }
    var sourceDescriptor = state.fs.openSync(sourceFile, "r");
    var targetDescriptor = null;
    var hash = state.crypto.createHash("sha256");
    var buffer = state.Buffer.alloc(4 * 1024 * 1024);
    var bytesRead;
    var written;
    try {
      targetDescriptor = state.fs.openSync(targetFile, "w");
      do {
        bytesRead = state.fs.readSync(sourceDescriptor, buffer, 0, buffer.length, null);
        if (bytesRead > 0) {
          hash.update(buffer.slice(0, bytesRead));
          written = 0;
          while (written < bytesRead) {
            written += state.fs.writeSync(targetDescriptor, buffer, written, bytesRead - written, null);
          }
        }
      } while (bytesRead > 0);
    } catch (error) {
      try { if (targetDescriptor !== null) { state.fs.closeSync(targetDescriptor); targetDescriptor = null; } } catch (ignoredClose) {}
      try { if (state.fs.existsSync(targetFile)) { state.fs.unlinkSync(targetFile); } } catch (ignoredCleanup) {}
      throw error;
    } finally {
      try { state.fs.closeSync(sourceDescriptor); } catch (ignoredSourceClose) {}
      try { if (targetDescriptor !== null) { state.fs.closeSync(targetDescriptor); } } catch (ignoredTargetClose) {}
    }
    return hash.digest("hex");
  }

  function sequenceFilesFor(filePath, source) {
    var files = [filePath];
    var extension = state.path.extname(filePath).toLowerCase();
    var imageExtensions = [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr", ".dpx", ".bmp", ".gif", ".tga", ".webp"];
    var isStill = source && source.interpretation ? source.interpretation.isStill : true;
    var match = state.path.basename(filePath).match(/^(.*?)(\d+)(\.[^.]+)$/);
    if (isStill !== false || imageExtensions.indexOf(extension) < 0 || !match) { return files; }
    var directory = state.path.dirname(filePath);
    var prefix = match[1];
    var suffix = match[3].toLowerCase();
    files = state.fs.readdirSync(directory).filter(function (name) {
      var candidate = name.match(/^(.*?)(\d+)(\.[^.]+)$/);
      return candidate && candidate[1] === prefix && candidate[3].toLowerCase() === suffix;
    }).map(function (name) { return state.path.join(directory, name); }).filter(fileExists).sort();
    source.sequence = files.length > 1;
    return files.length ? files : [filePath];
  }

  function collectAssetMedia(dataPath, assetDirectory) {
    assertNodeAvailable();
    var data = readJsonFile(dataPath);
    var mediaRoot = state.path.join(assetDirectory, "Media");
    var copiedByOriginal = {};
    var manifest = [];
    var summary = { copied: 0, missing: 0, bytes: 0 };
    if (Array.isArray(data.mediaManifest) && data.mediaManifest.length) {
      data.mediaManifest.forEach(function (entry) { summary.bytes += Number(entry.size) || 0; });
      return summary;
    }

    function packageSource(source) {
      if (!source || typeof source !== "object" || !source.filePath || source.packagedPath) { return; }
      var original = state.path.resolve(String(source.filePath));
      var key = state.os && state.os.platform() === "win32" ? original.toLowerCase() : original;
      if (copiedByOriginal[key]) {
        source.packagedPath = copiedByOriginal[key];
        return;
      }
      if (!fileExists(original)) {
        source.mediaMissing = true;
        summary.missing += 1;
        return;
      }
      var identity = state.crypto ? state.crypto.createHash("sha256").update(key).digest("hex").slice(0, 16) : String(manifest.length + 1);
      var targetFolder = state.path.join(mediaRoot, identity);
      ensureDirectory(targetFolder);
      var files = sequenceFilesFor(original, source);
      files.forEach(function (sourceFile) {
        var targetFile = state.path.join(targetFolder, state.path.basename(sourceFile));
        var sha256 = copyFileWithSha256(sourceFile, targetFile);
        var stat = state.fs.statSync(targetFile);
        var packaged = state.path.relative(assetDirectory, targetFile).replace(/\\/g, "/");
        manifest.push({
          originalPath: sourceFile,
          packagedPath: packaged,
          size: stat.size,
          sha256: sha256,
          sequence: !!source.sequence,
          forceAlphabetical: !!source.forceAlphabetical
        });
        summary.copied += 1;
        summary.bytes += stat.size;
      });
      source.packagedPath = state.path.relative(assetDirectory,
        state.path.join(targetFolder, state.path.basename(original))).replace(/\\/g, "/");
      copiedByOriginal[key] = source.packagedPath;
    }

    function visit(value) {
      if (!value || typeof value !== "object") { return; }
      if (!Array.isArray(value) && value.filePath) { packageSource(value); }
      Object.keys(value).forEach(function (key) {
        if (key !== "mediaManifest" && value[key] && typeof value[key] === "object") { visit(value[key]); }
      });
    }

    visit(data);
    data.mediaManifest = manifest;
    data.mediaCollectedAt = new Date().toISOString();
    writeJsonAtomic(dataPath, data);
    return summary;
  }

  function importSelectedAsset() {
    var asset = findAsset(state.selectedAssetId);
    if (!asset || state.busy) { return; }
    if (!state.bridgeReady) {
      showToast("Otiner Engine is not connected. Click the connection status to retry.", "error");
      return;
    }
    if (!fileExists(asset._dataPath)) {
      showToast("This asset has no data.json file and cannot be imported.", "error");
      return;
    }
    try { assertSafeAssetPath(asset._assetDir); } catch (error) { showToast(getErrorMessage(error), "error"); return; }
    var mode = IMPORT_MODES.indexOf(dom.importModeSelect.value) >= 0 ? dom.importModeSelect.value : "original";
    var structure = ["saved", "composition", "layers", "compatibility"].indexOf(dom.importStructureSelect.value) >= 0 ?
      dom.importStructureSelect.value : "saved";
    var request = {
      assetId: asset.id,
      assetDir: asset._assetDir,
      assetPath: asset._assetDir,
      dataPath: asset._dataPath,
      mode: mode,
      loadStructure: structure,
      options: { mode: mode, structure: structure, allowLegacyLayerCopy: false }
    };
    state.busy = true;
    setBusyButton(dom.importButton, true, "LOADING…");
    callBridge("OPLUS_importAsset", [request]).then(function (result) {
      appendUiLog("IMPORT", asset.id, null);
      var count = result && (result.layerCount || result.importedLayerCount || result.count);
      var structureLabel = result && result.structure === "composition" ? " as one Safe Precomposition" :
        (result && result.structure === "compatibility" ? " with Compatibility Rebuild" : " as editable native layers");
      showToast("“" + asset.name + "” loaded" + structureLabel + (count ? " (" + count + ")" : "") + ". Use Undo to revert.", "success", 6200);
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

  function shareSelectedAsset() {
    var asset = findAsset(state.selectedAssetId);
    if (!asset || state.busy) { return; }
    try {
      assertNodeAvailable();
      assertSafeAssetPath(asset._assetDir);
      if (!state.childProcess) { throw new Error("System packaging tools are unavailable."); }
      var destinationRoot = chooseFolderPath("Choose where to save the shared Otiner asset");
      if (!destinationRoot) { return; }
      state.busy = true;
      setBusyButton(dom.shareButton, true, "COLLECTING MEDIA…");
      collectAssetMedia(asset._dataPath, asset._assetDir);
      validateSharedAssetPayload(asset._assetDir);
      var baseName = sanitizeFolderName(asset.name) || "Otiner Asset";
      var outputPath = uniqueFilePath(destinationRoot, baseName + ".otiner-asset.zip");
      setBusyButton(dom.shareButton, true, "PACKAGING…");
      createZipFromDirectory(asset._assetDir, outputPath);
      if (!fileExists(outputPath)) { throw new Error("The shared asset package was not created."); }
      appendUiLog("SHARE", asset.id, null);
      revealPath(outputPath);
      showToast("Shared asset created: " + state.path.basename(outputPath), "success", 6500);
    } catch (error) {
      appendUiLog("SHARE", asset ? asset.id : null, error);
      showToast("Share failed: " + getErrorMessage(error), "error", 7500);
    }
    state.busy = false;
    setBusyButton(dom.shareButton, false, "SHARE ASSET");
    updateActionAvailability();
  }

  function chooseSharedAssetFile() {
    if (state.busy) { return; }
    try {
      var filePath = chooseFilePath("Choose a shared Otiner asset", ["zip", "otiner-asset"]);
      if (filePath) { importSharedAssetPackage(filePath); }
    } catch (error) {
      showToast("Shared asset could not be selected: " + getErrorMessage(error), "error", 7000);
    }
  }

  function importSharedAssetPackage(packagePath) {
    var temporaryRoot = "";
    var importedTarget = "";
    try {
      assertNodeAvailable();
      if (!state.os || !state.childProcess || !state.assetRoot) { throw new Error("The Otiner library is not ready."); }
      packagePath = state.path.resolve(packagePath);
      if (!fileExists(packagePath) || !/\.(zip|otiner-asset)$/i.test(packagePath)) {
        throw new Error("Choose one .otiner-asset.zip package.");
      }
      state.busy = true;
      setBusyButton(dom.receiveButton, true, "ADDING…");
      temporaryRoot = state.fs.mkdtempSync(state.path.join(state.os.tmpdir(), "otiner-asset-"));
      var extractRoot = state.path.join(temporaryRoot, "extracted");
      ensureDirectory(extractRoot);
      extractUpdateArchive(packagePath, extractRoot, 100000);
      var packageRoot = findSharedAssetPayload(extractRoot);
      validateSharedAssetPayload(packageRoot);
      var metadata = readJsonFile(state.path.join(packageRoot, "asset.json"));
      var target = createUniqueAssetDirectory(metadata.name || "Shared Asset");
      importedTarget = target;
      copyTreeSafe(packageRoot, target);
      var newId = createAssetId();
      var targetMetadataPath = state.path.join(target, "asset.json");
      var targetDataPath = state.path.join(target, "data.json");
      metadata = readJsonFile(targetMetadataPath);
      metadata.id = newId;
      metadata.importedFromPackage = state.path.basename(packagePath);
      metadata.importedAt = new Date().toISOString();
      metadata.updated = metadata.importedAt;
      writeJsonAtomic(targetMetadataPath, metadata);
      var data = readJsonFile(targetDataPath);
      if (data.asset) { data.asset.id = newId; data.asset.updated = metadata.updated; }
      writeJsonAtomic(targetDataPath, data);
      importedTarget = "";
      appendUiLog("RECEIVE_SHARED_ASSET", newId, null);
      refreshLibrary().then(function () {
        selectAsset(newId, false);
        showToast("Shared asset “" + (metadata.name || "Asset") + "” added with all packaged media.", "success", 6500);
      });
    } catch (error) {
      if (importedTarget) {
        try { removeTreeInside(state.assetRoot, importedTarget); } catch (ignoredPartialCleanup) { /* best effort */ }
      }
      appendUiLog("RECEIVE_SHARED_ASSET", null, error);
      showToast("Add shared asset failed: " + getErrorMessage(error), "error", 8500);
    } finally {
      if (temporaryRoot) {
        try { removeTreeInside(state.os.tmpdir(), temporaryRoot); } catch (ignoredCleanup) { /* best effort */ }
      }
      state.busy = false;
      setBusyButton(dom.receiveButton, false, "ADD ASSET");
      updateActionAvailability();
    }
  }

  function findSharedAssetPayload(extractRoot) {
    var valid = [];
    function scan(directory, depth) {
      if (depth > 3) { return; }
      if (fileExists(state.path.join(directory, "asset.json")) && fileExists(state.path.join(directory, "data.json"))) {
        valid.push(directory);
        return;
      }
      state.fs.readdirSync(directory).forEach(function (name) {
        var child = state.path.join(directory, name);
        if (state.fs.lstatSync(child).isDirectory()) { scan(child, depth + 1); }
      });
    }
    scan(extractRoot, 0);
    if (valid.length !== 1) { throw new Error("The package must contain exactly one complete Otiner asset."); }
    return valid[0];
  }

  function validateSharedAssetPayload(packageRoot) {
    var totals = { files: 0, bytes: 0 };
    function inspect(directory) {
      state.fs.readdirSync(directory).forEach(function (name) {
        var item = state.path.join(directory, name);
        var stat = state.fs.lstatSync(item);
        if (stat.isSymbolicLink()) { throw new Error("Shared asset packages cannot contain symbolic links."); }
        if (stat.isDirectory()) { inspect(item); }
        else {
          totals.files += 1;
          totals.bytes += stat.size;
          if (totals.files > 100000 || totals.bytes > 20 * 1024 * 1024 * 1024) {
            throw new Error("The shared asset package exceeds the 20 GB safety limit.");
          }
        }
      });
    }
    inspect(packageRoot);
    var metadata = readJsonFile(state.path.join(packageRoot, "asset.json"));
    var data = readJsonFile(state.path.join(packageRoot, "data.json"));
    if (!metadata || !metadata.name || !data || !Array.isArray(data.layers)) {
      throw new Error("The shared asset metadata or layer data is invalid.");
    }
    (data.mediaManifest || []).forEach(function (entry) {
      var relative = String(entry.packagedPath || "").replace(/\\/g, "/");
      if (!relative || relative.split("/").indexOf("..") >= 0 || state.path.isAbsolute(relative)) {
        throw new Error("Unsafe media path was blocked.");
      }
      var mediaFile = state.path.resolve(packageRoot, relative);
      var within = state.path.relative(state.path.resolve(packageRoot), mediaFile);
      if (!within || within.indexOf(".." + state.path.sep) === 0 || !fileExists(mediaFile)) {
        throw new Error("A packaged media file is missing: " + relative);
      }
      if (entry.size !== undefined && state.fs.statSync(mediaFile).size !== Number(entry.size)) {
        throw new Error("A packaged media file has the wrong size: " + relative);
      }
      if (entry.sha256 && sha256File(mediaFile).toLowerCase() !== String(entry.sha256).toLowerCase()) {
        throw new Error("A packaged media file failed integrity verification: " + relative);
      }
    });
    return totals;
  }

  function openUpdateDialog() {
    if (state.busy) { return; }
    setUpdateStatus("Drop an Otiner update ZIP here. Your current code is backed up before installation.");
    openDialog("update-dialog", dom.updateDropZone);
  }

  function chooseUpdateFile() {
    if (state.busy) { return; }
    var filePath = chooseFilePath("Choose an Otiner update package", ["zip", "otiner-update"]);
    if (filePath) { installUpdatePackage(filePath); }
  }

  function onUpdateDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) { event.dataTransfer.dropEffect = "copy"; }
    dom.updateDropZone.classList.add("is-dragging");
  }

  function onUpdateDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!dom.updateDropZone.contains(event.relatedTarget)) {
      dom.updateDropZone.classList.remove("is-dragging");
    }
  }

  function onUpdateDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    dom.updateDropZone.classList.remove("is-dragging");
    var files = event.dataTransfer && event.dataTransfer.files;
    if (!files || files.length !== 1 || !files[0].path) {
      setUpdateStatus("Drop exactly one local update ZIP file.", "error");
      return;
    }
    installUpdatePackage(files[0].path);
  }

  function installUpdatePackage(packagePath) {
    if (state.busy) { return; }
    var temporaryRoot = "";
    try {
      assertNodeAvailable();
      if (!state.os || !state.childProcess) { throw new Error("CEP Node update services are unavailable."); }
      packagePath = state.path.resolve(packagePath);
      if (!fileExists(packagePath)) { throw new Error("The update file does not exist."); }
      if (!/\.(zip|otiner-update)$/i.test(packagePath)) { throw new Error("Update packages must end in .zip or .otiner-update."); }
      state.busy = true;
      updateActionAvailability();
      setUpdateStatus("Checking and unpacking " + state.path.basename(packagePath) + "…");

      temporaryRoot = state.fs.mkdtempSync(state.path.join(state.os.tmpdir(), "otiner-update-"));
      var extractRoot = state.path.join(temporaryRoot, "extracted");
      ensureDirectory(extractRoot);
      extractUpdateArchive(packagePath, extractRoot);
      var payloadRoot = findUpdatePayload(extractRoot);
      var updateInfo = validateUpdatePayload(payloadRoot);
      var currentInfo = readCurrentBuildInfo();
      if (compareVersions(updateInfo.version, currentInfo.version) <= 0) {
        throw new Error("This update is version " + updateInfo.version + "; installed version is " + currentInfo.version + ". A newer version is required.");
      }
      setUpdateStatus("Installing Otiner " + updateInfo.version + " and creating a rollback backup…");
      applyUpdatePayload(payloadRoot, updateInfo, currentInfo);
      setUpdateStatus("Otiner " + updateInfo.version + " installed. Close After Effects completely and open it again.", "success");
      appendUiLog("SELF_UPDATE", null, null);
      showToast("Update installed. Restart After Effects to load Otiner " + updateInfo.version + ".", "success", 9000);
    } catch (error) {
      setUpdateStatus("Update failed: " + getErrorMessage(error), "error");
      appendUiLog("SELF_UPDATE", null, error);
      showToast("Update failed: " + getErrorMessage(error), "error", 9000);
    } finally {
      if (temporaryRoot) {
        try { removeTreeInside(state.os.tmpdir(), temporaryRoot); } catch (ignoredCleanup) { /* OS temp cleanup is best effort. */ }
      }
      state.busy = false;
      updateActionAvailability();
    }
  }

  function setUpdateStatus(message, type) {
    dom.updateStatus.textContent = message;
    dom.updateStatus.className = "update-status" + (type ? " is-" + type : "");
  }

  function chooseFolderPath(title) {
    var cepFs = window.cep && window.cep.fs;
    if (!cepFs) { throw new Error("The folder picker is unavailable."); }
    var result = typeof cepFs.showOpenDialogEx === "function" ?
      cepFs.showOpenDialogEx(false, true, title, state.libraryRoot || state.userDataPath || "", []) :
      cepFs.showOpenDialog(false, true, title, state.libraryRoot || state.userDataPath || "", []);
    return result && result.err === 0 && result.data && result.data.length ? stripFileScheme(result.data[0]) : "";
  }

  function chooseFilePath(title, extensions) {
    var cepFs = window.cep && window.cep.fs;
    if (!cepFs) { throw new Error("The file picker is unavailable."); }
    var result = typeof cepFs.showOpenDialogEx === "function" ?
      cepFs.showOpenDialogEx(false, false, title, state.userDataPath || "", extensions || []) :
      cepFs.showOpenDialog(false, false, title, state.userDataPath || "", extensions || []);
    return result && result.err === 0 && result.data && result.data.length ? stripFileScheme(result.data[0]) : "";
  }

  function uniqueFilePath(directory, fileName) {
    var parsed = state.path.parse(fileName);
    var candidate = state.path.join(directory, fileName);
    var suffix = 2;
    while (state.fs.existsSync(candidate)) {
      candidate = state.path.join(directory, parsed.name + "-" + suffix + parsed.ext);
      suffix += 1;
    }
    return candidate;
  }

  function createZipFromDirectory(sourceDirectory, outputPath) {
    var result;
    var platform = String(state.os.platform()).toLowerCase();
    if (platform === "win32") {
      result = state.childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "Compress-Archive -LiteralPath $env:OTINER_SHARE_SOURCE -DestinationPath $env:OTINER_SHARE_OUTPUT -CompressionLevel Optimal"], {
        encoding: "utf8",
        env: mergeObjects(state.processEnv || {}, { OTINER_SHARE_SOURCE: sourceDirectory, OTINER_SHARE_OUTPUT: outputPath })
      });
    } else {
      result = state.childProcess.spawnSync("/usr/bin/ditto", ["-c", "-k", "--keepParent", sourceDirectory, outputPath], { encoding: "utf8" });
    }
    if (result.error || result.status !== 0) {
      throw new Error("Asset packaging failed: " + getProcessError(result));
    }
  }

  function extractUpdateArchive(packagePath, destination, entryLimit) {
    var listed;
    var extracted;
    var platform = String(state.os.platform()).toLowerCase();
    var environment = mergeObjects(state.processEnv || {}, { OTINER_UPDATE_ARCHIVE: packagePath, OTINER_UPDATE_DEST: destination });
    if (platform === "win32") {
      listed = state.childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[IO.Compression.ZipFile]::OpenRead($env:OTINER_UPDATE_ARCHIVE); try {$a.Entries | ForEach-Object {$_.FullName}} finally {$a.Dispose()}"],
        { encoding: "utf8", env: environment });
      if (listed.error || listed.status !== 0) { throw new Error("Update archive could not be read: " + getProcessError(listed)); }
      validateArchiveEntries(String(listed.stdout || "").split(/\r?\n/), entryLimit);
      extracted = state.childProcess.spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:OTINER_UPDATE_ARCHIVE,$env:OTINER_UPDATE_DEST)"],
        { encoding: "utf8", env: environment });
    } else {
      listed = state.childProcess.spawnSync("/usr/bin/unzip", ["-Z1", packagePath], { encoding: "utf8" });
      if (listed.error || listed.status !== 0) { throw new Error("Update archive could not be read: " + getProcessError(listed)); }
      validateArchiveEntries(String(listed.stdout || "").split(/\r?\n/), entryLimit);
      extracted = state.childProcess.spawnSync("/usr/bin/unzip", ["-qq", packagePath, "-d", destination], { encoding: "utf8" });
    }
    if (extracted.error || extracted.status !== 0) {
      throw new Error("Update archive could not be extracted: " + getProcessError(extracted));
    }
  }

  function validateArchiveEntries(entries, entryLimit) {
    var meaningful = entries.filter(Boolean);
    entryLimit = Number(entryLimit) || 5000;
    if (!meaningful.length || meaningful.length > entryLimit) { throw new Error("Archive has an invalid file count."); }
    meaningful.forEach(function (entry) {
      var normalized = String(entry).replace(/\\/g, "/");
      if (!normalized || normalized.length > 500 || normalized.indexOf("\u0000") >= 0 ||
          normalized.charAt(0) === "/" || /^[A-Za-z]:/.test(normalized) ||
          normalized.split("/").indexOf("..") >= 0) {
        throw new Error("Unsafe path in update archive was blocked: " + normalized);
      }
    });
  }

  function findUpdatePayload(extractRoot) {
    var candidates = [extractRoot];
    state.fs.readdirSync(extractRoot).forEach(function (name) {
      var candidate = state.path.join(extractRoot, name);
      if (state.fs.statSync(candidate).isDirectory()) { candidates.push(candidate); }
    });
    var valid = candidates.filter(function (candidate) {
      return fileExists(state.path.join(candidate, "build-info.json")) &&
        fileExists(state.path.join(candidate, "CSXS", "manifest.xml")) &&
        fileExists(state.path.join(candidate, "UI", "index.html"));
    });
    if (valid.length !== 1) { throw new Error("Update ZIP must contain exactly one complete Otiner extension folder."); }
    return valid[0];
  }

  function validateUpdatePayload(payloadRoot) {
    inspectTree(payloadRoot, { files: 0, bytes: 0 });
    var info = readJsonFile(state.path.join(payloadRoot, "build-info.json"));
    if (info.bundleId !== "studio.oplus.ae") { throw new Error("This update belongs to a different extension."); }
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(String(info.version || ""))) {
      throw new Error("Update build-info contains an invalid version.");
    }
    return info;
  }

  function inspectTree(root, totals) {
    state.fs.readdirSync(root).forEach(function (name) {
      var item = state.path.join(root, name);
      var stat = state.fs.lstatSync(item);
      if (stat.isSymbolicLink()) { throw new Error("Symbolic links are not allowed in update packages."); }
      if (stat.isDirectory()) { inspectTree(item, totals); }
      else {
        totals.files += 1;
        totals.bytes += stat.size;
        if (totals.files > 5000 || totals.bytes > 500 * 1024 * 1024) { throw new Error("Update package exceeds safety limits."); }
      }
    });
    return totals;
  }

  function readCurrentBuildInfo() {
    var infoPath = state.path.join(state.extensionPath, "build-info.json");
    if (fileExists(infoPath)) { return readJsonFile(infoPath); }
    return { version: "0.0.0", bundleId: "studio.oplus.ae" };
  }

  function compareVersions(left, right) {
    var a = String(left || "0.0.0").split(/[+-]/)[0].split(".");
    var b = String(right || "0.0.0").split(/[+-]/)[0].split(".");
    for (var index = 0; index < 3; index += 1) {
      var difference = (Number(a[index]) || 0) - (Number(b[index]) || 0);
      if (difference) { return difference > 0 ? 1 : -1; }
    }
    return 0;
  }

  function applyUpdatePayload(payloadRoot, updateInfo, currentInfo) {
    var extensionRoot = state.path.resolve(state.extensionPath);
    var extensionParent = state.path.dirname(extensionRoot);
    if (!fileExists(state.path.join(extensionRoot, "CSXS", "manifest.xml"))) {
      throw new Error("The installed Otiner extension root could not be verified.");
    }
    var token = Date.now() + "-" + Math.random().toString(36).slice(2, 8);
    var stagedRoot = state.path.join(extensionParent, ".studio.oplus.ae-update-" + token);
    var backupRoot = state.path.join(state.runtimeDataPath || state.userDataPath, "Updates", "backups",
      String(currentInfo.version || "unknown") + "-" + new Date().toISOString().replace(/[:.]/g, "-"));
    assertDirectChild(extensionParent, stagedRoot);
    copyTreeSafe(extensionRoot, backupRoot);
    copyTreeSafe(payloadRoot, stagedRoot);
    ["Database", "Logs", "Cache"].forEach(function (name) {
      var existing = state.path.join(extensionRoot, name);
      var staged = state.path.join(stagedRoot, name);
      if (state.fs.existsSync(existing)) {
        if (state.fs.existsSync(staged)) { removeTreeInside(stagedRoot, staged); }
        copyTreeSafe(existing, staged);
      }
    });
    try {
      copyTreeSafe(stagedRoot, extensionRoot);
      if (!fileExists(state.path.join(extensionRoot, "build-info.json"))) {
        throw new Error("Installed update could not be verified after replacement.");
      }
      var installedInfo = readJsonFile(state.path.join(extensionRoot, "build-info.json"));
      if (installedInfo.version !== updateInfo.version) {
        throw new Error("Installed version does not match the update package.");
      }
      removeTreeInside(extensionParent, stagedRoot);
    } catch (error) {
      try {
        copyTreeSafe(backupRoot, extensionRoot);
        if (state.fs.existsSync(stagedRoot)) { removeTreeInside(extensionParent, stagedRoot); }
      } catch (rollbackError) {
        throw new Error(getErrorMessage(error) + " Rollback failed; backup is at " + backupRoot + ". " + getErrorMessage(rollbackError));
      }
      throw error;
    }
  }

  function getProcessError(result) {
    if (!result) { return "unknown process error"; }
    if (result.error) { return getErrorMessage(result.error); }
    return String(result.stderr || result.stdout || ("exit code " + result.status)).trim();
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
    dom.receiveButton.disabled = state.busy || !hasLibrary || !state.childProcess;
    dom.updateButton.disabled = state.busy || !state.fs || !state.path;
    dom.importButton.disabled = state.busy || !selected || !state.bridgeReady;
    dom.shareButton.disabled = state.busy || !selected || !state.childProcess;
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

  function assertDirectChild(parent, candidate) {
    var resolvedParent = state.path.resolve(parent);
    var resolvedCandidate = state.path.resolve(candidate);
    if (resolvedCandidate === resolvedParent || state.path.dirname(resolvedCandidate) !== resolvedParent) {
      throw new Error("Unsafe filesystem target was blocked: " + resolvedCandidate);
    }
    return resolvedCandidate;
  }

  function copyTreeSafe(source, target) {
    var sourceStat = state.fs.lstatSync(source);
    if (sourceStat.isSymbolicLink()) { throw new Error("Symbolic links cannot be copied: " + source); }
    if (!sourceStat.isDirectory()) {
      ensureDirectory(state.path.dirname(target));
      state.fs.copyFileSync(source, target);
      return;
    }
    ensureDirectory(target);
    state.fs.readdirSync(source).forEach(function (name) {
      copyTreeSafe(state.path.join(source, name), state.path.join(target, name));
    });
  }

  function removeTreeInside(root, target) {
    var resolvedRoot = state.path.resolve(root);
    var resolvedTarget = state.path.resolve(target);
    var relative = state.path.relative(resolvedRoot, resolvedTarget);
    if (!relative || relative === ".." || relative.indexOf(".." + state.path.sep) === 0 || state.path.isAbsolute(relative)) {
      throw new Error("Unsafe cleanup target was blocked: " + resolvedTarget);
    }
    if (!state.fs.existsSync(resolvedTarget)) { return; }
    var stat = state.fs.lstatSync(resolvedTarget);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      state.fs.unlinkSync(resolvedTarget);
      return;
    }
    state.fs.readdirSync(resolvedTarget).forEach(function (name) {
      removeTreeInside(resolvedRoot, state.path.join(resolvedTarget, name));
    });
    state.fs.rmdirSync(resolvedTarget);
  }

  function revealPath(targetPath) {
    if (!state.childProcess) { return; }
    if (String(state.os.platform()).toLowerCase() === "win32") {
      state.childProcess.spawn("explorer.exe", ["/select,", targetPath], { detached: true });
    } else {
      state.childProcess.spawn("/usr/bin/open", ["-R", targetPath], { detached: true });
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
