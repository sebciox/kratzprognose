import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Sunrise,
  Thermometer,
  ThermometerSnowflake,
  ThermometerSun,
  Wind,
  X,
} from "lucide-react";
import { PULL_READY, usePullToRefresh } from "./lib/usePullToRefresh";
import {
  analyzeDays,
  createDemoForecast,
  dayWords,
  DEFAULT_DEPART,
  DEPART_MAX,
  DEPART_MIN,
  DEPART_STEP,
  fmtClock,
  fmtTemp,
  getForecast,
  normalizeDepart,
  searchPlaces,
  weatherKind,
  weekdayShort,
  weatherLabel,
  type Analysis,
  type DayOffset,
  type Forecast,
  type HourData,
  type Place,
  type RiskLevel,
} from "./lib/weather";

const STORAGE_HOME = "kratzprognose.home";
const STORAGE_GPS = "kratzprognose.gps";
const STORAGE_ACTIVE = "kratzprognose.active";
const STORAGE_DEPART = "kratzprognose.depart";
const STORAGE_DETAILS = "kratzprognose.details";

const DEPART_OPTIONS = Array.from(
  { length: (DEPART_MAX - DEPART_MIN) / DEPART_STEP + 1 },
  (_, i) => DEPART_MIN + i * DEPART_STEP
);

/** Startort beim allerersten Aufruf; wird durch die Ortssuche ersetzt und dann gemerkt. */
const DEFAULT_HOME: Place = {
  id: "witten",
  name: "Witten",
  region: "Nordrhein-Westfalen",
  country: "Deutschland",
  lat: 51.4436,
  lon: 7.3526,
};

/** Nach so langer Zeit im Hintergrund lädt die App beim Zurückkehren neu. */
const STALE_AFTER_MS = 30 * 60 * 1000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const VERDICT: Record<
  RiskLevel,
  {
    badge: string;
    description: (early: string) => string;
    color: string;
    glow: string;
    text: string;
    chip: string;
    bar: string;
  }
> = {
  high: {
    badge: "Hohes Frost-Risiko",
    description: () =>
      "In der Nacht und am frühen Morgen sinkt die Temperatur unter den Gefrierpunkt – bei ausreichend Feuchtigkeit bildet sich Raureif oder eine Eisschicht auf der Scheibe.",
    color: "#67e8f9",
    glow: "rgba(103,232,249,0.28)",
    text: "text-cyan-200",
    chip: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
    bar: "from-cyan-300 to-sky-400",
  },
  medium: {
    badge: "Wahrscheinlich",
    description: () =>
      "Die Werte liegen nah am Gefrierpunkt. Vor allem an windstillen, klaren Stellen kann sich über Nacht Reif auf dem Glas bilden.",
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.24)",
    text: "text-amber-200",
    chip: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    bar: "from-amber-300 to-orange-400",
  },
  low: {
    badge: "Geringes Risiko",
    description: () =>
      "Überwiegend zu mild für eine geschlossene Eisschicht. In kühlen Ecken oder nach nächtlichem Regen kann dennoch ein Hauch Reif entstehen.",
    color: "#93c5fd",
    glow: "rgba(147,197,253,0.2)",
    text: "text-blue-200",
    chip: "border-blue-300/25 bg-blue-300/10 text-blue-100",
    bar: "from-blue-300 to-indigo-400",
  },
  none: {
    badge: "Kein Frost in Sicht",
    description: (early) =>
      `Die Nacht bleibt zu warm für Raureif oder Eis auf der Windschutzscheibe. Du kannst ${early} voraussichtlich direkt losfahren.`,
    color: "#6ee7b7",
    glow: "rgba(110,231,183,0.22)",
    text: "text-emerald-200",
    chip: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    bar: "from-emerald-300 to-teal-400",
  },
};

/** Für „Heute“ gibt es keine Vorabend-Aufgaben mehr (abdecken, Prognose am Abend prüfen). */
const PREP_ITEMS_TODAY: Record<RiskLevel, string[]> = {
  high: [
    "Eiskratzer & Enteiser griffbereit legen",
    "5–10 Minuten mehr Zeit einplanen",
    "Scheibenwaschanlage mit Frostschutz prüfen",
  ],
  medium: ["Eiskratzer ins Auto legen", "Beim Einsteigen kurz die Scheibe prüfen"],
  low: ["Kurz über die Scheibe wischen", "Enteiser für den Fall der Fälle im Auto haben"],
  none: ["Direkt einsteigen und losfahren", "Kurzer Blick auf die Scheibe genügt"],
};

