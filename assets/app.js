/* Vejr & Planlægning — statisk dashboard til GitHub Pages.
   Data: Open-Meteo (ingen API-nøgle). Falder tilbage til demo-data uden netværk. */

const API = "https://api.open-meteo.com/v1/forecast";
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const AIR = "https://air-quality-api.open-meteo.com/v1/air-quality";

const DEFAULT_PLACE = { name: "København", region: "Hovedstaden", country: "Danmark", lat: 55.6761, lon: 12.5683 };

/* De fire modeller der sammenlignes. Slot-numrene peger på --s1..--s4 i CSS. */
const MODELS = [
  { id: "dmi_seamless", short: "DMI", name: "DMI Harmonie", origin: "Danmark", slot: 1 },
  { id: "ecmwf_ifs025", short: "ECMWF", name: "ECMWF IFS", origin: "Europa", slot: 2 },
  { id: "icon_seamless", short: "ICON", name: "ICON", origin: "DWD, Tyskland", slot: 3 },
  { id: "gfs_seamless", short: "GFS", name: "GFS", origin: "NOAA, USA", slot: 4 }
];
const MODEL_HOURS = 48;   // sammenligningens horisont

/* Pollenarter der er relevante i Danmark. CAMS måler i korn pr. m³.
   Grænserne er de gængse europæiske trin — omtrentlige, ikke en klinisk skala. */
const POLLEN = [
  { id: "alder_pollen", name: "El", steps: [1, 10, 50, 500] },
  { id: "birch_pollen", name: "Birk", steps: [1, 10, 50, 500] },
  { id: "grass_pollen", name: "Græs", steps: [1, 5, 20, 200] },
  { id: "mugwort_pollen", name: "Bynke", steps: [1, 5, 20, 100] },
  { id: "ragweed_pollen", name: "Ambrosia", steps: [1, 5, 20, 100] }
];
const POLLEN_BANDS = ["Intet", "Lavt", "Moderat", "Højt", "Meget højt"];

/* Det europæiske luftkvalitetsindeks (EEA-skalaen). */
const AQI_BANDS = [
  { max: 20, name: "God", tone: 1, advice: "Fri bane for alt udendørs." },
  { max: 40, name: "Rimelig", tone: 2, advice: "Ingen begrænsninger for de fleste." },
  { max: 60, name: "Moderat", tone: 3, advice: "Følsomme bør skrue ned for hård træning udendørs." },
  { max: 80, name: "Ringe", tone: 4, advice: "Læg hård træning indendørs, og luft ud om morgenen." },
  { max: 100, name: "Meget ringe", tone: 5, advice: "Undgå anstrengelse udendørs, og hold vinduerne lukket." },
  { max: Infinity, name: "Ekstremt ringe", tone: 6, advice: "Bliv indendørs, og hold vinduerne lukket." }
];
const aqiBand = (v) => AQI_BANDS.find((b) => v <= b.max) || AQI_BANDS[AQI_BANDS.length - 1];
const pollenLevel = (v, steps) => steps.filter((t) => v >= t).length;
const RAIN_MM = 0.2;      // hvornår en model "ser regn" i en time

/* Antagelser for terrassen — juster her hvis din terrasse er anderledes. */
const TERRACE = {
  southFactor: 1.25,   // fuld sydsol fordamper mere end en åben mark
  shelterFactor: 0.55, // hvor stor en del af regnen der reelt rammer potterne
  potArea: 0.049       // m² for en 25 cm potte (til liter-/ml-beregning)
};

const state = { place: null, data: null, day: 0, demo: false, viewHours: [], hourSel: -1, models: null, air: null };

/* localStorage kan kaste i privat tilstand — huskefunktionen må aldrig vælte siden. */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignorer */ } }
};

/* ---------- små hjælpere ---------- */
const $ = (sel) => document.querySelector(sel);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => String(r1(v)).replace(".", ",");
const num = (v, fb = 0) => (typeof v === "number" && isFinite(v) ? v : fb);
const hhmm = (iso) => (iso || "").slice(11, 16).replace(":", ".");
const dayKey = (iso) => (iso || "").slice(0, 10);
const dateFromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const WEEKDAYS = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
const MONTHS = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const dayName = (k) => WEEKDAYS[dateFromKey(k).getDay()];
const dayDate = (k) => { const d = dateFromKey(k); return `${d.getDate()}. ${MONTHS[d.getMonth()]}`; };
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const COMPASS = ["N", "NNØ", "NØ", "ØNØ", "Ø", "ØSØ", "SØ", "SSØ", "S", "SSV", "SV", "VSV", "V", "VNV", "NV", "NNV"];
const dir = (deg) => COMPASS[Math.round(num(deg) / 22.5) % 16];

/* Beaufort-agtig beskrivelse af vind i m/s */
function windWord(ms) {
  if (ms < 0.3) return "stille";
  if (ms < 3.4) return "svag vind";
  if (ms < 5.5) return "let vind";
  if (ms < 8) return "jævn vind";
  if (ms < 10.8) return "frisk vind";
  if (ms < 13.9) return "hård vind";
  if (ms < 17.2) return "stiv kuling";
  if (ms < 20.8) return "hård kuling";
  if (ms < 24.5) return "stormende kuling";
  if (ms < 28.5) return "storm";
  if (ms < 32.7) return "stærk storm";
  return "orkan";
}

/* ---------- vejrkoder og ikoner ---------- */
const WMO = {
  0: ["Klart", "clear"], 1: ["Overvejende klart", "mostly"], 2: ["Delvist skyet", "partly"], 3: ["Overskyet", "overcast"],
  45: ["Tåge", "fog"], 48: ["Rimtåge", "fog"],
  51: ["Let støvregn", "drizzle"], 53: ["Støvregn", "drizzle"], 55: ["Kraftig støvregn", "drizzle"],
  56: ["Underafkølet støvregn", "sleet"], 57: ["Kraftig underafkølet støvregn", "sleet"],
  61: ["Let regn", "rain"], 63: ["Regn", "rain"], 65: ["Kraftig regn", "rain"],
  66: ["Isslag", "sleet"], 67: ["Kraftigt isslag", "sleet"],
  71: ["Let snefald", "snow"], 73: ["Snefald", "snow"], 75: ["Kraftigt snefald", "snow"], 77: ["Snekorn", "snow"],
  80: ["Regnbyger", "showers"], 81: ["Byger", "showers"], 82: ["Kraftige byger", "showers"],
  85: ["Snebyger", "snow"], 86: ["Kraftige snebyger", "snow"],
  95: ["Tordenvejr", "thunder"], 96: ["Torden med hagl", "thunder"], 99: ["Kraftig torden med hagl", "thunder"]
};
const SNOWY = new Set([71, 73, 75, 77, 85, 86]);
const ICY = new Set([56, 57, 66, 67]);
const THUNDER = new Set([95, 96, 99]);
const FOGGY = new Set([45, 48]);
const codeText = (c) => (WMO[c] ? WMO[c][0] : "Ukendt");
const codeKind = (c) => (WMO[c] ? WMO[c][1] : "overcast");

const P = {
  sun: '<circle cx="12" cy="12" r="4.3" stroke="var(--warm)"/><path stroke="var(--warm)" d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
  sunSmall: '<circle cx="8.5" cy="8" r="3.1" stroke="var(--warm)"/><path stroke="var(--warm)" d="M8.5 1.8v1.6M2.3 8h1.6M4.1 3.6l1.2 1.2M12.9 3.6l-1.2 1.2"/>',
  moon: '<path stroke="var(--text-2)" d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2z"/>',
  moonSmall: '<path stroke="var(--text-2)" d="M12.6 9.4A5.2 5.2 0 0 1 6.2 3a5.2 5.2 0 1 0 6.4 6.4z"/>',
  cloud: '<path stroke="var(--text-2)" d="M7.4 18.5h9.1a3.7 3.7 0 0 0 .4-7.4 5.5 5.5 0 0 0-10.5-1 4.2 4.2 0 0 0 1 8.4z"/>',
  cloudLow: '<path stroke="var(--text-2)" d="M8 17.5h8.4a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.6-.9A3.9 3.9 0 0 0 8 17.5z"/>',
  drops: '<path stroke="var(--rain)" d="M9 20.2l-1 2M13 20.2l-1 2M17 20.2l-1 2"/>',
  dropsHeavy: '<path stroke="var(--rain)" d="M8.4 19.6l-1.4 3M12.4 19.6l-1.4 3M16.4 19.6l-1.4 3M10.4 19.6l-1 2M14.4 19.6l-1 2"/>',
  flakes: '<path stroke="var(--cold)" d="M8.6 21h.01M12.6 20.2h.01M16.6 21h.01M10.6 22.6h.01M14.6 22.6h.01" stroke-width="2.6"/>',
  bolt: '<path stroke="var(--warm)" d="M13 19l-3.4 4.4h4L11 27" transform="translate(0,-6)" stroke-width="2"/>',
  fog: '<path stroke="var(--text-2)" d="M4 16h16M6 19.4h13M4.5 22.6h11"/>'
};

function weatherIcon(code, isDay = 1, cls = "wicon") {
  const k = codeKind(code);
  const base = isDay ? P.sun : P.moon;
  const small = isDay ? P.sunSmall : P.moonSmall;
  let body;
  switch (k) {
    case "clear": body = base; break;
    case "mostly": body = small + P.cloudLow; break;
    case "partly": body = small + P.cloud; break;
    case "overcast": body = P.cloud; break;
    case "fog": body = P.cloudLow + P.fog; break;
    case "drizzle": body = P.cloud + P.drops; break;
    case "rain": body = P.cloud + P.dropsHeavy; break;
    case "showers": body = small + P.cloud + P.drops; break;
    case "sleet": body = P.cloud + P.drops + P.flakes; break;
    case "snow": body = P.cloud + P.flakes; break;
    case "thunder": body = P.cloud + P.bolt; break;
    default: body = P.cloud;
  }
  return `<svg class="${cls}" viewBox="0 0 24 26" aria-hidden="true">${body}</svg>`;
}

