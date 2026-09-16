import fs from 'node:fs';
import path from 'node:path';

type HonoContext = any;

export type AuditAction = 'decision.add' | 'decision.delete' | 'alert.delete' | 'cleanup.by-ip' | 'instance.metadata.update';
export type AuditOutcome = 'success' | 'partial' | 'failure' | 'queued';

export interface AuditActor {
  username: string;
  role?: string;
}

export interface AuditEvent {
  action: AuditAction;
  outcome: AuditOutcome;
  [detail: string]: unknown;
}

export interface AuditLogger {
  enabled: boolean;
  record: (context: HonoContext, event: AuditEvent) => void;
}

export interface CreateAuditLoggerOptions {
  enabled: boolean;
  logFile?: string;
  getActor: (context: HonoContext) => AuditActor | null;
  writeDatabase?: (operation: () => void) => void;
  insertAuditStatement?: { run: (params: Record<string, unknown>) => void };
  auditEventsRetentionDays?: number;
}

export function createAuditLogger(options: CreateAuditLoggerOptions): AuditLogger {
  const { enabled, logFile, getActor, writeDatabase, insertAuditStatement, auditEventsRetentionDays } = options;
  let fileWritable = Boolean(logFile);

  if (enabled && logFile) {
    try {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
    } catch (error) {
      fileWritable = false;
      console.error(`Audit log file directory for "${logFile}" could not be created: ${(error as Error).message}`);
    }
  }

  function record(context: HonoContext, event: AuditEvent): void {
    if (!enabled) return;

    const actor = getActor(context);
    const time = new Date().toISOString();
    const entry = {
      time,
      user: actor?.username || 'unknown',
      ...(actor?.role ? { role: actor.role } : {}),
      ...event,
    };
    const line = JSON.stringify(entry);

    // Audit logging must never break the user action it describes.
    try {
      console.log(`[audit] ${line}`);
    } catch (error) {
      console.error(`Failed to write audit log entry: ${(error as Error).message}`);
    }

    try {
      if (logFile && fileWritable) {
        fs.appendFileSync(logFile, `${line}\n`, 'utf8');
      }
    } catch (error) {
      console.error(`Failed to write audit log entry to file: ${(error as Error).message}`);
    }

    if (writeDatabase && insertAuditStatement) {
      const detailsJson = (() => {
        const { action, outcome, ...rest } = entry;
        return JSON.stringify(rest);
      })();
      const targetsJson = (() => {
        const e = entry as Record<string, unknown>;
        if (Array.isArray(e.alert_ids)) return JSON.stringify({ alert_ids: e.alert_ids });
        if (Array.isArray(e.decision_ids)) return JSON.stringify({ decision_ids: e.decision_ids });
        return null;
      })();
      try {
        writeDatabase(() => {
          insertAuditStatement.run({
            $time: time,
            $user: actor?.username || 'unknown',
            $role: actor?.role || null,
            $action: entry.action,
            $outcome: entry.outcome,
            $details_json: detailsJson,
            $targets_json: targetsJson,
          });
        });
      } catch (error) {
        console.error(`Failed to persist audit event to database: ${(error as Error).message}`);
      }
    }
  }

  return { enabled, record };
}
