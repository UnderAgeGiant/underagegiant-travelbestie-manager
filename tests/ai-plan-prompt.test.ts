const create = jest.fn();

jest.mock('../src/lib/deepseek', () => ({
  deepseekClient: { chat: { completions: { create: (...args: any[]) => create(...args) } } },
}));

import { AiController } from '../src/controllers/ai.controller';
import type { AiPlanBody } from '../src/schemas/ai.schemas';

const body: AiPlanBody = {
  preferences:    'historia y arte',
  selectedOption: { id: 1, title: 'Clásicos de Europa', summary: 'Resumen', highlights: ['París'], cityIds: ['paris'] },
  duration:       5,
};

function mockPlanResponse(plan: unknown = { title: 'T', stops: [], transits: [] }, usage?: unknown): void {
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(plan) } }], usage });
}

async function planSystemPrompt(): Promise<string> {
  await new AiController().generatePlan(body);
  return create.mock.calls[0][0].messages[0].content as string;
}

describe('plan system prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanResponse();
  });

  it('does not ask the model to narrate, show reasoning, or ask the user questions', async () => {
    const system = await planSystemPrompt();
    expect(system).not.toContain('muestra tu razonamiento');
    expect(system).not.toContain('pregúntalo');
    expect(system).not.toContain('Buscando vuelos');
    expect(system).toContain('<criterios>');
    expect(system).toContain('asume un valor razonable en lugar de preguntar');
  });

  it('keeps the scheduling and transit rules that map to the JSON schema', async () => {
    const system = await planSystemPrompt();
    expect(system).toContain('Ninguna atracción puede solaparse en horario con otra programada el mismo día');
    expect(system).toContain('código IATA en "notes"');
    expect(system).toContain('debes responder ÚNICAMENTE con un objeto JSON válido');
    expect(system).toContain('IDENTIDAD FIJA');
  });
});

import { logger } from '../src/lib/logger';

describe('plan usage logging', () => {
  afterEach(() => jest.restoreAllMocks());

  it('logs DeepSeek usage for the plan endpoint', async () => {
    const info = jest.spyOn(logger, 'info').mockImplementation(() => {});
    mockPlanResponse(undefined, { prompt_tokens: 900, completion_tokens: 400, total_tokens: 1300 });
    await new AiController().generatePlan(body);
    expect(info).toHaveBeenCalledWith(expect.objectContaining({
      event: 'ai_usage', endpoint: 'plan', model: 'deepseek-v4-flash', totalTokens: 1300,
    }));
  });
});

describe('plan catalog placement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlanResponse();
  });

  it('sends the catalog in the user message, never the system prompt', async () => {
    await new AiController().generatePlan({ ...body, cityCatalog: { paris: [{ id: 'paris_0', name: 'Torre Eiffel' }] } });
    const systemMessage = create.mock.calls[0][0].messages[0].content as string;
    const userMessage   = create.mock.calls[0][0].messages[1].content as string;
    expect(userMessage).toContain('paris_0=Torre Eiffel');
    expect(userMessage).toContain('{cityId}_0'); // fallback-format sentence inside the block is not re-substituted
    expect(systemMessage).not.toContain('Torre Eiffel');
    expect(systemMessage).not.toContain('<catalog>');
  });
});

describe('plan output validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the sanitized plan (hostile lodging URL blanked)', async () => {
    mockPlanResponse({
      title: 'T',
      stops: [{ cityId: 'paris', checkIn: '01/07/2026', checkOut: '02/07/2026', selectedAttractions: [], lodging: { name: 'H', url: 'javascript:alert(1)' } }],
      transits: [],
    });
    const out = await new AiController().generatePlan(body);
    expect(out.stops[0].lodging?.url).toBe('');
  });
});

import { AI_MAX_TOKENS } from '../src/lib/ai-limits';

describe('plan output cap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('caps plan output tokens', async () => {
    mockPlanResponse();
    await new AiController().generatePlan(body);
    expect(create.mock.calls[0][0].max_tokens).toBe(AI_MAX_TOKENS.plan);
  });

  it('fails with a clear error when the model hits the cap', async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: '{"title":"T","stops":[' } }] });
    await expect(new AiController().generatePlan(body)).rejects.toThrow('DeepSeek output truncated at max_tokens');
  });
});
