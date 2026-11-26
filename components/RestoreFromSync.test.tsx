import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestoreFromSync } from './RestoreFromSync';
import { generateCode, formatCode } from '../utils/syncCrypto';

afterEach(() => localStorage.clear());

const open = async (onRestore = vi.fn().mockResolvedValue({ added: 0 })) => {
  const user = userEvent.setup();
  render(<RestoreFromSync onRestore={onRestore} />);
  await user.click(screen.getByRole('button', { name: /restore with your sync code/i }));
  return { user, onRestore };
};

describe('restoring on a device with nothing stored', () => {
  it('offers a way in from the onboarding screen', () => {
    render(<RestoreFromSync onRestore={vi.fn()} />);
    // Without this, an iOS home-screen install has its own empty storage
    // container and no route to the sync panel, which lives behind the
    // dashboard the user cannot reach.
    expect(screen.getByRole('button', { name: /restore with your sync code/i })).toBeInTheDocument();
  });

  it('restores with a valid code', async () => {
    const code = generateCode();
    const { user, onRestore } = await open();
    await user.type(screen.getByLabelText(/sync code/i), code);
    await user.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(onRestore).toHaveBeenCalledWith(code);
  });

  it('accepts the code in the grouped form it is displayed in', async () => {
    const code = generateCode();
    const { user, onRestore } = await open();
    await user.type(screen.getByLabelText(/sync code/i), formatCode(code).toLowerCase());
    await user.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(onRestore).toHaveBeenCalledWith(code);
  });

  it('saves the code so later opens sync by themselves', async () => {
    const code = generateCode();
    const { user } = await open();
    await user.type(screen.getByLabelText(/sync code/i), code);
    await user.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(localStorage.getItem('vitalQuestSyncCode')).toBe(code);
  });

  it('rejects an incomplete code without calling the network', async () => {
    const { user, onRestore } = await open();
    await user.type(screen.getByLabelText(/sync code/i), 'ABC123');
    await user.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(onRestore).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/26 characters/i);
  });

  it('surfaces a failure instead of hanging on the spinner', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('No data for that code yet'));
    const { user } = await open(failing);
    await user.type(screen.getByLabelText(/sync code/i), generateCode());
    await user.click(screen.getByRole('button', { name: /^restore$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/No data for that code/i);
    expect(screen.getByRole('button', { name: /^restore$/i })).toBeEnabled();
  });
});
