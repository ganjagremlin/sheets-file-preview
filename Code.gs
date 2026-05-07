/**
 * Markdown File Preview for Google Sheets
 * https://github.com/ganjagremlin/sheets-file-preview
 *
 * Opens a sidebar (or wider modeless dialog) showing rendered markdown
 * for markdown notes synced to Google Drive, referenced by filename in
 * a configurable column of your sheet.
 */

// ---- defaults (overridden at runtime by user settings) ----

const CONFIG = {
  vaultFolderName: 'obsidian',  // overridden by setup
  fileNameColumns: [            // overridden by setup
    { column: 3, label: '' }    // Column C = 3
  ],
  headerRow: 1,
  cacheTtlSeconds: 300,
  sidebarTitle: 'Note Preview',
  dialogWidth: 900,
  dialogHeight: 700,
  dialogMinWidth: 400,
  dialogMaxWidth: 1600,
  dialogMinHeight: 300,
  dialogMaxHeight: 1200
};

// PropertiesService keys
const PROP_VAULT_FOLDER   = 'vaultFolderName';
const PROP_FILE_COL       = 'fileNameColumn';   // legacy: single int, read for back-compat
const PROP_FILE_COLS      = 'fileNameColumns';  // current: JSON [{column, label}, ...]
const PROP_SETUP_DONE     = 'setupComplete';
const PROP_DIALOG_WIDTH   = 'dialogWidth';
const PROP_DIALOG_HEIGHT  = 'dialogHeight';
const PROP_AUTO_UPDATE    = 'autoUpdate';

// ---- menu ----

/**
 * Simple trigger — runs automatically when the sheet opens.
 * Shows a first-run setup prompt if setup hasn't been completed yet.
 *
 * Note: throws when run manually from the Apps Script editor (no UI context).
 * The try/catch makes that a silent no-op. To trigger the auth flow during
 * installation, run any other function from the editor instead.
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    const menu = ui.createMenu('📄 Notes')
      .addItem('Preview Selected File',           'previewSelectedFile')
      .addItem('Preview Selected File (Dialog)',  'previewSelectedFileAsDialog')
      .addSeparator()
      .addItem('Settings',    'showSettings')
      .addItem('Clear Cache', 'clearAllCaches')
      .addToUi();

    // Show the setup dialog automatically on first run.
    const props = PropertiesService.getUserProperties();
    if (!props.getProperty(PROP_SETUP_DONE)) {
      showSetup();
    }
  } catch (e) {
    // No UI context — nothing to do.
  }
}

// ---- preview entry points ----

function previewSelectedFile() {
  const sel = getSelectedFileName_();
  if (!sel) return;
  showSidebar(sel.fileName, sel.label);
}

function previewSelectedFileAsDialog() {
  const sel = getSelectedFileName_();
  if (!sel) return;
  showDialog(sel.fileName, sel.label);
}

/** Called from the sidebar's "Pop out" button via google.script.run. */
function showDialogForFile(fileName, label) {
  showDialog(fileName, label || '');
}

// ---- setup & settings ----

/**
 * Opens the setup/settings dialog. On first run this is shown automatically;
 * afterwards accessible via 📄 Notes → Settings.
 */
function showSetup() {
  const template = HtmlService.createTemplateFromFile('Setup');
  const settings = getSettings_();
  template.vaultFolderName  = settings.vaultFolderName;
  template.fileNameColumns  = settings.fileNameColumns;
  template.isFirstRun       = !PropertiesService.getUserProperties().getProperty(PROP_SETUP_DONE);

  const html = template.evaluate()
    .setWidth(500)
    .setHeight(480)
    .setSandboxMode(HtmlService.SandboxMode.IFRAME);

  SpreadsheetApp.getUi().showModalDialog(html, '📄 Notes — Setup');
}

function showSettings() {
  showSetup();
}

/**
 * Called by Setup.html on form submit. Saves settings and marks setup done.
 * Returns { ok, error } so the dialog can show validation feedback.
 *
 * @param {string} vaultFolderName
 * @param {string} columnsJson  JSON-encoded array of {column, label}.
 */
