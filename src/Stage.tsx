// ============================================================
// Stage.tsx – Chub AI Stage | Memory Engine Integration
// ============================================================
// Place memory.js in the same src/ folder, then commit both.
// ============================================================

import { ReactElement } from 'react';
import {
  StageBase,
  StageResponse,
  InitResponse,
  UserMessage,
  BotMessage,
  InitData,
} from '@chub-ai/stages-ts';

// Import all functions from memory.js
import { defaultMemory, parseMessage, buildLive, initRelationship } from './memory.js';

// TypeScript type for memory state
type Memory = ReturnType<typeof defaultMemory>;

// ─── STAGE CLASS ─────────────────────────────────────────────
export class Stage extends StageBase<Memory, never, never, never> {

  private mem: Memory;

  // ── Called once when chat is opened ──
  constructor(data: InitData<Memory, never, never, never>) {
    super(data);

    // Load saved memory, or create fresh
    this.mem = data.messageState ?? defaultMemory();

    // Auto-detect relationship from character description
    if (!data.messageState) {
      const charText = [
        data.characters?.[0]?.name ?? '',
        data.characters?.[0]?.persona ?? '',
        data.characters?.[0]?.description ?? '',
        data.characters?.[0]?.scenario ?? '',
      ].join(' ');

      const userText = data.users?.[0]?.persona ?? '';
      initRelationship(this.mem, charText, userText);
    }
  }

  // ── Initial load ──
  async load(): Promise<Partial<InitResponse<Memory>>> {
    return {
      success:      true,
      messageState: this.mem,
    };
  }

  // ── Restore state when swiping to an older message ──
  async setState(state: Memory): Promise<void> {
    this.mem = state ?? defaultMemory();
  }

  // ── Called BEFORE user message is sent to the AI ──
  async beforePrompt(
    userMessage: UserMessage
  ): Promise<Partial<StageResponse<Memory, never>>> {

    const msg = typeof userMessage.content === 'string'
      ? userMessage.content
      : '';

    // Parse user message and update memory
    parseMessage(this.mem, msg, 'user');

    // Build live context block that the AI will see
    const liveContext = buildLive(this.mem);

    return {
      messageState:          { ...this.mem },
      systemPromptExtension: liveContext,
    };
  }

  // ── Called AFTER the AI responds ──
  async afterResponse(
    botMessage: BotMessage
  ): Promise<Partial<StageResponse<Memory, never>>> {

    const msg = typeof botMessage.content === 'string'
      ? botMessage.content
      : '';

    // Parse AI response and update memory
    parseMessage(this.mem, msg, 'char');

    return {
      messageState: { ...this.mem },
    };
  }

  // ── UI render (empty = runs silently in background) ──
  render(): ReactElement {
    return <></>;
  }
}