const ICONS = {
  car: '<svg viewBox="0 0 24 24"><path d="M4.5 16.5h15M5 16.5V19H7v-2.5M17 16.5V19h2v-2.5"/><path d="M3.8 16.5l1-5.2a2 2 0 0 1 2-1.6h10.4a2 2 0 0 1 2 1.6l1 5.2z"/><path d="M6.6 13h10.8"/></svg>',
  hike: '<svg viewBox="0 0 24 24"><circle cx="13" cy="4.6" r="1.9"/><path d="M12 8.4l-3 3.2 2.4 2.4.6 6M11.4 14l-3.6 2.6-1.4 4M14.4 9.4l2.6 2.2 3 .6M17.6 21V9"/></svg>',
  plant: '<svg viewBox="0 0 24 24"><path d="M12 21v-7.5"/><path d="M12 13.5C12 9.9 9.4 7.2 5.6 6.6c-.5 3.9 1.9 7 6.4 6.9z"/><path d="M12 13.5c0-3.6 2.6-6.3 6.4-6.9.5 3.9-1.9 7-6.4 6.9z"/><path d="M8.6 21h6.8"/></svg>',
  drop: '<svg viewBox="0 0 24 24"><path d="M12 3.6s5.6 6 5.6 9.6a5.6 5.6 0 1 1-11.2 0C6.4 9.6 12 3.6 12 3.6z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6"/></svg>',
  wind: '<svg viewBox="0 0 24 24"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h14a3 3 0 1 1-3 3M3 11.5h7"/></svg>',
  snow: '<svg viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5L4.2 16.5"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4.8 12.6l4.6 4.6L19.4 7.2"/></svg>'
};

/* ---------- datahentning ---------- */
function weatherUrl(p) {
  const q = new URLSearchParams({
    latitude: p.lat, longitude: p.lon, timezone: "auto", forecast_days: 7, wind_speed_unit: "ms",
    current: "temperature_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,relative_humidity_2m,is_day,shortwave_radiation",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max,sunrise,sunset,sunshine_duration,et0_fao_evapotranspiration"
  });
  return `${API}?${q}`;
}

/* Luftkvalitet og pollen ligger på et andet værtsnavn end vejrprognosen. */
function airUrl(p) {
  const q = new URLSearchParams({
    latitude: p.lat, longitude: p.lon, timezone: "auto", forecast_days: 3,
    hourly: ["pm10", "pm2_5", "ozone", "nitrogen_dioxide", "european_aqi"].concat(POLLEN.map((x) => x.id)).join(",")
  });
  return `${AIR}?${q}`;
}

async function loadAir(place) {
  const res = await fetch(airUrl(place));
  const js = await res.json().catch(() => null);
  if (!res.ok || !js || js.error) throw new Error((js && js.reason) || `Luft-API'et svarede ${res.status}`);
  if (!js.hourly || !js.hourly.time) throw new Error("Ufuldstændigt svar");
  return js;
}

function shapeAir(raw, fromISO) {
  const H = raw.hourly;
  const col = (k) => (Array.isArray(H[k]) ? H[k] : []);
  let i = H.time.indexOf(fromISO);
  if (i < 0) i = H.time.findIndex((t) => t >= fromISO);
  if (i < 0) i = 0;
  const todayKey = dayKey(H.time[i]);
  const todayIdx = H.time.map((t, k) => k).filter((k) => dayKey(H.time[k]) === todayKey);

  /* Nogle felter dækker kun Europa — de kommer tilbage som null uden for. */
  const val = (k, at) => { const v = col(k)[at]; return typeof v === "number" && isFinite(v) ? v : null; };
  const peak = (k) => todayIdx.reduce((best, at) => {
    const v = val(k, at);
    return v !== null && (best === null || v > best.v) ? { v, t: H.time[at] } : best;
  }, null);

  const pollen = POLLEN.map((sp) => ({
    ...sp, now: val(sp.id, i), peak: peak(sp.id)
  })).filter((sp) => sp.now !== null || sp.peak !== null);

  return {
    t: H.time[i],
    aqi: val("european_aqi", i),
    aqiPeak: peak("european_aqi"),
    pm25: val("pm2_5", i), pm10: val("pm10", i),
    o3: val("ozone", i), no2: val("nitrogen_dioxide", i),
    pollen
  };
}

/* Modelsammenligningen hentes for sig: fejler den, mangler kun dette ét afsnit. */
function modelsUrl(p) {
  const q = new URLSearchParams({
    latitude: p.lat, longitude: p.lon, timezone: "auto", forecast_days: 3, wind_speed_unit: "ms",
    models: MODELS.map((m) => m.id).join(","),
    hourly: "temperature_2m,precipitation"
  });
  return `${API}?${q}`;
}

async function loadModels(place) {
  const res = await fetch(modelsUrl(place));
  const js = await res.json().catch(() => null);
  if (!res.ok || !js || js.error) throw new Error((js && js.reason) || `Open-Meteo svarede ${res.status}`);
  if (!js.hourly || !js.hourly.time) throw new Error("Ufuldstændigt svar");
  return js;
}

/* Med flere modeller suffikser Open-Meteo variabelnavnene (temperature_2m_dmi_seamless).
   Med én model gør den ikke — så prøv begge. */
function modelCol(H, base, id) {
  const a = H[`${base}_${id}`];
  if (Array.isArray(a)) return a;
  const b = H[base];
  return Array.isArray(b) ? b : [];
}

function shapeModels(raw, fromISO) {
  const H = raw.hourly;
  let start = H.time.indexOf(fromISO);
  if (start < 0) start = H.time.findIndex((t) => t >= fromISO);
  if (start < 0) start = 0;
  const time = H.time.slice(start, start + MODEL_HOURS);
  if (time.length < 6) throw new Error("For få timer i svaret");
  const series = MODELS.map((m) => {
    const temp = modelCol(H, "temperature_2m", m.id).slice(start, start + time.length);
    const precip = modelCol(H, "precipitation", m.id).slice(start, start + time.length);
    return { ...m, temp, precip, ok: temp.some((v) => typeof v === "number" && isFinite(v)) };
  }).filter((m) => m.ok);
  if (series.length < 2) throw new Error("Kun én model svarede");

  /* Spænd og regn-enighed pr. time */
  const hours = time.map((t, i) => {
    const temps = series.map((m) => m.temp[i]).filter((v) => typeof v === "number" && isFinite(v));
    const rain = series.filter((m) => num(m.precip[i]) >= RAIN_MM).length;
    return {
      t, hh: hhmm(t), key: dayKey(t),
      min: temps.length ? Math.min(...temps) : 0,
      max: temps.length ? Math.max(...temps) : 0,
      spread: temps.length ? Math.max(...temps) - Math.min(...temps) : 0,
      rain, rainAll: series.length
    };
  });
  return { time, series, hours };
}

async function loadWeather(place) {
  const res = await fetch(weatherUrl(place));
  const js = await res.json().catch(() => null);
  if (!res.ok || !js || js.error) throw new Error((js && js.reason) || `Open-Meteo svarede ${res.status}`);
  if (!js.hourly || !js.daily || !js.current) throw new Error("Ufuldstændigt svar fra Open-Meteo");
  return js;
}

/* Normaliser API-svaret til et fladt timeobjekt-array + dagsobjekter. */
function shape(raw) {
  const H = raw.hourly, D = raw.daily;
  /* Manglende variabler (afhænger af model og placering) må ikke vælte siden. */
  const col = (o, k) => (Array.isArray(o[k]) ? o[k] : []);
  const hours = H.time.map((t, i) => ({
    t, key: dayKey(t), hh: hhmm(t),
    temp: num(col(H, "temperature_2m")[i]),
    feels: num(col(H, "apparent_temperature")[i]),
    prob: num(col(H, "precipitation_probability")[i]),
    precip: num(col(H, "precipitation")[i]),
    code: num(col(H, "weather_code")[i]),
    cloud: num(col(H, "cloud_cover")[i]),
    vis: num(col(H, "visibility")[i], 24000),
    wind: num(col(H, "wind_speed_10m")[i]),
    gust: num(col(H, "wind_gusts_10m")[i]),
    wdir: num(col(H, "wind_direction_10m")[i]),
    uv: num(col(H, "uv_index")[i]),
    rh: num(col(H, "relative_humidity_2m")[i]),
    isDay: num(col(H, "is_day")[i], 1),
    rad: num(col(H, "shortwave_radiation")[i])
  }));
  const days = D.time.map((t, i) => ({
    key: t,
    code: num(col(D, "weather_code")[i]),
    tmax: num(col(D, "temperature_2m_max")[i]),
    tmin: num(col(D, "temperature_2m_min")[i]),
    feelsMax: num(col(D, "apparent_temperature_max")[i]),
    precip: num(col(D, "precipitation_sum")[i]),
    prob: num(col(D, "precipitation_probability_max")[i]),
    wind: num(col(D, "wind_speed_10m_max")[i]),
    gust: num(col(D, "wind_gusts_10m_max")[i]),
    uv: num(col(D, "uv_index_max")[i]),
    sunrise: col(D, "sunrise")[i] || `${t}T05:00`,
    sunset: col(D, "sunset")[i] || `${t}T21:00`,
    sunshine: num(col(D, "sunshine_duration")[i]) / 3600,
    et0: num(col(D, "et0_fao_evapotranspiration")[i]),
    hours: hours.filter((h) => h.key === t)
  }));
  const cur = raw.current;
  const nowKey = (cur.time || "").slice(0, 13);
  let nowIndex = hours.findIndex((h) => h.t.slice(0, 13) === nowKey);
  if (nowIndex < 0) nowIndex = 0;
  return {
    hours, days, nowIndex,
    tz: raw.timezone,
    now: {
      t: cur.time,
      temp: num(cur.temperature_2m), feels: num(cur.apparent_temperature),
      code: num(cur.weather_code), isDay: num(cur.is_day, 1),
      precip: num(cur.precipitation), cloud: num(cur.cloud_cover),
      rh: num(cur.relative_humidity_2m), wind: num(cur.wind_speed_10m),
      gust: num(cur.wind_gusts_10m), wdir: num(cur.wind_direction_10m)
    }
  };
}

/* ---------- scoring ---------- */
function driveScore(h, day) {
  let s = 10;
  if (SNOWY.has(h.code)) s -= 6;
  if (ICY.has(h.code)) s -= 7;
  if (THUNDER.has(h.code)) s -= 2.5;
  if (h.precip >= 4) s -= 4; else if (h.precip >= 1) s -= 2.5; else if (h.precip >= 0.2) s -= 1;
  if (h.temp <= 1 && (h.precip > 0.05 || h.rh >= 92)) s -= 4;
  else if (h.temp <= 3) s -= 1;
  if (h.gust >= 20) s -= 5; else if (h.gust >= 15) s -= 3; else if (h.gust >= 11) s -= 1.5;
  if (h.vis < 1000) s -= 4.5; else if (h.vis < 4000) s -= 2; else if (h.vis < 8000) s -= 0.8;
  if (FOGGY.has(h.code)) s -= 1.5;
  if (day && h.isDay && h.cloud < 55 && lowSun(h, day)) s -= 1;
  return clamp(s, 0, 10);
}
function lowSun(h, day) {
  const m = (x) => Number(x.slice(11, 13)) * 60 + Number(x.slice(14, 16));
  const t = m(h.t);
  return Math.abs(t - m(day.sunrise)) <= 60 || Math.abs(t - m(day.sunset)) <= 60;
}

