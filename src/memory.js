// ============================================================
// ­ЪДа MEMORY ENGINE v7.1 РђЊ ES2020 (ES11) | Chub AI Stage
// ============================================================
// Features: Time ┬и Location ┬и Mood ┬и Relationship ┬и Outfit (Char+User)
// Sex History ┬и Meal Memory ┬и Pregnancy (optional, male-perspective trigger)
// Outfit auto-restore after sex
// ============================================================

// РћђРћђРћђ CONSTANTS РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const MAX_SEX_HISTORY = 15;
const MAX_RECENT_LOC = 5;
const MAX_INTERACTIONS = 15;
const MAX_MEALS = 5;
const MAX_SCHEDULES = 5;

// РћђРћђРћђ HELPERS РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const pushCapped = (arr, item, max) => {
  arr.push(item);
  while (arr.length > max) arr.shift();
};

const timeToMins = (s = "08:00") => {
  const [h = 0, m = 0] = (s || "08:00").split(":").map(Number);
  return h * 60 + m;
};
const minsToTime = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60),
    min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};
const getTimeCat = (h) => {
  if (h >= 4 && h < 6) return "dawn";
  if (h >= 6 && h < 11) return "morning";
  if (h >= 11 && h < 15) return "afternoon";
  if (h >= 15 && h < 18) return "evening";
  if (h >= 18) return "night";
  return "midnight";
};

// РћђРћђРћђ DEFAULT MEMORY РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
export const defaultMemory = () => ({
  time: "08:00",
  day: 1,
  schedules: [],

  location: {
    current: "unknown",
    previous: "",
    recent: [],
    enteredAt: "08:00",
  },

  // Char & user outfit tracked separately
  outfitChar: {
    upper: ["shirt"],
    lower: ["jeans"],
    legs: [],
    underwear: { bra: true, panties: true },
  },
  outfitUser: {
    upper: ["shirt"],
    lower: ["pants"],
    legs: [],
    underwear: { bra: false, underwear: true },
  },

  // Relationship
  affection: 0,
  romance: 0,
  trust: 0,
  respect: 0,
  lust: 0,
  stage: "stranger",
  isMarried: false,
  familyRole: "",
  interactions: [],

  // Mood
  currentMood: "neutral",
  moodIntensity: 50,
  moodReason: "",
  previousMood: "",
  previousMoodIntensity: 0,

  // Sex
  currentSex: null,
  lastSex: null,
  sexHistory: [],
  sexCount: 0,
  lastSexDay: 0,

  // Pregnancy Рђћ OFF by default
  pregnancyEnabled: false,
  pregnancyRequested: false,
  pregnancy: null,
  children: [],

  // Food / meals
  mealHistory: [],

  objects: {},
});

// РћђРћђРћђ OUTFIT HELPERS РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const outfitStr = (o) => {
  if (!o) return "unknown";
  const u = o.underwear ?? {};
  const p = [
    `upper:${o.upper?.length ? o.upper.join(",") : "none"}`,
    `lower:${o.lower?.length ? o.lower.join(",") : "none"}`,
  ];
  if (o.legs?.length) p.push(`legs:${o.legs.join(",")}`);
  p.push(`bra:${u.bra ? "ON" : "OFF"} panties:${u.panties ? "ON" : "OFF"}`);
  return p.join(" | ");
};

const snapOutfit = (o) => {
  if (!o) return null;
  const u = o.underwear ?? {};
  return {
    upper: [...(o.upper ?? [])],
    lower: [...(o.lower ?? [])],
    legs: [...(o.legs ?? [])],
    underwear: { bra: !!u.bra, panties: !!u.panties },
  };
};

const copyOutfitInto = (target, source) => {
  if (!target || !source) return;
  target.upper = [...(source.upper ?? [])];
  target.lower = [...(source.lower ?? [])];
  target.legs = [...(source.legs ?? [])];
  target.underwear = {
    ...(source.underwear ?? { bra: false, panties: false }),
  };
};

const _addItem = (outfit, layer, item) => {
  if (!outfit) return;
  if (layer === "bra" || layer === "panties") {
    outfit.underwear ??= {};
    outfit.underwear[layer] = true;
    return;
  }
  outfit[layer] ??= [];
  if (item && !outfit[layer].includes(item)) outfit[layer].push(item);
};

const _removeItem = (outfit, layer, item) => {
  if (!outfit) return;
  if (layer === "bra" || layer === "panties") {
    outfit.underwear ??= {};
    outfit.underwear[layer] = false;
    return;
  }
  if (layer === "all") {
    outfit.upper = [];
    outfit.lower = [];
    outfit.legs = [];
    outfit.underwear = { bra: false, panties: false };
    return;
  }
  outfit[layer] = item ? (outfit[layer] ?? []).filter((x) => x !== item) : [];
};

