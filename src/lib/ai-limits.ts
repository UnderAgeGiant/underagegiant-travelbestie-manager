import type { AiEndpoint } from './ai-usage';

// Output-token caps per endpoint. Sized well above normal replies; tune from the
// ai_usage log's completionTokens. plan: keep ≤ DeepSeek's documented maximum.
export const AI_MAX_TOKENS: Record<AiEndpoint, number> = {
  suggest:            8000,  // 2026-10-09: now 8 options per call (served 2 at a time); 4000 truncated with the old avoid-list prompt. 2026-09-27: 2 options, 6 cities went past 2000
  plan:               32000, // 2026-09-27: 6 cities / 13 nights used 12,529; ~250 tok/s → ~2 min worst case, under Vercel's 300 s
  suggestAttractions: 2000,
  companionSuggest:   1000,
};

/** /ai/suggest: one DeepSeek call asks for SUGGEST_BATCH_SIZE options; each response shows SUGGEST_PAGE_SIZE, the rest are queued (Redis) for the next "Generar nuevas opciones" clicks. */
export const SUGGEST_BATCH_SIZE = 8;
export const SUGGEST_PAGE_SIZE  = 2;

// Per-user request limits (existing rateLimitMiddleware, Redis-backed, fails open).
// These bound DeepSeek spend even where karma doesn't (suggest-attractions with isFollowUp: true is free).
export const AI_RATE_LIMIT_WINDOW_SECONDS      = 3600;
export const AI_SUGGEST_RATE_LIMIT             = 20;
export const AI_PLAN_RATE_LIMIT                = 20;
export const AI_SUGGEST_ATTRACTIONS_RATE_LIMIT = 30;
