import { dmyToISO, isoToDMY, addDaysISO, iterateISODates, todayISO, isValidDMY } from '../../src/lib/weather-dates';

describe('weather-dates', () => {
  it('converts dd/mm/yyyy to yyyy-mm-dd', () => {
    expect(dmyToISO('05/03/2026')).toBe('2026-03-05');
    expect(dmyToISO('31/12/2026')).toBe('2026-12-31');
  });

  it('converts yyyy-mm-dd to dd/mm/yyyy', () => {
    expect(isoToDMY('2026-03-05')).toBe('05/03/2026');
  });

  it('round-trips dmy -> iso -> dmy', () => {
    expect(isoToDMY(dmyToISO('01/01/2027'))).toBe('01/01/2027');
  });

  it('adds days across a month/year boundary', () => {
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDaysISO('2026-03-05', -365)).toBe('2025-03-05');
  });

  it('iterates an inclusive date range', () => {
    expect(iterateISODates('2026-03-05', '2026-03-08')).toEqual([
      '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08',
    ]);
  });

  it('returns a single-day range unchanged', () => {
    expect(iterateISODates('2026-03-05', '2026-03-05')).toEqual(['2026-03-05']);
  });

  it('todayISO returns a yyyy-mm-dd string', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts real calendar dates', () => {
    expect(isValidDMY('05/03/2026')).toBe(true);
    expect(isValidDMY('29/02/2028')).toBe(true); // leap year
    expect(isValidDMY('31/12/2026')).toBe(true);
  });

  it('rejects shape-valid but non-existent dates', () => {
    expect(isValidDMY('31/02/2026')).toBe(false);  // February never has 31 days
    expect(isValidDMY('29/02/2026')).toBe(false);  // 2026 is not a leap year
    expect(isValidDMY('31/04/2026')).toBe(false);  // April has 30 days
    expect(isValidDMY('00/01/2026')).toBe(false);
    expect(isValidDMY('01/13/2026')).toBe(false);
  });
});
