# 📄 File Preview for Google Sheets

Preview files stored in Google Drive directly inside Google Sheets — without leaving the spreadsheet.

If you use Google Sheets to track or index files in Google Drive (such as an Obsidian vault synced via [Obsidian Sync](https://obsidian.md/sync) or [Remotely Save](https://github.com/remotely-save/remotely-save)), this script adds a sidebar that previews whichever file you click on. Need more room? Pop it out into a resizable floating dialog.

![Preview sidebar demo](docs/demo.gif)

---

## Features

- **Multi-format preview** — three render modes selected automatically by file type:
  - **Markdown** (`.md`) — fully rendered with headings, bold, italic, code blocks, tables, task lists, blockquotes, and links
  - **Plain text** (`.txt`) — displayed in a monospace block with proper word wrapping
  - **Everything else** — PDFs, images (PNG, JPG, GIF, etc.), DOCX, XLSX, PPTX, and any other Drive-supported format shown via Google Drive's built-in viewer
- **Sidebar** that stays open as you click between rows
- **Resizable dialog** (pop-out) when you need more reading room
- **Guided setup** — a settings dialog on first run; no manual config file editing
- **Fast** — recursive Drive search scoped to your vault folder, with multi-layer caching (folder ID, file ID, file content)
- **Reload button** — bypass the cache and fetch fresh content from Drive on demand
- **Raw / rendered toggle** — switch between rendered markdown and the raw source (markdown files only)

---

## Requirements

- A Google Sheet with file names in one of its columns
- Files stored in a Google Drive folder (e.g. an Obsidian vault synced to Drive)
- A Google account with access to both the Sheet and the Drive folder

---

## Installation

There are two ways to install: **with clasp** (recommended if you plan to reuse this across multiple sheets or want to track changes with git) or **manually** (copy-paste, no tools required).

### Option A — clasp (recommended)

clasp is Google's official Apps Script CLI. Once set up, deploying to a new sheet takes about two minutes with a single command.

See **[DEPLOYING.md](DEPLOYING.md)** for the full guide, including one-time machine setup, deploying to a new sheet, and day-to-day workflow.

Quick version if you already have clasp configured:

```bash
git clone https://github.com/ganjagremlin/sheets-file-preview.git
cd sheets-file-preview
# Edit .clasp.json — replace scriptId with your sheet's Script ID
clasp push
```

Then refresh your sheet. The **📄 Notes** menu appears and setup runs automatically.

### Option B — Manual (copy-paste)

No tools required, but you'll need to repeat these steps for each new sheet.

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Delete any existing code/files in the project.
3. Create the following files in the editor:

   | File to create | Type | How |
   |---|---|---|
   | `Code` | Script | Default type |
   | `FileService` | Script | Default type |
   | `Preview` | HTML | Click **+ → HTML** |
   | `Sidebar` | HTML | Click **+ → HTML** |
   | `Dialog` | HTML | Click **+ → HTML** |
   | `Setup` | HTML | Click **+ → HTML** |

   Name HTML files without the `.html` extension — Apps Script adds it automatically.

4. Paste the contents of each file from this repository into the corresponding editor file.
5. Press **Ctrl+S** / **Cmd+S** to save.
6. Run any function other than `onOpen` from the editor (e.g. `clearAllCaches`) to trigger the authorization flow. Approve the permissions prompt.
7. Refresh your sheet. The **📄 Notes** menu appears and the setup dialog opens automatically.

### First-run setup

However you installed, the **📄 Notes** setup dialog appears automatically the first time the sheet opens. It asks for two things:

- **Vault folder name** — the name of the top-level Google Drive folder containing your files (e.g. `obsidian`, `My Vault`). The script verifies this folder exists before saving.
- **File name columns** — one or more columns where your file names live (A = 1, B = 2, C = 3, etc.). Add a row per column and give each one an optional label (e.g. "Migrated", "Original") so you can tell which version you opened. Click **+ Add column** to track multiple file lists side-by-side.

Click **Save settings**. You're ready. You can reopen this dialog any time via **📄 Notes → Settings**.

---

## Usage

1. Click any cell in one of your file name columns containing a file name.
2. Click **📄 Notes → Preview Selected File** in the menu bar.
3. The sidebar opens on the right showing the preview. If the column has a label, it appears in the sidebar/dialog title so you know which version you opened.

To open as a wider, draggable dialog instead: **📄 Notes → Preview Selected File (Dialog)**, or click the **↗ Pop out** button inside the sidebar.

To resize the dialog: click **⇲ Resize** in the dialog header. Two sliders appear (width and height) — drag to resize live. Your preferred size is remembered across sessions. Click **Reset to default** to go back to the configured default.

---

## Sheet structure

The script works with any sheet layout. During setup you specify which column(s) contain your file names — the default is Column C. You can configure multiple columns when you want to track parallel file lists (e.g. migrated and original copies).

File names may include or omit the `.md` extension for markdown files; both are handled. All other file types should include their extension (e.g. `report.pdf`, `photo.png`).

**Example layout:**

| Column A | Column B | Column C |
|---|---|---|
| Date | Title | File name |
| 2024-01-15 | Weekly review | 2024-W03 weekly review |
| 2024-01-20 | Project notes | project-alpha.md |
| 2024-02-01 | Q1 Budget | budget-q1.xlsx |
| 2024-02-10 | Design mockup | mockup-v2.png |

Row 1 is treated as a header row and is skipped.

---

## Configuration

Most users won't need to touch this. If you want to adjust advanced defaults, they live in the `CONFIG` object at the top of `Code.gs`:

```javascript
const CONFIG = {
  cacheTtlSeconds: 300,    // How long to cache file content (seconds)
  dialogWidth: 900,        // Default dialog width in px
  dialogHeight: 700,       // Default dialog height in px
  dialogMinWidth: 400,     // Slider lower bound
  dialogMaxWidth: 1600,    // Slider upper bound
  dialogMinHeight: 300,
  dialogMaxHeight: 1200
};
```

Vault folder name and file name columns are set via **📄 Notes → Settings**, not here.

---

## Updating settings

To change your vault folder or columns later: **📄 Notes → Settings**. The same setup dialog reopens with your current values pre-filled.

---

## How caching works

Three layers, all per-user:

1. **Vault folder ID** — stored permanently in `PropertiesService`. Resolved once from the folder name, reused after that. Self-heals automatically if the folder is renamed or moved.
2. **File ID by name** — stored in `CacheService` for 5 minutes. Skips the recursive folder walk on cache hits.
3. **File content** — stored in `CacheService` for 5 minutes, for text-based files (`.md`, `.txt`) only. Non-text files (PDFs, images, etc.) are rendered via Drive's viewer directly from their file ID — no content is fetched or cached.

**Cache is invalidated automatically** when you save settings. You can also clear it manually via **📄 Notes → Clear Cache**, or reload a single file with the **↻ Reload** button in the sidebar/dialog.

---

## Known limitations

- **Sidebar width is fixed at 300px** — this is a hard limit of the Google Apps Script platform, not something the script can change. Use the pop-out dialog when you need more room, especially for PDFs and documents.
- **The dialog closes when you click the sheet** — standard Apps Script modeless dialog behavior. The sidebar stays open.
- **Preview requires a menu click** — Apps Script doesn't allow running code on cell click, so there's no way to trigger the preview automatically when you select a row.
- **Obsidian-specific syntax is not rendered** — `[[wikilinks]]`, `![[embeds]]`, `> [!callout]` blocks, and `#tags` display as plain text. Standard markdown is fully rendered.
- **Drive viewer requires network access** — PDFs, images, and other non-text file types are rendered by Google Drive's built-in viewer, which requires an internet connection and that the file be accessible to the authenticated user.
- **First preview may be slow** — the script walks your vault folder tree to find the file. Subsequent previews of the same file are fast (cached file ID).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 📄 Notes menu missing | `onOpen` hasn't run | Refresh the sheet |
| Setup dialog doesn't appear on first open | Auth hasn't been granted yet | Run any function from the Apps Script editor, approve permissions, then refresh |
| "Vault folder not found" error | Folder name doesn't match Drive exactly | Go to **📄 Notes → Settings** and correct the name |
| "File not found in vault" | Typo in the cell, wrong extension, or file is outside the vault folder | Check the file name and extension; run **Clear Cache** if you recently moved files |
| PDF / image shows blank or loading spinner | Drive viewer blocked by network, or file permissions | Check network access; confirm the file is in a folder accessible to your account |
| Stale content showing | Cache TTL hasn't expired | Click **↻ Reload** in the sidebar or dialog |
| Markdown not rendering (showing raw text) | jsDelivr CDN blocked by network or browser | Check your network; the CDN URL is in `Preview.html` |
| Authorization error after install | Permissions weren't granted | Re-run any function from the editor and approve |

---

## Privacy

This script runs entirely within your Google account. For markdown and plain text files, content travels only between your Google Drive and your browser via Apps Script's sandboxed HTML service. For all other file types (PDFs, images, documents, etc.), files are rendered directly by Google Drive's viewer — no content passes through the script at all. The only external dependency is the [markdown-it](https://github.com/markdown-it/markdown-it) library loaded from [jsDelivr](https://www.jsdelivr.com/) CDN for markdown rendering.

---

## Contributing

Issues and PRs welcome. If you run into a bug or have a feature request, open an issue with your Apps Script execution log (Extensions → Apps Script → Executions) if relevant.

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.
