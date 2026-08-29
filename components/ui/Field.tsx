import React, { useId } from 'react';

type Accent = 'nutri' | 'hydro' | 'spark';

interface FieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** Hides the label visually but keeps it for screen readers. */
  labelHidden?: boolean;
  /** Explanatory copy under the label. */
  hint?: string;
  /** Error text. Sets aria-invalid and switches the border to the alert colour. */
  error?: string;
  /** Unit or short suffix rendered inside the field ("kg", "ml", "min"). */
  suffix?: string;
  /** Focus accent. Defaults to nutri; water uses hydro, weight uses spark. */
  accent?: Accent;
  /** Larger type for the one number a dialog is about. */
  emphasis?: boolean;
}

const ACCENT_BORDER: Record<Accent, string> = {
  nutri: 'focus:border-accent',
  hydro: 'focus:border-hydro',
  spark: 'focus:border-spark',
};

/**
 * Labelled text input.
 *
 * Replaces seven near-identical hand-rolled inputs that differed only in
 * padding, focus colour and text size -- and five different label treatments
 * for the same role. The focus ring is not optional here: it is part of the
 * primitive, so a new field cannot ship without one.
 */
export const Field: React.FC<FieldProps> = ({
  label,
  labelHidden = false,
  hint,
  error,
  suffix,
  accent = 'nutri',
  emphasis = false,
  className = '',
  id,
  ...rest
}) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={
          labelHidden
            ? 'sr-only'
            : 'block text-xs font-semibold uppercase tracking-wider text-fg-soft mb-1.5'
        }
      >
        {label}
      </label>
      {hint && !labelHidden && (
        <p id={hintId} className="text-xs text-fg-mute mb-1.5">{hint}</p>
      )}
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          className={`w-full p-3 bg-card border-2 rounded-control text-fg placeholder:text-fg-mute font-medium
            ${emphasis ? 'text-lg font-bold' : ''}
            ${suffix ? 'pr-12' : ''}
            ${error ? 'border-fat' : `border-edge ${ACCENT_BORDER[accent]}`}
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:ring-offset-2 focus-visible:ring-offset-page
            transition-colors`}
          {...rest}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-fg-mute pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-semibold text-fat mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
};
