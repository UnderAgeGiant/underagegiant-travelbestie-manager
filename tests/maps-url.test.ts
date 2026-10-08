import { isGoogleMapsUrl } from '../src/lib/maps-url';

describe('isGoogleMapsUrl', () => {
  it.each([
    'https://maps.app.goo.gl/AbC123',
    'https://goo.gl/maps/xyz',
    'https://www.google.com/maps/place/Cafe+de+Flore/@48.85,2.33,17z',
    'https://google.cl/maps?q=Santiago',
    'https://www.google.com.ar/maps/search/?api=1&query=x',
    'https://maps.google.com/?q=Paris',
    'https://maps.google.co.uk/maps?q=London',
  ])('accepts %s', url => expect(isGoogleMapsUrl(url)).toBe(true));

  it.each([
    'http://maps.google.com/?q=Paris',          // not https
    'javascript:alert(1)',
    'https://google.com.evil.io/maps',
    'https://evil.io/?u=https://maps.app.goo.gl/x',
    'https://www.google.com/search?q=maps',     // google.com but not /maps
    'https://goo.gl/abc',                       // goo.gl but not /maps
    'https://maps.app.goo.gl.evil.io/x',
    'not a url',
    '',
  ])('rejects %s', url => expect(isGoogleMapsUrl(url)).toBe(false));
});
