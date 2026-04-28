import express from 'express';
import cors from 'cors';
import { userController, tripController, commentController, karmaController, karmaRepo, commentRepo } from './container';
import { createAuthRouter } from './routes/auth.routes';
import { createTripsRouter } from './routes/trips.routes';
import { createCommentsRouter } from './routes/comments.routes';
import { createKarmaRouter } from './routes/karma.routes';
import { errorHandler, notFound } from './middleware/error.middleware';

export const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200', credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth',     createAuthRouter(userController));
app.use('/trips',    createTripsRouter(tripController, karmaRepo));
app.use('/comments', createCommentsRouter(commentController, karmaRepo, commentRepo));
app.use('/karma',    createKarmaRouter(karmaController));

app.use(notFound);
app.use(errorHandler);
