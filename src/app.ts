import express from 'express';
import cors from 'cors';
import { userController, tripController, commentController, karmaController, aiController } from './container';
import { createAuthRouter } from './routes/auth.routes';
import { createTripsRouter } from './routes/trips.routes';
import { createCommentsRouter } from './routes/comments.routes';
import { createKarmaRouter } from './routes/karma.routes';
import { createAiRouter } from './routes/ai.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';
import { respond } from './middleware/respond.middleware';

export const app = express();

app.use(requestLoggerMiddleware);
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200', credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/shared/:shareId', tripController.findByShareId, respond(200));

app.use('/auth',     createAuthRouter(userController));
app.use('/trips',    createTripsRouter(tripController, karmaController));
app.use('/comments', createCommentsRouter(commentController));
app.use('/karma',    createKarmaRouter(karmaController));
app.use('/ai',       createAiRouter(aiController, karmaController));

app.use(notFound);
app.use(errorHandler);