// Find which items were removed during sex (compare start vs current state)
const diffOutfit = (before, after) => {
  if (!before || !after) return [];
  const removed = [];
  if (before.underwear?.bra && !after.underwear?.bra) removed.push("bra");
  if (before.underwear?.panties && !after.underwear?.panties)
    removed.push("panties");
  const layers = ["upper", "lower", "legs"];
  for (const layer of layers) {
    for (const item of before[layer] ?? []) {
      if (!(after[layer] ?? []).includes(item))
        removed.push(`${layer}:${item}`);
    }
  }
  return removed;
};

// РћђРћђРћђ CONDOM РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const setCondom = (mem, val, who) => {
  const cs = mem.currentSex;
  if (!cs?.active) return;
  if (cs.lock && !val) return;
  cs.condom = val;
  if (val) {
    cs.condomUsed = true;
    cs.condomBy = who ?? "unknown";
  }
};
const lockCondom = (mem) => {
  if (mem.currentSex) mem.currentSex.lock = true;
};
const unlockCondom = (mem) => {
  if (mem.currentSex) mem.currentSex.lock = false;
};
const disposeCondom = (mem) => {
  const cs = mem.currentSex;
  if (!cs) return;
  unlockCondom(mem);
  cs.condom = false;
  cs.condomDisposed = true;
  cs.lock = false;
  cs.condomBy = null;
};

// РћђРћђРћђ SEX РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const startSex = (mem, partner, loc) => {
  mem.currentSex = {
    active: true,
    condom: false,
    condomUsed: false,
    condomDisposed: false,
    lock: false,
    condomBy: null,
    startTime: mem.time,
    partner: partner ?? "partner",
    location: loc ?? mem.location?.current ?? "unknown",
    currentPosition: null,
    positions: [],
    // Snapshot outfit BEFORE sex (for restore & comparison)
    outfitCharStart: snapOutfit(mem.outfitChar),
    outfitUserStart: snapOutfit(mem.outfitUser),
  };
};

const finishSex = (mem, cum) => {
  const cs = mem.currentSex;
  if (!cs?.active) return;
  if (cs.condom) disposeCondom(mem);

  // Find items removed during sex
  const charRemovedDuringSex = diffOutfit(cs.outfitCharStart, mem.outfitChar);
  const userRemovedDuringSex = diffOutfit(cs.outfitUserStart, mem.outfitUser);

  const entry = {
    day: mem.day,
    timeStart: cs.startTime,
    timeEnd: mem.time,
    location: cs.location,
    partner: cs.partner,
    condomUsed: cs.condomUsed,
    cum: cum ?? "none",
    positions: cs.positions.length
      ? cs.positions
      : cs.currentPosition
      ? [cs.currentPosition]
      : ["unknown"],
    // Full outfit tracking
    outfitCharBefore: cs.outfitCharStart,
    outfitCharAfter: snapOutfit(mem.outfitChar),
    outfitUserBefore: cs.outfitUserStart,
    outfitUserAfter: snapOutfit(mem.outfitUser),
    charRemovedDuringSex, // items char removed during sex
    userRemovedDuringSex, // items user removed during sex
  };

  mem.lastSex = entry;
  mem.sexCount = (mem.sexCount ?? 0) + 1;
  mem.sexHistory ??= [];
  pushCapped(mem.sexHistory, entry, MAX_SEX_HISTORY);
  mem.lastSexDay = mem.day;
  mem.lust = clamp((mem.lust ?? 0) - 30, 0, 100);

  // РћђРћђ AUTO-RESTORE OUTFIT РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
  // Char: restore to pre-sex state (simulate picking up clothes from floor, etc.)
  copyOutfitInto(mem.outfitChar, cs.outfitCharStart);

  // User: same, restore to pre-sex state
  copyOutfitInto(mem.outfitUser, cs.outfitUserStart);

  // Flag that sex just ended (used for post-sex note in buildLive)
  mem.currentSex = null;
  mem.justFinishedSex = {
    charRestored: charRemovedDuringSex,
    userRestored: userRemovedDuringSex,
    location: entry.location,
  };

  // РћђРћђ PREGNANCY РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
  // Only if: cum inside + pregnancyEnabled + pregnancyRequested
  if (
    cum === "inside" &&
    mem.pregnancyEnabled &&
    mem.pregnancyRequested &&
    !mem.pregnancy
  ) {
    _startPregnancy(mem);
  }
};