function outdoorScore(h) {
  let s = 10;
  const f = h.feels;
  if (f < -5) s -= 6; else if (f < 0) s -= 4.5; else if (f < 5) s -= 3; else if (f < 10) s -= 1.4;
  if (f > 31) s -= 4.5; else if (f > 28) s -= 3; else if (f > 25) s -= 1.2;
  if (h.prob >= 70) s -= 3.5; else if (h.prob >= 40) s -= 2; else if (h.prob >= 20) s -= 0.8;
  if (h.precip >= 1) s -= 2.5; else if (h.precip >= 0.2) s -= 1;
  if (h.wind >= 12) s -= 3.5; else if (h.wind >= 8) s -= 2; else if (h.wind >= 6) s -= 1;
  if (THUNDER.has(h.code)) s -= 6;
  if (SNOWY.has(h.code)) s -= 1.5;
  if (h.uv >= 8) s -= 0.6;
  if (!h.isDay) s -= 1.5;
  return clamp(s, 0, 10);
}

const verdictDrive = (s) => (s >= 8.2 ? "Fine forhold" : s >= 6.8 ? "Gode forhold" : s >= 5 ? "Kør med omtanke" : s >= 3.5 ? "Krævende forhold" : "Undgå kørsel hvis du kan");
const verdictOut = (s) => (s >= 8.2 ? "Perfekt udenfor" : s >= 6.8 ? "Fint udenfor" : s >= 5 ? "Til at leve med" : s >= 3.5 ? "Skidt udenfor" : "Bliv indenfor");
const scoreColor = (s) => (s >= 6.8 ? "var(--good)" : s >= 4.5 ? "var(--ok)" : "var(--bad)");
const scoreClass = (s) => (s >= 6.8 ? "g" : s >= 4.5 ? "o" : "b");

/* Længste sammenhængende vindue hvor score >= grænsen. */
function bestWindow(hours, scoreFn, min, from = 6, to = 23) {
  let best = null, cur = null;
  hours.forEach((h) => {
    const hr = Number(h.hh.slice(0, 2));
    const ok = scoreFn(h) >= min && hr >= from && hr <= to;
    if (ok) {
      cur = cur || { start: h, end: h, n: 0, sum: 0 };
      cur.end = h; cur.n++; cur.sum += scoreFn(h);
    } else if (cur) {
      if (!best || cur.n > best.n || (cur.n === best.n && cur.sum > best.sum)) best = cur;
      cur = null;
    }
  });
  if (cur && (!best || cur.n > best.n || (cur.n === best.n && cur.sum > best.sum))) best = cur;
  return best;
}

/* Aggregerede nøgletal for et udsnit af timer. */
function agg(hours) {
  const a = {
    precip: 0, maxProb: 0, maxGust: 0, maxWind: 0, minVis: 1e9, maxUv: 0,
    minTemp: 99, maxTemp: -99, minFeels: 99, maxFeels: -99, codes: new Set(), rainHours: 0
  };
  hours.forEach((h) => {
    a.precip += h.precip;
    a.maxProb = Math.max(a.maxProb, h.prob);
    a.maxGust = Math.max(a.maxGust, h.gust);
    a.maxWind = Math.max(a.maxWind, h.wind);
    a.minVis = Math.min(a.minVis, h.vis);
    a.maxUv = Math.max(a.maxUv, h.uv);
    a.minTemp = Math.min(a.minTemp, h.temp);
    a.maxTemp = Math.max(a.maxTemp, h.temp);
    a.minFeels = Math.min(a.minFeels, h.feels);
    a.maxFeels = Math.max(a.maxFeels, h.feels);
    a.codes.add(h.code);
    if (h.precip >= 0.1) a.rainHours++;
  });
  return a;
}
const has = (set, group) => [...set].some((c) => group.has(c));

/* ---------- vanding ---------- */
/* Nogle modeller leverer ikke ET0 — så estimeres fordampningen groft ud fra sol, varme og vind. */
function estimateEt0(day) {
  return clamp(day.sunshine * 0.32 + Math.max(0, day.tmax - 10) * 0.12 + day.wind * 0.08, 0.3, 8);
}

function water(day) {
  const et0 = day.et0 > 0 ? day.et0 : estimateEt0(day);
  const need = et0 * TERRACE.southFactor;
  const rain = day.precip * TERRACE.shelterFactor;
  const deficit = Math.max(0, need - rain);
  const label = deficit < 1 ? "Ingen vanding" : deficit < 2.5 ? "Let vanding" : deficit < 4 ? "Vand grundigt" : "Vand morgen og aften";
  const tone = deficit < 1 ? "g" : deficit < 4 ? "o" : "b";
  return { et0, need, rain, deficit, label, tone, ml: Math.round((deficit * TERRACE.potArea * 1000) / 10) * 10 };
}
/* Timer med reel sol på en sydvendt terrasse (kraftig indstråling midt på dagen). */
function terraceSun(day) {
  return day.hours.filter((h) => {
    const hr = Number(h.hh.slice(0, 2));
    return hr >= 8 && hr <= 19 && h.rad >= 120;
  }).length;
}

