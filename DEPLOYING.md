# Deploying with clasp

This guide covers everything you need to deploy and reuse this project using [clasp](https://github.com/google/clasp), Google's official Apps Script CLI.

---

## Table of contents

1. [One-time machine setup](#1-one-time-machine-setup)
2. [Connect the repo to your first sheet](#2-connect-the-repo-to-your-first-sheet)
3. [Reuse on a new sheet](#3-reuse-on-a-new-sheet)
4. [Day-to-day workflow](#4-day-to-day-workflow)
5. [Installing from GitHub (for other users)](#5-installing-from-github-for-other-users)

---

## 1. One-time machine setup

You only do this once per computer.

### Install Node.js

clasp requires Node.js v20 or later. Check what you have:

```bash
node -v
```

If it's below v20, or not installed, download it from [nodejs.org](https://nodejs.org/).

### Install clasp

```bash
npm install -g @google/clasp
```

Verify the install:

```bash
clasp -v
```

### Enable the Apps Script API

This is a per-Google-account setting, not per-project. You only do it once.

1. Go to [script.google.com/home/usersettings](https://script.google.com/home/usersettings)
2. Turn on **Google Apps Script API**

### Log in

```bash
clasp login
```

A browser window opens asking you to authorise clasp with your Google account. Sign in with the same account you use for Google Sheets and Drive. Your credentials are saved to `~/.clasprc.json` on your machine (this file is gitignored — never commit it).

---

## 2. Connect the repo to your first sheet

This links the local repo to the Apps Script project bound to a specific Google Sheet.

### Create the bound Apps Script project

Open (or create) the Google Sheet you want to use. Then go to **Extensions → Apps Script**. This creates a bound Apps Script project attached to that sheet.

### Get the Script ID

In the Apps Script editor, go to **Project Settings** (the gear icon on the left). Copy the **Script ID** — it's a long alphanumeric string.

### Update `.clasp.json`

Open `.clasp.json` in the repo and replace the placeholder:

```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": ".",
  "fileExtension": "gs",
  "htmlExtension": "html"
}
```

### Push the files

```bash
clasp push
```

clasp uploads all the `.gs` and `.html` files to the Apps Script project. The `.claspignore` file controls exactly which files are pushed — READMEs, git files, and this guide are excluded automatically.

### Authorize the script

Refresh your Google Sheet. The **📄 Notes** menu appears and the setup dialog opens automatically. Run through it once to configure your vault folder and file name column.

---

## 3. Reuse on a new sheet

This is the main benefit of clasp — deploying to a second (or tenth) sheet takes about two minutes.

### Clone the repo (if you haven't already)

```bash
git clone https://github.com/YOUR_USERNAME/obsidian-sheets-preview.git
cd obsidian-sheets-preview
```

### Create the bound Apps Script project on the new sheet

Open the new Google Sheet → **Extensions → Apps Script**. Copy the Script ID from **Project Settings**.

### Swap the Script ID

You have two options:

**Option A — Edit `.clasp.json` directly** (simplest):

```json
{
  "scriptId": "NEW_SHEET_SCRIPT_ID",
  ...
}
```

Then `clasp push`. Switch back to the previous Script ID when you want to push to the original sheet.

**Option B — Keep multiple `.clasp.json` files** (cleaner for many sheets):

```bash
cp .clasp.json .clasp.sheet1.json   # save the first sheet's config
cp .clasp.json .clasp.json          # edit this for the new sheet
```

When you want to deploy to a specific sheet:

```bash
cp .clasp.sheet1.json .clasp.json && clasp push   # push to sheet 1
cp .clasp.sheet2.json .clasp.json && clasp push   # push to sheet 2
```

This is manual but simple. For larger numbers of sheets a shell script wrapper makes sense.

### Push and run setup

```bash
clasp push
```

Refresh the new sheet, run through the setup dialog. Done.

---

## 4. Day-to-day workflow

### Making a change

Edit any `.gs` or `.html` file locally, then:

```bash
clasp push
```

Refresh your sheet to pick up the changes. The Apps Script editor auto-refreshes when you switch to it after a push.

### Pulling changes made in the editor

If you edit code directly in the Apps Script online editor (e.g. as a quick fix), sync it back down:

```bash
clasp pull
```

This overwrites your local files with whatever is in the online project. Be careful if you have unsaved local changes.

### Opening the online editor

```bash
clasp open
```

Opens the Apps Script editor for the current `.clasp.json` Script ID in your browser.

### Checking what would be pushed

There's no `--dry-run` flag in clasp, but you can inspect `.claspignore` to see exactly which files will be sent. The files that get pushed are:

- `Code.gs`
- `FileService.gs`
- `Preview.html`
- `Sidebar.html`
- `Dialog.html`
- `Setup.html`
- `appsscript.json`

Everything else (README, DEPLOYING, git files) stays local.

---

## 5. Installing from GitHub (for other users)

If someone else wants to use this project on their own sheet, the steps are:

### Prerequisites

1. Install Node.js v20+, clasp, and enable the Apps Script API (see [Section 1](#1-one-time-machine-setup) above).
2. `clasp login` with their Google account.

### Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/obsidian-sheets-preview.git
cd obsidian-sheets-preview
```

Open their Google Sheet → **Extensions → Apps Script** → copy the Script ID.

Edit `.clasp.json` and replace the `scriptId` value with their Script ID.

### Push

```bash
clasp push
```

Refresh their sheet. The **📄 Notes** menu appears and setup runs automatically.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `clasp: command not found` | Run `npm install -g @google/clasp` again; check that npm's global bin dir is on your `$PATH` |
| `Error: Could not read API` | The Apps Script API isn't enabled — go to [script.google.com/home/usersettings](https://script.google.com/home/usersettings) |
| `Invalid scriptId` | The Script ID in `.clasp.json` doesn't match any project in your account — double-check it from Project Settings |
| `Push failed: permission denied` | You're logged in to a different Google account than the one that owns the script — run `clasp logout` then `clasp login` |
| `clasp push` succeeds but menu doesn't appear | Refresh the sheet; if still missing, open the Apps Script editor and check for errors in the Executions log |
| Pushed files don't include my changes | Check `.claspignore` — make sure the file you changed isn't accidentally excluded |
