# Weißer Fleck

Internes Planungswerkzeug für ein Website-Erstell-Business. Reines HTML/CSS/JS, kein Build-Schritt, keine Konten, kein eigener Server.

- **Karte:** findet Betriebe, die in OpenStreetMap *keine* Website eingetragen haben (die „weißen Flecken“). Ort suchen → Ausschnitt scannen → Treffer vormerken, als kontaktiert markieren oder verwerfen.
- **Aufträge:** Board (Drag & Drop) und Liste mit Status von *Anfrage* bis *Abgeschlossen/Bezahlt*, Preis, Deadline, Notizen, Verlauf und Kennzahlen. Aufträge mit Position erscheinen als Rauten auf der Karte.
- **GitHub:** veröffentlicht die Aufträge als `data/auftraege.json` (+ lesbare `data/AUFTRAEGE.md` ohne Kontaktdaten) per GitHub-API in ein Repository deiner Wahl. Mit „Von GitHub laden“ lassen sich Daten auf einem zweiten Gerät zusammenführen.

## Starten

```bash
python serve.py 8809
```

dann <http://localhost:8809> öffnen. (`index.html` direkt per Doppelklick geht ebenfalls.)

## GitHub-Veröffentlichung einrichten

1. Ein **privates** Repository anlegen (die JSON-Datei enthält Kundendaten).
2. Unter <https://github.com/settings/personal-access-tokens/new> ein *Fine-grained Token* erstellen: nur dieses Repository, Berechtigung **Contents: Read and write**.
3. In der Kopfzeile auf **GitHub** klicken, Repository (`name/repo`) und Token eintragen, **Veröffentlichen**.

Das Token wird nur an `api.github.com` gesendet. Standardmäßig bleibt es nur für die Dauer des Tabs erhalten; mit „Token auf diesem Gerät merken“ wird es im `localStorage` des Browsers abgelegt.

Schutz vor Fehlern: Bei einem öffentlichen Repository und bei Änderungen, die auf GitHub neuer sind als dein lokaler Stand, fragt die App vor dem Überschreiben nach.

## Daten & Speicherung

Alles liegt im `localStorage` des Browsers (Schlüssel `wf.*`). Über **GitHub → Lokale Sicherung** gibt es zusätzlich Export/Import als JSON-Datei.

## Datenquellen & Hinweise

- Betriebsdaten: © OpenStreetMap-Mitwirkende (ODbL) via Overpass API; Ortssuche via Nominatim; Kartenkacheln von tile.openstreetmap.org. Für leichte, interaktive Nutzung gedacht – bitte nicht automatisiert in Masse abfragen.
- „Keine Website“ heißt nur: In OSM fehlt das Feld. Vor dem Kontakt per **Prüfen** (Websuche) gegenprüfen. Ketten/Filialisten lassen sich ausblenden.
- Kaltakquise per E-Mail/Telefon ist in Deutschland rechtlich eingeschränkt (UWG §7). Telefonnummern in OSM sind kein Freibrief.
- Leaflet 1.9.4 liegt unter `vendor/leaflet` (BSD-2-Clause).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst, Dialoge |
| `css/style.css` | Design (Atlas-/Feldbuch-Look) |
| `js/store.js` | Zustand, Datenmodell, Persistenz, Zusammenführen |
| `js/map.js` | Karte, Overpass-Suche, Fundstellen-Liste |
| `js/orders.js` | Board, Liste, Auftrags-Dialog |
| `js/github.js` | Veröffentlichen / Laden über die GitHub-Contents-API |
| `js/app.js` | Start & Routing (`#karte`, `#auftraege`) |
| `serve.py` | kleiner Dev-Server ohne Cache |
