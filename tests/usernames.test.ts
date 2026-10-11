import { isUsernameAllowed, isUsernameFormatValid } from '../src/lib/usernames';

describe('isUsernameFormatValid', () => {
  it.each(['ana', 'ana_perez', 'ana.perez', '_ana_', 'a'.repeat(50), 'a1b2'])('accepts %s', u =>
    expect(isUsernameFormatValid(u)).toBe(true));
  it.each(['ab', 'a'.repeat(51), 'Ana', '.ana', 'ana.', 'an..a', 'ana perez', 'ana-perez', 'añá', "a'b", 'a/b', ''])('rejects %s', u =>
    expect(isUsernameFormatValid(u)).toBe(false));
});

describe('isUsernameAllowed', () => {
  it.each(['viajera_ana', 'computadora', 'vergara', 'essex', 'peacock', 'pollachilena', 'pajero', 'negro_viajero', 'disputa'])(
    'allows %s', u => expect(isUsernameAllowed(u)).toBe(true));

  it.each([
    'admin', 'perfil', 'tripilove', 'tripiloveofficial', 'tripilove.official', 'soporte', 'carabineros', 'acab',   // exact A/B/C
    '4dm1n',                                        // leet → admin
    'yo_soy_culiao', 'xxconchetumarexx', 'pacoviajero', 'super_weon', 'travesano',   // D1 substring
    'juan_puta', 'puta', 'ana.ql', 'qlao',          // D2 token / exact
  ])('blocks %s', u => expect(isUsernameAllowed(u)).toBe(false));

  it('rejects bad format before checking words', () => expect(isUsernameAllowed('Admin!')).toBe(false));
});
