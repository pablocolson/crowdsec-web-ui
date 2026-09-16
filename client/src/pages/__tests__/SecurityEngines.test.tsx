import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SecurityEngines } from '../SecurityEngines';
import type { ConfigResponse, InstanceSummary } from '../../types';

const { fetchConfigMock } = vi.hoisted(() => ({ fetchConfigMock: vi.fn() }));

vi.mock('../../lib/api', () => ({
    fetchConfig: fetchConfigMock,
}));

vi.mock('../../contexts/useRefresh', () => ({
    useRefresh: () => ({ refreshSignal: 0 }),
}));

beforeEach(() => {
    fetchConfigMock.mockReset();
});

function sampleInstance(overrides: Partial<InstanceSummary> = {}): InstanceSummary {
    return {
        id: 'default',
        name: 'CrowdSec',
        lapi_status: { isConnected: true, lastCheck: new Date().toISOString(), lastError: null, offline_since: null },
        sync_status: { isSyncing: false, progress: 100, message: '', startedAt: null, completedAt: null },
        prometheus: [],
        alerts_count: 5,
        decisions_count: 2,
        tags: [],
        archived: false,
        ...overrides,
    };
}

function configWith(instances: InstanceSummary[]): ConfigResponse {
    return {
        lookback_period: '168h',
        lookback_hours: 168,
        lookback_days: 7,
        refresh_interval: 0,
        current_interval_name: 'off',
        lapi_status: instances[0]?.lapi_status ?? { isConnected: true, lastCheck: null, lastError: null, offline_since: null },
        instances,
        sync_status: { isSyncing: false, progress: 100, message: '', startedAt: null, completedAt: null },
        simulations_enabled: false,
        machine_features_enabled: true,
        origin_features_enabled: true,
    };
}

function renderPage() {
    return render(
        <MemoryRouter>
            <SecurityEngines />
        </MemoryRouter>,
    );
}

describe('SecurityEngines page', () => {
    test('lists configured security engines as cards by default', async () => {
        fetchConfigMock.mockResolvedValue(configWith([
            sampleInstance({ id: 'default', name: 'CrowdSec' }),
            sampleInstance({ id: 'edge', name: 'Edge Node' }),
        ]));
        renderPage();

        expect(await screen.findByRole('link', { name: /CrowdSec/ })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Edge Node/ })).toBeInTheDocument();
    });

    test('shows the empty state when no engines are configured', async () => {
        fetchConfigMock.mockResolvedValue(configWith([]));
        renderPage();

        expect(await screen.findByText('No security engines configured.')).toBeInTheDocument();
    });

    test('filters engines by search query, matching name, id, and tags', async () => {
        fetchConfigMock.mockResolvedValue(configWith([
            sampleInstance({ id: 'default', name: 'CrowdSec' }),
            sampleInstance({ id: 'edge', name: 'Edge Node', tags: ['production'] }),
        ]));
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole('link', { name: /CrowdSec/ });

        await user.type(screen.getByPlaceholderText('Search by name, ID, or tag...'), 'production');

        expect(screen.queryByRole('link', { name: /CrowdSec/ })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Edge Node/ })).toBeInTheDocument();
    });

    test('hides archived engines by default and shows them when toggled on', async () => {
        fetchConfigMock.mockResolvedValue(configWith([
            sampleInstance({ id: 'default', name: 'CrowdSec' }),
            sampleInstance({ id: 'edge', name: 'Edge Node', archived: true }),
        ]));
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole('link', { name: /CrowdSec/ });

        expect(screen.queryByRole('link', { name: /Edge Node/ })).not.toBeInTheDocument();

        await user.click(screen.getByRole('switch'));

        expect(await screen.findByRole('link', { name: /Edge Node/ })).toBeInTheDocument();
    });

    test('switches to table view and shows tabular data', async () => {
        fetchConfigMock.mockResolvedValue(configWith([sampleInstance({ id: 'default', name: 'CrowdSec' })]));
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole('link', { name: /CrowdSec/ });

        await user.click(screen.getByRole('button', { name: 'Table view' }));

        const table = await screen.findByRole('table');
        expect(table).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    });

    test('reloads when the config request fails, without crashing', async () => {
        fetchConfigMock.mockRejectedValue(new Error('network down'));
        renderPage();

        await waitFor(() => expect(fetchConfigMock).toHaveBeenCalled());
        expect(await screen.findByText('No security engines configured.')).toBeInTheDocument();
    });
});
