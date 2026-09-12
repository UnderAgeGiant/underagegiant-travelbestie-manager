import { StubKarmaRepository } from '../helpers/stubs';

describe('StubKarmaRepository.listEvents', () => {
  it('returns newest-first and records spend/award as events', async () => {
    const karma = new StubKarmaRepository();
    await karma.spendAmount('u1', 9, 'ai_suggest', 'flow-1');
    await karma.spendAmount('u1', 1, 'ai_plan', 'req-1');
    await karma.award('u1', 3, 'karma_purchased', 'purchase-1');

    const { rows, hasMore } = await karma.listEvents('u1', null, 20);
    expect(hasMore).toBe(false);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.reason)).toEqual(['karma_purchased', 'ai_plan', 'ai_suggest']); // newest first
    expect(rows[0].delta).toBe(3);
    expect(rows[2].delta).toBe(-9);
  });

  it('scopes to the given userId only', async () => {
    const karma = new StubKarmaRepository();
    await karma.spendAmount('u1', 1, 'trip_created', 't1');
    await karma.spendAmount('u2', 1, 'trip_created', 't2');

    const { rows } = await karma.listEvents('u1', null, 20);
    expect(rows).toHaveLength(1);
    expect(rows[0].refId).toBe('t1');
  });

  it('paginates via cursor and reports hasMore correctly', async () => {
    const karma = new StubKarmaRepository();
    for (let i = 0; i < 5; i++) {
      await karma.spendAmount('u1', 1, 'trip_created', `t${i}`);
    }

    const page1 = await karma.listEvents('u1', null, 2);
    expect(page1.rows).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.rows[0].refId).toBe('t4'); // newest

    const cursor = { createdAt: page1.rows[1].createdAt, eventId: page1.rows[1].eventId };
    const page2 = await karma.listEvents('u1', cursor, 2);
    expect(page2.rows).toHaveLength(2);
    expect(page2.rows[0].refId).toBe('t2');

    const cursor2 = { createdAt: page2.rows[1].createdAt, eventId: page2.rows[1].eventId };
    const page3 = await karma.listEvents('u1', cursor2, 2);
    expect(page3.rows).toHaveLength(1);
    expect(page3.hasMore).toBe(false);
    expect(page3.rows[0].refId).toBe('t0'); // oldest
  });
});
