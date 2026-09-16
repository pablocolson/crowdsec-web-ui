import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    Activity,
    AlertCircle,
    ArchiveRestore,
    ArrowLeft,
    CheckCircle2,
    Gavel,
    PackageOpen,
    ShieldAlert,
    ShieldCheck,
} from 'lucide-react';
import { fetchConfig, fetchCrowdsecMetrics, updateInstanceMetadata } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useDateTime } from '../lib/dateTime';
import { useRefresh } from '../contexts/useRefresh';
import { useOptionalToast } from '../contexts/useToast';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { CopyableText } from '../components/ui/CopyableText';
import { GroupListEditor } from './Settings';
import { bouncerModeVariant } from '../lib/metricsDisplay';
import { INSTANCE_TAG_LIMITS } from '../../../shared/contracts';
import type { CrowdsecMetricsResponse, InstanceSummary } from '../types';

export function SecurityEngineDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { formatDateTime } = useDateTime();
    const { refreshSignal } = useRefresh();
    const toast = useOptionalToast();

    const [instance, setInstance] = useState<InstanceSummary | null>(null);
    const [canManageSettings, setCanManageSettings] = useState(true);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [loadError, setLoadError] = useState(false);

    const [tagDraft, setTagDraft] = useState('');
    const [savingTags, setSavingTags] = useState(false);
    const [savingArchived, setSavingArchived] = useState(false);
    const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);

    const [metrics, setMetrics] = useState<CrowdsecMetricsResponse | null>(null);
    const [metricsError, setMetricsError] = useState<string | null>(null);
    const [metricsLoading, setMetricsLoading] = useState(false);

    const loadInstance = useCallback(async () => {
        try {
            const config = await fetchConfig();
            const found = (config.instances || []).find((candidate) => candidate.id === id) || null;
            setInstance(found);
            setNotFound(!found);
            setLoadError(false);
            setCanManageSettings(config.permissions?.can_manage_settings !== false);
        } catch (error) {
            console.error('Failed to load security engine', error);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        queueMicrotask(() => {
            void loadInstance();
        });
    }, [loadInstance, refreshSignal]);

    // Navigating away is a side effect of a failed lookup, not something to do
    // during render: doing it inline would both warn ("Cannot update a
    // component while rendering a different component") and would fire even
    // while a fetch is merely in flight.
    useEffect(() => {
        if (notFound) {
            navigate('/security-engines', { replace: true });
        }
    }, [notFound, navigate]);

    const instanceId = instance?.id;
    const primaryEndpointId = instance?.prometheus[0]?.id;

    useEffect(() => {
        let cancelled = false;

        queueMicrotask(() => {
            if (cancelled) return;
            if (!instanceId || !primaryEndpointId) {
                setMetrics(null);
                return;
            }

            setMetricsLoading(true);
            setMetricsError(null);
            fetchCrowdsecMetrics(instanceId, primaryEndpointId)
                .then((response) => {
                    if (!cancelled) setMetrics(response);
                })
                .catch((error: unknown) => {
                    if (!cancelled) setMetricsError(error instanceof Error ? error.message : String(error));
                })
                .finally(() => {
                    if (!cancelled) setMetricsLoading(false);
                });
        });

        return () => {
            cancelled = true;
        };
        // Re-fetching only needs to happen when the engine or its Prometheus
        // endpoint actually changes, not on every setInstance() call (tag
        // edits and archive toggles create a new instance object reference).
    }, [instanceId, primaryEndpointId]);

    const tags = useMemo(() => instance?.tags ?? [], [instance]);
    const tagLimitReached = tags.length >= INSTANCE_TAG_LIMITS.maxTags;
    const tagControlsDisabled = savingTags || !canManageSettings;

    const handleTagDraftChange = useCallback((value: string) => {
        setTagDraft(value.slice(0, INSTANCE_TAG_LIMITS.maxTagLength));
    }, []);

    const handleAddTag = useCallback(async () => {
        if (!instance || !tagDraft.trim()) return;
        if (tagLimitReached) {
            toast?.addToast(t('pages.securityEngineDetails.tagsLimitReached', { max: INSTANCE_TAG_LIMITS.maxTags }), 'danger');
            return;
        }
        const nextTags = [...tags, tagDraft.trim()];
        setSavingTags(true);
        try {
            const result = await updateInstanceMetadata(instance.id, { tags: nextTags });
            setInstance((current) => (current && current.id === result.instance_id ? { ...current, tags: result.tags } : current));
            setTagDraft('');
        } catch (error) {
            console.error('Failed to add tag', error);
            toast?.addToast(t('pages.securityEngineDetails.tagsSaveFailed'), 'danger');
        } finally {
            setSavingTags(false);
        }
    }, [instance, tagDraft, tagLimitReached, tags, toast, t]);

    const handleRemoveTag = useCallback(async (tag: string) => {
        if (!instance) return;
        const nextTags = tags.filter((candidate) => candidate !== tag);
        setSavingTags(true);
        try {
            const result = await updateInstanceMetadata(instance.id, { tags: nextTags });
            setInstance((current) => (current && current.id === result.instance_id ? { ...current, tags: result.tags } : current));
        } catch (error) {
            console.error('Failed to remove tag', error);
            toast?.addToast(t('pages.securityEngineDetails.tagsSaveFailed'), 'danger');
        } finally {
            setSavingTags(false);
        }
    }, [instance, tags, toast, t]);

    const handleSetArchived = useCallback(async (archived: boolean) => {
        if (!instance) return;
        setSavingArchived(true);
        try {
            const result = await updateInstanceMetadata(instance.id, { archived });
            setInstance((current) => (current && current.id === result.instance_id ? { ...current, archived: result.archived } : current));
        } catch (error) {
            console.error('Failed to update archive status', error);
            toast?.addToast(t('pages.securityEngineDetails.archiveFailed'), 'danger');
        } finally {
            setSavingArchived(false);
            setConfirmArchiveOpen(false);
        }
    }, [instance, toast, t]);

    const handleRetry = useCallback(() => {
        setLoading(true);
        void loadInstance();
    }, [loadInstance]);

    if (loading) {
        return <div className="p-8 text-center text-gray-500">{t('app.loading')}</div>;
    }

    if (loadError) {
        return (
            <div className="space-y-4 p-8 text-center">
                <p className="text-gray-500 dark:text-gray-400">{t('pages.securityEngineDetails.loadError')}</p>
                <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                    {t('common.retry')}
                </button>
            </div>
        );
    }

    if (notFound || !instance) {
        // The redirect effect above handles navigation; render nothing while
        // it takes effect on the next tick.
        return null;
    }

    const isOnline = instance.lapi_status.isConnected;
    const instanceQuery = `?instance=${encodeURIComponent(instance.id)}`;
    const archiveControlsDisabled = savingArchived || !canManageSettings;

    return (
        <div className="space-y-6">
            <Link
                to="/security-engines"
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
                <ArrowLeft className="h-4 w-4" />
                {t('pages.securityEngineDetails.backToList')}
            </Link>

            <Card>
                <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>{instance.name}</CardTitle>
                        <CopyableText value={instance.id} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <span className="font-mono">{t('pages.securityEngineDetails.id')}: {instance.id}</span>
                        </CopyableText>
                    </div>
                    <div className="flex items-center gap-2">
                        {instance.archived && <Badge variant="secondary">{t('common.archived')}</Badge>}
                        {instance.archived ? (
                            <button
                                type="button"
                                onClick={() => void handleSetArchived(false)}
                                disabled={archiveControlsDisabled}
                                title={canManageSettings ? undefined : t('pages.securityEngineDetails.readOnlyHint')}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                                <ArchiveRestore className="h-4 w-4" />
                                {t('pages.securityEngineDetails.unarchiveAction')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setConfirmArchiveOpen(true)}
                                disabled={archiveControlsDisabled}
                                title={canManageSettings ? undefined : t('pages.securityEngineDetails.readOnlyHint')}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                                <PackageOpen className="h-4 w-4" />
                                {t('pages.securityEngineDetails.archiveAction')}
                            </button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngineDetails.status')}</p>
                            <div className="mt-1 flex items-center gap-2">
                                {isOnline ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                                )}
                                <span className={isOnline ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                                    {isOnline ? t('common.online') : t('common.offline')}
                                </span>
                            </div>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngineDetails.lastCheck')}</p>
                            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                {instance.lapi_status.lastCheck ? formatDateTime(instance.lapi_status.lastCheck) : '-'}
                            </p>
                        </div>
                        <Link to={`/alerts${instanceQuery}`} className="group">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngineDetails.alertsCount')}</p>
                            <p className="mt-1 flex items-center gap-1.5 font-mono text-lg font-semibold text-gray-900 group-hover:text-primary-600 dark:text-white dark:group-hover:text-primary-400">
                                <ShieldAlert className="h-4 w-4" />
                                {(instance.alerts_count ?? 0).toLocaleString()}
                            </p>
                        </Link>
                        <Link to={`/decisions${instanceQuery}`} className="group">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('pages.securityEngineDetails.decisionsCount')}</p>
                            <p className="mt-1 flex items-center gap-1.5 font-mono text-lg font-semibold text-gray-900 group-hover:text-primary-600 dark:text-white dark:group-hover:text-primary-400">
                                <Gavel className="h-4 w-4" />
                                {(instance.decisions_count ?? 0).toLocaleString()}
                            </p>
                        </Link>
                    </div>

                    {instance.lapi_status.lastError && (
                        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                            {t('pages.securityEngineDetails.lastError')}: {instance.lapi_status.lastError}
                        </p>
                    )}

                    <GroupListEditor
                        id="security-engine-tags"
                        label={t('pages.securityEngineDetails.tagsTitle')}
                        groups={tags}
                        draft={tagDraft}
                        onDraftChange={handleTagDraftChange}
                        onAdd={() => void handleAddTag()}
                        onRemove={(tag) => void handleRemoveTag(tag)}
                        disabled={tagControlsDisabled}
                        placeholder={tagLimitReached
                            ? t('pages.securityEngineDetails.tagsLimitReached', { max: INSTANCE_TAG_LIMITS.maxTags })
                            : t('pages.securityEngineDetails.tagPlaceholder')}
                        addLabel={t('common.addTag')}
                        emptyLabel={t('common.noTags')}
                        removeLabel={(tag) => `${t('common.remove')} ${tag}`}
                        labelClass="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                    />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        {t('pages.metrics.remediationComponents')}
                    </CardTitle>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('pages.metrics.bouncersDescription')}</p>
                </CardHeader>
                <CardContent>
                    {!primaryEndpointId ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('pages.securityEngineDetails.metricsUnavailable')}</p>
                    ) : metricsLoading ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loadingChart')}</p>
                    ) : metricsError ? (
                        <p className="text-sm text-red-600 dark:text-red-400">{metricsError}</p>
                    ) : !metrics || metrics.bouncers.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('pages.metrics.emptyBouncers')}</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {metrics.bouncers.map((bouncer) => (
                                <div key={bouncer.name} className="rounded-lg border border-gray-100 p-3 dark:border-gray-700/70">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="truncate font-semibold text-gray-900 dark:text-white" title={bouncer.name}>{bouncer.name}</p>
                                        <Badge variant={bouncerModeVariant(bouncer.mode)}>{t(`pages.metrics.modes.${bouncer.mode || 'unknown'}`)}</Badge>
                                    </div>
                                    <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                                        <Activity className="h-3.5 w-3.5" />
                                        {bouncer.requests.toLocaleString()} {t('pages.metrics.labels.requests')}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('pages.metrics.scenarios')}</CardTitle>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('pages.metrics.scenariosDescription')}</p>
                </CardHeader>
                <CardContent>
                    {!primaryEndpointId ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('pages.securityEngineDetails.metricsUnavailable')}</p>
                    ) : metricsLoading ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loadingChart')}</p>
                    ) : !metrics || (metrics.scenarios || []).length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">{t('pages.metrics.emptyScenarios')}</p>
                    ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
                            {(metrics.scenarios || []).map((scenario) => (
                                <li key={scenario.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                                    <span className="truncate font-medium text-gray-900 dark:text-white" title={scenario.name}>{scenario.name}</span>
                                    <span className="font-mono text-gray-600 dark:text-gray-300">{scenario.current.toLocaleString()}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <Modal
                isOpen={confirmArchiveOpen}
                onClose={() => setConfirmArchiveOpen(false)}
                title={t('pages.securityEngineDetails.archiveConfirmTitle')}
            >
                <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
                    {t('pages.securityEngineDetails.archiveConfirmDescription')}
                </p>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={() => setConfirmArchiveOpen(false)}
                        className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSetArchived(true)}
                        disabled={savingArchived}
                        className="min-h-11 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {t('pages.securityEngineDetails.archiveAction')}
                    </button>
                </div>
            </Modal>
        </div>
    );
}

export default SecurityEngineDetails;
