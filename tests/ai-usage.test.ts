import { logger } from '../src/lib/logger';
import { logAiUsage } from '../src/lib/ai-usage';

describe('logAiUsage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs an ai_usage event with token and cache counts', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    logAiUsage('plan', 'deepseek-v4-flash', {
      prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500,
      prompt_cache_hit_tokens: 1000, prompt_cache_miss_tokens: 200,
    });
    expect(info).toHaveBeenCalledWith({
      event: 'ai_usage', endpoint: 'plan', model: 'deepseek-v4-flash',
      promptTokens: 1200, completionTokens: 300, totalTokens: 1500,
      cacheHitTokens: 1000, cacheMissTokens: 200,
    });
  });

  it('does nothing when the response has no usage object', () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    logAiUsage('suggest', 'deepseek-v4-flash', undefined);
    logAiUsage('suggest', 'deepseek-v4-flash', null);
    expect(info).not.toHaveBeenCalled();
  });
});
