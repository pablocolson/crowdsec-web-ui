import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, MessageSquarePlus, Save } from 'lucide-react';
import { addAlertInvestigationNote, fetchAlertInvestigation, updateAlertInvestigation } from '../lib/api';
import { useDateTime } from '../lib/dateTime';
import { useI18n } from '../lib/i18n';
import type { InvestigationResponse } from '../types';

type InvestigationStatus = 'new' | 'in_progress' | 'resolved';

interface AlertInvestigationPanelProps {
  alertId: string | number;
  instanceId?: string;
  disabled?: boolean;
}

export function AlertInvestigationPanel({ alertId, instanceId, disabled = false }: AlertInvestigationPanelProps) {
  const { t } = useI18n();
  const { formatDateTime } = useDateTime();
  const [data, setData] = useState<InvestigationResponse | null>(null);
  const [status, setStatus] = useState<InvestigationStatus>('new');
  const [assignedTo, setAssignedTo] = useState('');
  const [ticketRef, setTicketRef] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyData = useCallback((response: InvestigationResponse) => {
    setData(response);
    setStatus((response.investigation?.status as InvestigationStatus | undefined) ?? 'new');
    setAssignedTo(response.investigation?.assignedTo ?? '');
    setTicketRef(response.investigation?.ticketRef ?? '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      void fetchAlertInvestigation(alertId, instanceId)
        .then((response) => {
          if (!cancelled) applyData(response);
        })
        .catch((cause: unknown) => {
          if (!cancelled) setError(cause instanceof Error ? cause.message : t('pages.alerts.investigationLoadFailed'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [alertId, applyData, instanceId, t]);

  const saveInvestigation = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await updateAlertInvestigation(alertId, {
        status,
        assigned_to: assignedTo.trim() || null,
        ticket_ref: ticketRef.trim() || null,
        instance_id: instanceId,
      });
      applyData(response);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('pages.alerts.investigationSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await addAlertInvestigationNote(alertId, { content: note, instance_id: instanceId });
      setData((current) => current ? { ...current, notes: response.notes } : current);
      setNote('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('pages.alerts.investigationNoteFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        <h3 className="font-semibold text-gray-900 dark:text-white">{t('pages.alerts.investigation')}</h3>
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('app.loading')}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              {t('pages.alerts.investigationStatus')}
              <select value={status} onChange={(event) => setStatus(event.target.value as InvestigationStatus)} disabled={disabled || saving} className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800">
                <option value="new">{t('pages.alerts.investigationStatuses.new')}</option>
                <option value="in_progress">{t('pages.alerts.investigationStatuses.inProgress')}</option>
                <option value="resolved">{t('pages.alerts.investigationStatuses.resolved')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              {t('pages.alerts.investigationAssignedTo')}
              <input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} disabled={disabled || saving} className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700 dark:text-gray-300">
              {t('pages.alerts.investigationTicket')}
              <input value={ticketRef} onChange={(event) => setTicketRef(event.target.value)} disabled={disabled || saving} className="rounded-md border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-800" />
            </label>
          </div>
          <button type="button" onClick={() => void saveInvestigation()} disabled={disabled || saving} className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60">
            <Save className="h-4 w-4" />
            {t('common.save')}
          </button>
          <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
            <h4 className="font-medium text-gray-900 dark:text-white">{t('pages.alerts.investigationNotes')}</h4>
            {data?.notes.length ? (
              <ul className="mt-3 space-y-2">
                {data.notes.map((item) => (
                  <li key={item.id} className="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-800">
                    <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{item.content}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.author} · {formatDateTime(item.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('pages.alerts.investigationNoNotes')}</p>}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={disabled || saving} rows={2} placeholder={t('pages.alerts.investigationNotePlaceholder')} className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800" />
              <button type="button" onClick={() => void addNote()} disabled={disabled || saving || !note.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700">
                <MessageSquarePlus className="h-4 w-4" />
                {t('pages.alerts.investigationAddNote')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
