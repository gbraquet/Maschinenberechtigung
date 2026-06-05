const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// DB-Datei im /data Ordner (für Railway Volumes) oder lokal
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'einweisungen.db');

// ── Datenbank einrichten ──────────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS protokolle (
    id          TEXT PRIMARY KEY,
    ts          TEXT NOT NULL,
    datum       TEXT NOT NULL,
    maschine    TEXT NOT NULL,
    maschine_label TEXT NOT NULL,
    serial      TEXT,
    year        TEXT,
    fahrer      TEXT NOT NULL,
    einweiser   TEXT NOT NULL,
    geprueft    TEXT NOT NULL,
    nicht_geprueft TEXT NOT NULL,
    sig_fahrer  TEXT,
    sig_einweiser TEXT,
    sig_leitung TEXT
  );

  CREATE TABLE IF NOT EXISTS maschinen (
    id      TEXT PRIMARY KEY,
    label   TEXT NOT NULL,
    serial  TEXT,
    year    TEXT,
    type    TEXT,
    groups  TEXT NOT NULL,
    builtin INTEGER DEFAULT 0,
    created TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS einweisung_template (
    id      INTEGER PRIMARY KEY CHECK (id = 1),
    groups  TEXT NOT NULL
  );
`);

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));  // groß wegen Base64-Signaturen
app.use(express.static(path.join(__dirname, 'public')));

// ── API: Protokolle ───────────────────────────────────────────

// Alle Protokolle abrufen
app.get('/api/protokolle', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, ts, datum, maschine, maschine_label, serial, year,
             fahrer, einweiser, geprueft, nicht_geprueft
      FROM protokolle ORDER BY ts DESC
    `).all();
    const result = rows.map(r => ({
      ...r,
      maschineLabel: r.maschine_label,
      geprueft: JSON.parse(r.geprueft),
      nichtGeprueft: JSON.parse(r.nicht_geprueft)
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Einzelnes Protokoll (mit Signaturen) für PDF
app.get('/api/protokolle/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM protokolle WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({
      ...row,
      maschineLabel: row.maschine_label,
      geprueft: JSON.parse(row.geprueft),
      nichtGeprueft: JSON.parse(row.nicht_geprueft)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Neues Protokoll speichern
app.post('/api/protokolle', (req, res) => {
  try {
    const r = req.body;
    if (!r.id || !r.fahrer || !r.maschine) return res.status(400).json({ error: 'Pflichtfelder fehlen' });
    db.prepare(`
      INSERT INTO protokolle
        (id, ts, datum, maschine, maschine_label, serial, year, fahrer, einweiser,
         geprueft, nicht_geprueft, sig_fahrer, sig_einweiser, sig_leitung)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      r.id, r.ts, r.datum, r.maschine, r.maschineLabel, r.serial||'', r.year||'',
      r.fahrer, r.einweiser,
      JSON.stringify(r.geprueft||[]), JSON.stringify(r.nichtGeprueft||[]),
      r.sigFahrer||null, r.sigEinweiser||null, r.sigLeitung||null
    );
    res.json({ ok: true, id: r.id });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'ID existiert bereits' });
    res.status(500).json({ error: e.message });
  }
});

// ── API: Maschinen ────────────────────────────────────────────

app.get('/api/maschinen', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM maschinen ORDER BY created ASC').all();
    const result = {};
    rows.forEach(r => {
      result[r.id] = { ...r, groups: JSON.parse(r.groups), builtin: !!r.builtin };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/maschinen', (req, res) => {
  try {
    const { id, label, serial, year, type, groups, builtin } = req.body;
    if (!id || !label) return res.status(400).json({ error: 'id und label erforderlich' });
    db.prepare(`
      INSERT OR REPLACE INTO maschinen (id, label, serial, year, type, groups, builtin)
      VALUES (?,?,?,?,?,?,?)
    `).run(id, label, serial||'', year||'', type||'', JSON.stringify(groups||[]), builtin?1:0);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/maschinen/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM maschinen WHERE id = ? AND builtin = 0').run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── API: Template ─────────────────────────────────────────────

app.get('/api/template', (req, res) => {
  try {
    const row = db.prepare('SELECT groups FROM einweisung_template WHERE id = 1').get();
    res.json(row ? JSON.parse(row.groups) : null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/template', (req, res) => {
  try {
    const { groups } = req.body;
    db.prepare('INSERT OR REPLACE INTO einweisung_template (id, groups) VALUES (1, ?)').run(JSON.stringify(groups));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CSV Export ────────────────────────────────────────────────
app.get('/api/export/csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM protokolle ORDER BY datum DESC').all();
    const hdr = ['ID','Datum','Maschine','Seriennummer','Fahrer','Einweisender','Geprueft','NichtGeprueft','Vollstaendigkeit_Pct','Erfasst_am'];
    const lines = rows.map(r => {
      const gp = JSON.parse(r.geprueft), np = JSON.parse(r.nicht_geprueft);
      const tot = gp.length + np.length, pct = tot > 0 ? Math.round((gp.length/tot)*100) : 0;
      return [r.id, r.datum, r.maschine_label, r.serial, r.fahrer, r.einweiser, gp.length, np.length, pct+'%', r.ts]
        .map(v => '"' + String(v||'').replace(/"/g,'""') + '"').join(',');
    });
    const csv = '\uFEFF' + [hdr.join(','), ...lines].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Einweisungen_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Fallback → index.html ─────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✓ Einweisungsprotokoll läuft auf Port ${PORT}`);
  console.log(`  Datenbank: ${DB_PATH}`);
});
