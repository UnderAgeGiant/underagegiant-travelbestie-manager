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

  it('throws on the wrong number of options or a non-JSON-object reply', () => {
    expect(() => sanitizeSuggestOutput({ options: [option(1, [])] })).toThrow();
    expect(() => sanitizeSuggestOutput('Solo puedo ayudarte con planificación de viajes.')).toThrow();
  });

  // Caps come from the frontend's layout (2026-09-27): over-long display text is cut to its
  // cap with '…', never a 500 (the 8 karma is spent before the call).
  it('cuts over-long title (60), summary (300) and highlights (40) instead of throwing', () => {
    const out = sanitizeSuggestOutput({ options: [
      { ...option(1, []), title: 't'.repeat(61), summary: 's'.repeat(301), highlights: ['ok', 'h'.repeat(200)] },
      option(2, []),
    ] });
    const o = out.options[0];
    expect(o.title).toHaveLength(60);
    expect(o.title.endsWith('…')).toBe(true);
    expect(o.summary).toHaveLength(300);
    expect(o.summary.endsWith('…')).toBe(true);
    expect(o.highlights[0]).toBe('ok');
    expect(o.highlights[1]).toHaveLength(40);
    expect(o.highlights[1].endsWith('…')).toBe(true);
  });

  it('leaves text at exactly the cap untouched', () => {
    const out = sanitizeSuggestOutput({ options: [
      { ...option(1, []), title: 't'.repeat(60), summary: 's'.repeat(300), highlights: ['h'.repeat(40)] },
      option(2, []),
    ] });
    expect(out.options[0].title).toBe('t'.repeat(60));
    expect(out.options[0].summary).toBe('s'.repeat(300));
    expect(out.options[0].highlights[0]).toBe('h'.repeat(40));
  });

  it('keeps only the first 4 highlights', () => {
    const out = sanitizeSuggestOutput({ options: [
      { ...option(1, []), highlights: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] },
      option(2, []),
    ] });
    expect(out.options[0].highlights).toEqual(['a', 'b', 'c', 'd']);
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
    expect(() => sanitizePlanOutput(plan({ stops: [{ ...plan().stops[0], cityId: 'Paris!' }] }))).toThrow();
  });

  it('cuts over-long plan text to the frontend caps instead of failing or blanking', () => {
    const seg = plan().transits[0].segments[0];
    const out = sanitizePlanOutput(plan({
      title: 'x'.repeat(200),
      stops: [{ ...plan().stops[0], lodging: { name: 'n'.repeat(200), url: '', address: 'a'.repeat(400), notes: 'o'.repeat(600) } }],
      transits: [{ ...plan().transits[0], segments: [{ ...seg, notes: 'v'.repeat(600), carrier: 'c'.repeat(200) }] }],
    }), catalog);
    const cut = (s: string | undefined, n: number) => { expect(s).toHaveLength(n); expect(s!.endsWith('…')).toBe(true); };
    cut(out.title, 60);
    cut(out.stops[0].lodging?.name, 80);
    cut(out.stops[0].lodging?.address, 150);
    cut(out.stops[0].lodging?.notes, 200);
    cut(out.transits[0].segments[0].notes, 80);
    cut(out.transits[0].segments[0].carrier, 40);
  });

  it('accepts the empty plan shape used by existing tests', () => {
    expect(sanitizePlanOutput({ title: 'T', stops: [], transits: [] })).toEqual({ title: 'T', stops: [], transits: [] });
  });
});

import { hasValidReason, clampReason, REASON_MAX_CHARS, parseCompletionJson } from '../src/lib/ai-output';

describe('reason handling', () => {
  it('caps reason at 160 characters', () => {
    expect(REASON_MAX_CHARS).toBe(160);
  });

  it('accepts any non-empty string reason, however long', () => {
    expect(hasValidReason({ reason: 'Queda a 5 minutos a pie.' })).toBe(true);
    expect(hasValidReason({ reason: 'x'.repeat(REASON_MAX_CHARS + 500) })).toBe(true);
  });

  it('cuts a reason over the cap with an ellipsis and leaves a short one alone', () => {
    const cut = clampReason('x'.repeat(REASON_MAX_CHARS + 1));
    expect(cut).toHaveLength(REASON_MAX_CHARS);
    expect(cut.endsWith('…')).toBe(true);
    expect(clampReason('Cerca de tu hotel.')).toBe('Cerca de tu hotel.');
  });

  it('rejects an empty reason or a non-string', () => {
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