const PREP_ITEMS_AHEAD: Record<RiskLevel, string[]> = {
  high: [
    "Eiskratzer & Enteiser griffbereit legen",
    "5–10 Minuten früher losfahren",
    "Scheibe am Vorabend abdecken oder Garage nutzen",
    "Scheibenwaschanlage mit Frostschutz prüfen",
  ],
  medium: [
    "Eiskratzer ins Auto legen",
    "Beim Einsteigen kurz die Scheibe prüfen",
    "Scheibenabdeckung in Erwägung ziehen",
    "Prognose am Vorabend noch einmal checken",
  ],
  low: [
    "Morgens kurz über die Scheibe wischen",
    "Enteiser für den Fall der Fälle im Auto haben",
    "Wetterprognose am Vorabend bestätigen",
  ],
  none: [
    "Direkt einsteigen und losfahren",
    "Kurzer Blick auf die Scheibe genügt",
    "Prognose bei Bedarf aktualisieren",
  ],
};

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* z. B. privater Modus – die App funktioniert auch ohne Speicher */
  }
}

/** Thermometer-Symbol passend zur Temperatur: Schneeflocke bei Frost, sonst ohne. */
function TempIcon({ temp }: { temp: number }) {
  if (temp <= 0.5) return <ThermometerSnowflake className="h-5 w-5 text-cyan-300" aria-hidden="true" />;
  if (temp >= 20) return <ThermometerSun className="h-5 w-5 text-amber-300" aria-hidden="true" />;
  return <Thermometer className="h-5 w-5 text-slate-300" aria-hidden="true" />;
}

function WeatherIcon({ code, className = "h-5 w-5" }: { code: number; className?: string }) {
  const kind = weatherKind(code);
  const props = { className, strokeWidth: 1.7 };
  if (kind === "sun") return code <= 1 ? <Sun {...props} /> : <CloudSun {...props} />;
  if (kind === "cloud") return <Cloud {...props} />;
  if (kind === "fog") return <CloudFog {...props} />;
  if (kind === "rain") return code >= 80 ? <CloudRain {...props} /> : <CloudDrizzle {...props} />;
  if (kind === "snow") return <CloudSnow {...props} />;
  if (kind === "storm") return <CloudLightning {...props} />;
  return <Cloud {...props} />;
}

function RiskGauge({ score, level }: { score: number; level: RiskLevel }) {
  const c = VERDICT[level].color;
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(440px,40dvh)]">
      <div
        className="absolute inset-6 rounded-full blur-3xl transition-colors duration-700"
        style={{ background: VERDICT[level].glow, opacity: 0.55 }}
      />
      <svg viewBox="0 0 200 200" className="relative h-full w-full -rotate-90">
        <defs>
          <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity="0.45" />
            <stop offset="100%" stopColor={c} />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="8" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Risiko</span>
        <span className="mt-1 text-[5.5rem] font-extrabold leading-none tracking-tight text-white tabular-nums sm:text-[7rem]">{score}</span>
      </div>
    </div>
  );
}

/** Kleiner Risiko-Kreis für einen Tag in der Mehrtages-Leiste. */
function MiniGauge({ score, level }: { score: number; level: RiskLevel }) {
  const c = VERDICT[level].color;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-12 w-12">
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke={c}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - score / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums text-white">{score}</span>
    </div>
  );
}

/** Heute und die nächsten Tage als Reihe kleiner Kreise. Antippen wählt den Tag für den großen Kreis. */
function DayStrip({ days, selected, onSelect }: { days: Analysis[]; selected: number; onSelect: (offset: DayOffset) => void }) {
  return (
    <div className="mt-6 grid w-full grid-cols-5 gap-1.5" role="tablist" aria-label="Prognose für die nächsten Tage">
      {days.map((d, i) => (
        <button
          key={d.dateKey}
          role="tab"
          aria-selected={selected === i}
          onClick={() => onSelect(i as DayOffset)}
          className={`flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 transition ${selected === i ? "border-cyan-300/40 bg-cyan-300/10" : "border-transparent hover:border-white/20"}`}
        >
          <MiniGauge score={d.score} level={d.level} />
          <span className={`text-[11px] font-semibold ${selected === i ? "text-cyan-100" : "text-slate-400"}`}>{weekdayShort(i, d.dateKey)}</span>
        </button>
      ))}
    </div>
  );
}

