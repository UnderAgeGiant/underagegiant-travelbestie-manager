import { StepComment, StepCommentsMap } from '../../types';

export interface IStepCommentRepository {
  getAllForTrip(tripId: string): Promise<StepCommentsMap>;
  add(data: {
    tripId:     string;
    stepKey:    string;
    userId:     string;
    authorName: string;
    text:       string;
  }): Promise<StepComment>;
  isFirstCommentOnStep(userId: string, tripId: string, stepKey: string): Promise<boolean>;
}
