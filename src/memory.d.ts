// ============================================================
// memory.d.ts – TypeScript declaration file for memory.js
// Place this file in src/ alongside memory.js
// ============================================================

export type MemoryState = Record<string, any>;

/** Creates a fresh default memory object */
export function defaultMemory(): MemoryState;

/**
 * Parses a chat message and updates memory accordingly.
 * @param mem   - Current memory state
 * @param msg   - Message text to parse
 * @param role  - 'char' for AI response, 'user' for user message
 */
export function parseMessage(mem: MemoryState, msg: string, role: 'char' | 'user'): void;

/** Builds the live context block injected into the AI's system prompt */
export function buildLive(mem: MemoryState): string;

/**
 * Auto-detects relationship type from character/user description text.
 * Run once on first load.
 */
export function initRelationship(mem: MemoryState, charText: string, userText: string): void;

/**
 * Detects outfit items from any text and sets them in memory.
 * Only fills empty outfit layers — won't override already-tracked items.
 * @param target - 'char' (default) or 'user'
 */
export function detectOutfit(mem: MemoryState, text: string, target?: 'char' | 'user'): void;

/**
 * Applies fallback outfit ('casual_clothes') if outfit is still empty
 * after all detection attempts.
 * @param target - 'char' (default) or 'user'
 */
export function applyOutfitFallback(mem: MemoryState, target?: 'char' | 'user'): void;
