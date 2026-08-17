import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Field } from './Field';

/**
 * Before this component, six labels in the app were bare <label> elements with
 * no htmlFor and no wrapping — so a screen reader announced an unlabelled box.
 * Association is structural here: a Field cannot be rendered without it.
 */
describe('Field', () => {
  it('associates its label with the input', () => {
    render(<Field label="Duration (minutes)" />);
    // getByLabelText only resolves through a real association.
    expect(screen.getByLabelText('Duration (minutes)')).toBeInstanceOf(HTMLInputElement);
  });

  it('keeps the label for screen readers when it is visually hidden', () => {
    render(<Field label="Today's weight" labelHidden />);
    expect(screen.getByLabelText("Today's weight")).toBeInTheDocument();
  });

  it('generates distinct ids so two fields never collide', () => {
    render(<><Field label="First" /><Field label="Second" /></>);
    const a = screen.getByLabelText('First');
    const b = screen.getByLabelText('Second');
    expect(a.id).not.toBe(b.id);
  });

  it('reports an error to assistive tech, not just in colour', () => {
    render(<Field label="Weight" error="Enter a number between 20 and 400" />);
    const input = screen.getByLabelText('Weight');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('between 20 and 400');
    expect(input.getAttribute('aria-describedby')).toContain(`${input.id}-error`);
  });

  it('links a hint to the input', () => {
    render(<Field label="Amount" hint="Roughly one glass" />);
    const input = screen.getByLabelText('Amount');
    expect(input.getAttribute('aria-describedby')).toContain(`${input.id}-hint`);
  });

  it('passes typing through to the handler', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Field label="Amount" onChange={onChange} />);
    await user.type(screen.getByLabelText('Amount'), '350');
    expect(onChange).toHaveBeenCalled();
  });

  it('renders a unit suffix without swallowing the label', () => {
    render(<Field label="Amount" suffix="ml" />);
    expect(screen.getByLabelText('Amount')).toBeInTheDocument();
    expect(screen.getByText('ml')).toBeInTheDocument();
  });
});
