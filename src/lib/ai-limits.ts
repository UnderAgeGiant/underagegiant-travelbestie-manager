import type { AiEndpoint } from './ai-usage';

// Output-token caps per endpoint. Sized well above normal replies; tune from the
// ai_usage log's completionTokens. plan: keep ≤ DeepSeek's documented maximum.
export const AI_MAX_TOKENS: Record<AiEndpoint, number> = {
  suggest:            2000,
  plan:               8000,
  suggestAttractions: 2000,
  companionSuggest:   1000,
};

// Per-user request limits (existing rateLimitMiddleware, Redis-backed, fails open).
// These bound DeepSeek spend even where karma doesn't (suggest-attractions with isFollowUp: true is free).
export const AI_RATE_LIMIT_WINDOW_SECONDS      = 3600;
export const AI_SUGGEST_RATE_LIMIT             = 20;
export const AI_PLAN_RATE_LIMIT                = 20;
export const AI_SUGGEST_ATTRACTIONS_RATE_LIMIT = 30;
