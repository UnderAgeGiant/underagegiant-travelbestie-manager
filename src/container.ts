import { MemoryUserRepository } from './repositories/memory/memory-user.repository';
import { MemoryTripRepository } from './repositories/memory/memory-trip.repository';
import { MemoryCommentRepository } from './repositories/memory/memory-comment.repository';
import { MemoryKarmaRepository } from './repositories/memory/memory-karma.repository';
import { UserController } from './controllers/user.controller';
import { TripController } from './controllers/trip.controller';
import { CommentController } from './controllers/comment.controller';
import { KarmaController } from './controllers/karma.controller';

export const karmaRepo    = new MemoryKarmaRepository();
export const commentRepo  = new MemoryCommentRepository();

export const userController    = new UserController(new MemoryUserRepository());
export const tripController    = new TripController(new MemoryTripRepository());
export const commentController = new CommentController(commentRepo);
export const karmaController   = new KarmaController(karmaRepo);
