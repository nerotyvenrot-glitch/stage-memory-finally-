// ============================================================
// Stage.tsx – Chub AI Stage | Memory Engine Integration v4
// ============================================================

import { ReactElement } from 'react';
import {
  StageBase,
  StageResponse,
  LoadResponse,
  Message,
} from '@chub-ai/stages-ts';

// @ts-ignore
import {
  defaultMemory,
  parseMessage,
  buildLive,
  initRelationship,
  detectOutfit,
  applyOutfitFallback,
} from './memory.js';

type Memory = any;

export class Stage extends StageBase<Memory, any, any, any> {

  private mem: Memory;

  constructor(data: any) {
    super(data);
    this.mem = data.messageState ?? defaultMemory();

    if (!data.messageState) {

      // ── 1. Build text sources ─────────────────────────────
      const charText = [
        data.characters?.[0]?.name        ?? '',
        data.characters?.[0]?.persona     ?? '',
        data.characters?.[0]?.description ?? '',
        data.characters?.[0]?.scenario    ?? '',
      ].join(' ');

      const userText = data.users?.[0]?.persona ?? '';

      // ── 2. Relationship from description ──────────────────
      initRelationship(this.mem, charText, userText);

      // ── 3. Detect CHAR outfit from description/scenario ───
      detectOutfit(this.mem, charText, 'char');

      // ── 4. Detect USER outfit from persona ────────────────
      detectOutfit(this.mem, userText, 'user');

      // ── 5. Read Initial Message ───────────────────────────
      const history: any[] =
        data.chatHistory    ??
        data.messages       ??
        data.chat           ??
        data.messageHistory ?? [];

      if (Array.isArray(history) && history.length > 0) {
        const firstCharMsg = history.find((m: any) =>
          m?.role === 'assistant' ||
          m?.role === 'char'      ||
          m?.isBot === true       ||
          m?.author === 'char'    ||
          true
        );
        const content =
          (typeof firstCharMsg?.content === 'string' ? firstCharMsg.content : '') ||
          (typeof firstCharMsg?.message === 'string' ? firstCharMsg.message : '') ||
          (typeof firstCharMsg?.text    === 'string' ? firstCharMsg.text    : '');

        if (content) {
          // Detect outfit from Initial Message (adds to what description found)
          detectOutfit(this.mem, content, 'char');
          // Parse rest (location, mood, etc.)
          parseMessage(this.mem, content, 'char');
        }
      }

      // ── 6. Fallback if outfit still empty ─────────────────
      // Prevents AI from thinking char/user is naked by default
      applyOutfitFallback(this.mem, 'char');
      applyOutfitFallback(this.mem, 'user');
    }
  }

  async load(): Promise<Partial<LoadResponse<any, any, Message>>> {
    return { success: true, messageState: this.mem };
  }

  async setState(state: Memory): Promise<void> {
    this.mem = state ?? defaultMemory();
  }

  async beforePrompt(userMessage: Message): Promise<Partial<StageResponse<Memory, any>>> {
    const msg = typeof userMessage.content === 'string' ? userMessage.content : '';
    parseMessage(this.mem, msg, 'user');
    return {
      messageState:    { ...this.mem },
      stageDirections: buildLive(this.mem),
    };
  }

  async afterResponse(message: Message): Promise<Partial<StageResponse<Memory, any>>> {
    const msg = typeof message.content === 'string' ? message.content : '';
    parseMessage(this.mem, msg, 'char');
    return { messageState: { ...this.mem } };
  }

  render(): ReactElement {
    return <></>;
  }
}
