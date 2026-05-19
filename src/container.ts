import { pool } from './lib/db';
import { PgUserRepository } from './repositories/pg/pg-user.repository';
import { PgTripRepository } from './repositories/pg/pg-trip.repository';
import { PgCommentRepository } from './repositories/pg/pg-comment.repository';
import { PgKarmaRepository } from './repositories/pg/pg-karma.repository';
import { UserController } from './controllers/user.controller';
import { TripController } from './controllers/trip.controller';
import { CommentController } from './controllers/comment.controller';
import { KarmaController } from './controllers/karma.controller';
import { AiController } from './controllers/ai.controller';

export const userController    = new UserController(new PgUserRepository(pool));
export const tripController    = new TripController(new PgTripRepository(pool));
export const commentController = new CommentController(new PgCommentRepository(pool));
export const karmaController   = new KarmaController(new PgKarmaRepository(pool));
export const aiController      = new AiController();
