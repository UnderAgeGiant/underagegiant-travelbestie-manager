import { Request, Response, NextFunction } from 'express';
import { readAnonymousId } from '../../lib/highlight-identity';
import { IHighlightRepository } from '../../repositories/interfaces/highlight.repository.interface';
import { logger } from '../../lib/logger';

/**
 * Wired into the /auth/login and /auth/register chains, after signTokenMiddleware. An
 * anonymous visitor who dismissed/completed a highlight tour before authenticating is,
 * per the product ask, "essentially the same user" — so on their very first authenticated
 * request we fold whatever their X-Anonymous-Id identity had marked seen in Redis onto
 * their new u:{userId} identity, in BOTH Redis (fast path for future status checks) and
 * Postgres (source of truth for logged-in users — see PgHighlightRepository). Silent no-op
 * when there's no X-Anonymous-Id header (older client, storage unavailable, etc.) or
 * nothing was ever marked seen under it.
 *
 * Non-fatal by design, same as every other highlight middleware: a failure here must never
 * block or fail a login/register response — worst case the visitor just sees a highlight
 * tour again that they'd already dismissed anonymously.
 */
export function makeMigrateAnonymousHighlights(repo: IHighlightRepository) {
  return async function migrateAnonymousHighlights(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const anonymousId = readAnonymousId(req);
    const userId = req.foundUser?.id;
    if (!anonymousId || !userId) { next(); return; }

    // Deferred require: auth.routes.ts is imported by virtually every test suite in this
    // repo (and every real request), but almost none of them ever send an X-Anonymous-Id.
    // A top-level `import { redis } from '../../lib/redis'` would make src/lib/redis's
    // eager `new Redis(...)` connection attempt run for ALL of them — unlike
    // rateLimitMiddleware's existing redis import, which every test file already
    // neutralizes via `jest.mock('../src/middleware/rate-limit.middleware', ...)`, nothing
    // mocks this path. Loading the module lazily, only once a request actually needs it,
    // keeps that connection attempt out of every unrelated test/request entirely.
    const { redis, highlightSeenKey, findHighlightTypesFor } = require('../../lib/redis') as typeof import('../../lib/redis');

    try {
      const types = await findHighlightTypesFor(`a:${anonymousId}`);
      for (const type of types) {
        try {
          await redis.set(highlightSeenKey(type, `u:${userId}`), '1');
        } catch (err) {
          logger.warn({ flowId: req.flowId, msg: 'Redis write failed migrating anonymous highlight', type, err });
        }
        try {
          await repo.markSeen(userId, type);
        } catch (err) {
          logger.warn({ flowId: req.flowId, msg: 'DB write failed migrating anonymous highlight', type, err });
        }
      }
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'Redis scan failed migrating anonymous highlights', err });
    }

    next();
  };
}
