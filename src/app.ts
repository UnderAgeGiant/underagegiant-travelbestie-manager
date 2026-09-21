import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import {
  userController, tripController, commentController, commentRepo,
  karmaController, karmaPurchaseController, karmaPurchaseRepo,
  mercadopagoController,
  aiController, stepCommentController, stepCommentRepo, karmaRepo, pool,
  statsController, favoriteRepository, notificationRepo,
  companionController,
  collaboratorController, collaboratorRepo, userRepo, tripRepo,
  highlightRepo, aiPlanRequestRepo, weatherController,
} from './container';
import { createAuthRouter }            from './routes/auth.routes';
import { createTripsRouter }           from './routes/trips.routes';
import { createSharedRouter }          from './routes/shared.routes';
import { createSharedCommentsRouter }  from './routes/shared-comments.routes';
import { createCommentsRouter }        from './routes/comments.routes';
import { createKarmaRouter }           from './routes/karma.routes';
import { createAiRouter }              from './routes/ai.routes';
import { createFeaturedRouter, createStatsRouter, createFeedRouter } from './routes/landing.routes';
import { createFavoritesRouter }       from './routes/favorites.routes';
import { createNotificationsRouter }   from './routes/notifications.routes';
import { createCompanionRouter }       from './routes/companion.routes';
import { createHighlightsRouter }      from './routes/highlights.routes';
import { createWeatherRouter }         from './routes/weather.routes';
import { createSeoRouter }             from './routes/seo.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { noIndexApi, robotsTxt } from './middleware/no-index.middleware';
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
app.use(noIndexApi);
const rawOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200';
const corsOrigin = rawOrigin.includes(',') ? rawOrigin.split(',').map(o => o.trim()) : rawOrigin;
// maxAge caches the browser's CORS preflight (OPTIONS) result for 24h — without it Chrome
// falls back to a 5s cache, and since every request now carries X-Anonymous-Id (see
// AuthInterceptor in the frontend repo, 2026-09-09), even anonymous GETs on public paths
// like /featured, /stats, /shared/:id, /comments/:id trigger a preflight on nearly every call.
app.use(cors({ origin: corsOrigin, credentials: true, maxAge: 86400 }));
app.use(cookieParser());
app.use(express.json());

// Recursively strip prototype-pollution keys from the parsed JSON body (B-6).
app.use((req, _res, next) => {
  stripPollutionKeys(req.body);
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/robots.txt', robotsTxt);
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
app.use('/comments', createCommentsRouter(commentController, commentRepo, karmaRepo));
app.use('/karma',    createKarmaRouter(karmaController, karmaPurchaseController, mercadopagoController, karmaPurchaseRepo, userRepo, notificationRepo, karmaRepo, pool));
app.use('/ai',       createAiRouter(aiController, karmaController, karmaRepo, aiPlanRequestRepo, notificationRepo));
app.use('/companion', createCompanionRouter(companionController, karmaController));
app.use('/featured', createFeaturedRouter(tripController));
app.use('/stats',    createStatsRouter(statsController));
app.use('/feed',     createFeedRouter(tripController));
app.use('/notifications', createNotificationsRouter(notificationRepo));
app.use('/highlights', createHighlightsRouter(highlightRepo));
app.use('/weather', createWeatherRouter(weatherController));
app.use('/seo',     createSeoRouter(tripController));

app.use(notFound);
app.use(errorHandler);
