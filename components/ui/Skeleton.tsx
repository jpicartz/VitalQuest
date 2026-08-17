import React from 'react';

interface SkeletonProps {
  className?: string;
  /** Number of stacked lines; each is slightly shorter than the last. */
  lines?: number;
}

/**
 * Placeholder for content that is on its way.
 *
 * The pulse is a plain opacity animation, so the global prefers-reduced-motion
 * rule in index.css flattens it to a static block rather than leaving a
 * throbbing element on screen for someone who asked for stillness.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', lines = 1 }) => (
  <div role="status" aria-label="Loading" className="w-full">
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className={`bg-track rounded-control animate-pulse ${i > 0 ? 'mt-2' : ''} ${className || 'h-4'}`}
        style={{ width: lines > 1 && i === lines - 1 ? '65%' : '100%' }}
      />
    ))}
  </div>
);

/** Matches the resting height of a logged-food row, so the list does not jump. */
export const FoodRowSkeleton: React.FC = () => (
  <div role="status" aria-label="Adding food" className="flex items-center gap-3 p-3 rounded-tile bg-raised animate-pulse">
    <div className="flex-1 space-y-2">
      <div className="h-3.5 bg-track rounded-control w-3/5" />
      <div className="h-2.5 bg-track rounded-control w-2/5" />
    </div>
    <div className="h-6 w-12 bg-track rounded-control shrink-0" />
  </div>
);
