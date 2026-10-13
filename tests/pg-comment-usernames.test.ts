import type { Pool } from 'pg';
import { PgCommentRepository } from '../src/repositories/pg/pg-comment.repository';
import { PgStepCommentRepository } from '../src/repositories/pg/pg-step-comment.repository';

const pool = (rows: object[]) => {
  const query = jest.fn(async () => ({ rows }));
  return { p: { query } as unknown as Pool, query };
};

describe('comment usernames', () => {
  it('attraction comments carry username', async () => {
    const { p, query } = pool([{ comment_id: 'c1', attraction_id: 'lima_x', name: 'Ana', username: 'ana', text: 't', rating: 5, color: '#fff', created_at: new Date() }]);
    const res = await new PgCommentRepository(p).findByAttractions(['lima_x']);
    expect((query.mock.calls[0] as unknown[])[0]).toContain('u.username');
    expect(res.lima_x[0].username).toBe('ana');
  });

  it('step comments carry authorUsername (null when the user has none)', async () => {
    const { p, query } = pool([{ id: 's1', step_key: 'k', author_name: 'Ana', author_username: null, text: 't', created_at: new Date() }]);
    const map = await new PgStepCommentRepository(p).getAllForTrip('trip');
    expect((query.mock.calls[0] as unknown[])[0]).toContain('LEFT JOIN users');
    expect(map.k[0].authorUsername).toBeNull();
  });
});
