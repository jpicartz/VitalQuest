import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  fullWidth?: boolean;
  /** Shows a spinner and disables the button. Pass `loadingLabel` for the text. */
  loading?: boolean;
  /** Replacement label while loading, e.g. "Adding…". Falls back to children. */
  loadingLabel?: React.ReactNode;
}

const Spinner: React.FC = () => (
  <svg
    className="animate-spin shrink-0"
    width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  fullWidth = false,
  loading = false,
  loadingLabel,
  className = '',
  disabled,
  ...props
}) => {
  // The focus ring lives in the base styles, not per-variant: this component had
  // no focus styling at all, which made every primary action in the app
  // invisible to a keyboard user. It is not something a caller can forget now.
  const baseStyles =
    'px-6 py-3 rounded-control font-bold transition-all duration-200 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
    'focus-visible:ring-offset-2 focus-visible:ring-offset-page';

  const variants = {
    /*
      The primary action is the signature accent, not a semantic hue. It used to
      be nutri-strong, which made "the main button" and "nutrition" the same
      colour — so a green primary sitting next to a green macro figure read as
      if they were related.

      Light mode carries white at 5.7:1; dark mode lightens the token and flips
      the label to ink at the same ratio. Both measured, not assumed.
    */
    primary: 'bg-accent text-white dark:text-[#1c1c1e] shadow-lg shadow-accent/25 border-b-[3px] border-black/15 hover:brightness-[1.05] active:border-b-0 active:translate-y-[3px]',
    secondary: 'bg-hydro-strong text-white dark:text-[#04222e] shadow-lg shadow-hydro/25 border-b-[3px] border-black/15 hover:brightness-[1.05] active:border-b-0 active:translate-y-[3px]',
    outline: 'border-2 border-edge text-fg-soft hover:border-accent hover:text-accent bg-card active:scale-[.98]',
    ghost: 'text-fg-soft hover:text-fg hover:bg-raised active:scale-[.98]',
    // Destructive actions must not read as ordinary outline buttons.
    danger: 'border-2 border-fat/40 text-fat hover:bg-fat/10 hover:border-fat bg-card active:scale-[.98]',
  };

  const width = fullWidth ? 'w-full' : '';

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${width} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner />
          {loadingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
};
