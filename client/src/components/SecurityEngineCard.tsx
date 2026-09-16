import { Link } from 'react-router-dom';
import { Activity, AlertCircle, CheckCircle2, Gavel, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { CopyableText } from './ui/CopyableText';
import { InstanceIcon } from './InstanceIcon';
import { useI18n } from '../lib/i18n';
import { useDateTime } from '../lib/dateTime';
import type { InstanceSummary } from '../types';

interface SecurityEngineCardProps {
    instance: InstanceSummary;
    colorIndex: number;
}

export function SecurityEngineCard({ instance, colorIndex }: SecurityEngineCardProps) {
    const { t } = useI18n();
    const { formatDateTime } = useDateTime();
    const isOnline = instance.lapi_status.isConnected;

    return (
        <Card className={`h-full transition-shadow hover:shadow-lg ${instance.archived ? 'opacity-60' : ''}`}>
            <CardContent className="flex h-full flex-col gap-4 p-4">
                <div className="flex items-start justify-between gap-2">
                    <Link
                        to={`/security-engines/${encodeURIComponent(instance.id)}`}
                        className="flex min-w-0 items-center gap-2 font-semibold text-gray-900 hover:text-primary-600 dark:text-white dark:hover:text-primary-400"
                    >
                        <InstanceIcon icon={instance.icon} colorIndex={colorIndex} />
                        <span className="truncate" title={instance.name}>{instance.name}</span>
                    </Link>
                    {instance.archived && (
                        <Badge variant="secondary">{t('common.archived')}</Badge>
                    )}
                </div>

                <CopyableText
                    value={instance.id}
                    label={instance.id}
                    className="text-xs text-gray-500 dark:text-gray-400"
                >
                    <span className="truncate font-mono">{instance.id}</span>
                </CopyableText>

                <div className="flex items-center gap-2 text-sm">
                    {isOnline ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                    ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    )}
                    <span className={isOnline ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                        {isOnline ? t('common.online') : t('common.offline')}
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-center dark:border-gray-700/70">
                    <div>
                        <div className="flex items-center justify-center gap-1.5 text-gray-500 dark:text-gray-400">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            <span className="text-xs">{t('components.securityEngineCard.alerts')}</span>
                        </div>
                        <p className="mt-0.5 font-mono text-lg font-semibold text-gray-900 dark:text-white">
                            {(instance.alerts_count ?? 0).toLocaleString()}
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center justify-center gap-1.5 text-gray-500 dark:text-gray-400">
                            <Gavel className="h-3.5 w-3.5" />
                            <span className="text-xs">{t('components.securityEngineCard.decisions')}</span>
                        </div>
                        <p className="mt-0.5 font-mono text-lg font-semibold text-gray-900 dark:text-white">
                            {(instance.decisions_count ?? 0).toLocaleString()}
                        </p>
                    </div>
                </div>

                {instance.tags && instance.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {instance.tags.map((tag) => (
                            <Badge key={tag} variant="outline">{tag}</Badge>
                        ))}
                    </div>
                )}

                <div className="mt-auto flex items-center gap-1.5 pt-1 text-xs text-gray-400 dark:text-gray-500">
                    <Activity className="h-3.5 w-3.5" />
                    <span>
                        {t('components.securityEngineCard.lastCheck')}: {instance.lapi_status.lastCheck
                            ? formatDateTime(instance.lapi_status.lastCheck)
                            : t('components.securityEngineCard.never')}
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}
