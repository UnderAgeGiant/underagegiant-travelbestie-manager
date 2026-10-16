import { logger } from './logger';
import { capture } from './analytics';

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

export function logAiUsage(
  endpoint: AiEndpoint,
  model: string,
  usage: AiUsage | null | undefined,
  distinctId: string | null,
): void {
  if (!usage) return;
  logger.info({
    event:            'ai_usage',
    endpoint,
    model,
    userId:           distinctId,
    promptTokens:     usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens:      usage.total_tokens,
    cacheHitTokens:   usage.prompt_cache_hit_tokens,
    cacheMissTokens:  usage.prompt_cache_miss_tokens,
  });
  // PostHog LLM-analytics event shape ($ai_* properties).
  capture(distinctId, '$ai_generation', {
    $ai_model:         model,
    $ai_provider:      'deepseek',
    $ai_input_tokens:  usage.prompt_tokens,
    $ai_output_tokens: usage.completion_tokens,
    endpoint,
    cacheHitTokens:    usage.prompt_cache_hit_tokens,
    cacheMissTokens:   usage.prompt_cache_miss_tokens,
  });
}
