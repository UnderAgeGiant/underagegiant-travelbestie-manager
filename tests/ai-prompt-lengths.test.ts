import prompts from '../prompts/ai-trip-prompts.json';

// Length targets chosen by the frontend from its layout (2026-09-27, frontend PR #150).
// The server caps in src/schemas/ai-output.schemas.ts are higher; these are what ARIA aims for.
describe('prompt length guidance', () => {
  it('suggest: short title/summary and 3 noun-phrase highlights', () => {
    const s = prompts.suggest.system;
    expect(s).toContain('máx. 45 caracteres');
    expect(s).toContain('máx. 220 caracteres');
    expect(s).toContain('exactamente 3 "highlights"');
    expect(s).toContain('sin verbos, máx. 4 palabras');
    expect(s).toContain('"Tapas en Barcelona"');
    expect(s).not.toContain('Punto clave');
  });

  it('plan: title, lodging and transit text targets', () => {
    const s = prompts.plan.system;
    for (const t of ['"title" ≤45', '"lodging.name" ≤50', '"lodging.address" ≤100', '"lodging.notes" ≤120', '"notes" de cada segmento ≤50', '"carrier" ≤25', '"Vuelo directo, llegar 2 h antes"']) {
      expect(s).toContain(t);
    }
  });

  it('suggestAttractions and companionSuggest: one-sentence reason ≤110', () => {
    expect(prompts.suggestAttractions.system).toContain('máx. 110 caracteres');
    expect(prompts.companionSuggest.system).toContain('máx. 110 caracteres');
  });
});
