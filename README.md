# Weißer Fleck

Internes Planungswerkzeug für ein Website-Erstell-Business. Reines HTML/CSS/JS, kein Build-Schritt, keine Konten, kein eigener Server.

- **Karte:** findet Betriebe, die in OpenStreetMap *keine* Website eingetragen haben (die „weißen Flecken“). Ort suchen → Ausschnitt scannen → Treffer vormerken, als kontaktiert markieren oder verwerfen.
- **Aufträge:** Board (Drag & Drop) und Liste mit Status von *Anfrage* bis *Abgeschlossen/Bezahlt*, Preis, Deadline, Notizen, Verlauf und Kennzahlen. Aufträge mit Position erscheinen als Rauten auf der Karte.
- **GitHub:** veröffentlicht die Aufträge als `data/auftraege.json` (+ lesbare `data/AUFTRAEGE.md` ohne Kontaktdaten) per GitHub-API in ein Repository deiner Wahl. Mit „Von GitHub laden“ lassen sich Daten auf einem zweiten Gerät zusammenführen.

## Online

Live unter <https://maultion-commits.github.io/weisser-fleck/> (GitHub Pages, Branch `main`, Ordner `/`). Jede Änderung auf `main` wird automatisch neu veröffentlicht. Die Seite enthält keine Daten – Aufträge liegen im Browser des jeweiligen Geräts bzw. in deinem GitHub-Repository.

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
- „Keine Website“ heißt zunächst nur: In OSM fehlt das Feld – bei vielen Betrieben ist es schlicht nicht gepflegt. Deshalb gibt es mehrere Prüfstufen (siehe unten). Vor dem Kontakt immer kurz auf **Prüfen** klicken (öffnet den Google-Maps-Eintrag mit Website, Telefon, Öffnungszeiten).

## Wie genau ist die Suche?

Automatisch nach jedem Scan, ohne Schlüssel:

1. OSM-Tags: `website`, `url`, `contact:*`, `wikidata`, Marken/Ketten → ausgeblendet; gleicher Name ≥ 3× im Ausschnitt gilt als Kette.
2. E-Mail auf eigener Domain (`info@haarscharf.de`) → Betrieb hat sehr wahrscheinlich eine Seite.
3. Existiert eine Domain mit **Betriebsname + Ort** (`vinothek-jena.de`)? Geprüft per `HEAD`-Anfrage im Browser (nur „antwortet / antwortet nicht“, kein Inhalt). Reine Namensdomains (`mein-salon.de`) werden bewusst nicht gewertet – in Stichproben gehörten sie fast nie dem Betrieb vor Ort.

Aussortierte Betriebe bleiben sichtbar („Auch Betriebe mit vermuteter Website zeigen“) und lassen sich mit **Doch keine Website** zurückholen. In einer Stichprobe in Jena stimmten rund drei von vier Ortsdomain-Treffern; Fehlalarme sind Parkseiten und Lieferdienst-Weiterleitungen. Betriebe mit einer *anders benannten* Domain erkennt dieser Weg nicht.

Optional und deutlich genauer – **Google-Prüfung** (Button im Panel): liest die Website aus dem Google-Maps-Eintrag über die *Places API (New)*. Du brauchst einen eigenen API-Schlüssel; Google rechnet über dein Konto ab (aktuelle Preise prüfen, Budget-Limit setzen). Läuft nur auf Knopfdruck (max. 100 Betriebe pro Klick, mit Bestätigung). Ergebnis je Betrieb: hat Website → aussortiert, Eintrag ohne Website → „bestätigter Lead“ (goldener Hinweis, grüner Ring auf der Karte, steht oben), dauerhaft geschlossen → verworfen. Facebook/Instagram/Lieferdienste zählen nicht als eigene Website.

Datenschutz: Für Prüfung 3 sendet dein Browser einfache Anfragen an die geratenen Domains (ohne Cookies/Referrer). Für die Google-Prüfung gehen Betriebsname und Adresse an Google.
- Kaltakquise per E-Mail/Telefon ist in Deutschland rechtlich eingeschränkt (UWG §7). Telefonnummern in OSM sind kein Freibrief.
- Leaflet 1.9.4 liegt unter `vendor/leaflet` (BSD-2-Clause).

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Seitengerüst, Dialoge |
| `css/style.css` | Design (Atlas-/Feldbuch-Look) |
| `js/store.js` | Zustand, Datenmodell, Persistenz, Zusammenführen |
| `js/map.js` | Karte, Overpass-Suche, Fundstellen-Liste |
| `js/sitecheck.js` | Website-Hinweise: Tags, Mail-Domain, Ortsdomain-Probe |
| `js/places.js` | optionale Google-Places-Prüfung (eigener API-Schlüssel) |
| `js/orders.js` | Board, Liste, Auftrags-Dialog |
| `js/github.js` | Veröffentlichen / Laden über die GitHub-Contents-API |
| `js/app.js` | Start & Routing (`#karte`, `#auftraege`) |
| `serve.py` | kleiner Dev-Server ohne Cache |
