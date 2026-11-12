/**
 * Activities & saved places – used by both the REST routes and the offline
 * sync endpoint so both paths enforce identical rules.
 */
import { z } from 'zod';
import {
  activityCreateSchema,
  activityReorderSchema,
  activityUpdateSchema,
  placeCreateSchema,
  placeUpdateSchema,
} from '../../shared/schemas';
import type { ActivityDto, PlaceDto } from '../../shared/types';
import {
  activitySpec,
  deleteEntity,
  insertEntity,
  placeSpec,
  reorderEntities,
  updateEntity,
  type DeleteResult,
  type UpdateResult,
} from '../db/entity';
import { ApiError } from '../lib/errors';

export type ActivityCreate = z.output<typeof activityCreateSchema>;
export type ActivityPatch = Omit<z.output<typeof activityUpdateSchema>, 'version'>;

function checkTimes(startTime?: string | null, endTime?: string | null) {
  if (startTime && endTime && endTime < startTime) {
    throw new ApiError('validation_failed', 'Endzeit liegt vor der Startzeit', [{ path: 'endTime' }]);
  }
}

export async function createActivity(db: D1Database, tripId: string, userId: string, input: ActivityCreate) {
  checkTimes(input.startTime, input.endTime);
  const next = await db
    .prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM activities WHERE trip_id = ? AND date = ?')
    .bind(tripId, input.date)
    .first<{ n: number }>();
  return insertEntity<ActivityDto>(db, activitySpec, tripId, input, {
    created_by: userId,
    updated_by: userId,
    sort_order: next?.n ?? 0,
  });
}

export async function updateActivity(
  db: D1Database,
  tripId: string,
  userId: string,
  id: string,
  expectedVersion: number,
  patch: ActivityPatch,
): Promise<UpdateResult<ActivityDto>> {
  checkTimes(patch.startTime, patch.endTime);
  return updateEntity<ActivityDto>(db, activitySpec, tripId, id, expectedVersion, patch, { updated_by: userId });
}

export function deleteActivity(db: D1Database, tripId: string, id: string, expectedVersion?: number): Promise<DeleteResult<ActivityDto>> {
  return deleteEntity<ActivityDto>(db, activitySpec, tripId, id, expectedVersion);
}

/** Reordering only touches sort_order (no version bump → no false conflicts). */
export async function reorderActivities(db: D1Database, tripId: string, input: z.output<typeof activityReorderSchema>) {
  await reorderEntities(db, activitySpec, tripId, input.orderedIds, 'AND date = ?', [input.date]);
}

export type PlaceCreate = z.output<typeof placeCreateSchema>;
export type PlacePatch = Omit<z.output<typeof placeUpdateSchema>, 'version'>;

export function createPlace(db: D1Database, tripId: string, userId: string, input: PlaceCreate) {
  return insertEntity<PlaceDto>(db, placeSpec, tripId, input, { created_by: userId });
}

export function updatePlace(db: D1Database, tripId: string, id: string, expectedVersion: number, patch: PlacePatch) {
  return updateEntity<PlaceDto>(db, placeSpec, tripId, id, expectedVersion, patch);
}

export function deletePlace(db: D1Database, tripId: string, id: string, expectedVersion?: number) {
  return deleteEntity<PlaceDto>(db, placeSpec, tripId, id, expectedVersion);
}
