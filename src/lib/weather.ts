export type Place = {
  id: string;
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
};

export type HourData = {
  time: string;
  hour: number;
  temp: number;
  dew: number;
  humidity: number;
  precip: number;
  code: number;
  cloud: number;
  wind: number;
  risk: number;
};

export type Forecast = {
  timezone: string;
  current?: { time: string; temperature_2m: number; weather_code: number };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    dew_point_2m: number[];
    precipitation: number[];
    weather_code: number[];
    cloud_cover: number[];
    wind_speed_10m: number[];
  };
  daily: {
    time: string[];
    temperature_2m_min: number[];
    temperature_2m_max: number[];
    sunrise: string[];
    precipitation_sum: number[];
    weather_code: number[];
  };
};

/** 0 = Heute, 1 = Morgen, 2 = Übermorgen */
export type DayOffset = 0 | 1 | 2;

export const DAY_WORDS: Record<DayOffset, { tab: string; early: string; title: string }> = {
  0: { tab: "Heute", early: "heute früh", title: "heute" },
  1: { tab: "Morgen", early: "morgen früh", title: "morgen" },
  2: { tab: "Übermorgen", early: "übermorgen früh", title: "übermorgen" },
};

export type RiskLevel = "high" | "medium" | "low" | "none";

export type Factor = {
  key: string;
  label: string;
  value: string;
  detail: string;
  strength: number;
  hint: "cold" | "moist" | "precip" | "sky";
};

export type Analysis = {
  dateKey: string;
  dateLabel: string;
  shortDateLabel: string;
  level: RiskLevel;
  score: number;
  hours: HourData[];
  morningHours: HourData[];
  coldest: HourData;
  worst: HourData;
  minTemp: number;
  dewAtColdest: number;
  avgHumidity: number;
  nightPrecip: number;
  avgCloud: number;
  avgWind: number;
  sunrise: string;
  dailyMax: number;
  thawHour: string | null;
  factors: Factor[];
  /** Abfahrtszeit in Minuten seit Mitternacht, für die bewertet wurde. */
  departMin: number;
  departLabel: string;
  /** Wetterwerte zur Abfahrtszeit (zwischen den beiden Nachbarstunden interpoliert). */
  departure: HourData;
};

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
export const fmtTemp = (n: number) => `${Math.round(n * 10) / 10}°`.replace(".", ",");

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query.trim()
  )}&count=6&language=de&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("Die Ortssuche ist gerade nicht erreichbar.");
  const data = await res.json();
  const results = data?.results ?? [];
  return results.map((r: any) => ({
    id: String(r.id ?? `${r.latitude}-${r.longitude}`),
    name: r.name,
    region: r.admin1 && r.admin1 !== r.name ? r.admin1 : "",
    country: r.country ?? r.country_code ?? "",
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function getForecast(place: Place, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "dew_point_2m",
      "precipitation",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
    ].join(","),
    daily: [
      "temperature_2m_min",
      "temperature_2m_max",
      "sunrise",
      "precipitation_sum",
      "weather_code",
    ].join(","),
    current: "temperature_2m,weather_code",
    timezone: "auto",
    // Gestern mitladen: für „Heute“ braucht die Analyse den Vorabend (Nachtniederschlag, Nachtmittel).
    past_days: "1",
    forecast_days: "4",
    wind_speed_unit: "kmh",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!res.ok) throw new Error("Die Wetterdaten konnten nicht geladen werden.");
  return res.json();
}

function localParts(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function safeTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format();
    return timeZone;
  } catch {
    return "Europe/Berlin";
  }
}

/** Abfahrtszeit in Minuten seit Mitternacht: Standard 6:00, wählbar 4:00–10:00 in 15-Minuten-Schritten. */
export const DEFAULT_DEPART = 6 * 60;
export const DEPART_MIN = 4 * 60;
export const DEPART_MAX = 10 * 60;
export const DEPART_STEP = 15;

