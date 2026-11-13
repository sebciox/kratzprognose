# Kratzprognose

Sagt anhand der Wetterprognose, ob du die Autoscheibe **heute** oder **morgen früh** kratzen musst.
Die Abfahrtszeit ist wählbar (4:00 bis 10:00 Uhr, Standard 6:00 Uhr) und wird gemerkt. Die Einschätzung gilt für die Nacht bis zu dieser Uhrzeit. Bis eine Stunde nach der Abfahrt startet die App mit „Heute“, danach mit „Morgen“. Unter dem großen Kreis zeigt eine Reihe kleiner Kreise die Einschätzung für heute und die nächsten vier Tage; Antippen wählt den Tag. Ort und Abfahrtszeit stellst du über die obere Zeile ein. Zum Aktualisieren die Ansicht oben nach unten ziehen.

## Aufruf am Handy

1. Die Seite im Browser öffnen: `https://<github-name>.github.io/kratzprognose/`
2. „Zum Startbildschirm hinzufügen“ (iPhone: Teilen-Menü, Android: Browser-Menü „App installieren“).
3. Morgens das Symbol antippen. Die App lädt automatisch neu, wenn sie länger im Hintergrund war.

## Orte

- Der Startort ist Witten (NRW). Über die Suche eingetragen, wird ein anderer Ort als Heimatort gemerkt.
- „GPS-Standort“ nutzt den aktuellen Standort (nur über https, dein Browser fragt nach der Freigabe).
  Der zuletzt ermittelte Standort bleibt gespeichert.

## Datenquellen

- Wetter und Ortssuche: [Open-Meteo](https://open-meteo.com) (kostenlos, ohne Schlüssel, Modellwahl automatisch)
- Ortsname beim GPS-Standort: BigDataCloud (reverse geocoding)
- Schrift: Plus Jakarta Sans, lokal eingebunden (keine Google-Server)

Der **Risiko-Score ist eine einfache Faustformel** aus Temperatur, Taupunkt, Luftfeuchte, Wolken, Wind und
Nachtniederschlag (`src/lib/weather.ts`), keine Messung und nicht wissenschaftlich validiert.
Stunden, die für „Heute“ schon vergangen sind, sind Modellwerte, keine Messwerte.

## Entwicklung

```bash
npm install
npm run dev        # lokal unter http://localhost:5173/kratzprognose/
npm run build      # Typprüfung + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Veröffentlicht wird per GitHub Actions bei jedem Push auf `main` (`.github/workflows/deploy.yml`,
GitHub Pages mit Quelle „GitHub Actions“).
