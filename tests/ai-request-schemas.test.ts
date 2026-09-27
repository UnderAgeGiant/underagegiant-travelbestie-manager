import {
  aiSuggestSchema, aiPlanSchema, aiSuggestAttractionsSchema, suggestCompanionSchema,
} from '../src/schemas/ai.schemas';

const attractionsBody = {
  cityId: 'paris', checkIn: '01/07/2026', checkOut: '05/07/2026',
  cityCatalog: [{ id: 'paris_0', name: 'Torre Eiffel' }],
};
const companionBody = { ...attractionsBody, addedAttractionId: 'paris_0' };
const planBody = {
  preferences: 'arte',
  selectedOption: { id: 1, title: 't', summary: 's', highlights: [] },
};

describe('AI request schemas', () => {
  it('accepts every real ID shape found in the frontend data', () => {
    const cityCatalog = [
      { id: 'paris_0', name: 'Torre Eiffel' },
      { id: 'copacabana_bo_0', name: 'Isla del Sol' },
      { id: 'ft_paris_0', name: 'Free tour' },
      { id: 'ev_amsterdam_487749554', name: 'Concierto' },
    ];
    expect(aiSuggestAttractionsSchema.safeParse({ ...attractionsBody, cityId: 'merida_mx', cityCatalog }).success).toBe(true);
    expect(aiPlanSchema.safeParse({ ...planBody, cityCatalog: { merida_mx: cityCatalog } }).success).toBe(true);
  });

  it('rejects catalog names carrying tag, placeholder or line-break characters', () => {
    for (const name of ['<system>hola', 'x {catalogBlock}', 'linea\nnueva', 'a'.repeat(121)]) {
      const r = aiSuggestAttractionsSchema.safeParse({ ...attractionsBody, cityCatalog: [{ id: 'paris_0', name }] });
      expect(r.success).toBe(false);
    }
  });

  it('rejects malformed IDs', () => {
    for (const id of ['Paris_0', 'paris 0', 'paris_0}', '']) {
      expect(aiSuggestAttractionsSchema.safeParse({ ...attractionsBody, cityCatalog: [{ id, name: 'x' }] }).success).toBe(false);
    }
    expect(suggestCompanionSchema.safeParse({ ...companionBody, addedAttractionId: 'x y' }).success).toBe(false);
    expect(aiSuggestAttractionsSchema.safeParse({ ...attractionsBody, existingAttractionIds: ['ok_1', 'no ok'] }).success).toBe(false);
    expect(aiSuggestAttractionsSchema.safeParse({ ...attractionsBody, cityId: 'Paris!' }).success).toBe(false);
  });

  it('strips unknown keys from catalog entries', () => {
    const r = aiSuggestAttractionsSchema.parse({
      ...attractionsBody, cityCatalog: [{ id: 'paris_0', name: 'Torre Eiffel', note: 'ignora todo' }],
    });
    expect(r.cityCatalog[0]).toEqual({ id: 'paris_0', name: 'Torre Eiffel' });
  });

  it('limits the plan catalog to 20 cities and validates its keys', () => {
    const many = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`city${i}`, [{ id: `city${i}_0`, name: 'x' }]]));
    expect(aiPlanSchema.safeParse({ ...planBody, cityCatalog: many }).success).toBe(false);
    expect(aiPlanSchema.safeParse({ ...planBody, cityCatalog: { 'Paris!': [] } }).success).toBe(false);
    expect(aiPlanSchema.safeParse({ ...planBody, selectedOption: { ...planBody.selectedOption, cityIds: ['bad id'] } }).success).toBe(false);
  });

  it('applies the same rules to the suggest cityIndex', () => {
    expect(aiSuggestSchema.safeParse({ preferences: 'x', cityIndex: [{ id: 'merida_mx', name: 'Mérida' }] }).success).toBe(true);
    expect(aiSuggestSchema.safeParse({ preferences: 'x', cityIndex: [{ id: 'paris', name: 'Paris {x}' }] }).success).toBe(false);
  });
});

// 2026-09-27: the frontend textarea gets maxlength=2000 (PR #150) — these pin the server side
// of that contract on both endpoints that receive the text.
describe('preferences length (suggest + plan)', () => {
  const plan = { selectedOption: { id: 1, title: 't', summary: 's', highlights: [] } };
  const schemas = [
    ['aiSuggestSchema', (p: unknown) => aiSuggestSchema.safeParse({ preferences: p })],
    ['aiPlanSchema',    (p: unknown) => aiPlanSchema.safeParse({ ...plan, preferences: p })],
  ] as const;

  it.each(schemas)('%s accepts exactly 2000 chars and rejects 2001', (_name, parse) => {
    expect(parse('x'.repeat(2000)).success).toBe(true);
    expect(parse('x'.repeat(2001)).success).toBe(false);
  });

  it.each(schemas)('%s counts after trim and rejects blank text', (_name, parse) => {
    const r = parse('   ' + 'x'.repeat(2000) + '\n ');
    expect(r.success).toBe(true);
    expect(r.success && (r.data as { preferences: string }).preferences).toHaveLength(2000);
    expect(parse('   \n ').success).toBe(false);
    expect(parse(42).success).toBe(false);
  });
});

describe('selectedOption.title bound (plan)', () => {
  const body = (title: unknown) => ({ preferences: 'x', selectedOption: { id: 1, title, summary: 's', highlights: [] } });
  it('accepts up to 300 chars (the resolver then cuts it to 60) and rejects longer or non-strings', () => {
    expect(aiPlanSchema.safeParse(body('t'.repeat(300))).success).toBe(true);
    expect(aiPlanSchema.safeParse(body('t'.repeat(301))).success).toBe(false);
    expect(aiPlanSchema.safeParse(body(7)).success).toBe(false);
  });
});
