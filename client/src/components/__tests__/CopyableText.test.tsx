import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CopyableText } from '../ui/CopyableText';

// Note: this uses fireEvent rather than @testing-library/user-event's click,
// because user-event installs its own clipboard emulation that overrides a
// manually stubbed navigator.clipboard before the handler ever runs.
function stubClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        writable: true,
        configurable: true,
    });
    return writeText;
}

describe('CopyableText', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('renders the value by default and copies it to the clipboard on click', async () => {
        const writeText = stubClipboard();
        render(<CopyableText value="1.2.3.4" />);

        expect(screen.getByText('1.2.3.4')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button'));

        await waitFor(() => expect(writeText).toHaveBeenCalledWith('1.2.3.4'));
    });

    test('renders custom children instead of the raw value', () => {
        stubClipboard();
        render(<CopyableText value="raw-value"><span>Friendly label</span></CopyableText>);

        expect(screen.getByText('Friendly label')).toBeInTheDocument();
        expect(screen.queryByText('raw-value')).not.toBeInTheDocument();
    });

    test('does not trigger a parent click handler when the copy button is clicked', async () => {
        const writeText = stubClipboard();
        const onParentClick = vi.fn();
        render(
            <div onClick={onParentClick}>
                <CopyableText value="1.2.3.4" />
            </div>,
        );

        fireEvent.click(screen.getByRole('button'));
        await waitFor(() => expect(writeText).toHaveBeenCalled());

        expect(onParentClick).not.toHaveBeenCalled();
    });

    test('does nothing when the clipboard API is unavailable', () => {
        Object.defineProperty(navigator, 'clipboard', {
            value: undefined,
            writable: true,
            configurable: true,
        });
        render(<CopyableText value="1.2.3.4" />);

        expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
    });
});
