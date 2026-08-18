import { Request, Response, NextFunction } from 'express';
import {
  highlightSeenKey, highlightDismissKey, incrementHighlightDismissCount,
  markHighlightSeenInRedis, HIGHLIGHT_DISMISS_LIMIT,
} from '../../lib/redis';
import { highlightIdentity } from '../../lib/highlight-identity';
import { IHighlightRepository } from '../../repositories/interfaces/highlight.repository.interface';
import { logger } from '../../lib/logger';

/**
 * Called when the caller closes a highlight tour WITHOUT confirming it (✕/Escape/etc. —
 * never reaching "¡Entendido!" on the last step). Never marks the highlight seen by itself;
 * only increments a per-identity dismiss counter. Once that counter reaches
 * HIGHLIGHT_DISMISS_LIMIT, it escalates to the exact same "seen" write markHighlightSeen
 * does (Redis + Postgres for a logged-in caller) — from then on this identity is treated as
 * if they'd confirmed it, so the tour stops being offered.
 *
 * Non-fatal by design, same as every other highlight middleware.
 */
export function makeMarkHighlightDismissed(repo: IHighlightRepository) {
  return async function markHighlightDismissed(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const type = req.params.type;
    const identity = highlightIdentity(req);

    try {
      const count = await incrementHighlightDismissCount(highlightDismissKey(type, identity));

      if (count >= HIGHLIGHT_DISMISS_LIMIT) {
        try {
          await markHighlightSeenInRedis(highlightSeenKey(type, identity));
        } catch (err) {
          logger.warn({ flowId: req.flowId, msg: 'Redis write failed escalating dismissed highlight to seen', type, err });
        }
        if (req.user) {
          try {
            await repo.markSeen(req.user.userId, type);
          } catch (err) {
            logger.warn({ flowId: req.flowId, msg: 'DB write failed escalating dismissed highlight to seen', type, err });
          }
        }
      }
    } catch (err) {
      logger.warn({ flowId: req.flowId, msg: 'Redis unavailable in markHighlightDismissed; continuing', err });
    }

    next();
  };
}