function saveSettings(vaultFolderName, columnsJson) {
  const folder = vaultFolderName && vaultFolderName.trim();
  if (!folder) return { ok: false, error: 'Vault folder name cannot be empty.' };

  let columns;
  try {
    columns = JSON.parse(columnsJson);
  } catch (e) {
    return { ok: false, error: 'Could not parse column configuration.' };
  }
  if (!Array.isArray(columns) || columns.length === 0) {
    return { ok: false, error: 'Add at least one file name column.' };
  }

  const seen = {};
  const cleaned = [];
  for (let i = 0; i < columns.length; i++) {
    const col = parseInt(columns[i] && columns[i].column, 10);
    const label = String((columns[i] && columns[i].label) || '').trim().slice(0, 40);
    if (isNaN(col) || col < 1 || col > 26) {
      return { ok: false, error: `Row ${i + 1}: column must be between 1 and 26.` };
    }
    if (seen[col]) {
      return { ok: false, error: `Column ${columnToLetter_(col)} is listed more than once.` };
    }
    seen[col] = true;
    cleaned.push({ column: col, label: label });
  }

  // Verify the folder exists in Drive before saving.
  const folders = DriveApp.getFoldersByName(folder);
  if (!folders.hasNext()) {
    return { ok: false, error: `No folder named "${folder}" found in your Google Drive. Check the name and try again.` };
  }

  const props = PropertiesService.getUserProperties();
  props.setProperty(PROP_VAULT_FOLDER, folder);
  props.setProperty(PROP_FILE_COLS,    JSON.stringify(cleaned));
  // Drop the legacy single-column property so it can't drift out of sync.
  props.deleteProperty(PROP_FILE_COL);
  props.setProperty(PROP_SETUP_DONE,   'true');

  // Bust the cached vault folder ID since the folder may have changed.
  props.deleteProperty('vaultFolderId');
  FileService.invalidateAll();

  return { ok: true };
}

/**
 * Returns current saved settings (falling back to CONFIG defaults).
 * This is the single source of truth for runtime settings — all code
 * that needs vaultFolderName or fileNameColumns calls this, not CONFIG.
 *
 * fileNameColumns is always an array of {column, label}. The legacy
 * single-int property is migrated on read.
 */
function getSettings_() {
  const props = PropertiesService.getUserProperties();
  const savedFolder = props.getProperty(PROP_VAULT_FOLDER);

  let columns = null;
  const savedColsJson = props.getProperty(PROP_FILE_COLS);
  if (savedColsJson) {
    try {
      const parsed = JSON.parse(savedColsJson);
      if (Array.isArray(parsed) && parsed.length) columns = parsed;
    } catch (e) {
      // Fall through to legacy / default.
    }
  }
  if (!columns) {
    const legacyCol = parseInt(props.getProperty(PROP_FILE_COL), 10);
    if (!isNaN(legacyCol)) {
      columns = [{ column: legacyCol, label: '' }];
    }
  }
  if (!columns) columns = CONFIG.fileNameColumns.slice();

  return {
    vaultFolderName:  savedFolder || CONFIG.vaultFolderName,
    fileNameColumns:  columns
  };
}

// ---- cache ----

function clearAllCaches() {
  FileService.invalidateAll();
  PropertiesService.getUserProperties().deleteProperty('vaultFolderId');
  SpreadsheetApp.getUi().alert('Cache cleared.');
}

// ---- server functions called from sidebar / dialog ----

function fetchFileContent(fileName) {
  return FileService.getFileData(fileName);
}

function reloadFileContent(fileName) {
  FileService.invalidateFile(fileName);
  return FileService.getFileData(fileName);
}

// ---- dialog resize ----

function saveDialogSize(width, height) {
  const props = PropertiesService.getUserProperties();
  props.setProperty(PROP_DIALOG_WIDTH,  String(clamp_(parseInt(width,  10) || CONFIG.dialogWidth,  CONFIG.dialogMinWidth,  CONFIG.dialogMaxWidth)));
  props.setProperty(PROP_DIALOG_HEIGHT, String(clamp_(parseInt(height, 10) || CONFIG.dialogHeight, CONFIG.dialogMinHeight, CONFIG.dialogMaxHeight)));
}

function getDialogSizeConfig() {
  const dims = getDialogDimensions_();
  return {
    width:  dims.width,  height:  dims.height,
    minWidth:  CONFIG.dialogMinWidth,  maxWidth:  CONFIG.dialogMaxWidth,
    minHeight: CONFIG.dialogMinHeight, maxHeight: CONFIG.dialogMaxHeight,
    defaultWidth: CONFIG.dialogWidth,  defaultHeight: CONFIG.dialogHeight
  };
}

function resetDialogSize() {
  const props = PropertiesService.getUserProperties();
  props.deleteProperty(PROP_DIALOG_WIDTH);
  props.deleteProperty(PROP_DIALOG_HEIGHT);
  return { width: CONFIG.dialogWidth, height: CONFIG.dialogHeight };
}

// ---- internals ----

/**
 * Reads the active cell, validates it sits in one of the configured file
 * name columns, and returns { fileName, label } — or null after alerting
 * the user when the selection is invalid.
 */
function getSelectedFileName_() {
  const ui       = SpreadsheetApp.getUi();
  const settings = getSettings_();
  const result   = readActiveSelection_(settings);

  if (result.error) { ui.alert(result.error); return null; }
  return { fileName: result.fileName, label: result.label };
}

