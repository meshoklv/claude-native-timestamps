const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MARK = 'CC_TS_PATCH';

function cfg() { return vscode.workspace.getConfiguration('ccNativeTs'); }

function transcriptsDir() {
  const custom = String(cfg().get('transcriptsDir') || '').trim();
  return custom || path.join(os.homedir(), '.claude', 'projects');
}

function findWebview() {
  const ext = vscode.extensions.getExtension('anthropic.claude-code')
    || vscode.extensions.all.find(e => /anthropic\.claude-code/i.test(e.id));
  if (!ext) return null;
  const wv = path.join(ext.extensionPath, 'webview', 'index.js');
  return fs.existsSync(wv) ? wv : null;
}

function norm(t) {
  return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 120);
}

function msgText(m) {
  try {
    const c = m && m.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      let t = '';
      for (const b of c) { if (b && b.type === 'text') t += b.text || ''; }
      return t;
    }
  } catch (e) {}
  return '';
}

// build { normKey: earliestISO } from all session transcripts, with per-file mtime cache
function buildMap(cacheDir) {
  const projects = transcriptsDir();
  const cachePath = path.join(cacheDir, 'mapcache.json');
  let cache = { files: {} };
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch (e) {}
  const newCache = { files: {} };
  const map = {};
  function absorb(entries) {
    for (const k in entries) {
      const ts = entries[k];
      if (!map[k] || ts < map[k]) map[k] = ts; // keep earliest
    }
  }
  let dirs = [];
  try { dirs = fs.readdirSync(projects); } catch (e) { return map; }
  for (const dir of dirs) {
    const dpath = path.join(projects, dir);
    let files = [];
    try { files = fs.readdirSync(dpath).filter(f => f.endsWith('.jsonl')); } catch (e) { continue; }
    for (const f of files) {
      const fp = path.join(dpath, f);
      let st; try { st = fs.statSync(fp); } catch (e) { continue; }
      const sig = st.mtimeMs + ':' + st.size;
      const cached = cache.files[fp];
      if (cached && cached.sig === sig) {
        newCache.files[fp] = cached; absorb(cached.entries); continue;
      }
      const entries = {};
      try {
        const lines = fs.readFileSync(fp, 'utf8').split('\n');
        for (const line of lines) {
          if (!line) continue;
          if (line.indexOf('"timestamp"') === -1) continue;
          if (line.indexOf('"user"') === -1 && line.indexOf('"assistant"') === -1) continue;
          let d; try { d = JSON.parse(line); } catch (e) { continue; }
          const t = d.type; if (t !== 'user' && t !== 'assistant') continue;
          const ts = d.timestamp; if (!ts) continue;
          const txt = msgText(d.message); const k = norm(txt);
          if (!k) continue;
          if (!entries[k] || ts < entries[k]) entries[k] = ts;
        }
      } catch (e) { continue; }
      newCache.files[fp] = { sig, entries };
      absorb(entries);
    }
  }
  try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cachePath, JSON.stringify(newCache)); } catch (e) {}
  return map;
}

// Returns the pristine bundle text. If the file carries no marker it IS pristine
// (fresh install or Claude Code update) and we refresh the backup from it.
function cleanSource(wv) {
  const bak = wv + '.cc-ts-backup';
  const cur = fs.readFileSync(wv, 'utf8');
  if (cur.indexOf(MARK) === -1) { fs.writeFileSync(bak, cur); return cur; }
  if (fs.existsSync(bak)) return fs.readFileSync(bak, 'utf8');
  return null; // patched but no backup -> refuse (cannot recover the original)
}

function applyPatch(context, silent) {
  try {
    const wv = findWebview();
    if (!wv) { if (!silent) vscode.window.showWarningMessage('Claude Timestamps: Claude Code webview not found.'); return; }
    const clean = cleanSource(wv);
    if (clean === null) { if (!silent) vscode.window.showWarningMessage('Claude Timestamps: no pristine backup found; skipped.'); return; }
    const map = buildMap(context.globalStorageUri.fsPath);
    const inj = fs.readFileSync(path.join(__dirname, 'inject.js'), 'utf8');
    const conf = { timeZone: cfg().get('timeZone') || 'local', format: cfg().get('format') || 'yyyy-MM-dd HH:mm:ss' };
    const head = '\n;window.__ccTsMap=' + JSON.stringify(map) + ';window.__ccTsConfig=' + JSON.stringify(conf) + ';\n';
    fs.writeFileSync(wv, clean + head + inj);
    if (!silent) vscode.window.showInformationMessage('Claude Timestamps: applied (' + Object.keys(map).length + ' messages indexed). Reload window to see times.');
  } catch (e) {
    console.error('[cc-native-ts] patch error', e);
    if (!silent) vscode.window.showErrorMessage('Claude Timestamps patch failed: ' + e.message);
  }
}

function unpatch() {
  try {
    const wv = findWebview(); if (!wv) return;
    const bak = wv + '.cc-ts-backup';
    if (fs.existsSync(bak)) { fs.copyFileSync(bak, wv); vscode.window.showInformationMessage('Claude Timestamps: removed, original restored. Reload window.'); }
    else { vscode.window.showWarningMessage('Claude Timestamps: no backup found.'); }
  } catch (e) { console.error('[cc-native-ts] unpatch error', e); }
}

function activate(context) {
  if (cfg().get('autoPatch') !== false) applyPatch(context, true);
  context.subscriptions.push(vscode.commands.registerCommand('ccNativeTs.repatch', () => applyPatch(context, false)));
  context.subscriptions.push(vscode.commands.registerCommand('ccNativeTs.unpatch', unpatch));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('ccNativeTs.timeZone') || e.affectsConfiguration('ccNativeTs.format') || e.affectsConfiguration('ccNativeTs.transcriptsDir')) {
      applyPatch(context, true);
      vscode.window.showInformationMessage('Claude Timestamps: settings updated. Reload the window to apply.', 'Reload Window')
        .then(c => { if (c) vscode.commands.executeCommand('workbench.action.reloadWindow'); });
    }
  }));
}
function deactivate() {}
module.exports = { activate, deactivate };
