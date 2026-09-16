import { describe, expect, test } from 'vitest';
import path from 'path';
import { CrowdsecDatabase } from '../../database';
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
  });

  test('persists tags via PUT and reflects them on subsequent config/instances reads', async () => {
    const { controller } = createController();

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
  });

  test('persists the archived flag independently from tags', async () => {
    const { controller } = createController();

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
  });

  test('rejects an unknown instance id with 404', async () => {
    const { controller } = createController();

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/does-not-exist/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['x'] }),
    }));

    expect(response.status).toBe(404);
  });

  test('rejects a non-array tags payload with 400', async () => {
    const { controller } = createController();

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: 'not-an-array' }),
    }));

    expect(response.status).toBe(400);
  });

  test('rejects a non-boolean archived payload with 400', async () => {
    const { controller } = createController();

    const response = await controller.fetch(new Request('http://localhost/crowdsec/api/instances/default/metadata', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: 'yes' }),
    }));

    expect(response.status).toBe(400);
  });
});