/**
 * Polled by the sidebar when auto-update is on. Returns the file name and
 * label for the currently active cell, or null when the selection isn't a
 * valid file-name cell. Never throws and never alerts — silent so polling
 * can run frequently without disrupting the user.
 */
function getActiveSelection() {
  try {
    const settings = getSettings_();
    const result   = readActiveSelection_(settings);
    if (result.error) return null;
    return { fileName: result.fileName, label: result.label };
  } catch (e) {
    return null;
  }
}

/**
 * Shared core: reads the active cell, validates the column / row / value,
 * and returns either { fileName, label } or { error: string }. No UI side
 * effects so both the menu entry point and the silent poller can use it.
 */
function readActiveSelection_(settings) {
  const cell   = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getActiveCell();
  const colNum = cell.getColumn();

  let match = null;
  for (let i = 0; i < settings.fileNameColumns.length; i++) {
    if (settings.fileNameColumns[i].column === colNum) {
      match = settings.fileNameColumns[i];
      break;
    }
  }

  if (!match || cell.getRow() === CONFIG.headerRow) {
    return { error: `Please select a file name cell in ${describeColumns_(settings.fileNameColumns)} first.` };
  }

  const raw = String(cell.getValue() || '').trim();
  if (!raw) return { error: 'Selected cell is empty.' };

  const fileName = hasExtension_(raw) ? raw : raw + '.md';
  return { fileName: fileName, label: match.label || '' };
}

// ---- auto-update preference ----

function getAutoUpdate() {
  return PropertiesService.getUserProperties().getProperty(PROP_AUTO_UPDATE) === 'true';
}

function setAutoUpdate(enabled) {
  const props = PropertiesService.getUserProperties();
  if (enabled) props.setProperty(PROP_AUTO_UPDATE, 'true');
  else props.deleteProperty(PROP_AUTO_UPDATE);
  return enabled === true;
}

/**
 * Builds a human-readable list of configured columns for error messages,
 * e.g. "Column C (Migrated) or D (Original)".
 */
function describeColumns_(columns) {
  const parts = columns.map(function (c) {
    const letter = columnToLetter_(c.column);
    return c.label ? `Column ${letter} (${c.label})` : `Column ${letter}`;
  });
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] + ' or ' + parts[1];
  return parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1];
}

/**
 * Returns true if the name has a file extension (a dot with at least one
 * character after it that isn't itself a dot).
 */
function hasExtension_(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1;
}

/** Converts a 1-based column index to its letter (1→A, 3→C, 28→AB). */
function columnToLetter_(col) {
  let letter = '';
  while (col > 0) {
    const mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

function showSidebar(fileName, label) {
  const title = label ? `${CONFIG.sidebarTitle} — ${label}` : CONFIG.sidebarTitle;
  const html = renderTemplate_('Sidebar', fileName, 'sidebar').setTitle(title);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showDialog(fileName, label) {
  const dims = getDialogDimensions_();
  const html = renderTemplate_('Dialog', fileName, 'dialog')
    .setWidth(dims.width)
    .setHeight(dims.height);
  const dialogTitle = label ? `${label} — ${fileName}` : fileName;
  SpreadsheetApp.getUi().showModelessDialog(html, dialogTitle);
}

function getDialogDimensions_() {
  const props  = PropertiesService.getUserProperties();
  const savedW = parseInt(props.getProperty(PROP_DIALOG_WIDTH),  10);
  const savedH = parseInt(props.getProperty(PROP_DIALOG_HEIGHT), 10);
  return {
    width:  clamp_(isNaN(savedW) ? CONFIG.dialogWidth  : savedW, CONFIG.dialogMinWidth,  CONFIG.dialogMaxWidth),
    height: clamp_(isNaN(savedH) ? CONFIG.dialogHeight : savedH, CONFIG.dialogMinHeight, CONFIG.dialogMaxHeight)
  };
}

function clamp_(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function renderTemplate_(templateName, fileName, mode) {
  const result = FileService.getFileData(fileName);
  const t = HtmlService.createTemplateFromFile(templateName);
  t.fileName = fileName;
  t.content  = result.content;
  t.fileId   = result.fileId;
  t.mimeType = result.mimeType;
  t.error    = result.error;
  t.mode     = mode;
  return t.evaluate().setSandboxMode(HtmlService.SandboxMode.IFRAME);
}

function include(templateName, ctx) {
  const t = HtmlService.createTemplateFromFile(templateName);
  if (ctx) Object.keys(ctx).forEach(function (k) { t[k] = ctx[k]; });
  return t.evaluate().getContent();
}
