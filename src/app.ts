import express from 'express';
import cors from 'cors';
import {
  userController, tripController, commentController,
  karmaController, karmaPurchaseController, karmaPurchaseRepo,
  aiController, stepCommentController, stepCommentRepo, karmaRepo, pool,
  statsController, favoriteRepository,
} from './container';
import { createAuthRouter }            from './routes/auth.routes';
import { createTripsRouter }           from './routes/trips.routes';
import { createSharedRouter }          from './routes/shared.routes';
import { createSharedCommentsRouter }  from './routes/shared-comments.routes';
import { createCommentsRouter }        from './routes/comments.routes';
import { createKarmaRouter }           from './routes/karma.routes';
import { createAiRouter }              from './routes/ai.routes';
import { createFeaturedRouter, createStatsRouter } from './routes/landing.routes';
import { createFavoritesRouter }       from './routes/favorites.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';

export const app = express();

app.use(requestLoggerMiddleware);
const rawOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200';
const corsOrigin = rawOrigin.includes(',') ? rawOrigin.split(',').map(o => o.trim()) : rawOrigin;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Strip __proto__, constructor, prototype keys to prevent prototype pollution via JSON body
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = req.body as any;
    delete body.__proto__;
    delete body.constructor;
    delete body.prototype;
  }
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth',       createAuthRouter(userController));
app.use('/shared',     createSharedRouter(tripController, karmaController, favoriteRepository));
app.use('/favorites',  createFavoritesRouter(favoriteRepository));
app.use('/shared/:shareId/comments',
  createSharedCommentsRouter(pool, stepCommentController, stepCommentRepo, karmaRepo),
);
app.use('/trips',    createTripsRouter(tripController, karmaController));
app.use('/comments', createCommentsRouter(commentController));
app.use('/karma',    createKarmaRouter(karmaController, karmaPurchaseController, karmaPurchaseRepo));
app.use('/ai',       createAiRouter(aiController, karmaController));
app.use('/featured', createFeaturedRouter(tripController));
app.use('/stats',    createStatsRouter(statsController));

app.use(notFound);
app.use(errorHandler);