/* ---------- rendering ---------- */
function renderHero(d) {
  const n = d.now;
  $("#hero-icon").innerHTML = weatherIcon(n.code, n.isDay);
  $("#now-temp").textContent = Math.round(n.temp);
  $("#now-desc").textContent = codeText(n.code);
  $("#now-feels").textContent = `${Math.round(n.feels)}°`;
  $("#now-updated").textContent = `opdateret kl. ${hhmm(n.t)}`;
  const today = d.days[0];
  const uvNow = d.hours[d.nowIndex] ? d.hours[d.nowIndex].uv : today.uv;
  const stats = [
    ["Vind", `${fmt(n.wind)} <small>m/s ${dir(n.wdir)}</small>`, `stød ${fmt(n.gust)} m/s`],
    ["Nedbør i dag", `${fmt(today.precip)} <small>mm</small>`, `${Math.round(today.prob)}% sandsynlighed`],
    ["UV nu", `${fmt(uvNow)}`, `max ${fmt(today.uv)} i dag`],
    ["Luftfugtighed", `${Math.round(n.rh)}<small>%</small>`, `skydække ${Math.round(n.cloud)}%`],
    ["Sol", `${hhmm(today.sunrise)}–${hhmm(today.sunset)}`, `${fmt(today.sunshine)} soltimer`],
    ["Døgn", `${Math.round(today.tmax)}° / ${Math.round(today.tmin)}°`, codeText(today.code)]
  ];
  $("#hero-stats").innerHTML = stats
    .map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd><dd class="sub"><small>${s}</small></dd></div>`)
    .join("");
}

function planCard({ icon, title, sub, score, verdict, notes, pill }) {
  return `<article class="card plan">
    <div class="plan-head">${icon}<div><h3>${title}</h3><p>${sub}</p></div></div>
    <div>
      <div class="gauge"><b style="color:${scoreColor(score)}">${fmt(score)}</b><span>/ 10</span></div>
      <div class="bar" style="margin-top:8px"><i style="width:${score * 10}%;background:${scoreColor(score)}"></i></div>
      <div class="verdict" style="margin-top:9px;color:${scoreColor(score)}">${verdict}</div>
    </div>
    <ul>${notes.map((n) => `<li class="${n[0]}">${n[1]}</li>`).join("")}</ul>
    ${pill ? `<div class="window-pill">${pill}</div>` : ""}
  </article>`;
}

function renderPlan(d) {
  const next = d.hours.slice(d.nowIndex, d.nowIndex + 12);
  const today = d.days[0];
  const a = agg(next);

  /* Kørsel */
  const dScores = next.map((h) => driveScore(h, d.days.find((x) => x.key === h.key)));
  const dAvg = dScores.reduce((x, y) => x + y, 0) / (dScores.length || 1);
  const dNotes = [];
  if (has(a.codes, ICY) || (a.minTemp <= 1 && a.precip > 0)) dNotes.push(["neg", "Risiko for isslag — regn omkring frysepunktet"]);
  if (has(a.codes, SNOWY)) dNotes.push(["neg", "Sne eller slud i perioden"]);
  if (a.minVis < 4000) dNotes.push(["neg", `Nedsat sigt, ned til ${Math.round(a.minVis / 1000)} km`]);
  if (a.maxGust >= 15) dNotes.push(["neg", `Vindstød op til ${fmt(a.maxGust)} m/s — pas på ved broer og overhaling`]);
  else if (a.maxGust >= 11) dNotes.push(["warn", `Vindstød op til ${fmt(a.maxGust)} m/s`]);
  if (a.precip >= 3) dNotes.push(["neg", `${fmt(a.precip)} mm regn — vandplaning på motorvej`]);
  else if (a.precip >= 0.4) dNotes.push(["warn", `Våd vejbane, ${fmt(a.precip)} mm nedbør`]);
  if (a.minTemp <= 3 && a.minTemp > 1) dNotes.push(["warn", "Nær frysepunktet — broer og skyggefulde strækninger først"]);
  const glareHour = next.find((h) => h.isDay && h.cloud < 55 && lowSun(h, d.days.find((x) => x.key === h.key)));
  if (glareHour) dNotes.push(["warn", `Lavtstående sol omkring kl. ${glareHour.hh} — hav solbriller klar`]);
  if (!dNotes.length) dNotes.push(["pos", "Tørt, roligt og god sigt hele perioden"]);
  const worstDrive = next.reduce((w, h) => {
    const s = driveScore(h, d.days.find((x) => x.key === h.key));
    return !w || s < w.s ? { s, h } : w;
  }, null);
  const dPill = worstDrive && worstDrive.s < 6.8
    ? `Værst omkring <b>kl. ${worstDrive.h.hh}</b> (${fmt(worstDrive.s)}/10). ${(() => {
        const bw = bestWindow(next, (h) => driveScore(h, d.days.find((x) => x.key === h.key)), 7.5, 0, 23);
        return bw ? `Bedste vindue <b>${bw.start.hh}–${bw.end.hh}</b>.` : "Ingen rigtig gode timer i perioden.";
      })()}`
    : "Ingen kritiske perioder de næste 12 timer.";

  /* Udendørs */
  const oScores = next.map(outdoorScore);
  const oAvg = oScores.reduce((x, y) => x + y, 0) / (oScores.length || 1);
  const oNotes = [];
  oNotes.push(["", `Føles som ${Math.round(a.minFeels)}–${Math.round(a.maxFeels)}° i perioden`]);
  if (a.maxProb >= 40) oNotes.push(["warn", `Op til ${Math.round(a.maxProb)}% regnsandsynlighed, ${a.rainHours} timer med nedbør`]);
  else oNotes.push(["pos", "Lav regnrisiko — regnjakke er valgfri"]);
  if (a.maxWind >= 8) oNotes.push(["warn", `${cap(windWord(a.maxWind))}, op til ${fmt(a.maxWind)} m/s`]);
  if (a.maxUv >= 6) oNotes.push(["warn", `UV-indeks op til ${fmt(a.maxUv)} — solcreme og skygge midt på dagen`]);
  /* Luft og pollen nævnes kun når de er forhøjede — og får da forrang,
     fordi de ændrer hvad man gør, ikke bare hvordan det føles. */
  const air = state.air;
  const airNotes = [];
  if (air) {
    if (air.aqi !== null && air.aqi > 40) {
      const ab = aqiBand(air.aqi);
      airNotes.push([air.aqi > 60 ? "neg" : "warn",
        `Luftkvaliteten er ${ab.name.toLowerCase()} (indeks ${Math.round(air.aqi)}) — ${ab.advice.toLowerCase().replace(/\.$/, "")}`]);
    }
    const hi = air.pollen.filter((sp) => pollenLevel(sp.now || 0, sp.steps) >= 3);
    if (hi.length) airNotes.push(["warn", `${cap(hi.map((sp) => sp.name.toLowerCase()).join(" og "))}pollen er højt — allergikere bør tage medicin inden`]);
  }
  oNotes.splice(1, 0, ...airNotes);
  if (has(a.codes, THUNDER)) oNotes.push(["neg", "Torden i perioden — hold dig væk fra åbent land og vand"]);
  if (a.maxFeels > 28) oNotes.push(["neg", "Varmt — drik rigeligt og læg hård træning tidligt eller sent"]);
  if (a.minFeels < 0) oNotes.push(["neg", "Frost — husk lag på lag og handsker"]);
  const ow = bestWindow(d.hours.slice(d.nowIndex, d.nowIndex + 24), outdoorScore, 6.8, 6, 22);
  const oPill = ow
    ? `Bedste vindue: <b>${dayName(ow.start.key) === dayName(d.days[0].key) ? "i dag" : dayName(ow.start.key).toLowerCase()} ${ow.start.hh}–${ow.end.hh}</b> (${ow.n} timer)`
    : "Ingen rigtig gode timer det næste døgn — tag det korte program.";

  /* Terrasse */
  const w = water(today);
  const sunH = terraceSun(today);
  const pNotes = [];
  pNotes.push(["", `Fordampning ${fmt(w.need)} mm mod ${fmt(w.rain)} mm effektiv regn i potterne`]);
  if (w.deficit >= 2.5) pNotes.push(["neg", `Vand ca. ${w.ml} ml pr. 25 cm potte (${fmt(w.deficit)} l/m²)`]);
  else if (w.deficit >= 1) pNotes.push(["warn", `Let vanding, ca. ${w.ml} ml pr. potte`]);
  else pNotes.push(["pos", "Regnen dækker dagens behov — tjek kun de overdækkede potter"]);
  if (today.tmax >= 28 || today.uv >= 7) pNotes.push(["warn", `${Math.round(today.tmax)}° og UV ${fmt(today.uv)} — skyggenet eller flyt sarte planter kl. 12–16`]);
  if (today.tmin <= 3) pNotes.push(["neg", `Ned til ${Math.round(today.tmin)}° i nat — dæk til eller flyt ind`]);
  if (today.gust >= 13) pNotes.push(["neg", `Vindstød ${fmt(today.gust)} m/s — flyt høje potter i læ`]);
  const pScore = clamp(10 - (w.deficit >= 4 ? 2.5 : w.deficit >= 2.5 ? 1.2 : 0)
    - (today.tmax >= 30 ? 3 : today.tmax >= 27 ? 1.5 : 0)
    - (today.tmin <= 0 ? 4 : today.tmin <= 3 ? 2 : 0)
    - (today.gust >= 17 ? 3 : today.gust >= 13 ? 1.5 : 0)
    - (today.precip >= 20 ? 1.5 : 0), 0, 10);
  const pVerdict = pScore >= 8 ? "Planterne har det fint" : pScore >= 6 ? "Lidt pasning i dag" : pScore >= 4 ? "Kræver opmærksomhed" : "Grib ind i dag";
  const evening = today.sunset ? hhmm(today.sunset) : "20:00";
  const pPill = `Sol på terrassen <b>${sunH} timer</b> · vand tidligt (før kl. 9) eller efter <b>kl. ${evening}</b>`;

  $("#plan-grid").innerHTML =
    planCard({ icon: ICONS.car, title: "Kørsel", sub: "Næste 12 timer", score: dAvg, verdict: verdictDrive(dAvg), notes: dNotes.slice(0, 4), pill: dPill }) +
    planCard({ icon: ICONS.hike, title: "Udendørs", sub: "Næste 12 timer", score: oAvg, verdict: verdictOut(oAvg), notes: oNotes.slice(0, 5), pill: oPill }) +
    planCard({ icon: ICONS.plant, title: "Terrasseplanter", sub: "I dag, sydvendt", score: pScore, verdict: pVerdict, notes: pNotes.slice(0, 4), pill: pPill });
}

/* SVG-graf: temperatur, føles-som og nedbør. */
/* Glat kurve gennem punkterne — Catmull-Rom omsat til kubiske bezier-segmenter. */
function smoothPath(pts) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ` +
      `${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ` +
      `${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function renderChart(hours, day) {
  const W = 62, H = 158, padT = 26, padB = 40;
  const w = Math.max(hours.length * W, 320);
  const base = H - padB;
  const temps = hours.map((h) => h.temp);
  let lo = Math.min(...temps), hi = Math.max(...temps);
  if (hi - lo < 6) { const mid = (hi + lo) / 2; lo = mid - 3; hi = mid + 3; }
  lo -= 1; hi += 1;
  const x = (i) => i * W + W / 2;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (base - padT);
  const maxP = Math.max(1.5, ...hours.map((h) => h.precip));

  /* Nat som ét sammenhængende felt pr. mørkeperiode, ikke en kolonne pr. time */
  const nights = [];
  let ns = -1;
  hours.forEach((h, i) => {
    if (!h.isDay && ns < 0) ns = i;
    if ((h.isDay || i === hours.length - 1) && ns >= 0) {
      const end = h.isDay ? i : i + 1;
      nights.push(`<rect class="night" x="${ns * W}" y="0" width="${(end - ns) * W}" height="${base + 12}" rx="8"/>`);
      ns = -1;
    }
  });

  const pts = hours.map((h, i) => [x(i), y(h.temp)]);
  const curve = smoothPath(pts);
  const fill = `<path fill="url(#tempgrad)" stroke="none" d="${curve}L${x(hours.length - 1).toFixed(1)},${base}L${x(0).toFixed(1)},${base}Z"/>`;

  /* Nedbør: afrundede søjler fra bunden, mm-tal over de væsentlige */
  const bars = hours.map((h, i) => {
    if (h.precip < 0.05) return "";
    const bh = Math.max(3, (h.precip / maxP) * 34);
    return `<rect class="pbar" x="${x(i) - 7}" y="${(base + 12 - bh).toFixed(1)}" width="14" height="${bh.toFixed(1)}" rx="3"/>` +
      (h.precip >= 0.5 ? `<text class="pval" x="${x(i)}" y="${(base + 12 - bh - 5).toFixed(1)}" text-anchor="middle">${fmt(h.precip)}</text>` : "");
  }).join("");

  /* Kun yderpunkterne får tal — timelisten nedenunder har alle værdierne */
  const iMax = temps.indexOf(Math.max(...temps));
  const iMin = temps.indexOf(Math.min(...temps));
  const labels = [...new Set([iMax, iMin])].map((i) =>
    `<text class="val" x="${x(i)}" y="${(y(temps[i]) - 10).toFixed(1)}" text-anchor="middle">${Math.round(temps[i])}°</text>`).join("");
  const dots = [...new Set([iMax, iMin])].map((i) =>
    `<circle class="vdot" cx="${x(i)}" cy="${y(temps[i]).toFixed(1)}" r="3.2"/>`).join("");

  const grid = [0.25, 0.75].map((f) => {
    const v = lo + (hi - lo) * f;
    return `<line class="grid" x1="0" x2="${w}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
  }).join("");

  $("#chart").innerHTML = `<svg width="${w}" height="${H}" viewBox="0 0 ${w} ${H}" role="img"
      aria-label="Temperatur og nedbør time for time">
      <defs><linearGradient id="tempgrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--warm)" stop-opacity=".26"/>
        <stop offset="1" stop-color="var(--warm)" stop-opacity="0"/>
      </linearGradient></defs>
      ${nights.join("")}${grid}${fill}<path class="templine" d="${curve}"/>${bars}${dots}${labels}</svg>`;
  $("#today-sub").textContent = day
    ? `${dayName(day.key)} ${dayDate(day.key)} — ${hours.length} timer. Skyggede felter er nat.`
    : "Temperatur, nedbør og vind de næste 24 timer. Tryk på en time for alle detaljer.";
}

function windArrow(deg) {
  return `<svg class="warrow" viewBox="0 0 24 24" style="transform:rotate(${Math.round(num(deg)) + 180}deg)" aria-hidden="true"><path d="M12 20V5.5M12 5.5 7.8 10M12 5.5l4.2 4.5"/></svg>`;
}

function renderHours(hours, nowT) {
  state.viewHours = hours;
  state.hourSel = -1;
  $("#hour-detail").hidden = true;
  $("#hours").innerHTML = hours.map((h, i) => `
    <button type="button" class="hour${h.t === nowT ? " now" : ""}" data-i="${i}" aria-expanded="false"
      aria-label="Detaljer for kl. ${h.hh}">
      <span class="h">${h.t === nowT ? "nu" : h.hh}</span>
      ${weatherIcon(h.code, h.isDay)}
      <span class="w"><b style="color:var(--text)">${Math.round(h.temp)}°</b></span>
      <span class="p">${h.precip >= 0.05 ? `${fmt(h.precip)} mm` : h.prob >= 20 ? `${Math.round(h.prob)}%` : ""}</span>
      <span class="w wind">${windArrow(h.wdir)}${fmt(h.wind)}</span>
    </button>`).join("");
  $("#hours").querySelectorAll(".hour").forEach((b) => b.addEventListener("click", () => toggleHour(+b.dataset.i)));
}

