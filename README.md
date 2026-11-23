# Kratzprognose

Sagt anhand der Wetterprognose, ob du die Autoscheibe **heute** oder **morgen früh** kratzen musst.
Die Abfahrtszeit ist wählbar (4:00 bis 10:00 Uhr, Standard 6:00 Uhr) und wird gemerkt. Die Einschätzung gilt für die Nacht bis zu dieser Uhrzeit. Die App startet immer mit „Heute“; „Morgen“ und die weiteren Tage wählst du unter dem Kreis. Unter dem großen Kreis zeigt eine Reihe kleiner Kreise die Einschätzung für heute und die nächsten vier Tage; Antippen wählt den Tag. Ort und Abfahrtszeit stellst du über die obere Zeile ein. Zum Aktualisieren die Ansicht oben nach unten ziehen.

## Aufruf am Handy

1. Die Seite im Browser öffnen: `https://<github-name>.github.io/kratzprognose/`
2. „Zum Startbildschirm hinzufügen“ (iPhone: Teilen-Menü, Android: Browser-Menü „App installieren“).
3. Morgens das Symbol antippen. Die App lädt automatisch neu, wenn sie länger im Hintergrund war.

## Orte

- Der Startort ist Witten (NRW). Über die Suche eingetragen, wird ein anderer Ort als Heimatort gemerkt.
- „GPS-Standort“ nutzt den aktuellen Standort (nur über https, dein Browser fragt nach der Freigabe).
  Der zuletzt ermittelte Standort bleibt gespeichert.

## Datenquellen

- Wetter und Ortssuche: [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel). Wettermodell: DWD-ICON
  (`icon_seamless`: 2 km in Mitteleuropa, sonst gröbere ICON-Modelle). Der Standard-Mix von Open-Meteo lag in
  einer klaren, kalten Nacht (21.11.2026, Witten) 2–3 °C zu warm und sagte Wolken voraus, die ausblieben.
- Ortsname beim GPS-Standort: BigDataCloud (reverse geocoding)
- Schrift: Plus Jakarta Sans, lokal eingebunden (keine Google-Server)

## So wird gerechnet

Der **Risiko-Score ist eine Faustformel**, keine Messung und nicht wissenschaftlich validiert (`src/lib/weather.ts`):

1. **Scheibentemperatur:** Lufttemperatur minus Abstrahlung zum Himmel (bis ca. 3,8 °C bei klarem, ruhigem
   Himmel, bei Wolken und Wind weniger). Deshalb kann die Scheibe vereisen, obwohl die Luft noch im Plus ist.
2. **Frost-Gedächtnis:** Die Nacht wird Stunde für Stunde durchgerechnet, beginnend am Vorabend. Eis baut sich
   auf, solange die Scheibe unter 0 °C liegt, und taut erst, wenn sie deutlich im Plus ist. Frost von 22 Uhr
   zählt also noch um 6 Uhr, wenn er bis dahin nicht getaut ist.
3. **Zahl zur Abfahrtszeit:** Höher von „Risiko zu dieser Stunde“ und „noch nicht getauter Eisstand“.

Stunden, die für „Heute“ schon vergangen sind, sind Modellwerte, keine Messwerte. Die Prognose kann trotzdem
danebenliegen (Wolken-Timing, Kaltluftseen): Nach einer klaren Nacht lohnt ein Blick auf die Scheibe.

## Entwicklung

```bash
npm install
npm run dev        # lokal unter http://localhost:5173/kratzprognose/
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Veröffentlicht wird per GitHub Actions bei jedem Push auf `main` (`.github/workflows/deploy.yml`,
GitHub Pages mit Quelle „GitHub Actions“).
