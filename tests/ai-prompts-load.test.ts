jest.mock('../src/lib/deepseek', () => ({ deepseekClient: {} }));

import { loadPrompts } from '../src/controllers/ai.controller';

describe('loadPrompts (P4)', () => {
  it('parses the prompts file once, then serves the same object', () => {
    const first = loadPrompts();
    // Two separate JSON.parse results are never the same reference, so identity proves memoization.
    expect(loadPrompts()).toBe(first);
    expect(first.plan.system).toContain('ARIA');
  });
});
