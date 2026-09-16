import { describe, expect, test } from 'vitest';
import path from 'path';
import { CrowdsecDatabase } from '../../database';
import { normalizeInstanceTags } from '../../app/instance-metadata';
import type { ConfigResponse } from '../../../shared/contracts';
import { createController, sampleAlert, seedAlert, tempDir } from './harness';

describe('security engine (instance) metadata', () => {
  test('exposes cached alert/decision counts and defaults tags/archived on /api/config', async () => {
    const database = new CrowdsecDatabase({ dbPath: path.join(tempDir, 'test.db') });
    seedAlert(database, sampleAlert({ id: 1, uuid: 'alert-1' }));
    const { controller } = createController({ database });

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/config'));
    const config = await response.json() as ConfigResponse;

    expect(config.instances).toEqual([
      expect.objectContaining({
        id: 'default',
        alerts_count: 1,
        decisions_count: 1,
        tags: [],
        archived: false,
      }),
    ]);

    controller.stopBackgroundTasks();
    database.close();
  });

  test('persists tags via PUT and reflects them on subsequent config/instances reads', async () => {
    const { controller, database } = createController();

    const putResponse = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['production', ' edge ', 'production'] }),
    }));
    expect(putResponse.status).toBe(200);
    expect(await putResponse.json()).toEqual({
      success: true,
      instance_id: 'default',
      tags: ['production', 'edge'],
      archived: false,
    });

    const instancesResponse = await controller.fetch(new Request('http://localhost/crowdsec/api/instances'));
    const instancesPayload = await instancesResponse.json() as { data: Array<{ id: string; tags: string[] }> };
    expect(instancesPayload.data).toEqual([
      expect.objectContaining({ id: 'default', tags: ['production', 'edge'] }),
    ]);

    controller.stopBackgroundTasks();
    database.close();
  });

  test('persists the archived flag independently from tags', async () => {
    const { controller, database } = createController();

    await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['keep-me'] }),
    }));

    const archiveResponse = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    }));
    expect(await archiveResponse.json()).toEqual({
      success: true,
      instance_id: 'default',
      tags: ['keep-me'],
      archived: true,
    });

    const configResponse = await controller.fetch(new Request('http://localhost/crowdsec/api/config'));
    const config = await configResponse.json() as ConfigResponse;
    expect(config.instances).toEqual([
      expect.objectContaining({ id: 'default', tags: ['keep-me'], archived: true }),
    ]);

    controller.stopBackgroundTasks();
    database.close();
  });

  test('rejects an unknown instance id with 404', async () => {
    const { controller, database } = createController();

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/does-not-exist/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['x'] }),
    }));

    expect(response.status).toBe(404);

    controller.stopBackgroundTasks();
    database.close();
  });

  test('rejects a non-array tags payload with 400', async () => {
    const { controller, database } = createController();

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: 'not-an-array' }),
    }));

    expect(response.status).toBe(400);

    controller.stopBackgroundTasks();
    database.close();
  });

  test('rejects a non-boolean archived payload with 400', async () => {
    const { controller, database } = createController();

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: 'yes' }),
    }));

    expect(response.status).toBe(400);

    controller.stopBackgroundTasks();
    database.close();
  });

  test('rejects a JSON body that is not an object (e.g. null or an array) with 400', async () => {
    const { controller, database } = createController();

    const nullBodyResponse = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'null',
    }));
    expect(nullBodyResponse.status).toBe(400);
    expect(await nullBodyResponse.json()).toEqual({ error: 'A JSON object body is required' });

    const arrayBodyResponse = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '["tags"]',
    }));
    expect(arrayBodyResponse.status).toBe(400);

    controller.stopBackgroundTasks();
    database.close();
  });

  test('rejects malformed JSON with 400', async () => {
    const { controller, database } = createController();

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'A JSON request body is required' });

    controller.stopBackgroundTasks();
    database.close();
  });

  test('blocks metadata updates in read-only mode', async () => {
    const { controller, database } = createController({ env: { PERMISSION_READ_ONLY: 'true' } });

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['x'] }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Read-only mode is enabled', code: 'READ_ONLY' });

    controller.stopBackgroundTasks();
    database.close();
  });
});

describe('normalizeInstanceTags', () => {
  test('trims, deduplicates, and drops empty values', () => {
    expect(normalizeInstanceTags([' production ', 'production', '', '   ', 'edge']))
      .toEqual(['production', 'edge']);
  });

  test('filters out non-string entries', () => {
    expect(normalizeInstanceTags(['ok', 42, null, undefined, { nope: true }, 'also-ok']))
      .toEqual(['ok', 'also-ok']);
  });

  test('truncates tags longer than the shared max length', () => {
    const longTag = 'x'.repeat(100);
    const [result] = normalizeInstanceTags([longTag]);
    expect(result).toHaveLength(40);
  });

  test('caps the number of tags at the shared maximum', () => {
    const manyTags = Array.from({ length: 25 }, (_, index) => `tag-${index}`);
    expect(normalizeInstanceTags(manyTags)).toHaveLength(20);
  });

  test('returns an empty array for non-array input', () => {
    expect(normalizeInstanceTags(undefined)).toEqual([]);
    expect(normalizeInstanceTags('not-an-array')).toEqual([]);
    expect(normalizeInstanceTags(null)).toEqual([]);
  });
});
