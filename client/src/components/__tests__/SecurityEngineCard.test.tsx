import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { SecurityEngineCard } from '../SecurityEngineCard';
import type { InstanceSummary } from '../../types';

function sampleInstance(overrides: Partial<InstanceSummary> = {}): InstanceSummary {
    return {
        id: 'default',
        name: 'CrowdSec',
        lapi_status: {
            isConnected: true,
            lastCheck: '2026-01-01T00:00:00.000Z',
            lastError: null,
            offline_since: null,
        },
        sync_status: {
            isSyncing: false,
            progress: 100,
            message: '',
            startedAt: null,
            completedAt: null,
        },
        prometheus: [],
        alerts_count: 12,
        decisions_count: 3,
        tags: [],
        archived: false,
        ...overrides,
    };
}

function renderCard(instance: InstanceSummary) {
    return render(
        <MemoryRouter>
            <SecurityEngineCard instance={instance} colorIndex={0} />
        </MemoryRouter>,
    );
}

describe('SecurityEngineCard', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders the engine name, id, counts, and links to its details page', () => {
        renderCard(sampleInstance());

        const link = screen.getByRole('link', { name: /CrowdSec/ });
        expect(link).toHaveAttribute('href', '/security-engines/default');
        expect(screen.getByText('default')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument();
    });

    test('shows an offline indicator when the LAPI is not connected', () => {
        renderCard(sampleInstance({ lapi_status: { isConnected: false, lastCheck: null, lastError: 'boom', offline_since: null } }));

        expect(screen.getByText('Offline')).toBeInTheDocument();
        expect(screen.getByText(/Never/)).toBeInTheDocument();
    });

    test('renders tags and an archived badge when present', () => {
        renderCard(sampleInstance({ tags: ['production', 'edge'], archived: true }));

        expect(screen.getByText('production')).toBeInTheDocument();
        expect(screen.getByText('edge')).toBeInTheDocument();
        expect(screen.getByText('Archived')).toBeInTheDocument();
    });
});
