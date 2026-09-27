import type { AiEndpoint } from './ai-usage';

// Output-token caps per endpoint. Sized well above normal replies; tune from the
// ai_usage log's completionTokens. plan: keep ≤ DeepSeek's documented maximum.
export const AI_MAX_TOKENS: Record<AiEndpoint, number> = {
  suggest:            4000,  // 2026-09-27: a 6-city request went past 2000 (another run: 1047)
  plan:               32000, // 2026-09-27: 6 cities / 13 nights used 12,529; ~250 tok/s → ~2 min worst case, under Vercel's 300 s
  suggestAttractions: 2000,
  companionSuggest:   1000,
};

// Per-user request limits (existing rateLimitMiddleware, Redis-backed, fails open).
// These bound DeepSeek spend even where karma doesn't (suggest-attractions with isFollowUp: true is free).
export const AI_RATE_LIMIT_WINDOW_SECONDS      = 3600;
export const AI_SUGGEST_RATE_LIMIT             = 20;
export const AI_PLAN_RATE_LIMIT                = 20;
export const AI_SUGGEST_ATTRACTIONS_RATE_LIMIT = 30;
