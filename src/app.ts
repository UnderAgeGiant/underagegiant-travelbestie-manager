import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import {
  userController, tripController, commentController,
  karmaController, karmaPurchaseController, karmaPurchaseRepo,
  aiController, stepCommentController, stepCommentRepo, karmaRepo, pool,
  statsController, favoriteRepository, notificationRepo,
  companionController,
  collaboratorController, collaboratorRepo, userRepo, tripRepo,
  highlightRepo, aiPlanRequestRepo,
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
import { createNotificationsRouter }   from './routes/notifications.routes';
import { createCompanionRouter }       from './routes/companion.routes';
import { createHighlightsRouter }      from './routes/highlights.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
import { validateProductionSecrets } from './lib/validate-env';
import { stripPollutionKeys } from './lib/sanitize-body';

export const app = express();

// Fail fast if production is misconfigured (B-5) — never sign tokens with the dev key.
validateProductionSecrets();

app.use(requestLoggerMiddleware);
// API-appropriate security headers. contentSecurityPolicy is disabled here — this is a
// JSON API (no HTML it serves), and the browser CSP is enforced at the frontend/Vercel edge.
app.use(helmet({ contentSecurityPolicy: false }));
const rawOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200';
const corsOrigin = rawOrigin.includes(',') ? rawOrigin.split(',').map(o => o.trim()) : rawOrigin;
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());

// Recursively strip prototype-pollution keys from the parsed JSON body (B-6).
app.use((req, _res, next) => {
  stripPollutionKeys(req.body);
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
if (process.env.NODE_ENV !== 'production') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
}

app.use('/auth',       createAuthRouter(userController, highlightRepo));
app.use('/shared',     createSharedRouter(tripController, karmaController, favoriteRepository, notificationRepo));
app.use('/favorites',  createFavoritesRouter(favoriteRepository));
app.use('/shared/:shareId/comments',
  createSharedCommentsRouter(pool, stepCommentController, stepCommentRepo, karmaRepo, notificationRepo),
);
app.use('/trips',    createTripsRouter(tripController, karmaController, collaboratorController, collaboratorRepo, userRepo, tripRepo, notificationRepo));
app.use('/comments', createCommentsRouter(commentController));
app.use('/karma',    createKarmaRouter(karmaController, karmaPurchaseController, karmaPurchaseRepo, notificationRepo));
app.use('/ai',       createAiRouter(aiController, karmaController, karmaRepo, aiPlanRequestRepo, notificationRepo));
app.use('/companion', createCompanionRouter(companionController, karmaController));
app.use('/featured', createFeaturedRouter(tripController));
app.use('/stats',    createStatsRouter(statsController));
app.use('/notifications', createNotificationsRouter(notificationRepo));
app.use('/highlights', createHighlightsRouter(highlightRepo));

app.use(notFound);
app.use(errorHandler);
