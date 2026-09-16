import { INSTANCE_TAG_LIMITS } from '../../shared/contracts';
import type { CrowdsecDatabase } from '../database';

const { maxTags: MAX_TAGS, maxTagLength: MAX_TAG_LENGTH } = INSTANCE_TAG_LIMITS;

export interface InstanceMetadata {
  tags: string[];
  archived: boolean;
}

function tagsMetaKey(instanceId: string): string {
  return `instance_tags_${instanceId}`;
}

function archivedMetaKey(instanceId: string): string {
  return `instance_archived_${instanceId}`;
}

/**
 * Local, per-instance metadata (tags, archived flag) that has no equivalent
 * in the CrowdSec instance configuration. Stored in the generic `meta`
 * key/value table rather than a dedicated table since it's small and does
 * not need indexing or relations.
 */
export function loadInstanceMetadata(database: CrowdsecDatabase, instanceId: string): InstanceMetadata {
  let tags: string[] = [];
  try {
    const raw = database.getMeta(tagsMetaKey(instanceId))?.value;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        tags = parsed.filter((tag): tag is string => typeof tag === 'string');
      }
    }
  } catch (error) {
    console.error(`Error loading tags for instance ${instanceId}:`, error);
  }

  const archived = database.getMeta(archivedMetaKey(instanceId))?.value === 'true';
  return { tags, archived };
}

export function normalizeInstanceTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const trimmed = tag.trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length >= MAX_TAGS) break;
  }
  return normalized;
}

export function saveInstanceMetadata(
  database: CrowdsecDatabase,
  instanceId: string,
  update: { tags?: string[]; archived?: boolean },
): InstanceMetadata {
  if (update.tags !== undefined) {
    database.setMeta(tagsMetaKey(instanceId), JSON.stringify(normalizeInstanceTags(update.tags)));
  }
  if (update.archived !== undefined) {
    database.setMeta(archivedMetaKey(instanceId), update.archived ? 'true' : 'false');
  }
  return loadInstanceMetadata(database, instanceId);
}
