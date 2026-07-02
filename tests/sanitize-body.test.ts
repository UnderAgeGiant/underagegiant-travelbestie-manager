import { stripPollutionKeys } from '../src/lib/sanitize-body';

describe('stripPollutionKeys (B-6)', () => {
  it('removes an own top-level __proto__ key (JSON.parse form)', () => {
    const body = JSON.parse('{"a":1,"__proto__":{"polluted":true}}');
    stripPollutionKeys(body);
    expect(Object.prototype.hasOwnProperty.call(body, '__proto__')).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('removes constructor and prototype keys', () => {
    const body = JSON.parse('{"constructor":{"x":1},"prototype":{"y":2}}');
    stripPollutionKeys(body);
    expect(Object.prototype.hasOwnProperty.call(body, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(body, 'prototype')).toBe(false);
  });

  it('strips keys nested inside objects and arrays', () => {
    const body = JSON.parse('{"stops":[{"__proto__":{"polluted":true},"name":"A"}]}');
    stripPollutionKeys(body);
    expect(Object.prototype.hasOwnProperty.call(body.stops[0], '__proto__')).toBe(false);
    expect(body.stops[0].name).toBe('A');
    expect(({} as any).polluted).toBeUndefined();
  });

  it('leaves normal data untouched', () => {
    const body = { name: 'Ana', nested: { count: 3, list: [1, 2] } };
    stripPollutionKeys(body);
    expect(body).toEqual({ name: 'Ana', nested: { count: 3, list: [1, 2] } });
  });

  it('does not choke on null / primitives', () => {
    expect(() => stripPollutionKeys(null)).not.toThrow();
    expect(() => stripPollutionKeys('str' as unknown as object)).not.toThrow();
  });
});
