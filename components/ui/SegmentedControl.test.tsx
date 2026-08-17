import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SegmentedControl } from './SegmentedControl';

/**
 * The keyboard contract these tests pin did not exist before this component:
 * the app's primary navigation was a role="tablist" with no arrow-key handling
 * and no roving tabindex, and the trend range picker was three plain buttons.
 */

const segments = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
] as const;

const setup = (over: Partial<Parameters<typeof SegmentedControl<string>>[0]> = {}) => {
  const onChange = vi.fn();
  render(
    <SegmentedControl<string>
      segments={segments}
      value="a"
      onChange={onChange}
      label="Test group"
      {...over}
    />,
  );
  return { onChange, user: userEvent.setup() };
};

describe('SegmentedControl', () => {
  it('is a radiogroup by default', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Test group' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('becomes a tablist when the segments reveal different views', () => {
    setup({ role: 'tablist' });
    expect(screen.getByRole('tablist', { name: 'Test group' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
  });

  it('puts only the selected segment in the tab order', () => {
    // Roving tabindex: Tab should move past the group, not through every option.
    setup();
    const [a, b, c] = screen.getAllByRole('radio');
    expect(a).toHaveAttribute('tabindex', '0');
    expect(b).toHaveAttribute('tabindex', '-1');
    expect(c).toHaveAttribute('tabindex', '-1');
  });

  it('moves selection with arrow keys', async () => {
    const { onChange, user } = setup();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('wraps from the last segment to the first', async () => {
    const { onChange, user } = setup({ value: 'c' });
    screen.getByRole('radio', { name: 'Charlie' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('wraps backwards from the first to the last', async () => {
    const { onChange, user } = setup();
    screen.getByRole('radio', { name: 'Alpha' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('jumps to the ends with Home and End', async () => {
    const { onChange, user } = setup({ value: 'b' });
    screen.getByRole('radio', { name: 'Bravo' }).focus();
    await user.keyboard('{End}');
    expect(onChange).toHaveBeenCalledWith('c');
    await user.keyboard('{Home}');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('selects on click', async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Charlie' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('uses ariaLabel when the visible label is a bare number', () => {
    render(
      <SegmentedControl<number>
        segments={[{ value: 7, label: '7D', ariaLabel: 'Last 7 days' }]}
        value={7}
        onChange={vi.fn()}
        label="Trend range"
        nums
      />,
    );
    expect(screen.getByRole('radio', { name: 'Last 7 days' })).toBeInTheDocument();
  });
});
