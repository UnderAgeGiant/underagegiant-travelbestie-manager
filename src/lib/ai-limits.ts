import type { AiEndpoint } from './ai-usage';

// Output-token caps per endpoint. Sized well above normal replies; tune from the
// ai_usage log's completionTokens. plan: keep ≤ DeepSeek's documented maximum.
export const AI_MAX_TOKENS: Record<AiEndpoint, number> = {
  suggest:            2000,
  plan:               8000,
  suggestAttractions: 2000,
  companionSuggest:   1000,
};
