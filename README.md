# Emly – Trink- & Toiletten-Tagebuch

Emly ist eine kleine Web-App (PWA) für das Handy: Getränke, Toilettengänge, Training und morgens kurz die Nacht davor eintragen – mit einem Tipp. Dazu gibt es XP, Level und Abzeichen fürs Trinken und Dranbleiben. Wochen-, Monats- und Gesamtberichte lassen sich als PDF erzeugen und z. B. per WhatsApp teilen.

Version 1.0.3

## Datenschutz

**Alle Daten bleiben nur lokal auf dem Gerät.** Keine Server, keine Cloud, kein Konto, keine Tracker, keine Werbung, keine externen Schriften oder Skripte.
Einträge liegen im `localStorage` des Browsers, Fotos (optional) in der IndexedDB. Berichte (PDF) und Backups (JSON) entstehen auf dem Handy und verlassen es nur, wenn man sie selbst teilt.
Wer die App-Daten im Browser löscht oder die App deinstalliert, löscht auch die Einträge – deshalb ab und zu unter „Mehr → Backup exportieren“ sichern.

## Installation (Android, Chrome oder Samsung Internet)

1. Link öffnen: https://rechtslinks.github.io/emly/
2. Chrome: Menü ⋮ → „Zum Startbildschirm hinzufügen“ bzw. „App installieren“.
   Samsung Internet: Menü ☰ → „Seite hinzufügen zu“ → „Startbildschirm“.
3. Emly über das neue App-Symbol starten. Nach dem ersten Laden funktioniert die App auch ohne Internet.

Hinweis: Wird der Link in WhatsApp angetippt, öffnet er sich evtl. im WhatsApp-internen Browser. Dann zuerst „In Chrome öffnen“ wählen, damit die Installation und das lokale Speichern zuverlässig funktionieren.

## Entwicklung

- Reines HTML/CSS/JavaScript, kein Build-Schritt, keine Abhängigkeiten außer `vendor/jspdf.umd.min.js`.
- Lokal starten: `python3 -m http.server 8000` im Projektordner, dann http://localhost:8000/ öffnen.
  Die App läuft auch in einem Unterordner (alle Pfade relativ), wie auf GitHub Pages.
- Aufbau: `js/core.js` (Namespace, Bus, Helfer), `store.js` (Daten), `ui.js`, `game.js` (XP/Abzeichen), `today.js` (Heute), `reports.js` + `pdf.js` (Berichte), `settings.js` (Mehr), `app.js` (Start, Navigation, PWA), `sw.js` (Offline-Cache).
- Neue Version: `CACHE` in `sw.js` **und** `Emly.VERSION` in `js/core.js` gemeinsam erhöhen – sonst bleibt der alte Offline-Cache aktiv.
- GitHub Pages: Inhalt dieses Ordners in das Repository legen, Pages auf den Branch/Ordner zeigen lassen. Die Datei `.nojekyll` sorgt dafür, dass alle Dateien unverändert ausgeliefert werden.

## Lizenzen

- `vendor/jspdf.umd.min.js`: jsPDF – MIT-Lizenz, © James Hall, yWorks GmbH und Mitwirkende (https://github.com/parallax/jsPDF).
- Icons, Grafiken und App-Code: eigene Erstellung für Emly.

Emly ersetzt keine ärztliche Beratung. Richtwert Getränke 10–13 Jahre laut DGE: ca. 1.170 ml pro Tag.
