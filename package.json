# Einweisungsprotokoll – Mertert

Digitales Formular für Maschineneinweisungen mit zentraler Datenbank.

## Schnellstart (lokal testen)

```bash
npm install
npm start
# → http://localhost:3000
```

---

## Deployment auf Railway.app (kostenlos, empfohlen)

### 1. Konto anlegen
→ https://railway.app — kostenlos registrieren

### 2. Projekt hochladen

**Option A: GitHub (empfohlen)**
1. Diesen Ordner bei GitHub hochladen (neues Repository)
2. Bei Railway: „New Project" → „Deploy from GitHub Repo"
3. Repository auswählen → automatisch deployt

**Option B: Railway CLI**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### 3. Volume für die Datenbank einrichten
Damit die Daten beim Neustart erhalten bleiben:
1. Im Railway-Dashboard auf dein Projekt klicken
2. „New" → „Volume" → Mount Path: `/data`
3. Unter „Variables" hinzufügen: `DATA_DIR=/data`

### 4. Fertig
Railway gibt dir eine URL wie `https://einweisung-xxx.railway.app`
→ Diese URL an alle Tablets und Geräte verteilen

---

## Deployment auf einem eigenen Linux-Server

```bash
# Node.js installieren (falls nicht vorhanden)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# App einrichten
mkdir /opt/einweisung && cd /opt/einweisung
# Dateien hierhin kopieren, dann:
npm install

# Als Systemdienst einrichten (läuft immer)
sudo nano /etc/systemd/system/einweisung.service
```

Inhalt der Service-Datei:
```ini
[Unit]
Description=Einweisungsprotokoll
After=network.target

[Service]
WorkingDirectory=/opt/einweisung
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=3000
Environment=DATA_DIR=/opt/einweisung/data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable einweisung
sudo systemctl start einweisung
# → läuft auf http://IP:3000
```

---

## Projektstruktur

```
einweisung-app/
├── server.js          ← Backend (Node.js/Express)
├── package.json
├── data/              ← Datenbank (automatisch angelegt)
│   └── einweisungen.db
└── public/
    └── index.html     ← Frontend (alle Geräte)
```

## Datenbank-Tabellen

| Tabelle | Inhalt |
|---|---|
| `protokolle` | Alle abgeschlossenen Einweisungen inkl. Signaturen |
| `maschinen` | Eigene Maschinen (Standard-Maschinen sind im Code) |
| `einweisung_template` | Gemeinsame Einweisungspunkt-Vorlage |

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/protokolle` | Alle Protokolle (ohne Signaturen) |
| GET | `/api/protokolle/:id` | Einzelnes Protokoll (mit Signaturen, für PDF) |
| POST | `/api/protokolle` | Neues Protokoll speichern |
| GET | `/api/maschinen` | Alle eigenen Maschinen |
| POST | `/api/maschinen` | Maschine anlegen / aktualisieren |
| DELETE | `/api/maschinen/:id` | Maschine löschen |
| GET | `/api/template` | Einweisungsvorlage abrufen |
| POST | `/api/template` | Einweisungsvorlage speichern |
| GET | `/api/export/csv` | Alle Protokolle als CSV herunterladen |
