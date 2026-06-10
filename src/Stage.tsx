// ============================================================
// Stage.tsx – Chub AI Stage | Memory Engine Integration
// ============================================================

import { ReactElement } from 'react';
import {
  StageBase,
  StageResponse,
  LoadResponse,
  Message,
} from '@chub-ai/stages-ts';

// @ts-ignore — memory.js is plain JS, no type declarations needed
import { defaultMemory, parseMessage, buildLive, initRelationship } from './memory.js';

type Memory = any;

// ─── STAGE CLASS ─────────────────────────────────────────────
export class Stage extends StageBase<Memory, any, any, any> {

  private mem: Memory;

  constructor(data: any) {
    super(data);

    // Load saved memory, or create fresh
    this.mem = data.messageState ?? defaultMemory();

    // Auto-detect relationship from character description on first load
    if (!data.messageState) {
      const charText = [
        data.characters?.[0]?.name         ?? '',
        data.characters?.[0]?.persona      ?? '',
        data.characters?.[0]?.description  ?? '',
        data.characters?.[0]?.scenario     ?? '',
      ].join(' ');
      const userText = data.users?.[0]?.persona ?? '';
      initRelationship(this.mem, charText, userText);
    }
  }

  // ── Initial load ──
  async load(): Promise<Partial<LoadResponse<Memory>>> {
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
  async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<Memory, any>>> {
    const msg = typeof userMessage.content === 'string'
      ? userMessage.content : '';

    parseMessage(this.mem, msg, 'user');

    const liveContext = buildLive(this.mem);

    return {
      messageState:   { ...this.mem },
      stageDirections: liveContext,
    };
  }

  // ── Called AFTER the AI responds ──
  async afterResponse(message: Message): Promise<Partial<StageResponse<Memory, any>>> {
    const msg = typeof message.content === 'string'
      ? message.content : '';

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
