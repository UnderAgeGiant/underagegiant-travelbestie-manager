import { ITINERARY_LABELS, labelsFor, weatherCodeLabel } from '../src/lib/itinerary/labels';

describe('itinerary labels', () => {
  it('es-CL and en-US define the same keys, none empty', () => {
    const es = ITINERARY_LABELS['es-CL'];
    const en = ITINERARY_LABELS['en-US'];
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const v of [...Object.values(es), ...Object.values(en)]) expect(v).not.toBe('');
  });

  it('unknown or missing locale falls back to es-CL', () => {
    expect(labelsFor('fr')).toBe(ITINERARY_LABELS['es-CL']);
    expect(labelsFor(undefined)).toBe(ITINERARY_LABELS['es-CL']);
    expect(labelsFor('en-US')).toBe(ITINERARY_LABELS['en-US']);
  });

  it('weatherCodeLabel gives a localized label and icon', () => {
    const en = weatherCodeLabel(61, 'en-US');
    const es = weatherCodeLabel(61, 'es-CL');
    expect(en.label).not.toBe('');
    expect(en.label).not.toBe(es.label);
    expect(en.icon).toBe('🌧️');
    expect(weatherCodeLabel(0, 'es-CL').icon).toBe('☀️');
    expect(weatherCodeLabel(undefined, 'es-CL').icon).toBe('🌡️');
  });
});
