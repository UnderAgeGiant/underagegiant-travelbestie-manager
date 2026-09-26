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