/* Detaljepanel under timelisten — erstatter hover-tooltips, som ikke findes på mobil. */
function toggleHour(i) {
  const panel = $("#hour-detail");
  const close = !panel.hidden && state.hourSel === i;
  state.hourSel = close ? -1 : i;
  $("#hours").querySelectorAll(".hour").forEach((b) => {
    const on = !close && +b.dataset.i === i;
    b.classList.toggle("sel", on);
    b.setAttribute("aria-expanded", String(on));
  });
  if (close) { panel.hidden = true; return; }
  const h = state.viewHours[i];
  const rows = [
    ["Temperatur", `${Math.round(h.temp)}°`, `føles som ${Math.round(h.feels)}°`],
    ["Nedbør", `${fmt(h.precip)} mm`, `${Math.round(h.prob)}% risiko`],
    ["Vind", `${fmt(h.wind)} m/s fra ${dir(h.wdir)}`, `${windWord(h.wind)} · stød ${fmt(h.gust)} m/s`],
    ["UV-indeks", fmt(h.uv), h.uv >= 6 ? "brug solcreme" : h.uv >= 3 ? "moderat" : "lavt"],
    ["Luftfugtighed", `${Math.round(h.rh)}%`, `skydække ${Math.round(h.cloud)}%`],
    ["Sigtbarhed", `${fmt(Math.min(h.vis, 24000) / 1000)} km`, h.vis < 4000 ? "nedsat sigt" : "god sigt"]
  ];
  panel.innerHTML = `
    <div class="hd-head">
      ${weatherIcon(h.code, h.isDay)}
      <div><b>${dayName(h.key)} kl. ${h.hh}</b><span>${codeText(h.code)}</span></div>
    </div>
    <dl class="hd-grid">${rows.map(([k, v, sub]) =>
      `<div><dt>${k}</dt><dd>${v}</dd><dd class="sub"><small>${sub}</small></dd></div>`).join("")}</dl>`;
  panel.hidden = false;
}

function renderWeek(d) {
  const lo = Math.min(...d.days.map((x) => x.tmin));
  const hi = Math.max(...d.days.map((x) => x.tmax));
  const span = Math.max(hi - lo, 1);
  $("#week").innerHTML = d.days.map((day, i) => {
    const dayHours = day.hours.length ? day.hours : [];
    const active = dayHours.filter((h) => { const hr = +h.hh.slice(0, 2); return hr >= 7 && hr <= 21; });
    const dScore = dayHours.length ? dayHours.map((h) => driveScore(h, day)).reduce((a, b) => a + b, 0) / dayHours.length : 5;
    const oScore = active.length ? active.map(outdoorScore).reduce((a, b) => a + b, 0) / active.length : 5;
    const w = water(day);
    const pScore = w.deficit >= 4 || day.tmin <= 2 || day.gust >= 15 ? 3 : w.deficit >= 2 || day.tmax >= 28 ? 5.5 : 8;
    return `<button class="day" type="button" data-day="${i}" aria-selected="${i === state.day}">
      <span class="dcol-name"><span class="dname">${i === 0 ? "I dag" : dayName(day.key)}</span><span class="ddate">${dayDate(day.key)}</span></span>
      ${weatherIcon(day.code, 1)}
      <span class="range">
        <span class="lo">${Math.round(day.tmin)}°</span>
        <span class="track"><span class="fill" style="left:${((day.tmin - lo) / span) * 100}%;width:${Math.max(((day.tmax - day.tmin) / span) * 100, 4)}%"></span></span>
        <span class="hi">${Math.round(day.tmax)}°</span>
      </span>
      <span class="meta">
        <span>${ICONS.drop.replace("<svg", '<svg style="width:13px;height:13px;vertical-align:-2px;color:var(--rain)"')} <b>${fmt(day.precip)}</b> mm</span>
        <span>${ICONS.wind.replace("<svg", '<svg style="width:13px;height:13px;vertical-align:-2px"')} <b>${fmt(day.wind)}</b> m/s</span>
      </span>
      <span class="uv"><span>UV <b style="color:var(--text)">${fmt(day.uv)}</b></span><span>${fmt(day.sunshine)} t sol</span></span>
      <span class="chips">
        <span class="chip ${scoreClass(dScore)}" title="Kørsel ${fmt(dScore)}/10">${ICONS.car}</span>
        <span class="chip ${scoreClass(oScore)}" title="Udendørs ${fmt(oScore)}/10">${ICONS.hike}</span>
        <span class="chip ${scoreClass(pScore)}" title="Planter: ${w.label}">${ICONS.plant}</span>
      </span>
    </button>`;
  }).join("");
  $("#week").querySelectorAll(".day").forEach((b) => b.addEventListener("click", () => selectDay(+b.dataset.day)));
}

