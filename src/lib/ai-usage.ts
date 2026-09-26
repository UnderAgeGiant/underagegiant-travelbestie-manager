import { logger } from './logger';

export type AiEndpoint = 'suggest' | 'plan' | 'suggestAttractions' | 'companionSuggest';

// Structural subset of the OpenAI-SDK CompletionUsage plus DeepSeek's cache counters,
// which the SDK's own type doesn't declare.
export interface AiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export function logAiUsage(endpoint: AiEndpoint, model: string, usage: AiUsage | null | undefined): void {
  if (!usage) return;
  logger.info({
    event:            'ai_usage',
    endpoint,
    model,
    promptTokens:     usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens:      usage.total_tokens,
    cacheHitTokens:   usage.prompt_cache_hit_tokens,
    cacheMissTokens:  usage.prompt_cache_miss_tokens,
  });
}
