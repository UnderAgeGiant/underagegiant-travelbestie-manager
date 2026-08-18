import { pool } from './lib/db';
import { PgUserRepository }          from './repositories/pg/pg-user.repository';
import { PgTripRepository }          from './repositories/pg/pg-trip.repository';
import { PgCommentRepository }       from './repositories/pg/pg-comment.repository';
import { PgKarmaRepository }         from './repositories/pg/pg-karma.repository';
import { PgKarmaPurchaseRepository } from './repositories/pg/pg-karma-purchase.repository';
import { PgStepCommentRepository }   from './repositories/pg/pg-step-comment.repository';
import { PgStatsRepository }         from './repositories/pg/pg-stats.repository';
import { PgFavoriteRepository }      from './repositories/pg/pg-favorite.repository';
import { PgNotificationRepository }  from './repositories/pg/pg-notification.repository';
import { PgCollaboratorRepository }  from './repositories/pg/pg-collaborator.repository';
import { PgHighlightRepository }     from './repositories/pg/pg-highlight.repository';
import { UserController }            from './controllers/user.controller';
import { TripController }            from './controllers/trip.controller';
import { CommentController }         from './controllers/comment.controller';
import { KarmaController }           from './controllers/karma.controller';
import { KarmaPurchaseController }   from './controllers/karma-purchase.controller';
import { AiController }              from './controllers/ai.controller';
import { StepCommentController }     from './controllers/step-comment.controller';
import { StatsController }           from './controllers/stats.controller';
import { CompanionController }       from './controllers/companion.controller';
import { CollaboratorController }    from './controllers/collaborator.controller';

export { pool };

export const favoriteRepository      = new PgFavoriteRepository(pool);
export const highlightRepo           = new PgHighlightRepository(pool);
export const notificationRepo        = new PgNotificationRepository(pool);
export const karmaRepo               = new PgKarmaRepository(pool);
export const karmaPurchaseRepo       = new PgKarmaPurchaseRepository(pool);
export const stepCommentRepo         = new PgStepCommentRepository(pool);

export const userRepo                = new PgUserRepository(pool);
export const tripRepo                = new PgTripRepository(pool);
export const collaboratorRepo        = new PgCollaboratorRepository(pool);

export const userController          = new UserController(userRepo);
export const tripController          = new TripController(tripRepo);
export const commentController       = new CommentController(new PgCommentRepository(pool));
export const karmaController         = new KarmaController(karmaRepo);
export const karmaPurchaseController = new KarmaPurchaseController(karmaPurchaseRepo);
export const aiController            = new AiController();
export const stepCommentController   = new StepCommentController(stepCommentRepo);
export const statsController         = new StatsController(new PgStatsRepository(pool));
export const companionController     = new CompanionController();
export const collaboratorController  = new CollaboratorController(collaboratorRepo);