function renderPlants(d) {
  const today = d.days[0];
  const w = water(today);
  const week = d.days.reduce((s, day) => s + water(day).deficit, 0);
  const rain3 = d.days.slice(0, 3).reduce((s, day) => s + day.precip, 0);
  const sunH = terraceSun(today);
  const hotDay = d.days.find((x) => x.tmax >= 28);
  const frostDay = d.days.find((x) => x.tmin <= 2);
  const windDay = d.days.find((x) => x.gust >= 14);
  const wetDay = d.days.find((x) => x.precip >= 15);

  $("#plant-top").innerHTML = [
    ["Vanding i dag", `${w.ml} ml`, `pr. 25 cm potte · ${fmt(w.deficit)} l/m²`],
    ["Sol på terrassen", `${sunH} t`, `${fmt(today.sunshine)} soltimer i alt · UV max ${fmt(today.uv)}`],
    ["Regn i potterne", `${fmt(w.rain)} mm`, `af ${fmt(today.precip)} mm nedbør (læ-effekt)`],
    ["Ugens behov", `${fmt(week)} l/m²`, `${fmt(rain3)} mm regn de næste 3 dage`]
  ].map(([k, v, s]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

  $("#plant-days").innerHTML = d.days.map((day, i) => {
    const dw = water(day);
    const max = 6;
    return `<div class="pday">
      <span class="pd-name">${i === 0 ? "I dag" : dayName(day.key)} <span style="color:var(--text-2);font-weight:400">${Math.round(day.tmax)}°/${Math.round(day.tmin)}°</span></span>
      <span class="water">
        <span class="track"><i style="width:${clamp((dw.deficit / max) * 100, 2, 100)}%"></i></span>
        <span class="amount">${fmt(dw.deficit)} l/m² · ${dw.ml} ml</span>
      </span>
      <span class="tag ${dw.tone}">${dw.label}</span>
    </div>`;
  }).join("");

  const notes = [];
  if (frostDay) notes.push(["bad", ICONS.snow, `<b>Frostrisiko ${frostDay === today ? "i nat" : dayName(frostDay.key).toLowerCase()}</b> — ned til ${Math.round(frostDay.tmin)}°. Flyt citrus, pelargonier og andre sarte potter i læ eller ind, eller dæk med fiberdug.`]);
  if (hotDay) notes.push(["warn", ICONS.sun, `<b>${Math.round(hotDay.tmax)}° ${hotDay === today ? "i dag" : dayName(hotDay.key).toLowerCase()}</b> — sydvendte potter tørrer hurtigt ud. Giv skygge kl. 12–16, og undgå at vande på bladene i fuld sol.`]);
  if (windDay) notes.push(["warn", ICONS.wind, `<b>Vindstød op til ${fmt(windDay.gust)} m/s ${windDay === today ? "i dag" : dayName(windDay.key).toLowerCase()}</b> — sæt høje potter ned, bind espalier og tomater op. Vind tørrer potterne lige så hurtigt som sol.`]);
  if (wetDay) notes.push(["warn", ICONS.drop, `<b>${fmt(wetDay.precip)} mm regn ${wetDay === today ? "i dag" : dayName(wetDay.key).toLowerCase()}</b> — tøm underskåle så rødderne ikke står i vand, og tjek at drænhullerne er frie.`]);
  if (rain3 < 2 && week > 8) notes.push(["warn", ICONS.drop, `<b>Tørt de næste dage</b> — kun ${fmt(rain3)} mm regn på 3 dage mod ${fmt(week)} l/m² fordampning. Vand dagligt, og overvej at samle regnvand op når det kommer.`]);
  if (!notes.length) notes.push(["good", ICONS.check, "Ingen varslinger for terrassen i denne uge — hold den normale rytme med vanding og gødning."]);
  notes.push(["good", ICONS.check, `Vand tidligt om morgenen eller efter solnedgang (kl. ${hhmm(today.sunset)}) — så fordamper mindst muligt, og bladene når at tørre inden natten.`]);
  $("#plant-notes").innerHTML = notes.map(([cls, ic, txt]) => `<li class="${cls}">${ic}<span>${txt}</span></li>`).join("");
}

/* --- Luft og pollen --- */
function renderAir() {
  const a = state.air;
  const status = $("#air-status"), body = $("#air-body");
  if (!a) { status.hidden = false; body.hidden = true; return; }
  status.hidden = true; body.hidden = false;

  const tiles = [];
  if (a.aqi !== null) {
    const b = aqiBand(a.aqi);
    const worstPollen = a.pollen.reduce((w, sp) =>
      (!w || pollenLevel(sp.now || 0, sp.steps) > pollenLevel(w.now || 0, w.steps) ? sp : w), null);
    const wl = worstPollen ? pollenLevel(worstPollen.now || 0, worstPollen.steps) : 0;
    setChip("#chip-air",
      `${b.name}${wl >= 2 ? ` · ${worstPollen.name.toLowerCase()} ${POLLEN_BANDS[wl].toLowerCase()}` : ""}`,
      b.tone <= 2 && wl < 3 ? "g" : b.tone >= 4 || wl >= 4 ? "b" : "o");
    tiles.push(`<div class="stat aq-hero aq-t${b.tone}">
      <div class="k">Luftkvalitet nu</div>
      <div class="v">${Math.round(a.aqi)} <span class="aq-band">${b.name}</span></div>
      <div class="s">Europæisk indeks${a.aqiPeak ? ` · dagens værste ${Math.round(a.aqiPeak.v)} kl. ${hhmm(a.aqiPeak.t)}` : ""}</div>
    </div>`);
  }
  const comp = [
    ["PM2,5", a.pm25, "µg/m³", "fine partikler"],
    ["PM10", a.pm10, "µg/m³", "grove partikler"],
    ["Ozon", a.o3, "µg/m³", "O₃"],
    ["Kvælstofdioxid", a.no2, "µg/m³", "NO₂, mest fra trafik"]
  ].filter(([, v]) => v !== null);
  comp.forEach(([k, v, unit, sub]) => tiles.push(
    `<div class="stat"><div class="k">${k}</div><div class="v">${fmt(v)} <small>${unit}</small></div><div class="s">${sub}</div></div>`));
  $("#air-top").innerHTML = tiles.join("");

  /* Pollen: kun arter med tal. Uden for Europa mangler de helt. */
  const block = $("#pollen-block");
  if (!a.pollen.length) { block.hidden = true; return; }
  block.hidden = false;

  const active = a.pollen.filter((sp) => (sp.peak ? sp.peak.v : 0) >= sp.steps[0]);
  const dormant = a.pollen.filter((sp) => !active.includes(sp));
  const rows = (active.length ? active : a.pollen).map((sp) => {
    const now = sp.now === null ? 0 : sp.now;
    const lvl = pollenLevel(now, sp.steps);
    const peakLvl = sp.peak ? pollenLevel(sp.peak.v, sp.steps) : 0;
    return `<div class="pollen-row">
      <span class="pl-name">${sp.name}</span>
      <span class="pl-meter" role="img" aria-label="${POLLEN_BANDS[lvl]}">${
        [1, 2, 3, 4].map((k) => `<i class="${k <= lvl ? `on lv${lvl}` : ""}"></i>`).join("")}</span>
      <span class="pl-band lv${lvl}">${POLLEN_BANDS[lvl]}</span>
      <span class="pl-val">${fmt(now)} korn/m³${sp.peak && peakLvl > lvl ? ` · topper kl. ${hhmm(sp.peak.t)}` : ""}</span>
    </div>`;
  }).join("");
  $("#pollen-list").innerHTML = rows;

  const worst = (active.length ? active : []).reduce((w, sp) =>
    (!w || pollenLevel(sp.now || 0, sp.steps) > pollenLevel(w.now || 0, w.steps) ? sp : w), null);
  const worstLvl = worst ? pollenLevel(worst.now || 0, worst.steps) : 0;
  const notes = [];
  if (worstLvl >= 3) notes.push(`${worst.name}pollen er ${POLLEN_BANDS[worstLvl].toLowerCase()} — tag din allergimedicin i god tid, og luft ud sent om aftenen frem for midt på dagen.`);
  else if (worstLvl === 2) notes.push(`${worst.name}pollen er moderat — mærkbart for de mest følsomme.`);
  else if (active.length) notes.push("Pollental er lave i dag.");
  if (dormant.length) notes.push(`Uden for sæson lige nu: ${dormant.map((sp) => sp.name.toLowerCase()).join(", ")}.`);
  $("#pollen-note").textContent = notes.join(" ");
}

/* --- Modelsammenligning --- */

/* Længste sammenhængende række timer hvor prædikatet holder. */
function longestRun(hours, pred) {
  let best = null, cur = null;
  hours.forEach((h) => {
    if (pred(h)) { cur = cur || { start: h, end: h, n: 0, items: [] }; cur.end = h; cur.n++; cur.items.push(h); }
    else { if (cur && (!best || cur.n > best.n)) best = cur; cur = null; }
  });
  if (cur && (!best || cur.n > best.n)) best = cur;
  return best;
}

function modelsVerdict(m) {
  const first24 = m.hours.slice(0, 24);
  const worst = first24.reduce((a, b) => (b.spread > a.spread ? b : a), first24[0]);
  const avgSpread = first24.reduce((s, h) => s + h.spread, 0) / first24.length;

  const tempPart = avgSpread < 1.2
    ? `<b>Enige om temperaturen</b> — de ligger inden for ${fmt(avgSpread)}° af hinanden det næste døgn.`
    : avgSpread < 2.5
      ? `<b>Nogenlunde enige om temperaturen</b> — typisk ${fmt(avgSpread)}° fra hinanden, størst forskel kl. ${worst.hh} (${fmt(worst.spread)}°).`
      : `<b>Uenige om temperaturen</b> — i gennemsnit ${fmt(avgSpread)}° fra hinanden, og kl. ${worst.hh} skiller ${fmt(worst.spread)}° dem.`;

  const split = longestRun(first24, (h) => h.rain > 0 && h.rain < h.rainAll);
  const allRain = longestRun(first24, (h) => h.rain === h.rainAll);
  const anyRain = first24.some((h) => h.rain > 0);
  const rainPart = !anyRain
    ? "Alle modeller ser tørt vejr det næste døgn."
    : allRain && (!split || allRain.n >= split.n)
      ? `Alle er enige om regn kl. ${allRain.start.hh}–${allRain.end.hh}.`
      : split
        ? `Til gengæld er de <b>uenige om regn kl. ${split.start.hh}–${split.end.hh}</b>, hvor op til ${Math.max(...split.items.map((h) => h.rain))} af ${split.start.rainAll} modeller ser nedbør — hold øje med den periode.`
        : "De er stort set enige om nedbøren.";
  return `${tempPart} ${rainPart}`;
}

function renderModels() {
  const m = state.models;
  const status = $("#models-status"), body = $("#models-body");
  if (!m) { status.hidden = false; body.hidden = true; return; }
  status.hidden = true; body.hidden = false;

  $("#models-verdict").innerHTML = modelsVerdict(m);

  const first24 = m.hours.slice(0, 24);
  const avgSpread = first24.reduce((x, h) => x + h.spread, 0) / first24.length;
  const split = first24.some((h) => h.rain > 0 && h.rain < h.rainAll);
  setChip("#chip-models",
    split ? `Uenige om regn · ±${fmt(avgSpread)}°` : `${avgSpread < 1.2 ? "Enige" : avgSpread < 2.5 ? "Nogenlunde enige" : "Uenige"} · ±${fmt(avgSpread)}°`,
    avgSpread < 1.2 && !split ? "g" : avgSpread < 2.5 ? "o" : "b");
  $("#models-legend").innerHTML = m.series.map((s) =>
    `<span class="mlg"><i style="background:var(--s${s.slot})"></i>${esc(s.name)} <small>${esc(s.origin)}</small></span>`).join("");

  /* Én samlet figur: temperatur øverst, regn-enighed som række nedenunder,
     fælles tidsakse og fælles sigtelinje. Tegnes i containerens pixelbredde. */
  const wrapW = $("#mchart-wrap").clientWidth || 900;
  const narrow = wrapW < 560;
  const W = Math.max(320, wrapW);
  const padT = 12, padL = 34, padR = narrow ? 14 : 100;
  const plotH = narrow ? 130 : 150;          // temperaturfeltet
  const rainY = padT + plotH + 14;           // regnrækkens overkant
  const rainH = 14;
  const H = rainY + rainH + 30;              // plads til dagslabels nederst
  const n = m.hours.length;

  const vals = m.series.flatMap((s) => s.temp).filter((v) => typeof v === "number" && isFinite(v));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2; }
  const padY = (hi - lo) * 0.14;
  lo -= padY; hi += padY;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * plotH;

  /* Spændfeltet: glat overkant (varmeste) og glat underkant (koldeste) */
  const topPts = m.hours.map((h, i) => [x(i), y(h.max)]);
  const botPts = m.hours.map((h, i) => [x(i), y(h.min)]).reverse();
  const band = `<path class="mband" d="${smoothPath(topPts)}L${botPts[0][0].toFixed(1)},${botPts[0][1].toFixed(1)}${smoothPath(botPts).slice(smoothPath(botPts).indexOf("C"))}Z"/>`;

  const lines = m.series.map((s) => `<path class="mline" style="stroke:var(--s${s.slot})" d="${
    smoothPath(s.temp.map((v, i) => [x(i), y(num(v))]))}"/>`).join("");

  /* Markér timen med størst uenighed: lodret spænd med gradtal */
  const iw = m.hours.reduce((a, h, i) => (h.spread > m.hours[a].spread ? i : a), 0);
  const wh = m.hours[iw];
  const spreadMark = wh.spread >= 1.5 ? `
    <line class="mspread" x1="${x(iw).toFixed(1)}" x2="${x(iw).toFixed(1)}" y1="${y(wh.max).toFixed(1)}" y2="${y(wh.min).toFixed(1)}"/>
    <circle class="mspread-dot" cx="${x(iw).toFixed(1)}" cy="${y(wh.max).toFixed(1)}" r="2.6"/>
    <circle class="mspread-dot" cx="${x(iw).toFixed(1)}" cy="${y(wh.min).toFixed(1)}" r="2.6"/>
    <text class="mspread-txt" x="${(x(iw) + (iw > n * 0.75 ? -8 : 8)).toFixed(1)}" y="${((y(wh.max) + y(wh.min)) / 2 + 4).toFixed(1)}"
      ${iw > n * 0.75 ? 'text-anchor="end"' : ""}>${fmt(wh.spread)}°</text>` : "";

  /* Navn og slutværdi ved kurvernes ende (kun hvor der er plads) */
  const ends = m.series.map((s) => ({ s, y: y(num(s.temp[n - 1])) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  }
  const labels = narrow ? "" : ends.map(({ s, y: ly }) =>
    `<text class="mlabel" style="fill:var(--s${s.slot})" x="${(W - padR + 8).toFixed(1)}" y="${(ly + 4).toFixed(1)}">${esc(s.short)} ${Math.round(num(s.temp[n - 1]))}°</text>`).join("");

  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15].map((v) =>
    `<line class="mgrid" x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
    `<text class="maxis" x="${padL - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v)}°</text>`).join("");

  /* Regn-enighed inde i samme figur, med egen rækkelabel */
  const cellW = (W - padL - padR) / n;
  const rain = m.hours.map((h, i) => {
    const f = h.rain / h.rainAll;
    const fill = f === 0 ? "var(--line-soft)" : `color-mix(in srgb, var(--rain) ${Math.round(20 + f * 80)}%, transparent)`;
    return `<rect x="${(padL + i * cellW).toFixed(1)}" y="${rainY}" width="${Math.max(cellW - 1.5, 1).toFixed(1)}" height="${rainH}" rx="2.5" style="fill:${fill}" stroke="none"/>`;
  }).join("");
  const rainLabel = `<text class="maxis" x="${padL - 8}" y="${rainY + rainH - 3}" text-anchor="end">Regn</text>`;

  /* Dage: adskillere gennem begge felter og navnet centreret i sit døgn */
  const bounds = [0];
  m.hours.forEach((h, i) => { if (h.hh === "00.00" && i > 0) bounds.push(i); });
  bounds.push(n - 1);
  const seps = bounds.slice(1, -1).map((i) =>
    `<line class="mday" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${padT}" y2="${rainY + rainH}"/>`).join("");
  const todayKey = state.data ? state.data.days[0].key : m.hours[0].key;
  const dayLabs = bounds.slice(0, -1).map((b, k) => {
    const mid = (x(b) + x(bounds[k + 1])) / 2;
    const key = m.hours[Math.min(b + 1, n - 1)].key;
    const name = key === todayKey ? "i dag" : dayName(key).toLowerCase();
    return `<text class="mdaylab" x="${mid.toFixed(1)}" y="${rainY + rainH + 20}" text-anchor="middle">${esc(name)}</text>`;
  }).join("");

  $("#mchart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Temperatur og regn-enighed de næste ${n} timer ifølge ${m.series.length} vejrmodeller">
      ${ticks}${seps}${band}${lines}${spreadMark}${labels}${rain}${rainLabel}${dayLabs}
      <line class="mcross" id="mcross" x1="0" x2="0" y1="${padT}" y2="${rainY + rainH}" style="display:none"/>
    </svg>`;
  bindCrosshair(x, padL, W, padR);
  $("#mchart-cap").textContent = "Øverst temperaturen pr. model — det tonede felt er spændet mellem koldeste og varmeste, og markeringen viser timen med størst uenighed. Rækken Regn viser, hvor mange modeller der ser nedbør i timen." + (narrow ? " Tryk i grafen for at læse en time." : "");

  $("#rainscale").innerHTML = [0, 1, 2, 3, 4].filter((k) => k <= m.series.length).map((k) => {
    const f = k / m.series.length;
    return `<span class="rkey"><i style="background:${f === 0 ? "var(--line-soft)" : `color-mix(in srgb, var(--rain) ${Math.round(20 + f * 80)}%, transparent)`}"></i>${k}</span>`;
  }).join("") + `<span class="rkey-txt">modeller ser regn i timen</span>`;

  /* Tabelvisning — samme tal, uden farvekodning */
  const sum = (a) => a.reduce((x2, v) => x2 + num(v), 0);
  $("#mtable").innerHTML = `
    <thead><tr><th>Model</th><th>Nu</th><th>Laveste</th><th>Højeste</th><th>Nedbør ${MODEL_HOURS} t</th></tr></thead>
    <tbody>${m.series.map((s) => {
      const t = s.temp.filter((v) => typeof v === "number" && isFinite(v));
      return `<tr>
        <th scope="row"><i class="tdot" style="background:var(--s${s.slot})"></i>${esc(s.name)} <small>${esc(s.origin)}</small></th>
        <td>${Math.round(num(s.temp[0]))}°</td>
        <td>${Math.round(Math.min(...t))}°</td>
        <td>${Math.round(Math.max(...t))}°</td>
        <td>${fmt(sum(s.precip))} mm</td>
      </tr>`;
    }).join("")}</tbody>`;
}

/* Sigtelinje: virker med både mus og finger, og læser alle modeller på én gang. */
function bindCrosshair(x, padL, W, padR) {
  const wrap = $("#mchart-wrap"), tip = $("#mtip"), cross = $("#mcross");
  const m = state.models;
  const n = m.hours.length;
  const move = (ev) => {
    const r = wrap.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const i = clamp(Math.round(((px - padL) / (W - padL - padR)) * (n - 1)), 0, n - 1);
    const h = m.hours[i];
    cross.style.display = "";
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
    tip.innerHTML = `<b>${dayName(h.key)} kl. ${h.hh}</b>` +
      m.series.map((s) => `<span><i style="background:var(--s${s.slot})"></i>${esc(s.short)}<em>${fmt(num(s.temp[i]))}°</em></span>`).join("") +
      `<span class="tip-rain">${h.rain} af ${h.rainAll} ser regn</span>`;
    tip.hidden = false;
    const left = clamp((x(i) / W) * r.width - 70, 4, Math.max(4, r.width - 148));
    tip.style.left = `${left}px`;
  };
  const leave = () => { tip.hidden = true; cross.style.display = "none"; };
  wrap.addEventListener("pointermove", move);
  wrap.addEventListener("pointerdown", move);
  wrap.addEventListener("pointerleave", leave);
}

function renderDrive(d) {
  const next = d.hours.slice(d.nowIndex, d.nowIndex + 24);
  const scored = next.map((h) => ({ h, s: driveScore(h, d.days.find((x) => x.key === h.key)) }));

  const bar = `<div class="hourbar">${scored.map(({ h, s }, i) => `
    <span class="cell" title="kl. ${h.hh}: ${fmt(s)}/10 · ${esc(codeText(h.code))}">
      <i style="background:${scoreColor(s)};opacity:${0.35 + (10 - s) / 15}"></i>
      <span>${i % 3 === 0 ? h.hh.slice(0, 2) : ""}</span>
    </span>`).join("")}</div>`;

  const groups = [];
  scored.forEach(({ h, s }) => {
    const band = s >= 6.8 ? "g" : s >= 4.5 ? "o" : "b";
    const last = groups[groups.length - 1];
    if (last && last.band === band) { last.end = h; last.items.push({ h, s }); }
    else groups.push({ band, start: h, end: h, items: [{ h, s }] });
  });

  const rows = groups.map((g) => {
    const a = agg(g.items.map((i) => i.h));
    const why = [];
    if (has(a.codes, ICY)) why.push("isslag");
    if (has(a.codes, SNOWY)) why.push("sne");
    if (a.minVis < 4000) why.push(`sigt ned til ${Math.round(a.minVis / 1000)} km`);
    if (a.precip >= 1) why.push(`${fmt(a.precip)} mm regn`);
    else if (a.precip >= 0.2) why.push("vådt");
    if (a.maxGust >= 11) why.push(`vindstød ${fmt(a.maxGust)} m/s`);
    if (a.minTemp <= 3) why.push(`ned til ${Math.round(a.minTemp)}°`);
    const label = g.band === "g" ? "Gode forhold" : g.band === "o" ? "Vær opmærksom" : "Undgå hvis muligt";
    const color = g.band === "g" ? "var(--good)" : g.band === "o" ? "var(--ok)" : "var(--bad)";
    const crosses = g.start.key !== g.end.key;
    const when = `kl. ${g.start.hh}–${g.end.hh}${crosses ? " (til i morgen)" : ""}`;
    return `<div class="win">
      <span class="when" style="color:${color}">${when}</span>
      <span class="why"><b style="color:${color}">${label}</b>${why.length ? " · " + why.join(", ") : " · tørt og roligt"}</span>
    </div>`;
  });

  $("#drive-windows").innerHTML = bar + rows.join("");

  const bad = scored.filter((x) => x.s < 4.5).length;
  const care = scored.filter((x) => x.s >= 4.5 && x.s < 6.8).length;
  setChip("#chip-drive",
    bad ? `${bad} ${bad === 1 ? "time" : "timer"} at undgå` : care ? `${care} ${care === 1 ? "time" : "timer"} kræver omtanke` : "Ingen kritiske perioder",
    bad ? "b" : care ? "o" : "g");
}

/* ---------- interaktion ---------- */
function selectDay(i) {
  state.day = i;
  const d = state.data;
  const day = d.days[i];
  const hours = i === 0 ? d.hours.slice(d.nowIndex, d.nowIndex + 24) : day.hours;
  renderChart(hours, i === 0 ? null : day);
  renderHours(hours, i === 0 ? d.hours[d.nowIndex].t : null);
  $("#week").querySelectorAll(".day").forEach((b) => b.setAttribute("aria-selected", String(+b.dataset.day === i)));
}

function renderAll() {
  const d = state.data;
  renderHero(d);
  renderPlan(d);
  renderWeek(d);
  renderPlants(d);
  renderAir();
  renderModels();
  renderDrive(d);
  selectDay(0);
  const p = state.place;
  $("#place-line").textContent = [p.name, p.region, p.country].filter(Boolean).join(", ");
  $("#foot-meta").textContent = `${p.name} · ${p.lat.toFixed(3).replace(".", ",")}°, ${p.lon.toFixed(3).replace(".", ",")}° · tidszone ${d.tz}${state.demo ? " · demo-data" : ""}`;
  document.title = `${Math.round(d.now.temp)}° ${p.name} — Vejr & planlægning`;
}

/* Foldede sektioner viser deres konklusion i overskriften, så intet er skjult —
   kun sammenfattet. Chippen vises kun når sektionen er lukket (styret i CSS). */
function setChip(id, text, tone) {
  const el = $(id);
  if (!el) return;
  el.className = "sh-chip" + (tone ? ` ${tone}` : "");
  el.textContent = text || "";
  el.hidden = !text;
}

function banner(msg, isError) {
  const el = $("#banner");
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "banner" + (isError ? " error" : "");
  el.textContent = msg;
}

let loadSeq = 0;
async function load(place) {
  const seq = ++loadSeq;
  state.place = place;
  store.set("wd.place", JSON.stringify(place));
  $("#refresh-btn").classList.add("spin");
  $("#place-line").textContent = `Henter vejr for ${place.name}…`;
  let data, demo, err;
  try {
    data = shape(await loadWeather(place));
    demo = false;
  } catch (e) {
    data = shape(demoData(place));
    demo = true;
    err = e;
  }
  if (seq !== loadSeq) return; // et nyere kald er i gang eller færdigt
  state.data = data;
  state.demo = demo;
  state.models = null;
  state.air = null;
  banner(demo ? `Kunne ikke hente live data (${err.message}) — viser demo-data, så du kan se dashboardet.` : null, demo);
  renderAll();
  $("#refresh-btn").classList.remove("spin");
  loadModelsInto(place, seq, data.hours[data.nowIndex].t, demo);
  loadAirInto(place, seq, data.hours[data.nowIndex].t, demo);
}

/* Luftdata hentes for sig — fejler det, står kun dette afsnit tomt. */
async function loadAirInto(place, seq, fromISO, demo) {
  try {
    const raw = demo ? demoAir(fromISO) : await loadAir(place);
    if (seq !== loadSeq) return;
    state.air = shapeAir(raw, fromISO);
    renderAir();
    if (state.data) renderPlan(state.data);   // luften kan ændre udendørs-rådet
  } catch (e) {
    if (seq !== loadSeq) return;
    state.air = null;
    $("#air-body").hidden = true;
    const el = $("#air-status");
    el.hidden = false;
    el.textContent = `Kunne ikke hente luft- og pollendata (${e.message}). Resten af siden er upåvirket.`;
  }
}

/* Modelafsnittet hentes efter hovedvisningen — siden må ikke vente på det. */
async function loadModelsInto(place, seq, fromISO, demo) {
  const fail = (msg) => {
    if (seq !== loadSeq) return;
    state.models = null;
    $("#models-body").hidden = true;
    const el = $("#models-status");
    el.hidden = false;
    el.textContent = msg;
  };
  try {
    const raw = demo ? demoModels(place, fromISO) : await loadModels(place);
    if (seq !== loadSeq) return;
    state.models = shapeModels(raw, fromISO);
    renderModels();
  } catch (e) {
    fail(`Kunne ikke hente modelsammenligningen (${e.message}). Resten af siden er upåvirket.`);
  }
}

/* Bysøgning */
let searchTimer, searchSeq = 0, searchHits = [];
$("#search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { $("#search-results").hidden = true; return; }
  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;
    try {
      const res = await fetch(`${GEO}?name=${encodeURIComponent(q)}&count=6&language=da&format=json`);
      const js = await res.json();
      if (seq !== searchSeq) return; // et nyere søgeord er undervejs
      const box = $("#search-results");
      if (!js.results || !js.results.length) { box.hidden = true; return; }
      searchHits = js.results.map((r) => ({
        name: r.name, region: r.admin1 || "", country: r.country || "", lat: r.latitude, lon: r.longitude
      }));
      box.innerHTML = searchHits.map((r, i) =>
        `<button type="button" data-i="${i}">${esc(r.name)}<span>${esc([r.region, r.country].filter(Boolean).join(", "))}</span></button>`).join("");
      box.hidden = false;
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        box.hidden = true;
        $("#search-input").value = "";
        load(searchHits[+b.dataset.i]);
      }));
    } catch { /* offline: ingen søgeresultater */ }
  }, 280);
});
$("#search-form").addEventListener("submit", (e) => e.preventDefault());
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) $("#search-results").hidden = true;
});

$("#locate-btn").addEventListener("click", () => {
  if (!navigator.geolocation) { banner("Din browser understøtter ikke stedbestemmelse.", true); return; }
  $("#locate-btn").classList.add("spin");
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    let place = { name: "Min placering", region: "", country: "", lat, lon };
    try {
      const res = await fetch(`${GEO}?latitude=${lat}&longitude=${lon}&count=1&language=da&format=json`);
      const js = await res.json();
      if (js.results && js.results[0]) {
        const r = js.results[0];
        place = { name: r.name, region: r.admin1 || "", country: r.country || "", lat, lon };
      }
    } catch { /* behold koordinater */ }
    $("#locate-btn").classList.remove("spin");
    load(place);
  }, () => {
    $("#locate-btn").classList.remove("spin");
    banner("Kunne ikke hente din placering — søg efter byen i stedet.", true);
  }, { timeout: 8000 });
});

$("#refresh-btn").addEventListener("click", () => load(state.place));

$("#theme-btn").addEventListener("click", () => {
  const cur = document.documentElement.dataset.theme;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = cur === "auto" ? (dark ? "light" : "dark") : cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  store.set("wd.theme", next);
});

/* ---------- demo-data (bruges kun uden netværk) ---------- */
function demoData(place) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = new Date(now); start.setHours(0);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
  const N = 7 * 24;
  const hourly = { time: [], temperature_2m: [], apparent_temperature: [], precipitation_probability: [], precipitation: [], weather_code: [], cloud_cover: [], visibility: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], uv_index: [], relative_humidity_2m: [], is_day: [], shortwave_radiation: [] };
  for (let i = 0; i < N; i++) {
    const t = new Date(start.getTime() + i * 3600e3);
    const h = t.getHours(), d = Math.floor(i / 24);
    const base = 17 + Math.sin((d / 7) * Math.PI * 2) * 3;
    const temp = base + Math.sin(((h - 9) / 24) * Math.PI * 2) * 5.5;
    const rainy = d === 2 || (d === 5 && h > 12);
    const precip = rainy && h % 5 < 2 ? 0.6 + (h % 3) * 0.5 : 0;
    const day = h >= 6 && h <= 20 ? 1 : 0;
    const rad = day ? Math.max(0, Math.sin(((h - 6) / 14) * Math.PI)) * (rainy ? 220 : 650) : 0;
    hourly.time.push(iso(t));
    hourly.temperature_2m.push(r1(temp));
    hourly.apparent_temperature.push(r1(temp - 1.4));
    hourly.precipitation_probability.push(rainy ? 55 + (h % 4) * 8 : 8 + (h % 3) * 4);
    hourly.precipitation.push(r1(precip));
    hourly.weather_code.push(precip > 0.8 ? 63 : precip > 0 ? 61 : rainy ? 3 : day && h % 7 < 3 ? 1 : day ? 2 : 0);
    hourly.cloud_cover.push(rainy ? 90 : 25 + (h % 5) * 8);
    hourly.visibility.push(rainy ? 6000 : 22000);
    hourly.wind_speed_10m.push(r1(3 + Math.abs(Math.sin(i / 9)) * 6));
    hourly.wind_gusts_10m.push(r1(6 + Math.abs(Math.sin(i / 9)) * 11));
    hourly.wind_direction_10m.push((200 + i * 7) % 360);
    hourly.uv_index.push(r1(day ? Math.max(0, Math.sin(((h - 6) / 14) * Math.PI)) * (rainy ? 2.5 : 6.2) : 0));
    hourly.relative_humidity_2m.push(rainy ? 88 : 58 + (h % 6) * 3);
    hourly.is_day.push(day);
    hourly.shortwave_radiation.push(Math.round(rad));
  }
  const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [], apparent_temperature_max: [], precipitation_sum: [], precipitation_probability_max: [], wind_speed_10m_max: [], wind_gusts_10m_max: [], uv_index_max: [], sunrise: [], sunset: [], sunshine_duration: [], et0_fao_evapotranspiration: [] };
  for (let d = 0; d < 7; d++) {
    const slice = hourly.time.map((t, i) => i).filter((i) => Math.floor(i / 24) === d);
    const key = hourly.time[slice[0]].slice(0, 10);
    const temps = slice.map((i) => hourly.temperature_2m[i]);
    const psum = slice.reduce((s, i) => s + hourly.precipitation[i], 0);
    daily.time.push(key);
    daily.weather_code.push(psum > 3 ? 63 : psum > 0 ? 61 : 2);
    daily.temperature_2m_max.push(r1(Math.max(...temps)));
    daily.temperature_2m_min.push(r1(Math.min(...temps)));
    daily.apparent_temperature_max.push(r1(Math.max(...temps) - 1));
    daily.precipitation_sum.push(r1(psum));
    daily.precipitation_probability_max.push(Math.max(...slice.map((i) => hourly.precipitation_probability[i])));
    daily.wind_speed_10m_max.push(Math.max(...slice.map((i) => hourly.wind_speed_10m[i])));
    daily.wind_gusts_10m_max.push(Math.max(...slice.map((i) => hourly.wind_gusts_10m[i])));
    daily.uv_index_max.push(Math.max(...slice.map((i) => hourly.uv_index[i])));
    daily.sunrise.push(`${key}T05:40`);
    daily.sunset.push(`${key}T20:25`);
    daily.sunshine_duration.push(psum > 3 ? 7200 : 34000);
    daily.et0_fao_evapotranspiration.push(r1(psum > 3 ? 1.9 : 3.6));
  }
  const ni = hourly.time.indexOf(iso(now));
  const i = ni < 0 ? 12 : ni;
  return {
    timezone: "Europe/Copenhagen (demo)",
    current: {
      time: hourly.time[i], temperature_2m: hourly.temperature_2m[i], apparent_temperature: hourly.apparent_temperature[i],
      is_day: hourly.is_day[i], precipitation: hourly.precipitation[i], weather_code: hourly.weather_code[i],
      cloud_cover: hourly.cloud_cover[i], relative_humidity_2m: hourly.relative_humidity_2m[i],
      wind_speed_10m: hourly.wind_speed_10m[i], wind_gusts_10m: hourly.wind_gusts_10m[i], wind_direction_10m: hourly.wind_direction_10m[i]
    },
    hourly, daily, _place: place
  };
}

/* Syntetiske luft- og pollental til demo-visningen (sensommer i Danmark). */
function demoAir(fromISO) {
  const start = new Date(fromISO.replace(" ", "T"));
  start.setHours(start.getHours() - start.getHours());   // fra midnat
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
  const H = { time: [], pm10: [], pm2_5: [], ozone: [], nitrogen_dioxide: [], european_aqi: [] };
  POLLEN.forEach((sp) => { H[sp.id] = []; });
  for (let k = 0; k < 72; k++) {
    const t = new Date(start.getTime() + k * 3600e3);
    const h = t.getHours();
    const midday = Math.max(0, Math.sin(((h - 5) / 14) * Math.PI));
    H.time.push(iso(t));
    H.pm2_5.push(r1(6 + midday * 5 + (k % 5)));
    H.pm10.push(r1(11 + midday * 8 + (k % 7)));
    H.ozone.push(r1(52 + midday * 34));
    H.nitrogen_dioxide.push(r1(9 + (1 - midday) * 12));
    H.european_aqi.push(Math.round(22 + midday * 26 + (k % 4) * 2));
    H.alder_pollen.push(0);
    H.birch_pollen.push(0);
    H.grass_pollen.push(r1(midday * 6));
    H.mugwort_pollen.push(r1(midday * 34));
    H.ragweed_pollen.push(r1(midday * 7));
  }
  return { hourly: H };
}

/* Fire syntetiske modelvarianter, så afsnittet kan ses uden netværk. */
function demoModels(place, fromISO) {
  const base = demoData(place);
  const H = { time: base.hourly.time };
  MODELS.forEach((m, k) => {
    const phase = (k + 1) * 1.7, amp = 0.6 + k * 0.5, bias = (k - 1.5) * 0.7;
    H[`temperature_2m_${m.id}`] = base.hourly.temperature_2m.map((v, i) =>
      r1(v + bias + Math.sin(i / 7 + phase) * amp));
    H[`precipitation_${m.id}`] = base.hourly.precipitation.map((v, i) => {
      const wobble = Math.sin(i / 5 + phase * 2);
      if (v > 0) return r1(Math.max(0, v * (1 + wobble * 0.6)));
      return wobble > 0.86 - k * 0.12 ? r1(0.3 + k * 0.15) : 0;   // hver model ser en byge de andre ikke ser
    });
  });
  return { hourly: H };
}

/* Foldetilstanden huskes pr. sektion, så dashboardet åbner som du forlod det. */
function initSections() {
  let saved = {};
  try { saved = JSON.parse(store.get("wd.open") || "{}") || {}; } catch { /* ignorer */ }
  document.querySelectorAll("details.section").forEach((d) => {
    if (typeof saved[d.id] === "boolean") d.open = saved[d.id];
    d.addEventListener("toggle", () => {
      const map = {};
      document.querySelectorAll("details.section").forEach((x) => { map[x.id] = x.open; });
      store.set("wd.open", JSON.stringify(map));
      /* Modelgrafen måler sin egen bredde — den er 0 mens sektionen er lukket. */
      if (d.id === "sec-models" && d.open && state.models) renderModels();
    });
  });
}

/* Grafen tegnes i pixels, så den skal gentegnes når bredden ændrer sig. */
let resizeTimer, lastW = 0;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = $("#mchart-wrap").clientWidth || 0;
    if (state.models && Math.abs(w - lastW) > 24) { lastW = w; renderModels(); }
  }, 160);
});

/* ---------- start ---------- */
(function init() {
  initSections();
  const savedTheme = store.get("wd.theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  let place = DEFAULT_PLACE;
  try {
    const saved = JSON.parse(store.get("wd.place") || "null");
    if (saved && typeof saved.lat === "number") place = saved;
  } catch { /* ignorer */ }
  load(place);
  setInterval(() => { if (!document.hidden) load(state.place); }, 15 * 60 * 1000);
})();
