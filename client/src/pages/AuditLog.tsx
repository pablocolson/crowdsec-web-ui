import { useCallback, useEffect, useState } from 'react';
import { FileJson, FileSpreadsheet, Search, X } from 'lucide-react';
import { fetchAuditEvents, getAuditEventsExportUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useDateTime } from '../lib/dateTime';
import type { AuditEvent } from '../types';
import { Badge } from '../components/ui/Badge';

type AuditAction = AuditEvent['action'];
type AuditOutcome = AuditEvent['outcome'];

const ACTION_LABELS: Record<string, string> = {
  'decision.add': 'decision.add',
  'decision.delete': 'decision.delete',
  'alert.delete': 'alert.delete',
  'cleanup.by-ip': 'cleanup.by-ip',
  'instance.metadata.update': 'instance.metadata.update',
  'investigation.update': 'investigation.update',
  'investigation.note_added': 'investigation.note_added',
};

const OUTCOME_COLORS: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  success: 'success',
  partial: 'warning',
  failure: 'danger',
  queued: 'default',
};

export function AuditLog() {
  const { t } = useI18n();
  const { formatTime } = useDateTime();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterAction, setFilterAction] = useState('');
  const [filterOutcome, setFilterOutcome] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterSince, setFilterSince] = useState('');
  const [filterUntil, setFilterUntil] = useState('');

  const LIMIT = 50;

  const load = useCallback(async (pageOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAuditEvents({
        offset: pageOffset,
        limit: LIMIT,
        action: filterAction || undefined,
        outcome: filterOutcome || undefined,
        user: filterUser || undefined,
        since: filterSince || undefined,
        until: filterUntil || undefined,
      });
      setEvents(data.events);
      setTotal(data.total);
      setOffset(data.offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit events');
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterOutcome, filterUser, filterSince, filterUntil]);

  useEffect(() => {
    load(0);
  }, [load]);

  const hasFilters = filterAction || filterOutcome || filterUser || filterSince || filterUntil;

  const clearFilters = () => {
    setFilterAction('');
    setFilterOutcome('');
    setFilterUser('');
    setFilterSince('');
    setFilterUntil('');
  };

  const currentPage = Math.floor(offset / LIMIT) + 1;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t('pages.auditLog.title')}</h1>
        <div className="ml-auto flex items-center gap-2">
          <a
            href={getAuditEventsExportUrl({ format: 'csv', max_events: 1000, action: filterAction || undefined, outcome: filterOutcome || undefined, user: filterUser || undefined, since: filterSince || undefined, until: filterUntil || undefined })}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <FileSpreadsheet size={16} />
            CSV
          </a>
          <a
            href={getAuditEventsExportUrl({ format: 'json', max_events: 1000, action: filterAction || undefined, outcome: filterOutcome || undefined, user: filterUser || undefined, since: filterSince || undefined, until: filterUntil || undefined })}
            download
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <FileJson size={16} />
            JSON
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
        <div className="mb-3 flex items-center gap-2">
          <Search size={16} className="text-gray-500" />
          <span className="text-sm font-medium">{t('pages.auditLog.filters')}</span>
          {hasFilters && (
            <button onClick={clearFilters} className="ml-auto flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X size={14} />
              Clear
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.user')}</label>
            <input
              value={filterUser}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterUser(e.target.value)}
              placeholder={t('pages.auditLog.filterUserPlaceholder')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.action')}</label>
            <select
              value={filterAction}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterAction(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">All actions</option>
              {Object.keys(ACTION_LABELS).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.outcome')}</label>
            <select
              value={filterOutcome}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterOutcome(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">All outcomes</option>
              {['success', 'partial', 'failure', 'queued'].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.since')}</label>
            <input
              type="datetime-local"
              value={filterSince}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterSince(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.until')}</label>
            <input
              type="datetime-local"
              value={filterUntil}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilterUntil(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <span>{t('app.loading')}</span>
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          {hasFilters ? t('pages.auditLog.noResults') : t('pages.auditLog.noEvents')}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.time')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.user')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.action')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.outcome')}</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{t('pages.auditLog.details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-400">
                      {formatTime(event.time, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{event.user}</span>
                        {event.role && <span className="text-xs text-gray-500">{event.role}</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700 dark:text-gray-300">
                      {ACTION_LABELS[event.action] ?? event.action}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge variant={OUTCOME_COLORS[event.outcome] ?? 'default'}>{event.outcome}</Badge>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-gray-500 dark:text-gray-400">
                      {event.details && Object.keys(event.details).length > 0 ? (
                        <span className="block max-w-xs truncate font-mono text-xs">
                          {JSON.stringify(event.details)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-4">
              <button
                onClick={() => load((currentPage - 2) * LIMIT)}
                disabled={currentPage <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => load(currentPage * LIMIT)}
                disabled={currentPage >= totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}