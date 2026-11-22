import { buildCitiesPlanOption } from '../src/lib/cities-plan-option';

describe('buildCitiesPlanOption', () => {
  it('builds the byte-exact option (fixture shared with the frontend)', () => {
    expect(JSON.stringify(buildCitiesPlanOption([{ id: 'rome', name: 'Rome' }, { id: 'florence', name: 'Florence' }], 5)))
      .toBe('{"id":0,"title":"Viaje a Rome, Florence","summary":"Itinerario de 5 días por Rome, Florence","highlights":["Rome","Florence"],"cityIds":["rome","florence"]}');
  });
});
