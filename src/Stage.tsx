// ============================================================
// Stage.tsx – Chub AI Stage | Memory Engine Integration v3
// ============================================================

import { ReactElement } from 'react';
import {
  StageBase,
  StageResponse,
  LoadResponse,
  Message,
} from '@chub-ai/stages-ts';

// @ts-ignore
import { defaultMemory, parseMessage, buildLive, initRelationship, detectInitialOutfit } from './memory.js';

type Memory = any;

export class Stage extends StageBase<Memory, any, any, any> {

  private mem: Memory;

  constructor(data: any) {
    super(data);

    this.mem = data.messageState ?? defaultMemory();

    if (!data.messageState) {
      // Auto-detect relationship from character description
      const charText = [
        data.characters?.[0]?.name        ?? '',
        data.characters?.[0]?.persona     ?? '',
        data.characters?.[0]?.description ?? '',
        data.characters?.[0]?.scenario    ?? '',
      ].join(' ');
      const userText = data.users?.[0]?.persona ?? '';
      initRelationship(this.mem, charText, userText);

      // ── READ INITIAL MESSAGE ──────────────────────────────
      const history: any[] =
        data.chatHistory    ??
        data.messages       ??
        data.chat           ??
        data.messageHistory ?? [];

      if (Array.isArray(history) && history.length > 0) {
        // Find the first CHAR message (not user)
        // Chub may use role:'assistant', 'char', or isBot:true
        const firstCharMsg = history.find((m: any) =>
          m?.role === 'assistant' ||
          m?.role === 'char'      ||
          m?.isBot === true       ||
          m?.author === 'char'    ||
          // fallback: just use index 0 if no role info
          true
        );

        const content =
          (typeof firstCharMsg?.content === 'string' ? firstCharMsg.content : '') ||
          (typeof firstCharMsg?.message === 'string' ? firstCharMsg.message : '') ||
          (typeof firstCharMsg?.text    === 'string' ? firstCharMsg.text    : '');

        if (content) {
          // 1. Detect initial outfit from description
          detectInitialOutfit(this.mem, content);
          // 2. Parse rest of Initial Message (location, mood, etc.)
          parseMessage(this.mem, content, 'char');
        }
      }
      // ─────────────────────────────────────────────────────
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
