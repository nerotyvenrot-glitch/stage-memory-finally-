// ============================================================
// memory.d.ts – TypeScript declaration file for memory.js
// Place this file in src/ alongside memory.js
// ============================================================

export interface OutfitState {
  upper:     string[];
  lower:     string[];
  legs:      string[];
  underwear: { bra: boolean; panties: boolean };
}

export interface LocationState {
  current:   string;
  previous:  string;
  recent:    string[];
  enteredAt: string;
}

export interface InteractionEntry {
  type: string;
  time: string;
  aff:  number;
  rom:  number;
  tru:  number;
  res:  number;
  lst:  number;
}

export interface SexEntry {
  day:              number;
  timeStart:        string;
  timeEnd:          string;
  location:         string;
  partner:          string;
  condomUsed:       boolean;
  cum:              'inside' | 'outside' | 'condom' | 'none';
  positions:        string[];
  outfitCharBefore: OutfitState | null;
  outfitCharAfter:  OutfitState | null;
  outfitUserBefore: OutfitState | null;
  outfitUserAfter:  OutfitState | null;
  charRemovedDuringSex: string[];
  userRemovedDuringSex: string[];
}

export interface PregnancyState {
  dayStarted:  number;
  bellyPhase:  'early' | 'growing' | 'full';
  waterBroken: boolean;
}

export interface ChildEntry {
  name:    string;
  gender:  'boy' | 'girl' | 'unknown';
  bornDay: number;
}

export interface MealEntry {
  time:     string;
  food:     string;
  location: string;
  role:     'char' | 'user';
}

export interface ScheduleEntry {
  event: string;
  time:  string;
}

export interface MemoryState {
  // Time
  time:      string;
  day:       number;
  schedules: ScheduleEntry[];

  // Location
  location: LocationState;

  // Outfit
  outfitChar:   OutfitState;
  outfitUser:   OutfitState;
  outfitNaked?: boolean;

  // Relationship
  affection:    number;
  romance:      number;
  trust:        number;
  respect:      number;
  lust:         number;
  stage:        string;
  isMarried:    boolean;
  familyRole:   string;
  interactions: InteractionEntry[];

  // Mood
  currentMood:           string;
  moodIntensity:         number;
  moodReason:            string;
  previousMood:          string;
  previousMoodIntensity: number;

  // Sex
  currentSex:  Record<string, any> | null;
  lastSex:     SexEntry | null;
  sexHistory:  SexEntry[];
  sexCount:    number;
  lastSexDay:  number;

  // Pregnancy
  pregnancyEnabled:   boolean;
  pregnancyRequested: boolean;
  pregnancy:          PregnancyState | null;
  children:           ChildEntry[];

  // Food
  mealHistory: MealEntry[];

  // Post-sex restore note
  justFinishedSex: {
    charRestored: string[];
    userRestored: string[];
    location:     string;
  } | null;

  objects: Record<string, any>;
}

/** Creates a fresh default memory object */
export function defaultMemory(): MemoryState;

/**
 * Parses a chat message and updates memory accordingly.
 * @param mem  - Current memory state
 * @param msg  - Message text to parse
 * @param role - 'char' for AI response, 'user' for user message
 */
export function parseMessage(mem: MemoryState, msg: string, role: 'char' | 'user'): void;

/** Builds the live context block injected into the AI system prompt */
export function buildLive(mem: MemoryState): string;

/**
 * Auto-detects relationship type from character/user description text.
 * Run once on first load.
 */
export function initRelationship(mem: MemoryState, charText: string, userText: string): void;

/**
 * Detects outfit items from any text and applies them to memory.
 * Only fills empty outfit layers — will not override already-tracked items.
 * @param target - 'char' (default) or 'user'
 */
export function detectOutfit(mem: MemoryState, text: string, target?: 'char' | 'user'): void;

/**
 * Applies fallback outfit ('casual_clothes') if outfit is still empty
 * after all detection attempts. Prevents AI thinking char is naked by default.
 * @param target - 'char' (default) or 'user'
 */
export function applyOutfitFallback(mem: MemoryState, target?: 'char' | 'user'): void;
