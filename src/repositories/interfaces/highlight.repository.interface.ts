export interface IHighlightRepository {
  hasSeen(userId: string, highlightType: string): Promise<boolean>;
  markSeen(userId: string, highlightType: string): Promise<void>;
}