// РћђРћђРћђ PREGNANCY РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const _startPregnancy = (mem) => {
  if (mem.pregnancy) return;
  mem.pregnancy = {
    dayStarted: mem.day,
    bellyPhase: "early",
    waterBroken: false,
  };
  mem.pregnancyRequested = false; // reset Рђћ must request again for next time
};

const _updatePregnancyPhase = (mem) => {
  if (!mem.pregnancy) return;
  const d = mem.day - mem.pregnancy.dayStarted + 1;
  if (d >= 30) mem.pregnancy.waterBroken = true;
  else if (d >= 14) mem.pregnancy.bellyPhase = "full";
  else if (d >= 5) mem.pregnancy.bellyPhase = "growing";
};

const _deliverBaby = (mem, name, gender) => {
  if (!mem.pregnancy) return;
  mem.children ??= [];
  mem.children.push({
    name: name ?? "Baby",
    gender: gender ?? "unknown",
    bornDay: mem.day,
  });
  mem.pregnancy = null;
};

// РћђРћђРћђ RELATIONSHIP РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const _updateStage = (mem) => {
  if (mem.isMarried) {
    mem.stage = "partner";
    return;
  }
  const t =
    (mem.affection ?? 0) +
    (mem.romance ?? 0) +
    (mem.trust ?? 0) +
    (mem.respect ?? 0);
  mem.stage =
    t >= 300
      ? "partner"
      : t >= 200
      ? "lover"
      : t >= 120
      ? "close"
      : t >= 60
      ? "friend"
      : t >= 20
      ? "acquaintance"
      : "stranger";
};

const addInteraction = ( mem, type, aff = 0, rom = 0, tru = 0, res = 0, lst = 0 ) => {
  mem.affection = clamp((mem.affection ?? 0) + aff, -100, 100);
  mem.romance = clamp((mem.romance ?? 0) + rom, -100, 100);
  mem.trust = clamp((mem.trust ?? 0) + tru, -100, 100);
  mem.respect = clamp((mem.respect ?? 0) + res, -100, 100);
  mem.lust = clamp((mem.lust ?? 0) + lst, 0, 100);
  mem.interactions ??= [];
  pushCapped(
    mem.interactions,
    { type, time: mem.time, aff, rom, tru, res, lst },
    MAX_INTERACTIONS
  );
  _updateStage(mem);
};

export const initRelationship = (mem, charText = "", userText = "") => {
  const t = (charText + " " + userText).toLowerCase();
  if (/\b(wife|husband|married|spouse)\b/.test(t)) {
    mem.isMarried = true;
    mem.stage = "partner";
    mem.affection = 85;
    mem.romance = 90;
    mem.trust = 80;
    mem.respect = 75;
    mem.lust = 70;
  } else if (/\b(girlfriend|boyfriend|lover|dating|partner)\b/.test(t)) {
    mem.stage = "lover";
    mem.affection = 75;
    mem.romance = 80;
    mem.trust = 65;
    mem.respect = 60;
    mem.lust = 70;
  } else if (/\b(mom|mother|mama)\b/.test(t)) {
    mem.familyRole = "mom";
    mem.stage = "close";
    mem.affection = 75;
    mem.trust = 90;
    mem.respect = 85;
  } else if (/\b(sister|sibling)\b/.test(t)) {
    mem.familyRole = "sister";
    mem.stage = "close";
    mem.affection = 65;
    mem.trust = 80;
  } else if (/\b(best friend|close friend)\b/.test(t)) {
    mem.stage = "close";
    mem.affection = 60;
    mem.trust = 65;
  } else if (/\b(friend)\b/.test(t)) {
    mem.stage = "friend";
    mem.affection = 35;
    mem.trust = 40;
  }
};

