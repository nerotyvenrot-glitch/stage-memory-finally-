// ============================================================
// 🧠 MEMORY ENGINE v7.1 – ES2020 (ES11) | Chub AI Stage
// ============================================================
// Features: Time · Location · Mood · Relationship · Outfit (Char+User)
//          Sex History · Meal Memory · Pregnancy (optional, male-perspective trigger)
//          Outfit auto-restore after sex
// ============================================================

// ─── CONSTANTS ───────────────────────────────────────────────
const MAX_SEX_HISTORY = 15;
const MAX_RECENT_LOC  = 5;
const MAX_INTERACTIONS= 15;
const MAX_MEALS       = 5;
const MAX_SCHEDULES   = 5;

// ─── HELPERS ─────────────────────────────────────────────────
const clamp      = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const pushCapped = (arr, item, max) => { arr.push(item); while (arr.length > max) arr.shift(); };

const timeToMins = (s = '08:00') => {
  const [h = 0, m = 0] = (s || '08:00').split(':').map(Number);
  return h * 60 + m;
};
const minsToTime = (m) => {
  m = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), min = m % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
};
const getTimeCat = (h) => {
  if (h >= 4  && h < 6)  return 'dawn';
  if (h >= 6  && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'afternoon';
  if (h >= 15 && h < 18) return 'evening';
  if (h >= 18)            return 'night';
  return 'midnight';
};

// ─── DEFAULT MEMORY ──────────────────────────────────────────
export const defaultMemory = () => ({
  time: '08:00', day: 1, schedules: [],

  location: { current: 'unknown', previous: '', recent: [], enteredAt: '08:00' },

  // Char & user outfit tracked separately
  outfitChar: { upper: ['shirt'], lower: ['jeans'], legs: [], underwear: { bra: true, panties: true } },
  outfitUser: { upper: ['shirt'], lower: ['pants'], legs: [], underwear: { bra: false, underwear: true } },

  // Relationship
  affection: 0, romance: 0, trust: 0, respect: 0, lust: 0,
  stage: 'stranger', isMarried: false, familyRole: '', interactions: [],

  // Mood
  currentMood: 'neutral', moodIntensity: 50, moodReason: '',
  previousMood: '', previousMoodIntensity: 0,

  // Sex
  currentSex: null, lastSex: null, sexHistory: [], sexCount: 0, lastSexDay: 0,

  // Pregnancy — OFF by default
  pregnancyEnabled: false, pregnancyRequested: false,
  pregnancy: null, children: [],

  // Food / meals
  mealHistory: [],

  objects: {},
});

// ─── OUTFIT HELPERS ──────────────────────────────────────────
const outfitStr = (o) => {
  if (!o) return 'unknown';
  const u = o.underwear ?? {};
  const p = [
    `upper:${o.upper?.length ? o.upper.join(',') : 'none'}`,
    `lower:${o.lower?.length ? o.lower.join(',') : 'none'}`,
  ];
  if (o.legs?.length) p.push(`legs:${o.legs.join(',')}`);
  p.push(`bra:${u.bra ? 'ON':'OFF'} panties:${u.panties ? 'ON':'OFF'}`);
  return p.join(' | ');
};

const snapOutfit = (o) => {
  if (!o) return null;
  const u = o.underwear ?? {};
  return {
    upper:     [...(o.upper  ?? [])],
    lower:     [...(o.lower  ?? [])],
    legs:      [...(o.legs   ?? [])],
    underwear: { bra: !!u.bra, panties: !!u.panties },
  };
};

const copyOutfitInto = (target, source) => {
  if (!target || !source) return;
  target.upper     = [...(source.upper ?? [])];
  target.lower     = [...(source.lower ?? [])];
  target.legs      = [...(source.legs  ?? [])];
  target.underwear = { ...(source.underwear ?? { bra: false, panties: false }) };
};

const _addItem = (outfit, layer, item) => {
  if (!outfit) return;
  if (layer === 'bra' || layer === 'panties') { outfit.underwear ??= {}; outfit.underwear[layer] = true; return; }
  outfit[layer] ??= [];
  if (item && !outfit[layer].includes(item)) outfit[layer].push(item);
};

const _removeItem = (outfit, layer, item) => {
  if (!outfit) return;
  if (layer === 'bra' || layer === 'panties') { outfit.underwear ??= {}; outfit.underwear[layer] = false; return; }
  if (layer === 'all') { outfit.upper = []; outfit.lower = []; outfit.legs = []; outfit.underwear = { bra: false, panties: false }; return; }
  outfit[layer] = item ? (outfit[layer] ?? []).filter(x => x !== item) : [];
};

// Find which items were removed during sex (compare start vs current state)
const diffOutfit = (before, after) => {
  if (!before || !after) return [];
  const removed = [];
  if (before.underwear?.bra    && !after.underwear?.bra)    removed.push('bra');
  if (before.underwear?.panties && !after.underwear?.panties) removed.push('panties');
  const layers = ['upper', 'lower', 'legs'];
  for (const layer of layers) {
    for (const item of (before[layer] ?? [])) {
      if (!(after[layer] ?? []).includes(item)) removed.push(`${layer}:${item}`);
    }
  }
  return removed;
};

// ─── CONDOM ──────────────────────────────────────────────────
const setCondom    = (mem, val, who) => {
  const cs = mem.currentSex; if (!cs?.active) return;
  if (cs.lock && !val) return;
  cs.condom = val;
  if (val) { cs.condomUsed = true; cs.condomBy = who ?? 'unknown'; }
};
const lockCondom   = (mem) => { if (mem.currentSex) mem.currentSex.lock = true; };
const unlockCondom = (mem) => { if (mem.currentSex) mem.currentSex.lock = false; };
const disposeCondom = (mem) => {
  const cs = mem.currentSex; if (!cs) return;
  unlockCondom(mem); cs.condom = false; cs.condomDisposed = true; cs.lock = false; cs.condomBy = null;
};

// ─── SEX ────────────────────────────────────────────────────
const startSex = (mem, partner, loc) => {
  mem.currentSex = {
    active: true, condom: false, condomUsed: false, condomDisposed: false,
    lock: false, condomBy: null, startTime: mem.time,
    partner: partner ?? 'partner',
    location: loc ?? mem.location?.current ?? 'unknown',
    currentPosition: null, positions: [],
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
    day: mem.day, timeStart: cs.startTime, timeEnd: mem.time,
    location: cs.location, partner: cs.partner,
    condomUsed: cs.condomUsed, cum: cum ?? 'none',
    positions: cs.positions.length ? cs.positions : (cs.currentPosition ? [cs.currentPosition] : ['unknown']),
    // Full outfit tracking
    outfitCharBefore: cs.outfitCharStart,
    outfitCharAfter:  snapOutfit(mem.outfitChar),
    outfitUserBefore: cs.outfitUserStart,
    outfitUserAfter:  snapOutfit(mem.outfitUser),
    charRemovedDuringSex,   // items char removed during sex
    userRemovedDuringSex,   // items user removed during sex
  };

  mem.lastSex    = entry;
  mem.sexCount   = (mem.sexCount ?? 0) + 1;
  mem.sexHistory ??= [];
  pushCapped(mem.sexHistory, entry, MAX_SEX_HISTORY);
  mem.lastSexDay = mem.day;
  mem.lust       = clamp((mem.lust ?? 0) - 30, 0, 100);

  // ── AUTO-RESTORE OUTFIT ────────────────────────────────────
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

  // ── PREGNANCY ──────────────────────────────────────────────
  // Only if: cum inside + pregnancyEnabled + pregnancyRequested
  if (cum === 'inside' && mem.pregnancyEnabled && mem.pregnancyRequested && !mem.pregnancy) {
    _startPregnancy(mem);
  }
};

// ─── PREGNANCY ───────────────────────────────────────────────
const _startPregnancy = (mem) => {
  if (mem.pregnancy) return;
  mem.pregnancy = { dayStarted: mem.day, bellyPhase: 'early', waterBroken: false };
  mem.pregnancyRequested = false; // reset — must request again for next time
};

const _updatePregnancyPhase = (mem) => {
  if (!mem.pregnancy) return;
  const d = mem.day - mem.pregnancy.dayStarted + 1;
  if (d >= 30)      mem.pregnancy.waterBroken = true;
  else if (d >= 14) mem.pregnancy.bellyPhase = 'full';
  else if (d >= 5)  mem.pregnancy.bellyPhase = 'growing';
};

const _deliverBaby = (mem, name, gender) => {
  if (!mem.pregnancy) return;
  mem.children ??= [];
  mem.children.push({ name: name ?? 'Baby', gender: gender ?? 'unknown', bornDay: mem.day });
  mem.pregnancy = null;
};

// ─── RELATIONSHIP ────────────────────────────────────────────────
const _updateStage = (mem) => {
  if (mem.isMarried) { mem.stage = 'partner'; return; }
  const t = (mem.affection??0)+(mem.romance??0)+(mem.trust??0)+(mem.respect??0);
  mem.stage = t>=300?'partner':t>=200?'lover':t>=120?'close':t>=60?'friend':t>=20?'acquaintance':'stranger';
};

const addInteraction = (mem, type, aff=0, rom=0, tru=0, res=0, lst=0) => {
  mem.affection = clamp((mem.affection??0)+aff,-100,100);
  mem.romance   = clamp((mem.romance??0)+rom,-100,100);
  mem.trust     = clamp((mem.trust??0)+tru,-100,100);
  mem.respect   = clamp((mem.respect??0)+res,-100,100);
  mem.lust      = clamp((mem.lust??0)+lst,0,100);
  mem.interactions ??= [];
  pushCapped(mem.interactions,{type,time:mem.time,aff,rom,tru,res,lst},MAX_INTERACTIONS);
  _updateStage(mem);
};

export const initRelationship = (mem, charText='', userText='') => {
  const t = (charText+' '+userText).toLowerCase();
  if (/\b(wife|husband|married|spouse)\b/.test(t)) {
    mem.isMarried=true; mem.stage='partner'; mem.affection=85; mem.romance=90; mem.trust=80; mem.respect=75; mem.lust=70;
  } else if (/\b(girlfriend|boyfriend|lover|dating|partner)\b/.test(t)) {
    mem.stage='lover'; mem.affection=75; mem.romance=80; mem.trust=65; mem.respect=60; mem.lust=70;
  } else if (/\b(mom|mother|mama)\b/.test(t)) {
    mem.familyRole='mom'; mem.stage='close'; mem.affection=75; mem.trust=90; mem.respect=85;
  } else if (/\b(sister|sibling)\b/.test(t)) {
    mem.familyRole='sister'; mem.stage='close'; mem.affection=65; mem.trust=80;
  } else if (/\b(best friend|close friend)\b/.test(t)) {
    mem.stage='close'; mem.affection=60; mem.trust=65;
  } else if (/\b(friend)\b/.test(t)) {
    mem.stage='friend'; mem.affection=35; mem.trust=40;
  }
};

// ─── MOOD ────────────────────────────────────────────────────
const MOOD_TRIGGERS = [
  {re:/\b(?:fight|insult(?:s|ed)?|yell(?:s|ed)?|scold(?:s|ed)?)\b/i,     mood:'angry',       intensity:75,reason:'conflict'},
  {re:/\b(?:break[\s-]?up|leave me)\b/i,               mood:'sad',         intensity:80,reason:'breakup'},
  {re:/\b(?:cry|cries|crying|sobbing|sob(?:s|bed)?)\b/i,                mood:'sad',         intensity:70,reason:'crying'},
  {re:/\b(?:laugh(?:s|ed|ing)?|funny|giggle[sd]?)\b/i,                   mood:'happy',       intensity:60,reason:'laughter'},
  {re:/\b(?:compliment[sd]?|you look (?:good|great|amazing|beautiful))\b/i,  mood:'happy',       intensity:65,reason:'compliment'},
  {re:/\b(?:date|dinner together|romantic dinner)\b/i,             mood:'excited',     intensity:70,reason:'date'},
  {re:/\b(?:hug(?:s|ged|ging)?|embrace[sd]?)\b/i,                          mood:'happy',       intensity:60,reason:'hug'},
  {re:/\b(?:kiss|cium).{0,15}(?:lips|mouth)\b/i, mood:'romantic',    intensity:85,reason:'lip kiss'},
  {re:/\b(?:kiss)(?:es|ed|ing)?\b/i,                    mood:'romantic',    intensity:70,reason:'kiss'},
  {re:/\b(?:hold hands|cuddle[sd]?|snuggle[sd]?)\b/i,        mood:'romantic',    intensity:65,reason:'romantic gesture'},
  {re:/\b(?:tired|exhausted|sleepy|worn out)\b/i,           mood:'tired',       intensity:60,reason:'fatigue'},
  {re:/\b(?:scared|frightened|terrified|afraid)\b/i,              mood:'scared',      intensity:70,reason:'fear'},
  {re:/\b(?:nervous|anxious|worried)\b/i,                mood:'nervous',     intensity:65,reason:'anxiety'},
  {re:/\b(?:jealous|envious)\b/i,                        mood:'jealous',     intensity:70,reason:'jealousy'},
  {re:/\b(?:calm(?:s|ed)?|relax(?:es|ed)?|at ease)\b/i,                   mood:'calm',        intensity:50,reason:'relaxing'},
  {re:/\b(?:embarrassed|blush(?:es|ed)?|shy(?:ly)?)\b/i,         mood:'embarrassed', intensity:60,reason:'embarrassment'},
  {re:/\b(?:happy|joyful|glad|delighted)\b/i,               mood:'happy',       intensity:70,reason:'positive'},
  {re:/\b(?:sad|unhappy|upset)\b/i,                                   mood:'sad',         intensity:70,reason:'negative'},
  {re:/\b(?:excited|enthusiastic|thrilled)\b/i,                  mood:'excited',     intensity:75,reason:'exciting'},
];
const INTIMATE_RE = /\b(?:touch(?:es|ed|ing)?|kiss(?:es|ed|ing)?|lick[sz]?|suck[sz]?|grab[sz]?|caress(?:es|ed)?|stroke[sz]?|rub[sz]?|fondle[sz]?|grope[sz]?)\b.{0,30}\b(?:neck|chest|breast[sz]?|nipple[sz]?|belly|thigh[sz]?|crotch|pussy|vagina|dick|cock|penis)\b/i;

const _setMood = (mem, mood, intensity, reason) => {
  if (mem.currentMood !== mood) {
    mem.previousMood = mem.currentMood; mem.previousMoodIntensity = mem.moodIntensity;
    mem.moodIntensity = clamp(intensity, 0, 100);
  } else { mem.moodIntensity = clamp((mem.moodIntensity??50)+Math.round(intensity*0.3),0,100); }
  mem.currentMood = mood; mem.moodReason = reason;
};

// ─── LOCATION ──────────────────────────────────────────────────
const LOCATIONS = {
  bedroom:     ['bedroom','bed room'],
  living_room: ['living room'],
  kitchen:     ['kitchen'],
  bathroom:    ['bathroom','toilet'],
  garage:      ['garage'],
  garden:      ['garden'],
  balcony:     ['balcony'],
  office:      ['office'],
  restaurant:  ['restaurant'],
  cafe:        ['cafe','coffee shop','coffeehouse'],
  cinema:      ['cinema','movie theater'],
  park:        ['park','city park'],
  beach:       ['beach','seaside'],
  hospital:    ['hospital','medical center'],
  hotel:       ['hotel'],
  mall:        ['mall','plaza'],
  car:         ['in the car','inside the car'],
  school:      ['school'],
  apartment:   ['apartment','flat'],
  rooftop:     ['rooftop','roof'],
};
const LOC_LIST = Object.entries(LOCATIONS)
  .flatMap(([canon,arr]) => arr.map(phrase=>({canon,phrase})))
  .sort((a,b)=>b.phrase.length-a.phrase.length);

const _detectLocation = (msg) => {
  const lower = msg.toLowerCase();
  const found = LOC_LIST.find(({phrase})=>lower.includes(phrase));
  if (found) return found.canon;
  const m = msg.match(/\b(?:in|at|to|into|towards)\s+(?:the\s+)?([a-zA-Z\s]{2,25})(?:\.|,|\n|$)/i);
  return m ? m[1].trim().toLowerCase().replace(/\s+/g,'_') : null;
};

const _moveTo = (mem, loc) => {
  if (!loc || loc===mem.location?.current) return;
  mem.location ??= {current:'unknown',previous:'',recent:[],enteredAt:'08:00'};
  if (mem.location.current && mem.location.current!=='unknown') {
    mem.location.recent ??= [];
    pushCapped(mem.location.recent, mem.location.current, MAX_RECENT_LOC);
    mem.location.previous = mem.location.current;
  }
  mem.location.current = loc; mem.location.enteredAt = mem.time;
};

// ─── MASTER PARSER ───────────────────────────────────────────
export const parseMessage = (mem, msg, role='user') => {
  if (!msg) return;

  // Clear justFinishedSex flag each new message
  mem.justFinishedSex = null;

  // ── Time ────────
  const advM = msg.match(/\b(?:skip|advance|fast.?forward)\s+(\d+)\s+(menit|jam|minutes?|hours?)\b/i);
  if (advM) { let m=Number(advM[1]); if(/jam|hour/i.test(advM[2]))m*=60; mem.time=minsToTime(timeToMins(mem.time)+m); }
  const setTM = msg.match(/\b(?:set time to|time is now)\s+(\d{1,2}:\d{2})\b/i);
  if (setTM) mem.time = setTM[1];
  if (/\b(?:next day|the next day|new day|next morning|sleep)\b/i.test(msg)) {
    mem.day = (mem.day??1)+1; _updatePregnancyPhase(mem);
  }

  // ── Location ────
  const newLoc = _detectLocation(msg);
  if (newLoc) _moveTo(mem, newLoc);

  // ── Food / Meals ─
  const eatM = msg.match(/\b(?:eat(?:ing)?|eating|having|breakfast|lunch|dinner|drink(?:ing)?|snack(?:king)?)\b.{0,40}?([a-zA-Z\s,]{3,30}?)(?:\s+(?:di|at|in)\s+([a-zA-Z\s]{2,20}))?(?:\.|,|\n|$)/i);
  if (eatM) {
    mem.mealHistory ??= [];
    pushCapped(mem.mealHistory,{time:mem.time,food:eatM[1]?.trim()??'something',location:eatM[2]?.trim()??mem.location?.current??'unknown',role},MAX_MEALS);
  }

  // ── Condom & position (during active sex) ──
  if (mem.currentSex?.active) {
    const who = role==='user'?'user':'char';
    if (/(put on|use|wear|slips?|rolls?)/i.test(msg)) { setCondom(mem,true,who); lockCondom(mem); }
    else if (/(remove|take off|pull off|dispose)/i.test(msg)) { disposeCondom(mem); }

    const POS = [
      [/doggy/i,'doggy'],
      [/missionary/i,'missionary'],
      [/cowgirl/i,'cowgirl'],
      [/reverse cowgirl/i,'reverse cowgirl'],
      [/spooning/i,'spooning'],
      [/standing/i,'standing'],
      [/\b69\b/,'69'],
      [/prone bone/i,'prone bone'],
    ];
    for (const [re,pos] of POS) {
      if (re.test(msg)) {
        mem.currentSex.currentPosition=pos;
        if (!mem.currentSex.positions.includes(pos)) mem.currentSex.positions.push(pos);
        break;
      }
    }
  }

  // ── Start sex ────
  if (/\b(?:start sex|making love|let'?s (?:fuck|have sex)|having sex|we have sex|sex starts?)\b/i.test(msg) && !mem.currentSex?.active) {
    startSex(mem,'partner',mem.location?.current);
    addInteraction(mem,'sex_start',5,10,2,0,20);
  }

  // ── Finish sex & cum ──
  if (mem.currentSex?.active) {
    const inside   = /cum inside|creampie|came inside|finish(?:ed)? inside/i.test(msg);
    const outside  = /cum outside|pull(?:ed|s)? out|finish(?:ed)? outside/i.test(msg);
    const inCondom = /cum (?:in|into) (?:the )?condom|finish(?:ed)? in (?:the )?condom/i.test(msg);
    const sexDone  = /\b(?:finish sex|sex (?:done|over|finished)|done having sex|stop(?:ped)? sex)\b/i.test(msg);

    if      (inside)   finishSex(mem,'inside');
    else if (outside)  finishSex(mem,'outside');
    else if (inCondom) finishSex(mem,'condom');
    else if (sexDone)  finishSex(mem,'none');
  }

  // ── Outfit ────────
  const outfitTarget = role==='user' ? 'outfitUser' : 'outfitChar';
  const outfit = mem[outfitTarget];
  if (/\b(?:take off|remove[sd]?|undress|strip(?:s|ped)?|pull(?:s|ed)? off)\b/i.test(msg)) {
    if (/\bbra\b/i.test(msg))                                    _removeItem(outfit,'bra');
    if (/\b(?:panties|underwear|thong)\b/i.test(msg))     _removeItem(outfit,'panties');
    if (/\b(?:shirt|blouse|top|t-shirt)\b/i.test(msg)) _removeItem(outfit,'upper');
    if (/\b(?:jeans|skirt|pants|shorts|trousers)\b/i.test(msg))  _removeItem(outfit,'lower');
    if (/\b(?:all|everything)\b/i.test(msg))               _removeItem(outfit,'all');
  }
  if (/\b(?:put on|wear[sd]?|dress(?:es)?|slip(?:s|ped)? on)\b/i.test(msg)) {
    if (/\bbra\b/i.test(msg))                                    _addItem(outfit,'bra');
    if (/\b(?:panties|underwear)\b/i.test(msg))              _addItem(outfit,'panties');
    if (/\b(?:baju|kemeja|shirt|blous[ez])\b/i.test(msg))       _addItem(outfit,'upper','shirt');
    if (/\b(?:celana|jeans|pants)\b/i.test(msg))                _addItem(outfit,'lower','jeans');
    if (/\b(?:skirt)\b/i.test(msg))                         _addItem(outfit,'lower','skirt');
    if (/\b(?:dress|gown)\b/i.test(msg))                        { _addItem(outfit,'upper','dress'); _addItem(outfit,'lower','dress'); }
  }

  // ── Relationship ──
  if (/\b(?:kiss(?:es|ed|ing)?)\b/i.test(msg))                  addInteraction(mem,'kiss',3,5,1,0,5);
  if (/\b(?:hug(?:s|ged|ging)?|embrace[sd]?)\b/i.test(msg))                  addInteraction(mem,'hug',4,3,2,0,2);
  if (/\b(?:angry|fight(?:ing)?|argue[sd]?|argument)\b/i.test(msg)) addInteraction(mem,'conflict',-5,-3,-3,-2,0);
  if (/\b(?:thank(?:s|ed)?|appreciate[sd]?)\b/i.test(msg))         addInteraction(mem,'thanks',2,1,2,1,0);
  if (/\b(?:love you|i love)\b/i.test(msg))    addInteraction(mem,'love',5,7,2,0,3);
  if (/\b(?:flirt(?:s|ed|ing)?)\b/i.test(msg))                       addInteraction(mem,'flirt',2,4,0,0,6);
  if (/\b(?:married|wedding|propose[sd]?|marry)\b/i.test(msg))      { mem.isMarried=true; addInteraction(mem,'married',20,20,15,10,5); _updateStage(mem); }

  // ── Mood ──────────
  if (INTIMATE_RE.test(msg)) { _setMood(mem,'horny',85,'intimate touch'); }
  else { for (const t of MOOD_TRIGGERS) { if(t.re.test(msg)){ _setMood(mem,t.mood,t.intensity,t.reason); break; } } }

  // ── Pregnancy (male-perspective trigger) ──────────────────
  // Enable/disable pregnancy feature
  if (/\b(?:enable|turn on|activate)\s+(?:pregnancy)\b|pregnancy on\b/i.test(msg)) mem.pregnancyEnabled=true;
  if (/\b(?:disable|turn off|deactivate)\s+(?:pregnancy)\b|pregnancy off\b/i.test(msg)) { mem.pregnancyEnabled=false; mem.pregnancyRequested=false; }

  // Male user trigger — words expressing wish to impregnate
  // Triggers after sex (cum inside already processed in finishSex)
  // Also marks intent for future sessions
  const pregnancyWish =
    /(?:sperm|semen|seed|cum).{0,30}(?:egg|pregnant|impregnate)/i.test(msg) ||
    /(?:hopefully|i hope|i wish).{0,30}(?:pregnant|impregnate|get.*pregnant)/i.test(msg) ||
    /\b(?:i want to get you pregnant|make you pregnant|want you pregnant)\b/i.test(msg) ||
    /\b(?:i want to get you pregnant|hope my seed|hope my cum)\b/i.test(msg);

  if (pregnancyWish) {
    mem.pregnancyRequested = true;
    if (!mem.pregnancyEnabled) mem.pregnancyEnabled = true;
    // If sex just ended with cum inside, trigger immediately
    if (mem.lastSex?.cum === 'inside' && mem.lastSex?.day === mem.day && !mem.pregnancy) {
      _startPregnancy(mem);
    }
  }

  // Birth
  if (/\b(?:give birth|deliver(?:y|ed)?|labor|born)\b/i.test(msg) && mem.pregnancy?.waterBroken) {
    const nm = msg.match(/\b(?:name|name)\s+(?:him|her|it|baby)?\s*(\w+)/i);
    let gender='unknown';
    if (/\b(?:boy|son|boy|male)\b/i.test(msg)) gender='boy';
    else if (/\b(?:girl|daughter|girl|female)\b/i.test(msg)) gender='girl';
    _deliverBaby(mem, nm?.[1], gender);
  }

  // Schedule
  const schedM = msg.match(/\b(?:remind(?:er)?|schedule|add event)\b.{0,30}?(\w[\w\s]{1,20}?)\s+(?:at|at)\s+(\d{1,2}:\d{2})\b/i);
  if (schedM) { mem.schedules??=[]; pushCapped(mem.schedules,{event:schedM[1].trim(),time:schedM[2]},MAX_SCHEDULES); }
};

// ─── BUILD LIVE CONTEXT ──────────────────────────────────────
export const buildLive = (mem) => {
  const L = [];
  const h = parseInt((mem.time??'08:00').split(':')[0],10);

  // ── Natural light description based on time of day ──────────
  const LIGHT = {
    midnight: 'pitch dark, no light through curtains',
    dawn:     'faint reddish glow begins seeping through the curtains',
    morning:  'warm sunlight streaming through the curtains',
    afternoon:'bright daylight, curtains glowing white',
    evening:  'golden-orange light fading behind the curtains',
    night:    'no natural light, curtains dark',
  };
  const lightDesc = LIGHT[getTimeCat(h)] ?? 'unknown';

  L.push(`╔══ MEMORY STATE ══╗`);
  L.push(`[TIME]  ${mem.time} (${getTimeCat(h).toUpperCase()}) · Day ${mem.day}`);
  L.push(`[LIGHT] ${lightDesc}`);
  L.push(`  → char can perceive time of day from this light without checking clock`);
  L.push(`[LOC]   ${mem.location?.current??'unknown'}${mem.location?.previous?` ← ${mem.location.previous}`:''}`);
  if (mem.location?.recent?.length) L.push(`  visited: ${mem.location.recent.slice(-3).join(' → ')}`);

  L.push(`[OUTFIT CHAR] ${outfitStr(mem.outfitChar)}`);
  L.push(`[OUTFIT USER] ${outfitStr(mem.outfitUser)}`);

  // Food / meals
  if (mem.mealHistory?.length) {
    L.push(`[MEALS]`);
    for (const m of mem.mealHistory.slice(-3)) L.push(`  ${m.time} · ${m.food} @ ${m.location}`);
  }

  L.push('');

  // ── Post-sex outfit restore note ──
  // (justFinishedSex is cleared by parseMessage on next turn)
  if (mem.justFinishedSex) {
    const jf = mem.justFinishedSex;
    if (jf.charRestored?.length) {
      L.push(`[POST-SEX] Char just put back on: ${jf.charRestored.join(', ')} (picked up from floor / pulled back up)`);
    }
    if (jf.userRestored?.length) {
      L.push(`[POST-SEX] User just put back on: ${jf.userRestored.join(', ')}`);
    }
  }

  // Sex aktif
  if (mem.currentSex?.active) {
    const cs = mem.currentSex;
    L.push(`[SEX ACTIVE] since ${cs.startTime} @ ${cs.location}`);
    L.push(`  position now : ${cs.currentPosition??'none'}`);
    if (cs.positions.length) L.push(`  positions used: ${cs.positions.join(' → ')}`);
    L.push(`  condom: ${cs.condom?'ON':'OFF'}${cs.lock?' [LOCKED]':''}${cs.condomBy?` (by ${cs.condomBy})`:''}`);
    L.push(`  char outfit at start: ${outfitStr(cs.outfitCharStart)}`);
    L.push(`  ⚠ condom = OFF unless explicitly put on`);
  } else {
    L.push(`[SEX] none active · total sessions: ${mem.sexCount??0}`);
  }

  // Sex history — all sessions, full detail
  if (mem.sexHistory?.length) {
    const todayCount = mem.sexHistory.filter(s=>s.day===mem.day).length;
    L.push(`[SEX HISTORY] ${mem.sexHistory.length} sessions total · today: ${todayCount}×`);
    for (const sx of mem.sexHistory) {
      L.push(`  Day${sx.day} ${sx.timeStart}-${sx.timeEnd} @ ${sx.location}`);
      L.push(`    pos: ${sx.positions.join("+")} · cum: ${sx.cum} · condom: ${sx.condomUsed?"YES":"NO"}`);
      L.push(`    char: ${outfitStr(sx.outfitCharBefore)} → after: ${outfitStr(sx.outfitCharAfter)}`);
      if (sx.charRemovedDuringSex?.length) L.push(`    stripped: ${sx.charRemovedDuringSex.join(", ")}`);
    }
  }
  L.push('');

  // Relationship
  L.push(`[REL] ${mem.isMarried?'MARRIED PARTNER':(mem.stage??'stranger').toUpperCase()}${mem.familyRole?` (${mem.familyRole})`:''}`);
  L.push(`  Aff:${mem.affection} · Rom:${mem.romance} · Tru:${mem.trust} · Res:${mem.respect} · Lust:${mem.lust}`);
  if (mem.interactions?.length) {
    for (const it of mem.interactions.slice(-5)) {
      L.push(`  [${it.time}] ${it.type} A:${it.aff>=0?'+':''}${it.aff} R:${it.rom>=0?'+':''}${it.rom} L:${it.lst>=0?'+':''}${it.lst}`);
    }
  }

  L.push(`[MOOD] ${(mem.currentMood??'neutral').toUpperCase()} ${mem.moodIntensity??50}%${mem.moodReason?` · ${mem.moodReason}`:''}`);
  if (mem.previousMood) L.push(`  prev: ${mem.previousMood} ${mem.previousMoodIntensity}%`);

  // Pregnancy
  if (mem.pregnancy) {
    const pd=(mem.day??1)-mem.pregnancy.dayStarted+1;
    L.push(`[PREG] day ${pd} · phase: ${mem.pregnancy.bellyPhase}${mem.pregnancy.waterBroken?' · ⚠ WATER BROKE':''}`);
  } else {
    L.push(`[PREG] none${mem.pregnancyEnabled?' (feature ON)':' (feature OFF)'}`);
  }
  if (mem.children?.length) L.push(`[CHILDREN] ${mem.children.map(c=>`${c.name}(${c.gender})`).join(', ')}`);

  // Schedule & reminders — all today's events, urgent flag if within 60 min
  const nowM = timeToMins(mem.time);
  const todaySched = (mem.schedules??[]);
  if (todaySched.length) {
    L.push(`[SCHEDULE]`);
    for (const s of todaySched) {
      const diff = timeToMins(s.time) - nowM;
      if (diff >= 0 && diff <= 60) {
        L.push(`  ⚠ SOON (${diff}min) → ${s.event} at ${s.time} — char should remind user NOW`);
      } else if (diff > 60) {
        L.push(`  upcoming: ${s.event} at ${s.time} (${diff}min away)`);
      } else {
        L.push(`  past: ${s.event} was at ${s.time}`);
      }
    }
  }

  L.push('');
  L.push(`[RULES]`);
  L.push(`  · Condom = OFF unless explicitly put on. Never assume it's on.`);
  L.push(`  · Outfit auto-restored after sex. Char picks up clothes naturally.`);
  L.push(`  · Pregnancy: only if pregnancyEnabled=true AND user expressed wish to impregnate.`);
  L.push(`  · Char perceives time of day from LIGHT desc — no need to check clock.`);
  L.push(`  · If schedule shows ⚠ SOON — char must proactively remind user about it.`);
  L.push(`  · Use sex history for continuity (remember location, positions, count per day).`);
  L.push(`  · Mood affects char's tone, words, and energy level in responses.`);
  L.push(`╚══════════════════╝`);

  return L.join('\n');
};
