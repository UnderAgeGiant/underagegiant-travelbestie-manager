import express from 'express';
import cors from 'cors';
import {
  userController, tripController, commentController,
  karmaController, karmaPurchaseController, karmaPurchaseRepo,
  aiController, stepCommentController, stepCommentRepo, karmaRepo, pool,
} from './container';
import { createAuthRouter }            from './routes/auth.routes';
import { createTripsRouter }           from './routes/trips.routes';
import { createSharedRouter }          from './routes/shared.routes';
import { createSharedCommentsRouter }  from './routes/shared-comments.routes';
import { createCommentsRouter }        from './routes/comments.routes';
import { createKarmaRouter }           from './routes/karma.routes';
import { createAiRouter }              from './routes/ai.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';

export const app = express();

app.use(requestLoggerMiddleware);
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200', credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth',     createAuthRouter(userController));
app.use('/shared',   createSharedRouter(tripController, karmaController));
app.use('/shared/:shareId/comments',
  createSharedCommentsRouter(pool, stepCommentController, stepCommentRepo, karmaRepo),
);
app.use('/trips',    createTripsRouter(tripController, karmaController));
app.use('/comments', createCommentsRouter(commentController));
app.use('/karma',    createKarmaRouter(karmaController, karmaPurchaseController, karmaPurchaseRepo));
app.use('/ai',       createAiRouter(aiController, karmaController));

app.use(notFound);
app.use(errorHandler);
