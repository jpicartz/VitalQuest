import React from 'react';

// `title` is omitted from the DOM attributes because this component means a
// heading by it, not the browser's tooltip attribute.
interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Rendered element. Defaults to <section>, which is what most callers want. */
  as?: 'section' | 'div' | 'article';
  /** Inner padding. `none` when the card owns its own edge-to-edge content. */
  padding?: 'none' | 'sm' | 'md';
  /** Elevation level; see index.css. Theme-aware in both directions. */
  elevation?: 0 | 1 | 2;
  /** Optional heading rendered with the display face and correct spacing. */
  title?: React.ReactNode;
  /** Sub-copy under the title. */
  description?: React.ReactNode;
  /** Control aligned to the title's right — an action, a selector, a count. */
  action?: React.ReactNode;
}

const PADDING = { none: '', sm: 'p-4', md: 'p-6' } as const;
const ELEVATION = { 0: '', 1: 'shadow-e1', 2: 'shadow-e2' } as const;

/**
 * The app's one surface container.
 *
 * Before this existed, the exact string
 * `bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none`
 * appeared 17 times, so any change to how a surface reads meant 17 edits and a
 * near-certain miss. The `title`/`description`/`action` props exist because
 * every one of those call sites also hand-rolled the same heading block with
 * five different spacing values.
 */
export const Card: React.FC<CardProps> = ({
  as: Tag = 'section',
  padding = 'md',
  elevation = 1,
  title,
  description,
  action,
  className = '',
  children,
  ...rest
}) => (
  <Tag
    className={`bg-card rounded-card border border-edge ${PADDING[padding]} ${ELEVATION[elevation]} ${className}`}
    {...rest}
  >
    {(title || action) && (
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          {title && <h3 className="font-display text-lg font-bold text-fg">{title}</h3>}
          {description && <p className="text-xs text-fg-mute mt-1 max-w-prose">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )}
    {children}
  </Tag>
);
