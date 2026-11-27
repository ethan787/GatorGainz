import type { ScoringVersion } from '@gatorgainz/types';

export { EXERCISE_CATALOG } from '@gatorgainz/types/exercise-catalog';

/**
 * Approved scoring configuration (SCRUM-74). The server trusts only these values:
 * base points, tracking type, cardio limits, and cardio baselines never come from the client.
 */
export const SCORING_VERSIONS = ['v1'] as const satisfies readonly ScoringVersion[];
export const CURRENT_SCORING_VERSION: ScoringVersion = 'v1';