// РћђРћђРћђ MOOD РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const MOOD_TRIGGERS = [
  {
    re: /\b(?:fight|insult(?:s|ed)?|yell(?:s|ed)?|scold(?:s|ed)?)\b/i,
    mood: "angry",
    intensity: 75,
    reason: "conflict",
  },
  {
    re: /\b(?:break[\s-]?up|leave me)\b/i,
    mood: "sad",
    intensity: 80,
    reason: "breakup",
  },
  {
    re: /\b(?:cry|cries|crying|sobbing|sob(?:s|bed)?)\b/i,
    mood: "sad",
    intensity: 70,
    reason: "crying",
  },
  {
    re: /\b(?:laugh(?:s|ed|ing)?|funny|giggle[sd]?)\b/i,
    mood: "happy",
    intensity: 60,
    reason: "laughter",
  },
  {
    re: /\b(?:compliment[sd]?|you look (?:good|great|amazing|beautiful))\b/i,
    mood: "happy",
    intensity: 65,
    reason: "compliment",
  },
  {
    re: /\b(?:date|dinner together|romantic dinner)\b/i,
    mood: "excited",
    intensity: 70,
    reason: "date",
  },
  {
    re: /\b(?:hug(?:s|ged|ging)?|embrace[sd]?)\b/i,
    mood: "happy",
    intensity: 60,
    reason: "hug",
  },
  {
    re: /\b(?:kiss|cium).{0,15}(?:lips|mouth)\b/i,
    mood: "romantic",
    intensity: 85,
    reason: "lip kiss",
  },
  {
    re: /\b(?:kiss)(?:es|ed|ing)?\b/i,
    mood: "romantic",
    intensity: 70,
    reason: "kiss",
  },
  {
    re: /\b(?:hold hands|cuddle[sd]?|snuggle[sd]?)\b/i,
    mood: "romantic",
    intensity: 65,
    reason: "romantic gesture",
  },
  {
    re: /\b(?:tired|exhausted|sleepy|worn out)\b/i,
    mood: "tired",
    intensity: 60,
    reason: "fatigue",
  },
  {
    re: /\b(?:scared|frightened|terrified|afraid)\b/i,
    mood: "scared",
    intensity: 70,
    reason: "fear",
  },
  {
    re: /\b(?:nervous|anxious|worried)\b/i,
    mood: "nervous",
    intensity: 65,
    reason: "anxiety",
  },
  {
    re: /\b(?:jealous|envious)\b/i,
    mood: "jealous",
    intensity: 70,
    reason: "jealousy",
  },
  {
    re: /\b(?:calm(?:s|ed)?|relax(?:es|ed)?|at ease)\b/i,
    mood: "calm",
    intensity: 50,
    reason: "relaxing",
  },
  {
    re: /\b(?:embarrassed|blush(?:es|ed)?|shy(?:ly)?)\b/i,
    mood: "embarrassed",
    intensity: 60,
    reason: "embarrassment",
  },
  {
    re: /\b(?:happy|joyful|glad|delighted)\b/i,
    mood: "happy",
    intensity: 70,
    reason: "positive",
  },
  {
    re: /\b(?:sad|unhappy|upset)\b/i,
    mood: "sad",
    intensity: 70,
    reason: "negative",
  },
  {
    re: /\b(?:excited|enthusiastic|thrilled)\b/i,
    mood: "excited",
    intensity: 75,
    reason: "exciting",
  },
];
const INTIMATE_RE =
  /\b(?:touch(?:es|ed|ing)?|kiss(?:es|ed|ing)?|lick[sz]?|suck[sz]?|grab[sz]?|caress(?:es|ed)?|stroke[sz]?|rub[sz]?|fondle[sz]?|grope[sz]?)\b.{0,30}\b(?:neck|chest|breast[sz]?|nipple[sz]?|belly|thigh[sz]?|crotch|pussy|vagina|dick|cock|penis)\b/i;

const _setMood = (mem, mood, intensity, reason) => {
  if (mem.currentMood !== mood) {
    mem.previousMood = mem.currentMood;
    mem.previousMoodIntensity = mem.moodIntensity;
    mem.moodIntensity = clamp(intensity, 0, 100);
  } else {
    mem.moodIntensity = clamp(
      (mem.moodIntensity ?? 50) + Math.round(intensity * 0.3),
      0,
      100
    );
  }
  mem.currentMood = mood;
  mem.moodReason = reason;
};

