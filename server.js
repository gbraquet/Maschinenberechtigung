const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();

// Railway setzt PORT automatisch — MUSS 0.0.0.0 binden
const PORT = parseInt(process.env.PORT) || 3000;

// Datenbank-Verzeichnis
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
const DB_PATH = path.join(DATA_DIR, 'einweisungen.db');

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS protokolle (
    id TEXT PRIMARY KEY, ts TEXT, datum TEXT,
    maschine TEXT, maschine_label TEXT, serial TEXT, year TEXT,
    fahrer TEXT, einweiser TEXT,
    geprueft TEXT, nicht_geprueft TEXT,
    sig_fahrer TEXT, sig_einweiser TEXT, sig_leitung TEXT
  );
  CREATE TABLE IF NOT EXISTS maschinen (
    id TEXT PRIMARY KEY, label TEXT, serial TEXT,
    year TEXT, type TEXT, groups TEXT, builtin INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS template (
    id INTEGER PRIMARY KEY CHECK(id=1), groups TEXT
  );
`);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Health check — Railway braucht das
app.get('/health', (req, res) => res.json({ ok: true }));

/* ── Protokolle ── */
app.get('/api/protokolle', (req, res) => {
  try {
    const rows = db.prepare('SELECT id,ts,datum,maschine,maschine_label,serial,year,fahrer,einweiser,geprueft,nicht_geprueft FROM protokolle ORDER BY ts DESC').all();
    res.json(rows.map(r => ({
      ...r, maschineLabel: r.maschine_label,
      geprueft: JSON.parse(r.geprueft),
      nichtGeprueft: JSON.parse(r.nicht_geprueft)
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/protokolle/:id', (req, res) => {
  try {
    const r = db.prepare('SELECT * FROM protokolle WHERE id=?').get(req.params.id);
    if (!r) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json({ ...r, maschineLabel: r.maschine_label, geprueft: JSON.parse(r.geprueft), nichtGeprueft: JSON.parse(r.nicht_geprueft) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/protokolle', (req, res) => {
  try {
    const r = req.body;
    db.prepare('INSERT INTO protokolle VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      r.id, r.ts, r.datum, r.maschine, r.maschineLabel, r.serial||'', r.year||'',
      r.fahrer, r.einweiser,
      JSON.stringify(r.geprueft||[]), JSON.stringify(r.nichtGeprueft||[]),
      r.sigF||null, r.sigE||null, r.sigL||null
    );
    res.json({ ok: true });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'ID existiert bereits' });
    res.status(500).json({ error: e.message });
  }
});

/* ── Maschinen ── */
app.get('/api/maschinen', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM maschinen').all();
    const result = {};
    rows.forEach(r => { result[r.id] = { ...r, groups: JSON.parse(r.groups), builtin: !!r.builtin }; });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/maschinen', (req, res) => {
  try {
    const { id, label, serial, year, type, groups, builtin } = req.body;
    db.prepare('INSERT OR REPLACE INTO maschinen VALUES (?,?,?,?,?,?,?)').run(
      id, label, serial||'', year||'', type||'', JSON.stringify(groups||[]), builtin ? 1 : 0
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/maschinen/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM maschinen WHERE id=? AND builtin=0').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── Template ── */
app.get('/api/template', (req, res) => {
  try {
    const r = db.prepare('SELECT groups FROM template WHERE id=1').get();
    res.json(r ? JSON.parse(r.groups) : null);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/template', (req, res) => {
  try {
    db.prepare('INSERT OR REPLACE INTO template VALUES (1,?)').run(JSON.stringify(req.body.groups));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── CSV Export ── */
app.get('/api/export/csv', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM protokolle ORDER BY datum DESC').all();
    const hdr = ['ID','Datum','Maschine','SN','Fahrer','Einweisender','OK','NOK','Pct','Erfasst'];
    const lines = rows.map(r => {
      const gp = JSON.parse(r.geprueft), np = JSON.parse(r.nicht_geprueft);
      const tot = gp.length + np.length, pct = tot > 0 ? Math.round((gp.length/tot)*100) : 0;
      return [r.id, r.datum, r.maschine_label, r.serial, r.fahrer, r.einweiser,
              gp.length, np.length, pct+'%', r.ts]
        .map(v => '"' + String(v||'').replace(/"/g, '""') + '"').join(',');
    });
    const csv = '\uFEFF' + [hdr.join(','), ...lines].join('\r\n');
    res.setHeader('Content-Type', 'text/csv;charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Einweisungen_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

/* ── Fallback → index.html ── */
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// WICHTIG: 0.0.0.0 damit Railway den Port erkennt
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf 0.0.0.0:${PORT}`);
  console.log(`DB: ${DB_PATH}`);
});
