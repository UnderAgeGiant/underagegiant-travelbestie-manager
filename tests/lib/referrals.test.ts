import { generateReferralCode, REFERRAL_CODE_RE, spanishMonthName, REFERRAL_REWARD, REFERRAL_MONTHLY_CAP } from '../../src/lib/referrals';
import { StubReferralRepository } from '../helpers/stubs';

describe('referral lib', () => {
  it('generates 8-char a-z0-9 codes that do not repeat', () => {
    const codes = Array.from({ length: 200 }, generateReferralCode);
    codes.forEach(c => expect(c).toMatch(REFERRAL_CODE_RE));
    expect(new Set(codes).size).toBeGreaterThanOrEqual(199);
  });

  it('names the month in Spanish, lowercase', () => {
    expect(spanishMonthName('2026-12-01')).toBe('diciembre');
    expect(spanishMonthName('2027-01-01')).toBe('enero');
  });

  it('pays 10 at a time up to a 100 monthly cap', () => {
    expect([REFERRAL_REWARD, REFERRAL_MONTHLY_CAP]).toEqual([10, 100]);
  });
});

describe('StubReferralRepository.settle', () => {
  let repo: StubReferralRepository;
  let code: string;
  beforeEach(async () => {
    repo = new StubReferralRepository();
    code = await repo.getOrCreateCode('ref');
  });

  it('pays 10 times in a month, then caps', async () => {
    const outcomes = [];
    for (let i = 0; i < 11; i++) {
      await repo.attach(`new-${i}`, code, 'link', null);
      outcomes.push((await repo.settle(`new-${i}`))!.outcome);
    }
    expect(outcomes).toEqual([...Array(10).fill('paid'), 'cap']);
    expect(repo.credits.reduce((s, c) => s + c.amount, 0)).toBe(100);
  });

  it('same_browser when attached with an anon id the referrer used', async () => {
    const anon = '11111111-1111-4111-8111-111111111111';
    await repo.recordAnonymousId('ref', anon);
    expect(await repo.attach('new', code, 'card', anon)).toEqual({ sameBrowser: true });
    expect((await repo.settle('new'))!.outcome).toBe('same_browser');
    expect(repo.credits).toEqual([]);
  });

  it('settles once per referred user', async () => {
    await repo.attach('new', code, 'link', null);
    expect(await repo.settle('new')).not.toBeNull();
    expect(await repo.settle('new')).toBeNull();
  });

  it('ignores an own or unknown code', async () => {
    expect(await repo.attach('ref', code, 'link', null)).toBeNull();
    expect(await repo.attach('new', 'zzzzzzzz', 'link', null)).toBeNull();
  });
});
