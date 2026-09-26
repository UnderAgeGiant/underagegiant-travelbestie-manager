import { sanitizeSuggestOutput, sanitizePlanOutput } from '../src/lib/ai-output';

const option = (id: number, cityIds: string[]) => ({ id, title: `Opción ${id}`, summary: 'Resumen.', highlights: ['a', 'b'], cityIds });

function plan(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Viaje',
    stops: [{
      cityId: 'paris', checkIn: '01/07/2026', checkOut: '03/07/2026',
      selectedAttractions: [{ attractionId: 'paris_0', startTime: '10:00', date: '01/07/2026' }],
      lodging: { name: 'Hotel', url: '' },
    }],
    transits: [{
      fromCityId: 'paris', toCityId: 'rome', date: '03/07/2026',
      segments: [{ mode: 'flight', departureDate: '03/07/2026', departureTime: '09:00', arrivalDate: '03/07/2026', arrivalTime: '11:00', notes: 'AF 1204, CDG→FCO', durationMinutes: 120 }],
    }],
    ...overrides,
  };
}

describe('sanitizeSuggestOutput', () => {
  it('keeps a well-formed response and filters cityIds to the sent index', () => {
    const out = sanitizeSuggestOutput(
      { options: [option(1, ['paris', 'atlantis']), option(2, ['tokyo'])] },
      [{ id: 'paris', name: 'Paris' }, { id: 'tokyo', name: 'Tokyo' }],
    );
    expect(out.options[0].cityIds).toEqual(['paris']);
    expect(out.options[1].cityIds).toEqual(['tokyo']);
  });

  it('keeps only well-formed cityIds when no index was sent', () => {
    const out = sanitizeSuggestOutput({ options: [option(1, ['paris', 'Bad Id']), option(2, [])] });
    expect(out.options[0].cityIds).toEqual(['paris']);
  });

  it('strips unknown keys', () => {
    const out = sanitizeSuggestOutput({ options: [{ ...option(1, []), html: '<b>x</b>' }, option(2, [])], extra: 1 });
    expect(Object.keys(out.options[0]).sort()).toEqual(['cityIds', 'highlights', 'id', 'summary', 'title']);
    expect(out).not.toHaveProperty('extra');
  });

  it('throws on the wrong number of options or oversized text', () => {
    expect(() => sanitizeSuggestOutput({ options: [option(1, [])] })).toThrow();
    expect(() => sanitizeSuggestOutput({ options: [{ ...option(1, []), title: 'x'.repeat(151) }, option(2, [])] })).toThrow();
    expect(() => sanitizeSuggestOutput('Solo puedo ayudarte con planificación de viajes.')).toThrow();
  });
});

describe('sanitizePlanOutput', () => {
  const catalog = { paris: [{ id: 'paris_0', name: 'Torre Eiffel' }, { id: 'paris_1', name: 'Louvre' }] };

  it('keeps a well-formed plan and defaults endTime to null', () => {
    const out = sanitizePlanOutput(plan(), catalog);
    expect(out.stops[0].selectedAttractions).toEqual([{ attractionId: 'paris_0', startTime: '10:00', endTime: null, date: '01/07/2026' }]);
    expect(out.transits[0].segments[0].notes).toBe('AF 1204, CDG→FCO');
  });

  it('blanks non-https lodging URLs and keeps https ones', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'https://a b']) {
      const out = sanitizePlanOutput(plan({ stops: [{ ...plan().stops[0], lodging: { name: 'H', url: bad } }] }), catalog);
      expect(out.stops[0].lodging?.url).toBe('');
    }
    const ok = sanitizePlanOutput(plan({ stops: [{ ...plan().stops[0], lodging: { name: 'H', url: 'https://hotel.example/r' } }] }), catalog);
    expect(ok.stops[0].lodging?.url).toBe('https://hotel.example/r');
  });

  it('drops attractions outside the catalog for a catalogued city, keeping the rest', () => {
    const stop = { ...plan().stops[0], selectedAttractions: [
      { attractionId: 'paris_0', startTime: '10:00', date: '01/07/2026' },
      { attractionId: 'paris_99', startTime: '12:00', date: '01/07/2026' },
    ] };
    const out = sanitizePlanOutput(plan({ stops: [stop] }), catalog);
    expect(out.stops[0].selectedAttractions.map(a => a.attractionId)).toEqual(['paris_0']);
  });

  it('keeps well-formed synthetic IDs for an uncatalogued city and drops malformed ones', () => {
    const stop = { ...plan().stops[0], cityId: 'lyon', selectedAttractions: [
      { attractionId: 'lyon_2', startTime: '10:00', date: '01/07/2026' },
      { attractionId: 'lyon 3<x>', startTime: '12:00', date: '01/07/2026' },
    ] };
    const out = sanitizePlanOutput(plan({ stops: [stop] }), catalog);
    expect(out.stops[0].selectedAttractions.map(a => a.attractionId)).toEqual(['lyon_2']);
  });

  it('throws on structural violations', () => {
    const seg = plan().transits[0].segments[0];
    expect(() => sanitizePlanOutput(plan({ transits: [{ ...plan().transits[0], segments: [{ ...seg, mode: 'teleport' }] }] }))).toThrow();
    expect(() => sanitizePlanOutput(plan({ title: 'x'.repeat(151) }))).toThrow();
    expect(() => sanitizePlanOutput(plan({ stops: [{ ...plan().stops[0], cityId: 'Paris!' }] }))).toThrow();
  });

  it('accepts the empty plan shape used by existing tests', () => {
    expect(sanitizePlanOutput({ title: 'T', stops: [], transits: [] })).toEqual({ title: 'T', stops: [], transits: [] });
  });
});

import { hasValidReason, REASON_MAX_CHARS, parseCompletionJson } from '../src/lib/ai-output';

describe('hasValidReason', () => {
  it('accepts a short sentence and a reason exactly at the cap', () => {
    expect(hasValidReason({ reason: 'Queda a 5 minutos a pie.' })).toBe(true);
    expect(hasValidReason({ reason: 'x'.repeat(REASON_MAX_CHARS) })).toBe(true);
  });

  it('rejects a reason over the cap, an empty one, or a non-string', () => {
    expect(hasValidReason({ reason: 'x'.repeat(REASON_MAX_CHARS + 1) })).toBe(false);
    expect(hasValidReason({ reason: '' })).toBe(false);
    expect(hasValidReason({ reason: 42 })).toBe(false);
    expect(hasValidReason({})).toBe(false);
  });
});

describe('parseCompletionJson', () => {
  it('parses the first choice', () => {
    expect(parseCompletionJson({ choices: [{ finish_reason: 'stop', message: { content: '{"a":1}' } }] })).toEqual({ a: 1 });
  });

  it('throws a clear error when the model hit max_tokens', () => {
    expect(() => parseCompletionJson({ choices: [{ finish_reason: 'length', message: { content: '{"a":' } }] }))
      .toThrow('DeepSeek output truncated at max_tokens');
  });
});
