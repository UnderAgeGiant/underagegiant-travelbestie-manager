import express from 'express';
import cors from 'cors';
import { userController, tripController, commentController, karmaController } from './container';
import { createAuthRouter } from './routes/auth.routes';
import { createTripsRouter } from './routes/trips.routes';
import { createCommentsRouter } from './routes/comments.routes';
import { createKarmaRouter } from './routes/karma.routes';
import { errorHandler, notFound } from './middleware/error.middleware';
import { requestLoggerMiddleware } from './middleware/request-logger.middleware';

export const app = express();

app.use(requestLoggerMiddleware);
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200', credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth',     createAuthRouter(userController));
app.use('/trips',    createTripsRouter(tripController));
app.use('/comments', createCommentsRouter(commentController));
app.use('/karma',    createKarmaRouter(karmaController));

app.use(notFound);
app.use(errorHandler);
