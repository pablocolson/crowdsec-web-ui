import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { useOptionalToast } from '../../contexts/useToast';
import { useI18n } from '../../lib/i18n';
import { cn } from '../../lib/utils';

interface CopyableTextProps {
    value: string;
    children?: ReactNode;
    className?: string;
    /** Label announced to assistive tech and used in the button title. Defaults to the value itself. */
    label?: string;
}

/**
 * Renders its children (or the raw value) next to a small copy-to-clipboard
 * button. Safe to nest inside clickable rows: clicks are stopped from
 * propagating so it doesn't trigger a parent row's onClick/navigation.
 */
export function CopyableText({ value, children, className, label }: CopyableTextProps) {
    const [copied, setCopied] = useState(false);
    const toast = useOptionalToast();
    const { t } = useI18n();
    const resetTimeoutRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (resetTimeoutRef.current !== null) {
            window.clearTimeout(resetTimeoutRef.current);
        }
    }, []);

    const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        event.preventDefault();
        if (!value) return;

        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(value);
            } else {
                return;
            }
        } catch (error) {
            console.error('Failed to copy to clipboard', error);
            return;
        }

        setCopied(true);
        toast?.addToast(t('common.copiedToClipboard'), 'success', 2000);
        if (resetTimeoutRef.current !== null) {
            window.clearTimeout(resetTimeoutRef.current);
        }
        resetTimeoutRef.current = window.setTimeout(() => {
            resetTimeoutRef.current = null;
            setCopied(false);
        }, 2000);
    };

    return (
        <span className={cn('inline-flex min-w-0 max-w-full items-center gap-1.5', className)}>
            <span className="min-w-0 truncate">{children ?? value}</span>
            <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                title={t('common.copyToClipboard', { value: label ?? value })}
                aria-label={t('common.copyToClipboard', { value: label ?? value })}
            >
                {copied ? <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
        </span>
    );
}