export const fmtClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Macht aus einem gespeicherten/unbekannten Wert eine gültige Abfahrtszeit. */
export function normalizeDepart(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_DEPART;
  const stepped = Math.round(n / DEPART_STEP) * DEPART_STEP;
  return Math.min(DEPART_MAX, Math.max(DEPART_MIN, stepped));
}

/** Bis eine Stunde nach der Abfahrt zeigt die App standardmäßig „Heute“, danach „Morgen“. */
export function defaultOffset(timeZone: string, departMin: number, now = new Date()): DayOffset {
  const { hour, minute } = localParts(safeTimeZone(timeZone), now);
  return hour * 60 + minute < departMin + 60 ? 0 : 1;
}

export function localDateKey(timeZone: string, offset: number, now = new Date()): string {
  const { year, month, day } = localParts(safeTimeZone(timeZone), now);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  base.setUTCDate(base.getUTCDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

export function prettyDate(dateKey: string, weekday: "long" | "short" = "long") {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString("de-DE", {
    weekday,
    day: "numeric",
    month: weekday === "long" ? "long" : "numeric",
    timeZone: "UTC",
  });
}

function rawHours(fc: Forecast): Omit<HourData, "risk">[] {
  const h = fc.hourly;
  return h.time.map((time, i) => ({
    time,
    hour: Number(time.slice(11, 13)),
    temp: h.temperature_2m[i] ?? 0,
    dew: h.dew_point_2m[i] ?? 0,
    humidity: h.relative_humidity_2m[i] ?? 0,
    precip: h.precipitation[i] ?? 0,
    code: h.weather_code[i] ?? 0,
    cloud: h.cloud_cover[i] ?? 50,
    wind: h.wind_speed_10m[i] ?? 0,
  }));
}

const FROZEN_CODES = [56, 57, 66, 67, 71, 73, 75, 77, 85, 86];

function hourRisk(h: Omit<HourData, "risk">, wetBonus: number): number {
  const t = h.temp;
  const spread = t - h.dew;
  let score = clamp((3.5 - t) / 8) * 52;

  if (t < 3) {
    // Je kälter, desto stärker wirkt die vorhandene Feuchtigkeit.
    const coldness = clamp((3 - t) / 3);
    let moisture = clamp((h.humidity - 55) / 35) * 18 + clamp((5 - spread) / 5) * 12;
    if (h.dew <= 0 && spread <= 3) moisture += 5;
    // Bei klarem, windstillem Himmel kühlt die Scheibe stärker aus als die Luft.
    if (h.cloud < 40) moisture += 6;
    if (h.wind < 10) moisture += 4;
    score += moisture * coldness;
    // Feuchtigkeit aus Regen/Schnee der letzten Stunden gefriert auf der Scheibe.
    score += wetBonus * clamp((1.5 - t) / 2.5);
  }
  if (h.precip > 0 && t <= 1.5) score += Math.min(16, 7 + h.precip * 9);
  if (FROZEN_CODES.includes(h.code) && t <= 2) score += 12;
  return Math.round(clamp(score, 0, 100));
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 62) return "high";
  if (score >= 38) return "medium";
  if (score >= 18) return "low";
  return "none";
}

/** Stunden vor der Abfahrt, deren Frost noch auf der Scheibe liegen kann. */
const FROST_MEMORY_MIN = 180;

/** Wetterwerte zur genauen Abfahrtszeit: lineare Interpolation zwischen voller und nächster Stunde. */
function interpolateDeparture(
  scored: HourData[],
  dayKey: string,
  departMin: number,
  wetBonus: number,
  fallback: HourData
): HourData {
  const hour = Math.floor(departMin / 60);
  const frac = (departMin % 60) / 60;
  const idx = scored.findIndex((h) => h.time === `${dayKey}T${String(hour).padStart(2, "0")}:00`);
  const a = idx >= 0 ? scored[idx] : undefined;
  if (!a) return { ...fallback, time: `${dayKey}T${fmtClock(departMin)}`, hour };
  const b = scored[idx + 1] ?? a;
  const mix = (x: number, y: number) => x + (y - x) * frac;
  const raw = {
    time: `${dayKey}T${fmtClock(departMin)}`,
    hour,
    temp: round1(mix(a.temp, b.temp)),
    dew: round1(mix(a.dew, b.dew)),
    humidity: Math.round(mix(a.humidity, b.humidity)),
    precip: round1(mix(a.precip, b.precip)),
    code: frac < 0.5 ? a.code : b.code,
    cloud: Math.round(mix(a.cloud, b.cloud)),
    wind: Math.round(mix(a.wind, b.wind)),
  };
  return { ...raw, risk: hourRisk(raw, wetBonus) };
}

export function analyze(fc: Forecast, offset: DayOffset, departInput: number = DEFAULT_DEPART): Analysis {
  const departMin = normalizeDepart(departInput);
  const dayKey = localDateKey(fc.timezone, offset);
  const prevKey = localDateKey(fc.timezone, offset - 1);
  const all = rawHours(fc);

  const dayHours = all.filter((h) => h.time.startsWith(dayKey));
  const prevEvening = all.filter((h) => h.time.startsWith(prevKey) && h.hour >= 19);
  // Nacht bis zur Abfahrt: ab 22 Uhr am Vorabend bis zur Abfahrtsstunde.
  const targetNight = dayHours.filter((h) => h.hour * 60 <= departMin);
  const night = [...prevEvening.filter((h) => h.hour >= 22), ...targetNight];

  const nightPrecip = round1(
    [...prevEvening, ...dayHours.filter((h) => h.hour * 60 <= departMin)].reduce((sum, h) => sum + h.precip, 0)
  );
  const wetBonus = clamp(nightPrecip / 1.5) * 9;

  const scored: HourData[] = all.map((h) => ({ ...h, risk: hourRisk(h, wetBonus) }));
  const fallback: HourData = {
    time: `${dayKey}T07:00`,
    hour: 7,
    temp: 0,
    dew: 0,
    humidity: 0,
    precip: 0,
    code: 0,
    cloud: 50,
    wind: 0,
    risk: 0,
  };
  const departure = interpolateDeparture(scored, dayKey, departMin, wetBonus, fallback);

  // Kältester Moment der Nacht bis zur Abfahrt (inklusive Abfahrtszeitpunkt).
  const scoredNight = [...scored.filter((h) => h.time.startsWith(dayKey) && h.hour * 60 <= departMin), departure];
  const coldest = [...scoredNight].sort((a, b) => a.temp - b.temp)[0] ?? fallback;

  // Für die Bewertung zählt, was in den Stunden vor der Abfahrt auf der Scheibe liegen kann.
  const windowHours = [
    ...scored.filter(
      (h) =>
        h.time.startsWith(dayKey) && h.hour * 60 >= departMin - FROST_MEMORY_MIN && h.hour * 60 <= departMin
    ),
    departure,
  ];
  const worst = [...windowHours].sort((a, b) => b.risk - a.risk)[0] ?? fallback;
  const windowColdest = [...windowHours].sort((a, b) => a.temp - b.temp)[0] ?? fallback;

  let score = worst.risk;
  if (windowColdest.temp <= 0 && windowColdest.humidity >= 70) score = Math.max(score, 45);
  if (windowColdest.temp >= 5) score = Math.min(score, 12);
  if (windowColdest.temp <= -1 && nightPrecip > 0.1) score = Math.max(score, 70);

  const avgHumidity = Math.round(night.reduce((s, h) => s + h.humidity, 0) / Math.max(1, night.length));
  const avgCloud = Math.round(night.reduce((s, h) => s + h.cloud, 0) / Math.max(1, night.length));
  const avgWind = Math.round(night.reduce((s, h) => s + h.wind, 0) / Math.max(1, night.length));
  // Diagramm: 4 bis 10 Uhr deckt jede wählbare Abfahrtszeit ab.
  const morningHours = scored.filter((h) => h.time.startsWith(dayKey) && h.hour >= 4 && h.hour <= 10);

  const dailyIndex = fc.daily?.time?.indexOf(dayKey) ?? -1;
  const sunriseRaw = dailyIndex >= 0 ? fc.daily.sunrise[dailyIndex] : "";
  const sunrise = sunriseRaw ? sunriseRaw.slice(11, 16) : "–";
  const dailyMax = dailyIndex >= 0 ? fc.daily.temperature_2m_max[dailyIndex] : 8;
  // „Taut ab“ nur, wenn es zur Abfahrt noch nicht mild genug ist.
  const thaw =
    departure.temp > 1.5
      ? undefined
      : scored.find((h) => h.time.startsWith(dayKey) && h.hour * 60 > departMin && h.hour <= 12 && h.temp > 1.5);
  const thawHour = thaw ? `${String(thaw.hour).padStart(2, "0")}:00` : null;

  const factors: Factor[] = [
    {
      key: "temp",
      label: "Tiefsttemperatur",
      value: `${fmtTemp(coldest.temp)} um ${coldest.time.slice(11, 16)} Uhr`,
      detail:
        coldest.temp <= 0
          ? "Unter dem Gefrierpunkt – die Scheibe kann vereisen."
          : coldest.temp <= 2
            ? "Knapp über Null: Bei klarem Himmel kühlt Glas stärker aus als die Luft."
            : "Zu mild für eine Eisschicht.",
      strength: clamp((4 - coldest.temp) / 8),
      hint: "cold",
    },
    {
      key: "moisture",
      label: "Feuchtigkeit & Taupunkt",
      value: `${avgHumidity}% · Taupunkt ${fmtTemp(coldest.dew)}`,
      detail:
        coldest.temp - coldest.dew <= 3
          ? "Die Luft ist fast gesättigt – Reif bildet sich besonders leicht."
          : "Relativ trockene Luft, dadurch weniger Raureif.",
      strength: clamp((avgHumidity - 45) / 50),
      hint: "moist",
    },
    {
      key: "precip",
      label: "Niederschlag in der Nacht",
      value: nightPrecip > 0 ? `${nightPrecip.toFixed(1).replace(".", ",")} mm` : "Keiner",
      detail:
        nightPrecip > 0
          ? "Nässe auf der Scheibe kann bei Frost festfrieren."
          : "Keine zusätzliche Nässe von oben.",
      strength: clamp(nightPrecip / 2.5),
      hint: "precip",
    },
    {
      key: "sky",
      label: "Wolken & Wind",
      value: `${avgCloud}% Wolken · ${avgWind} km/h`,
      detail:
        avgCloud < 45 && avgWind < 12
          ? "Klar und ruhig: starke Auskühlung der Scheibe über Nacht."
          : "Bewölkung oder Wind bremsen die Auskühlung etwas ab.",
      strength: clamp((100 - avgCloud) / 100) * clamp((20 - avgWind) / 18),
      hint: "sky",
    },
  ];

  return {
    dateKey: dayKey,
    dateLabel: prettyDate(dayKey, "long"),
    shortDateLabel: prettyDate(dayKey, "short"),
    level: levelFromScore(score),
    score: Math.round(clamp(score, 0, 100)),
    hours: scored,
    morningHours,
    coldest,
    worst,
    minTemp: coldest.temp,
    dewAtColdest: coldest.dew,
    avgHumidity,
    nightPrecip,
    avgCloud,
    avgWind,
    sunrise,
    dailyMax,
    thawHour,
    factors,
    departMin,
    departLabel: fmtClock(departMin),
    departure,
  };
}

/** Klar gekennzeichnete Beispieldaten, falls die Live-API nicht erreichbar ist. */
export function createDemoForecast(place: Place): Forecast {
  const tz = "Europe/Berlin";
  // Wie die echte Abfrage (past_days=1): gestern + heute + 3 Folgetage.
  const startKey = localDateKey(tz, -1);
  const start = new Date(`${startKey}T00:00:00Z`).getTime();
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const relative_humidity_2m: number[] = [];
  const dew_point_2m: number[] = [];
  const precipitation: number[] = [];
  const weather_code: number[] = [];
  const cloud_cover: number[] = [];
  const wind_speed_10m: number[] = [];
  const latShift = (place.lat - 50) * -0.18;
  const dayMins = [0.4, -1.6, -3.4, 0.3, 2.2];
  const dayIdx = [0, 1, 2, 3, 4];

  for (let d = 0; d < 5; d++) {
    for (let h = 0; h < 24; h++) {
      const iso = new Date(start + (d * 24 + h) * 3600000).toISOString();
      time.push(`${iso.slice(0, 10)}T${iso.slice(11, 16)}`);
      const min = dayMins[d] + latShift;
      const temp = round1(min + 5.2 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (h - 14)) / 24)));
      const dew = round1(temp - 1.6 - 0.4 * Math.sin(h / 3));
      const precip = (d === 0 || d === 1) && h >= 20 && h <= 22 ? 0.3 : 0;
      const cloud = [50, 62, 24, 48, 70][d] + ((h % 5) - 2) * 3;
      temperature_2m.push(temp);
      dew_point_2m.push(dew);
      relative_humidity_2m.push(Math.round(Math.min(97, 94 - (temp - dew) * 4)));
      precipitation.push(precip);
      weather_code.push(precip > 0 ? 61 : cloud < 40 ? 1 : 3);
      cloud_cover.push(Math.max(0, Math.min(100, cloud)));
      wind_speed_10m.push(5 + (h % 4));
    }
  }

  return {
    timezone: tz,
    current: { time: time[24], temperature_2m: 2.1, weather_code: 3 },
    hourly: {
      time,
      temperature_2m,
      relative_humidity_2m,
      dew_point_2m,
      precipitation,
      weather_code,
      cloud_cover,
      wind_speed_10m,
    },
    daily: {
      time: dayIdx.map((d) => new Date(start + d * 86400000).toISOString().slice(0, 10)),
      temperature_2m_min: dayMins.map((m) => round1(m + latShift)),
      temperature_2m_max: dayMins.map((m) => round1(m + 5.2 + latShift)),
      sunrise: dayIdx.map((d) => `${new Date(start + d * 86400000).toISOString().slice(0, 10)}T07:42`),
      precipitation_sum: [0.3, 0.9, 0, 0.2, 1.1],
      weather_code: [3, 3, 1, 3, 61],
    },
  };
}

export type WeatherKind = "sun" | "cloud" | "fog" | "rain" | "snow" | "storm";

export function weatherKind(code: number): WeatherKind {
  if ([45, 48].includes(code)) return "fog";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([71, 73, 75, 77, 85, 86, 56, 57, 66, 67].includes(code)) return "snow";
  if (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    code === 61 ||
    code === 63 ||
    code === 65
  )
    return "rain";
  if ([1, 2].includes(code)) return "sun";
  if (code >= 3) return "cloud";
  return "sun";
}

export function weatherLabel(code: number): string {
  if (code === 0) return "Klar";
  if (code === 1) return "Überwiegend klar";
  if (code === 2) return "Leicht bewölkt";
  if (code === 3) return "Bewölkt";
  if ([45, 48].includes(code)) return "Nebel";
  if ([51, 53, 55, 56, 57].includes(code)) return "Nieselregen";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Regen";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Schnee";
  if ([95, 96, 99].includes(code)) return "Gewitter";
  return "Wechselhaft";
}
