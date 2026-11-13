# Kratzprognose

Sagt anhand der Wetterprognose, ob du die Autoscheibe **heute** oder **morgen früh** kratzen musst.
Vor 9:00 Uhr startet die App mit „Heute“, danach mit „Morgen“. „Übermorgen“ ist immer wählbar.

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
