import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SecurityEngineDetails } from '../SecurityEngineDetails';
import type { ConfigResponse, InstanceSummary } from '../../types';

const {
    fetchConfigMock,
    fetchCrowdsecMetricsMock,
    updateInstanceMetadataMock,
} = vi.hoisted(() => ({
    fetchConfigMock: vi.fn(),
    fetchCrowdsecMetricsMock: vi.fn(),
    updateInstanceMetadataMock: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
    fetchConfig: fetchConfigMock,
    fetchCrowdsecMetrics: fetchCrowdsecMetricsMock,
    updateInstanceMetadata: updateInstanceMetadataMock,
}));

vi.mock('../../contexts/useRefresh', () => ({
    useRefresh: () => ({ refreshSignal: 0 }),
}));

beforeEach(() => {
    fetchConfigMock.mockReset();
    fetchCrowdsecMetricsMock.mockReset();
    updateInstanceMetadataMock.mockReset();
});

function sampleInstance(overrides: Partial<InstanceSummary> = {}): InstanceSummary {
    return {
        id: 'default',
        name: 'CrowdSec',
        lapi_status: { isConnected: true, lastCheck: '2026-01-01T00:00:00.000Z', lastError: null, offline_since: null },
        sync_status: { isSyncing: false, progress: 100, message: '', startedAt: null, completedAt: null },
        prometheus: [],
        alerts_count: 5,
        decisions_count: 2,
        tags: [],
        archived: false,
        ...overrides,
    };
}

function configWith(instance: InstanceSummary, permissions?: ConfigResponse['permissions']): ConfigResponse {
    return {
        lookback_period: '168h',
        lookback_hours: 168,
        lookback_days: 7,
        refresh_interval: 0,
        current_interval_name: 'off',
        lapi_status: instance.lapi_status,
        instances: [instance],
        sync_status: { isSyncing: false, progress: 100, message: '', startedAt: null, completedAt: null },
        simulations_enabled: false,
        machine_features_enabled: true,
        origin_features_enabled: true,
        permissions,
    };
}

function renderPage(initialPath = '/security-engines/default') {
    return render(
        <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
                <Route path="/security-engines/:id" element={<SecurityEngineDetails />} />
                <Route path="/security-engines" element={<div>Engines list</div>} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('SecurityEngineDetails page', () => {
    test('renders the engine summary once loaded', async () => {
        fetchConfigMock.mockResolvedValue(configWith(sampleInstance()));
        renderPage();

        expect(await screen.findByRole('heading', { name: 'CrowdSec' })).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
    });

    test('redirects to the list when the instance id does not exist', async () => {
        fetchConfigMock.mockResolvedValue(configWith(sampleInstance()));
        renderPage('/security-engines/does-not-exist');

        expect(await screen.findByText('Engines list')).toBeInTheDocument();
    });

    test('shows a retry option instead of silently redirecting when the request fails', async () => {
        fetchConfigMock.mockRejectedValueOnce(new Error('network blip'));
        const user = userEvent.setup();
        renderPage();

        expect(await screen.findByText('Failed to load this security engine.')).toBeInTheDocument();
        // Must not silently look like "not found": the list route content
        // should not be reached from a transient network failure.
        expect(screen.queryByText('Engines list')).not.toBeInTheDocument();

        fetchConfigMock.mockResolvedValueOnce(configWith(sampleInstance()));
        await user.click(screen.getByRole('button', { name: 'Retry' }));

        expect(await screen.findByRole('heading', { name: 'CrowdSec' })).toBeInTheDocument();
    });

    test('adds a tag and reflects the server response without re-fetching metrics', async () => {
        fetchConfigMock.mockResolvedValue(configWith(sampleInstance({
            prometheus: [{ id: 'lapi', name: 'LAPI' }],
        })));
        fetchCrowdsecMetricsMock.mockResolvedValue({
            fetched_at: new Date().toISOString(),
            totals: {
                bouncerRequests: 0, machineRequests: 0, appsecRequests: 0, appsecBlocked: 0,
                parserProcessed: 0, parserOk: 0, parserKo: 0, parserSuccessRate: null,
                parserAverageSeconds: null, whitelistHits: 0, whitelisted: 0,
            },
            bouncers: [], machines: [], parserSources: [], parserNodes: [], whitelists: [], parserTimings: [],
        });
        updateInstanceMetadataMock.mockResolvedValue({ success: true, instance_id: 'default', tags: ['production'], archived: false });
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole('heading', { name: 'CrowdSec' });
        await waitFor(() => expect(fetchCrowdsecMetricsMock).toHaveBeenCalledTimes(1));

        await user.type(screen.getByLabelText('Tags'), 'production');
        await user.click(screen.getByRole('button', { name: 'Add tag' }));

        await waitFor(() => expect(updateInstanceMetadataMock).toHaveBeenCalledWith('default', { tags: ['production'] }));
        expect(await screen.findByText('production')).toBeInTheDocument();
        // Editing a tag creates a new `instance` object reference; the metrics
        // effect must key off primitive ids, not that reference, or it would
        // needlessly refetch Prometheus metrics on every tag edit.
        expect(fetchCrowdsecMetricsMock).toHaveBeenCalledTimes(1);
    });

    test('archives the engine after confirming in the modal', async () => {
        fetchConfigMock.mockResolvedValue(configWith(sampleInstance()));
        updateInstanceMetadataMock.mockResolvedValue({ success: true, instance_id: 'default', tags: [], archived: true });
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole('heading', { name: 'CrowdSec' });

        await user.click(screen.getByRole('button', { name: 'Archive' }));
        expect(screen.getByText('Archive this security engine?')).toBeInTheDocument();

        await user.click(screen.getAllByRole('button', { name: 'Archive' })[1]);

        await waitFor(() => expect(updateInstanceMetadataMock).toHaveBeenCalledWith('default', { archived: true }));
        expect(await screen.findByText('Archived')).toBeInTheDocument();
    });

    test('disables tag and archive controls in read-only mode', async () => {
        fetchConfigMock.mockResolvedValue(configWith(sampleInstance(), {
            mode: 'read-only',
            can_manage_enforcement: false,
            can_manage_settings: false,
        }));
        renderPage();
        await screen.findByRole('heading', { name: 'CrowdSec' });

        expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled();
    });

    test('shows a metrics-unavailable message when no Prometheus endpoint is configured', async () => {
        fetchConfigMock.mockResolvedValue(configWith(sampleInstance({ prometheus: [] })));
        renderPage();
        await screen.findByRole('heading', { name: 'CrowdSec' });

        expect(fetchCrowdsecMetricsMock).not.toHaveBeenCalled();
        expect(screen.getAllByText('Prometheus metrics are not configured for this security engine.')).toHaveLength(2);
    });
});