function TempChart({
  hours,
  selectedTime,
  onSelect,
  departMin,
}: {
  hours: HourData[];
  selectedTime: string;
  onSelect: (t: string) => void;
  departMin: number;
}) {
  const width = 700;
  const height = 215;
  const left = 38;
  const right = 18;
  const top = 24;
  const bottom = 36;
  if (hours.length === 0) return null;

  const values = [...hours.map((h) => h.temp), ...hours.map((h) => h.dew), 0];
  let lo = Math.min(...values) - 1.4;
  let hi = Math.max(...values) + 1.4;
  if (hi - lo < 6) hi = lo + 6;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const x = (i: number) => left + (i * plotW) / Math.max(1, hours.length - 1);
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * plotH;
  const tempPath = hours.map((h, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(h.temp)}`).join(" ");
  const dewPath = hours.map((h, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(h.dew)}`).join(" ");
  const area = `${tempPath} L ${x(hours.length - 1)} ${top + plotH} L ${x(0)} ${top + plotH} Z`;
  const ticks = [hi - 1.4, (hi + lo) / 2, lo + 1.4];
  // Position der Abfahrtszeit im Diagramm (Bruchteil zwischen zwei Stunden möglich).
  const departIndex = departMin / 60 - hours[0].hour;
  const showDepart = departIndex >= 0 && departIndex <= hours.length - 1;
  const departX = left + (departIndex * plotW) / Math.max(1, hours.length - 1);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Temperaturverlauf am Morgen">
      <defs>
        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.07)" strokeDasharray="4 6" />
          <text x={4} y={y(t) + 4} fill="rgba(190,215,245,0.5)" fontSize="11">{Math.round(t)}°</text>
        </g>
      ))}
      {y(0) > top && y(0) < top + plotH && (
        <g>
          <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="#67e8f9" strokeOpacity="0.42" strokeWidth="1.3" strokeDasharray="6 5" />
          <text x={width - right - 2} y={y(0) - 7} textAnchor="end" fill="#67e8f9" fontSize="10" fontWeight="600">Gefrierpunkt</text>
        </g>
      )}
      <path d={area} fill="url(#areaGradient)" />
      {showDepart && (
        <g>
          <line x1={departX} x2={departX} y1={top - 4} y2={top + plotH} stroke="#fbbf24" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="3 4" />
          <text x={departX} y={top - 9} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="700">
            Abfahrt {fmtClock(departMin)}
          </text>
        </g>
      )}
      <path d={dewPath} fill="none" stroke="#a78bfa" strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" opacity="0.8" />
      <path d={tempPath} fill="none" stroke="#67e8f9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {hours.map((h, i) => {
        const selected = h.time === selectedTime;
        return (
          <g key={h.time} onClick={() => onSelect(h.time)} className="cursor-pointer">
            {selected && <rect x={x(i) - 22} y={top - 6} width="44" height={plotH + 12} rx="10" fill="rgba(103,232,249,0.07)" />}
            <circle cx={x(i)} cy={y(h.temp)} r={selected ? 6 : 4.5} fill="#08182c" stroke="#67e8f9" strokeWidth="2.5" />
            <text x={x(i)} y={y(h.temp) - 13} textAnchor="middle" fill="#d9f4ff" fontSize="11" fontWeight="700">
              {fmtTemp(h.temp)}
            </text>
            <text x={x(i)} y={height - 10} textAnchor="middle" fill={selected ? "#67e8f9" : "rgba(190,215,245,0.65)"} fontSize="11" fontWeight="600">
              {String(h.hour).padStart(2, "0")}:00
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function App() {
  const [home, setHome] = useState<Place>(() => readStored(STORAGE_HOME, DEFAULT_HOME));
  const [gps, setGps] = useState<Place | null>(() => readStored<Place | null>(STORAGE_GPS, null));
  const [active, setActive] = useState<"home" | "gps">(() => readStored(STORAGE_ACTIVE, "home"));
  const place: Place = active === "gps" && gps ? gps : home;
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [demo, setDemo] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [depart, setDepart] = useState<number>(() => normalizeDepart(readStored(STORAGE_DEPART, DEFAULT_DEPART)));
  // Die App startet immer mit „Heute“.
  const [offset, setOffset] = useState<DayOffset>(0);
  const lastLoadedAt = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [showDetails, setShowDetails] = useState<boolean>(() => readStored<boolean>(STORAGE_DETAILS, false) === true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => writeStored(STORAGE_HOME, home), [home]);
  useEffect(() => writeStored(STORAGE_GPS, gps), [gps]);
  useEffect(() => writeStored(STORAGE_ACTIVE, active), [active]);
  useEffect(() => writeStored(STORAGE_DEPART, depart), [depart]);
  useEffect(() => writeStored(STORAGE_DETAILS, showDetails), [showDetails]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getForecast(place, controller.signal)
      .then((fc) => {
        setForecast(fc);
        lastLoadedAt.current = Date.now();
        setUpdatedAt(new Date());
        setDemo(false);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        setForecast(createDemoForecast(place));
        setUpdatedAt(null);
        setDemo(true);
        setError(
          `Keine Verbindung zum Wetterdienst (${err.message || "Netzwerkfehler"}). Es werden Beispielwerte angezeigt, damit du die Ansicht testen kannst.`
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [place, reloadToken]);

  // Die installierte Web-App bleibt über Nacht im Hintergrund. Beim Zurückkehren
  // (z. B. um 5:30) neu laden und wieder „Heute“ anzeigen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadedAt.current < STALE_AFTER_MS) return;
      setOffset(0);
      setSelectedTime(null);
      setReloadToken((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(q, controller.signal)
        .then(setResults)
        .catch((err: Error) => {
          if (err.name !== "AbortError") setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Einschätzung für heute und die nächsten Tage zur gewählten Abfahrtszeit.
  const days: Analysis[] = useMemo(() => {
    if (!forecast) return [];
    try {
      return analyzeDays(forecast, depart);
    } catch {
      return [];
    }
  }, [forecast, depart]);
  const analysis: Analysis | null = days[offset] ?? null;
  // Aktuelle Temperatur laut Open-Meteo; ohne Wert die Stundenprognose zur Abfahrtszeit.
  const nowTemp = forecast?.current?.temperature_2m ?? analysis?.departure.temp ?? 0;

  const resetView = () => {
    setQuery("");
    setResults([]);
    setSearchOpen(false);
    setEditOpen(false);
    setSelectedTime(null);
    setChecked({});
  };

  /** Über die Suche eingetragener Ort wird der gemerkte Heimatort. */
  const selectPlace = (p: Place) => {
    setHome(p);
    setActive("home");
    resetView();
  };

  const selectGps = () => {
    if (!gps) return useGeolocation();
    setActive("gps");
    resetView();
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) {
      setError("Dein Browser unterstützt keine Standortabfrage.");
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let name = "Mein Standort";
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=de`
          );
          const data = await res.json();
          name = data.city || data.locality || data.principalSubdivision || name;
        } catch {
          /* Fallback bleibt "Mein Standort" */
        }
        setGps({
          id: `geo-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
          name,
          region: "GPS-Standort",
          country: `${latitude.toFixed(2)}° N · ${longitude.toFixed(2)}° O`,
          lat: latitude,
          lon: longitude,
        });
        setActive("gps");
        resetView();
        setGeoLoading(false);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Standort nicht freigegeben. Am iPhone: Einstellungen › Datenschutz & Sicherheit › Ortungsdienste › Safari-Websites › „Beim Verwenden der App“. Danach die App neu öffnen. Oder such eine Stadt."
            : err.code === err.TIMEOUT
              ? "Die Standortbestimmung hat zu lange gedauert. Bitte versuch es noch einmal oder such eine Stadt."
              : "Der Standort konnte nicht bestimmt werden. Versuch es noch einmal oder such eine Stadt."
        );
        setGeoLoading(false);
      },
      { timeout: 15000, maximumAge: 600000 }
    );
  };

  const verdict = analysis ? VERDICT[analysis.level] : VERDICT.none;
  const level: RiskLevel = analysis?.level ?? "none";
  const day = dayWords(offset, analysis?.dateKey);
  const pull = usePullToRefresh(() => setReloadToken((n) => n + 1));
  // Zeigt, für welche Region die Aussage gilt (bei GPS statt der Koordinaten nur „GPS-Standort“).
  const placeSub = place.region === "GPS-Standort" ? "GPS-Standort" : [place.region, place.country].filter(Boolean).join(", ");
  const prepItems = (offset === 0 ? PREP_ITEMS_TODAY : PREP_ITEMS_AHEAD)[level];
  // Ohne Auswahl zeigt die Detailzeile die Werte zur Abfahrtszeit.
  const selectedHour = analysis?.morningHours.find((h) => h.time === selectedTime) ?? analysis?.departure ?? null;

  return (
    <div className="app-full relative overflow-hidden bg-[#050b19] text-slate-100">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(56,140,220,0.28),transparent_70%)]" />
        <div className="absolute -left-40 top-64 h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute -right-40 top-[640px] h-[420px] w-[420px] rounded-full bg-indigo-500/10 blur-[130px]" />
        <div className="grid-lines absolute inset-0" />
      </div>

      {pull > 0 && (
        <div
          className="pointer-events-none fixed left-1/2 z-50 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-cyan-300/30 bg-[#0a1a30]/80 text-cyan-200"
          style={{ top: "calc(env(safe-area-inset-top) + 1rem)", opacity: Math.min(1, pull / PULL_READY) }}
          aria-hidden="true"
        >
          <RefreshCw className="h-4 w-4" style={{ transform: `rotate(${pull * 8}deg)` }} />
        </div>
      )}

      <div
        className="app-full relative mx-auto flex max-w-3xl flex-col px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.5rem)] pt-[calc(env(safe-area-inset-top)_+_1rem)] sm:px-6"
        style={{ transform: pull > 0 ? `translateY(${pull}px)` : undefined, transition: pull > 0 ? "none" : "transform 0.25s ease" }}
      >
        {/* Oben: Ort · Uhrzeit · Tag. Antippen zum Ändern. */}
        <button
          onClick={() => setEditOpen((v) => !v)}
          aria-expanded={editOpen}
          aria-label="Ort, Uhrzeit und Tag ändern"
          className="glass-soft relative z-30 mx-auto flex w-[calc(100%-2rem)] max-w-sm items-center justify-center gap-2.5 rounded-2xl px-4 py-3 text-center transition hover:border-cyan-300/40"
        >
          {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" /> : <MapPin className="h-4 w-4 shrink-0 text-cyan-300" />}
          <span className="min-w-0 truncate text-base font-bold text-white">
            {place.name}
            <span className="font-semibold text-slate-300"> · {fmtClock(depart)} Uhr · {day.tab}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${editOpen ? "rotate-180" : ""}`} />
        </button>

        {editOpen && (
          <div className="glass relative z-30 mt-3 flex flex-col gap-3 rounded-2xl p-2.5">
            <div ref={searchRef} className="relative">
              <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3.5 py-2.5 ring-1 ring-white/5 transition focus-within:ring-cyan-300/35">
                <MapPin className="h-4 w-4 shrink-0 text-cyan-300/80" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && results[0]) selectPlace(results[0]);
                    if (e.key === "Escape") setSearchOpen(false);
                  }}
                  placeholder={`Ort ändern · aktuell ${place.name}`}
                  className="w-full bg-transparent text-base font-medium text-white placeholder:text-slate-500 focus:outline-none"
                  aria-label="Stadt suchen"
                />
                {query ? (
                  <button onClick={() => { setQuery(""); setResults([]); }} className="text-slate-500 hover:text-white" aria-label="Suche löschen">
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <Search className="h-4 w-4 shrink-0 text-slate-500" />
                )}
                {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" />}
              </div>
              {searchOpen && (query.length >= 2 || results.length > 0) && (
                <div className="glass absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-72 overflow-y-auto rounded-2xl p-1.5 shadow-2xl">
                  {results.length > 0 ? (
                    results.map((r) => (
                      <button
                        key={`${r.id}-${r.lat}`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectPlace(r)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.07]"
                      >
                        <MapPin className="h-4 w-4 shrink-0 text-cyan-300/70" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white">{r.name}</span>
                          <span className="block truncate text-xs text-slate-400">{[r.region, r.country].filter(Boolean).join(", ")}</span>
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-4 text-center text-sm text-slate-400">
                      {searching ? "Orte werden gesucht …" : "Keine Orte gefunden. Versuch eine andere Schreibweise."}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {([
                { key: "home" as const, label: home.name, icon: MapPin, onClick: () => selectPlace(home) },
                { key: "gps" as const, label: gps ? `GPS · ${gps.name}` : "GPS-Standort", icon: LocateFixed, onClick: selectGps },
              ]).map((c) => (
                <button
                  key={c.key}
                  onClick={c.onClick}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${place === (c.key === "gps" ? gps : home) ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-white"}`}
                >
                  {c.key === "gps" && geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <c.icon className="h-3.5 w-3.5" />}
                  {c.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label
                className="glass-soft flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-slate-300 transition focus-within:border-cyan-300/40 hover:border-cyan-300/40"
                title="Abfahrtszeit"
              >
                <Clock className="h-4 w-4 shrink-0 text-amber-300" />
                <select
                  value={depart}
                  onChange={(e) => {
                    setDepart(normalizeDepart(Number(e.target.value)));
                    setSelectedTime(null);
                  }}
                  aria-label="Abfahrtszeit"
                  className="cursor-pointer bg-transparent text-base font-bold text-white tabular-nums focus:outline-none"
                >
                  {DEPART_OPTIONS.map((m) => (
                    <option key={m} value={m} className="bg-[#0a1428] text-white">
                      {fmtClock(m)} Uhr
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        {demo && (
          <p className="mt-3 text-center text-[11px] font-bold uppercase tracking-wider text-amber-200">Demo-Daten · keine Live-Prognose</p>
        )}

        {error && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-5 py-4 text-sm text-amber-100">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => { setError(null); setReloadToken((n) => n + 1); }} className="rounded-lg bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20">
              Erneut versuchen
            </button>
          </div>
        )}

        {/* Mitte: der Risiko-Kreis, fast bildschirmbreit */}
        <div className="flex flex-1 flex-col items-center justify-center py-6">
          {loading && !analysis ? (
            <div className="aspect-square w-full max-w-[min(440px,40dvh)] animate-pulse rounded-full border-[10px] border-white/10" />
          ) : analysis ? (
            <>
              <div className="animate-rise flex w-full flex-col items-center" key={`${place.id}-${offset}`}>
                <RiskGauge score={analysis.score} level={level} />
                <p className="mt-5 text-center text-2xl font-extrabold tracking-tight" style={{ color: verdict.color }}>
                  {verdict.badge}
                </p>
                {/* Nur am aktuellen Tag: die Temperatur jetzt. Das Symbol folgt der Temperatur. */}
                {offset === 0 && (
                  <p className="mt-2 flex items-center justify-center gap-2 text-xl font-bold tabular-nums text-white">
                    <TempIcon temp={nowTemp} />
                    {fmtTemp(nowTemp)}
                  </p>
                )}
              </div>
              <DayStrip days={days} selected={offset} onSelect={(o) => { setOffset(o); setSelectedTime(null); }} />
            </>
          ) : (
            !error && (
              <div className="text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-300" />
                <h2 className="mt-4 text-xl font-bold">Keine Prognose verfügbar</h2>
                <p className="mt-2 text-sm text-slate-400">Bitte lade die Wetterdaten erneut.</p>
                <button onClick={() => setReloadToken((n) => n + 1)} className="mt-5 rounded-xl bg-cyan-300/15 px-5 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-300/25">
                  Aktualisieren
                </button>
              </div>
            )
          )}
        </div>

        {/* Unten: Details */}
        <div className="flex items-stretch gap-2 px-1">
          <button
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="glass-soft flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-100"
          >
            {showDetails ? "Details ausblenden" : "Details anzeigen"}
            <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </button>
        </div>

        {showDetails && analysis && (
          <div className="mt-2">
            <section className="glass mt-5 overflow-hidden rounded-[24px]">
              <div className="flex flex-wrap items-center gap-2.5 px-6 pt-6 sm:px-8">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${verdict.chip}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {verdict.badge}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  <CalendarDays className="mr-1.5 inline h-3.5 w-3.5" />
                  {analysis.dateLabel} · Abfahrt {analysis.departLabel} Uhr
                </span>
              </div>
              <p className="px-6 pt-2 text-xs text-slate-500 sm:px-8">{[place.name, placeSub].filter(Boolean).join(", ")}</p>
              <p className="px-6 pt-4 text-sm leading-relaxed text-slate-300 sm:px-8">{verdict.description(day.early)}</p>
              <div className="flex flex-wrap gap-2 px-6 pb-6 pt-4 sm:px-8">
                <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${verdict.chip}`}>
                  <ThermometerSnowflake className="mr-1.5 inline h-3.5 w-3.5" />
                  Tiefstwert {fmtTemp(analysis.minTemp)}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                  <Droplets className="mr-1.5 inline h-3.5 w-3.5" />
                  {analysis.avgHumidity}% Luftfeuchte
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300">
                  <Clock className="mr-1.5 inline h-3.5 w-3.5" />
                  Höchstes Risiko vor der Abfahrt: {analysis.worst.time.slice(11, 16)} Uhr ({analysis.worst.risk}/100)
                </span>
              </div>
              <div className="grid grid-cols-1 divide-y divide-white/10 border-t border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="flex items-center gap-3 px-6 py-5 sm:px-8">
                  <ThermometerSnowflake className="h-5 w-5 shrink-0 text-cyan-300" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Kältester Moment</p>
                    <p className="text-sm font-bold text-white">{fmtTemp(analysis.minTemp)} um {analysis.coldest.time.slice(11, 16)} Uhr</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-6 py-5 sm:px-8">
                  <Sunrise className="h-5 w-5 shrink-0 text-amber-300" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Sonnenaufgang</p>
                    <p className="text-sm font-bold text-white">{analysis.sunrise} Uhr</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-6 py-5 sm:px-8">
                  <Thermometer className="h-5 w-5 shrink-0 text-orange-300" />
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-slate-500">Tageshöchstwert</p>
                    <p className="text-sm font-bold text-white">{fmtTemp(analysis.dailyMax)}{analysis.thawHour ? ` · taut ab ${analysis.thawHour} Uhr` : ""}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Chart + hour detail */}
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
              <section className="glass rounded-[24px] p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight">{cap(day.early)} im Verlauf</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {analysis.morningHours[0]?.hour ?? 4} bis 10 Uhr · Abfahrt {analysis.departLabel} Uhr · tippe auf eine Uhrzeit für Details
                      {offset === 0 ? " · bereits vergangene Stunden sind Modellwerte, keine Messung" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-cyan-300" /> Temperatur</span>
                    <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed border-violet-300" /> Taupunkt</span>
                  </div>
                </div>
                <div className="mt-5">
                  <TempChart
                    hours={analysis.morningHours}
                    selectedTime={selectedHour?.time ?? ""}
                    onSelect={setSelectedTime}
                    departMin={analysis.departMin}
                  />
                </div>
                {selectedHour && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
                    <WeatherIcon code={selectedHour.code} className="h-6 w-6 text-cyan-200" />
                    <div className="min-w-[140px] flex-1">
                      <p className="text-sm font-bold text-white">{selectedHour.time.slice(11, 16)} Uhr · {weatherLabel(selectedHour.code)}</p>
                      <p className="text-xs text-slate-400">
                        {fmtTemp(selectedHour.temp)} Luft · Taupunkt {fmtTemp(selectedHour.dew)} · {selectedHour.humidity}% Feuchte
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">Frost-Risiko</p>
                      <p className="text-sm font-bold" style={{ color: verdict.color }}>
                        {selectedHour.risk >= 62 ? "Hoch" : selectedHour.risk >= 38 ? "Mittel" : selectedHour.risk >= 18 ? "Gering" : "Kaum"} · {selectedHour.risk}/100
                      </p>
                    </div>
                  </div>
                )}
              </section>

              <section className="glass rounded-[24px] p-5 sm:p-7">
                <h3 className="text-lg font-bold tracking-tight">Auf einen Blick</h3>
                <p className="mt-1 text-xs text-slate-400">Alle Werte für {analysis.shortDateLabel}</p>
                <div className="mt-5 space-y-2.5">
                  {[
                    { icon: Clock, label: `Bei Abfahrt (${analysis.departLabel} Uhr)`, value: `${fmtTemp(analysis.departure.temp)} · ${weatherLabel(analysis.departure.code)}`, tint: "text-amber-300" },
                    { icon: ThermometerSnowflake, label: "Tiefsttemperatur", value: `${fmtTemp(analysis.minTemp)} um ${analysis.coldest.time.slice(11, 16)} Uhr`, tint: "text-cyan-300" },
                    { icon: Droplets, label: "Taupunkt (kältester Moment)", value: fmtTemp(analysis.dewAtColdest), tint: "text-violet-300" },
                    { icon: CloudRain, label: "Niederschlag in der Nacht", value: analysis.nightPrecip > 0 ? `${analysis.nightPrecip.toFixed(1).replace(".", ",")} mm` : "0,0 mm", tint: "text-blue-300" },
                    { icon: Wind, label: "Bewölkung & Wind", value: `${analysis.avgCloud}% · ${analysis.avgWind} km/h`, tint: "text-slate-300" },
                    { icon: CarFront, label: "Deine Scheibe", value: analysis.level === "high" ? "Vereist / Raureif" : analysis.level === "medium" ? "Reif möglich" : "Weitgehend frei", tint: verdict.text },
                  ].map((row) => (
                    <div key={row.label} className="glass-soft flex items-center gap-3 rounded-xl px-3.5 py-3">
                      <row.icon className={`h-4 w-4 shrink-0 ${row.tint}`} />
                      <span className="flex-1 text-xs text-slate-400">{row.label}</span>
                      <span className="text-right text-xs font-bold text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-2 text-[11px] text-slate-500">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {demo
                      ? "Beispielwerte – keine Live-Prognose"
                      : `Stand: ${updatedAt ? updatedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "–"} Uhr`}
                  </span>
                </div>
              </section>
            </div>

            {/* Factors + checklist */}
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
              <section className="glass rounded-[24px] p-5 sm:p-7">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold tracking-tight">Wie kommt die Einschätzung zustande?</h3>
                  <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-bold text-cyan-200">{analysis.factors.length} Faktoren</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">Eine Scheibe vereist, wenn sie unter 0 °C auskühlt und genug Feuchtigkeit vorhanden ist.</p>
                <div className="mt-5 space-y-3">
                  {analysis.factors.map((f) => {
                    const Icon = f.hint === "cold" ? ThermometerSnowflake : f.hint === "moist" ? Droplets : f.hint === "precip" ? CloudRain : Cloud;
                    return (
                      <div key={f.key} className="glass-soft rounded-2xl p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-cyan-200">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <p className="text-sm font-bold text-white">{f.label}</p>
                              <p className="text-xs font-semibold text-cyan-200">{f.value}</p>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-slate-400">{f.detail}</p>
                            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${verdict.bar} transition-all duration-700`}
                                style={{ width: `${Math.round(f.strength * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="glass rounded-[24px] p-5 sm:p-7">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-300" />
                  <h3 className="text-lg font-bold tracking-tight">Deine Vorbereitung</h3>
                </div>
                <p className="mt-1 text-xs text-slate-400">Kleine To-do-Liste für {analysis.shortDateLabel}</p>
                <div className="mt-5 space-y-2.5">
                  {prepItems.map((item) => {
                    const key = `${level}-${item}`;
                    const done = !!checked[key];
                    return (
                      <button
                        key={key}
                        onClick={() => setChecked((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${done ? "border-emerald-300/25 bg-emerald-300/[0.07]" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}
                      >
                        <span className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border ${done ? "border-emerald-300 bg-emerald-300/20 text-emerald-200" : "border-slate-500 text-transparent"}`}>
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span className={`text-xs leading-relaxed ${done ? "text-slate-400 line-through" : "text-slate-200"}`}>{item}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-200">
                    <CheckCircle2 className="h-4 w-4" /> Gut zu wissen
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    Glas kühlt bei klarem Himmel oft 1–2 °C stärker aus als die gemessene Lufttemperatur. Deshalb kann sich selbst bei leicht positiven Temperaturen Reif bilden.
                  </p>
                </div>
              </section>
            </div>
            <p className="mt-6 text-center text-xs text-slate-500">
              {demo ? "Demo-Modus: Live-Wetterdaten gerade nicht erreichbar." : "Wetterdaten von Open-Meteo · Prognosen können sich kurzfristig ändern."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
