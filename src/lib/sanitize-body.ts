const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

/** Recursively delete prototype-pollution keys from a parsed request body.
 *  Handles the own "__proto__" key that JSON.parse special-cases, plus nested
 *  objects and arrays. Safe on null / primitives. */
export function stripPollutionKeys(value: unknown): void {
  if (value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) stripPollutionKeys(item);
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key of DANGEROUS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      Reflect.deleteProperty(obj, key);
    }
  }
  for (const key of Object.keys(obj)) {
    stripPollutionKeys(obj[key]);
  }
}
