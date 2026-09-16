import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AlertInvestigationPanel } from '../AlertInvestigationPanel';

const { addNoteMock, fetchInvestigationMock, updateInvestigationMock } = vi.hoisted(() => ({
  addNoteMock: vi.fn(),
  fetchInvestigationMock: vi.fn(),
  updateInvestigationMock: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  addAlertInvestigationNote: addNoteMock,
  fetchAlertInvestigation: fetchInvestigationMock,
  updateAlertInvestigation: updateInvestigationMock,
}));

const investigation = {
  alertInternalId: 12,
  status: 'in_progress',
  assignedTo: 'alice',
  ticketRef: 'SEC-42',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'alice',
  updatedBy: 'alice',
};

describe('AlertInvestigationPanel', () => {
  beforeEach(() => {
    fetchInvestigationMock.mockReset();
    updateInvestigationMock.mockReset();
    addNoteMock.mockReset();
    fetchInvestigationMock.mockResolvedValue({ investigation, notes: [] });
    updateInvestigationMock.mockResolvedValue({ investigation, notes: [] });
    addNoteMock.mockResolvedValue({ notes: [{ id: 1, alertInternalId: 12, content: 'Checked logs', author: 'alice', createdAt: '2026-01-01T00:00:00.000Z' }] });
  });

  test('loads, saves, and adds notes for the selected alert instance', async () => {
    const user = userEvent.setup();
    render(<AlertInvestigationPanel alertId={7} instanceId="edge" />);

    const statusSelect = await screen.findByRole('combobox');
    expect(statusSelect).toHaveValue('in_progress');
    expect(fetchInvestigationMock).toHaveBeenCalledWith(7, 'edge');

    await user.selectOptions(statusSelect, 'resolved');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateInvestigationMock).toHaveBeenCalledWith(7, {
      status: 'resolved', assigned_to: 'alice', ticket_ref: 'SEC-42', instance_id: 'edge',
    });

    await user.type(screen.getByPlaceholderText('Add an investigation note'), 'Checked logs');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(addNoteMock).toHaveBeenCalledWith(7, { content: 'Checked logs', instance_id: 'edge' });
    expect(await screen.findByText('Checked logs')).toBeInTheDocument();
  });
});