// РћђРћђРћђ LOCATION РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
const LOCATIONS = {
  bedroom: ["bedroom", "bed room"],
  living_room: ["living room"],
  kitchen: ["kitchen"],
  bathroom: ["bathroom", "toilet"],
  garage: ["garage"],
  garden: ["garden"],
  balcony: ["balcony"],
  office: ["office"],
  restaurant: ["restaurant"],
  cafe: ["cafe", "coffee shop", "coffeehouse"],
  cinema: ["cinema", "movie theater"],
  park: ["park", "city park"],
  beach: ["beach", "seaside"],
  hospital: ["hospital", "medical center"],
  hotel: ["hotel"],
  mall: ["mall", "plaza"],
  car: ["in the car", "inside the car"],
  school: ["school"],
  apartment: ["apartment", "flat"],
  rooftop: ["rooftop", "roof"],
};
const LOC_LIST = Object.entries(LOCATIONS)
  .flatMap(([canon, arr]) => arr.map((phrase) => ({ canon, phrase })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

const _detectLocation = (msg) => {
  const lower = msg.toLowerCase();
  const found = LOC_LIST.find(({ phrase }) => lower.includes(phrase));
  if (found) return found.canon;
  const m = msg.match(
    /\b(?:in|at|to|into|towards)\s+(?:the\s+)?([a-zA-Z\s]{2,25})(?:\.|,|\n|$)/i
  );
  return m ? m[1].trim().toLowerCase().replace(/\s+/g, "_") : null;
};

const _moveTo = (mem, loc) => {
  if (!loc || loc === mem.location?.current) return;
  mem.location ??= {
    current: "unknown",
    previous: "",
    recent: [],
    enteredAt: "08:00",
  };
  if (mem.location.current && mem.location.current !== "unknown") {
    mem.location.recent ??= [];
    pushCapped(mem.location.recent, mem.location.current, MAX_RECENT_LOC);
    mem.location.previous = mem.location.current;
  }
  mem.location.current = loc;
  mem.location.enteredAt = mem.time;
};

// РћђРћђРћђ MASTER PARSER РћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђРћђ
export const parseMessage = (mem, msg, role = "user") => {
  if (!msg) return;

  // Clear justFinishedSex flag each new message
  mem.justFinishedSex = null;

  // РћђРћђ Time РћђРћђРћђРћђРћђРћђРћђРћђ
  const advM = msg.match(
    /\b(?:skip|advance|fast.?forward)\s+(\d+)\s+(menit|jam|minutes?|hours?)\b/i
  );
  if (advM) {
    let m = Number(advM[1]);
    if (/jam|hour/i.test(advM[2])) m *= 60;
    mem.time = minsToTime(timeToMins(mem.time) + m);
  }
  const setTM = msg.match(/\b(?:set time to|time is now)\s+(\d{1,2}:\d{2})\b/i);
  if (setTM) mem.time = setTM[1];
  if (/\b(?:next day|the next day|new day|next morning|sleep)\b/i.test(msg)) {
    mem.day = (mem.day ?? 1) + 1;
    _updatePregnancyPhase(mem);
  }

  // РћђРћђ Location РћђРћђРћђРћђ
  const newLoc = _detectLocation(msg);
  if (newLoc) _moveTo(mem, newLoc);

  // РћђРћђ Food / Meals Рћђ
  const eatM = msg.match(
    /\b(?:eat(?:ing)?|eating|having|breakfast|lunch|dinner|drink(?:ing)?|snack(?:king)?)\b.{0,40}?([a-zA-Z\s,]{3,30}?)(?:\s+(?:di|at|in)\s+([a-zA-Z\s]{2,20}))?(?:\.|,|\n|$)/i
  );
  if (eatM) {
    mem.mealHistory ??= [];
    pushCapped(
      mem.mealHistory,
      {
        time: mem.time,
        food: eatM[1]?.trim() ?? "something",
        location: eatM[2]?.trim() ?? mem.location?.current ?? "unknown",
        role,
      },
      MAX_MEALS
    );
  }

  // РћђРћђ Condom & position (during active sex) РћђРћђ
  if (mem.currentSex?.active) {
    const who = role === "user" ? "user" : "char";
    if (/(put on|use|wear|slips?|rolls?)/i.test(msg)) {
      setCondom(mem, true, who);
      lockCondom(mem);
    } else if (/(remove|take off|pull off|dispose)/i.test(msg)) {
      disposeCondom(mem);
    }

    const POS = [
      [/doggy/i, "doggy"],
      [/missionary/i, "missionary"],
      [/cowgirl/i, "cowgirl"],
      [/reverse cowgirl/i, "reverse cowgirl"],
      [/spooning/i, "spooning"],
      [/standing/i, "standing"],
      [/\b69\b/, "69"],
      [/prone bone/i, "prone bone"],
    ];
    for (const [re, pos] of POS) {
      if (re.test(msg)) {
        mem.currentSex.currentPosition = pos;
        if (!mem.currentSex.positions.includes(pos))
          mem.currentSex.positions.push(pos);
        break;
      }
    }
  }

  // РћђРћђ Start sex РћђРћђРћђРћђ
  if (
    /\b(?:start sex|making love|let'?s (?:fuck|have sex)|having sex|we have sex|sex starts?)\b/i.test(
      msg
    ) &&
    !mem.currentSex?.active
  ) {
    startSex(mem, "partner", mem.location?.current);
    addInteraction(mem, "sex_start", 5, 10, 2, 0, 20);
  }

  // РћђРћђ Finish sex & cum РћђРћђ
  if (mem.currentSex?.active) {
    const inside = /cum inside|creampie|came inside|fin
