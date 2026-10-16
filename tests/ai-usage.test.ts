jest.mock('../src/lib/analytics', () => ({ capture: jest.fn() }));

import { logger } from '../src/lib/logger';
import { capture } from '../src/lib/analytics';
import { logAiUsage } from '../src/lib/ai-usage';

describe('logAiUsage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs an ai_usage event with userId, token and cache counts', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    logAiUsage('plan', 'deepseek-v4-flash', {
      prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500,
      prompt_cache_hit_tokens: 1000, prompt_cache_miss_tokens: 200,
    }, 'u-1');
    expect(info).toHaveBeenCalledWith({
      event: 'ai_usage', endpoint: 'plan', model: 'deepseek-v4-flash', userId: 'u-1',
      promptTokens: 1200, completionTokens: 300, totalTokens: 1500,
      cacheHitTokens: 1000, cacheMissTokens: 200,
    });
  });

  it('sends a $ai_generation event attributed to the user', () => {
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    logAiUsage('suggest', 'deepseek-v4-flash', { prompt_tokens: 10, completion_tokens: 5, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6 }, 'u-1');
    expect(capture).toHaveBeenCalledWith('u-1', '$ai_generation', {
      $ai_model: 'deepseek-v4-flash', $ai_provider: 'deepseek',
      $ai_input_tokens: 10, $ai_output_tokens: 5,
      endpoint: 'suggest', cacheHitTokens: 4, cacheMissTokens: 6,
    });
  });

  it('does nothing when the response has no usage object', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    logAiUsage('suggest', 'deepseek-v4-flash', undefined, 'u-1');
    logAiUsage('suggest', 'deepseek-v4-flash', null, 'u-1');
    expect(info).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
