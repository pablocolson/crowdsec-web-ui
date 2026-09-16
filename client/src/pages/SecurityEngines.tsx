import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Search, Table as TableIcon } from 'lucide-react';
import { fetchConfig } from '../lib/api';
import { useRefresh } from '../contexts/useRefresh';
import { useI18n } from '../lib/i18n';
import { useDateTime } from '../lib/dateTime';
import { Switch } from '../components/ui/Switch';
import { SecurityEngineCard } from '../components/SecurityEngineCard';
import { InstanceIcon } from '../components/InstanceIcon';
import { Link } from 'react-router-dom';
import type { InstanceSummary } from '../types';

type ViewMode = 'cards' | 'table';

const VIEW_MODE_STORAGE_KEY = 'crowdsec-web-ui:security-engines:view-mode';
/** Engines with no LAPI check in this window are flagged as inactive, mirroring the
 * CrowdSec Console's 30-day inactivity cutoff for Security Engines. */
const INACTIVITY_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

function parseStoredViewMode(value: string | null): ViewMode {
    return value === 'table' ? 'table' : 'cards';
}

function matchesSearch(instance: InstanceSummary, query: string): boolean {
    if (!query) return true;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;
    return (
        instance.name.toLowerCase().includes(normalized)
        || instance.id.toLowerCase().includes(normalized)
        || (instance.tags ?? []).some((tag) => tag.toLowerCase().includes(normalized))
    );
}

function isInactive(instance: InstanceSummary): boolean {
    const lastCheck = instance.lapi_status.lastCheck;
    if (!lastCheck) return true;
    const timestamp = Date.parse(lastCheck);
    if (Number.isNaN(timestamp)) return true;
    return Date.now() - timestamp > INACTIVITY_THRESHOLD_MS;
}

export function SecurityEngines() {
    const { t } = useI18n();
    const { formatDateTime } = useDateTime();
    const { refreshSignal } = useRefresh();
    const [instances, setInstances] = useState<InstanceSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>(() => parseStoredViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY)));

    const loadInstances = useCallback(async () => {
        try {
            const config = await fetchConfig();
            setInstances(config.instances || []);
        } catch (error) {
            console.error('Failed to load security engines', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        queueMicrotask(() => {
            void loadInstances();
        });
    }, [loadInstances, refreshSignal]);

    useEffect(() => {
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    }, [viewMode]);

    const visibleInstances = useMemo(
        () => instances
            .filter((instance) => showArchived || !instance.archived)
            .filter((instance) => matchesSearch(instance, searchQuery)),
        [instances, searchQuery, showArchived],
    );

    if (loading) {
        return <div className="p-8 text-center text-gray-500">{t('app.loading')}</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('pages.securityEngines.title')}</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('pages.securityEngines.subtitle')}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t('pages.securityEngines.searchPlaceholder')}
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                </div>

                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Switch checked={showArchived} onCheckedChange={setShowArchived} ariaLabelledBy="show-archived-label" />
                        <span id="show-archived-label">{t('pages.securityEngines.showArchived')}</span>
                    </label>

                    <div className="flex rounded-lg border border-gray-300 dark:border-gray-600" role="group" aria-label={t('pages.securityEngines.title')}>
                        <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            aria-pressed={viewMode === 'cards'}
                            aria-label={t('pages.securityEngines.cardView')}
                            title={t('pages.securityEngines.cardView')}
                            className={`flex items-center gap-1.5 rounded-l-lg px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'cards'
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                }`}
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            aria-pressed={viewMode === 'table'}
                            aria-label={t('pages.securityEngines.tableView')}
                            title={t('pages.securityEngines.tableView')}
                            className={`flex items-center gap-1.5 rounded-r-lg border-l border-gray-300 px-3 py-2 text-sm font-medium transition-colors dark:border-gray-600 ${viewMode === 'table'
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                }`}
                        >
                            <TableIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {visibleInstances.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {instances.length === 0 ? t('pages.securityEngines.empty') : t('pages.securityEngines.emptySearch')}
                </div>
            ) : viewMode === 'cards' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleInstances.map((instance, index) => (
                        <SecurityEngineCard key={instance.id} instance={instance} colorIndex={index} />
                    ))}
                </div>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800/60">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngines.columns.name')}</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngines.columns.status')}</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngines.columns.alerts')}</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngines.columns.decisions')}</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngines.columns.tags')}</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngines.columns.lastCheck')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700/70 dark:bg-gray-900/40">
                            {visibleInstances.map((instance, index) => (
                                <tr key={instance.id} className={instance.archived ? 'opacity-60' : undefined}>
                                    <td className="px-4 py-3 text-sm">
                                        <Link
                                            to={`/security-engines/${encodeURIComponent(instance.id)}`}
                                            className="flex items-center gap-2 font-medium text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                                        >
                                            <InstanceIcon icon={instance.icon} colorIndex={index} />
                                            {instance.name}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                        <span className={instance.lapi_status.isConnected ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                                            {instance.lapi_status.isConnected ? t('common.online') : t('common.offline')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-sm text-gray-900 dark:text-gray-100">{(instance.alerts_count ?? 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-mono text-sm text-gray-900 dark:text-gray-100">{(instance.decisions_count ?? 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{(instance.tags ?? []).join(', ') || '-'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                        {instance.lapi_status.lastCheck ? formatDateTime(instance.lapi_status.lastCheck) : '-'}
                                        {isInactive(instance) && (
                                            <span
                                                className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
                                                title={t('pages.securityEngines.inactiveNotice')}
                                            >
                                                <span aria-hidden="true">●</span>
                                                <span className="sr-only">{t('pages.securityEngines.inactiveNotice')}</span>
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default SecurityEngines;
