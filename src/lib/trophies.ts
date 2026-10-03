import { Response } from 'express';
import { EarnedTrophy, TrophyTier, TrophyType } from '../types';

/** Count needed per tier. Mirrored by the frontend's trophy-catalog.ts — keep both in sync. */
export const TROPHY_THRESHOLDS: Record<TrophyType, Partial<Record<TrophyTier, number>>> = {
  ai_plans:     { bronze: 1, silver: 10, gold: 50 },
  comments:     { bronze: 1, silver: 20, gold: 70 },
  favorites:    { bronze: 1, silver: 10, gold: 50 },
  clones:       { bronze: 1, silver: 5,  gold: 10 },
  excel_export: { single: 1 },
  publish_plan: { single: 1 },
  share_plan:   { single: 1 },
  plan_visited: { single: 1 },
};

/** Spanish names, used only in notification bodies (frontend localizes its own copy). */
export const TROPHY_NAMES: Record<TrophyType, string> = {
  ai_plans:     'Mejor planeador con IA',
  comments:     'Maestro de los tips viajeros',
  favorites:    'Maravilloso plan!',
  clones:       'Plan inspirador',
  excel_export: 'Itinerario en papel',
  publish_plan: 'Plan a la deriva',
  share_plan:   'Corre la voz',
  plan_visited: 'Primera visita',
};

export const TIER_LABELS: Record<TrophyTier, string> = { bronze: 'Bronce', silver: 'Plata', gold: 'Oro', single: '' };

export function tiersReached(type: TrophyType, count: number): TrophyTier[] {
  return (Object.entries(TROPHY_THRESHOLDS[type]) as [TrophyTier, number][])
    .filter(([, needed]) => count >= needed)
    .map(([tier]) => tier);
}

export function trophyLabel(type: TrophyType, tier: TrophyTier): string {
  return tier === 'single' ? TROPHY_NAMES[type] : `${TROPHY_NAMES[type]} — ${TIER_LABELS[tier]}`;
}

export const NEW_TROPHIES_HEADER = 'X-New-Trophies';

/** Lets the frontend celebrate instantly. Must be called before the response is sent. */
export function exposeNewTrophies(res: Response, list: EarnedTrophy[]): void {
  if (list.length) res.setHeader(NEW_TROPHIES_HEADER, JSON.stringify(list));
}
