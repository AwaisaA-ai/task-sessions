interface LiveRegionProps {
  message: string;
}

/**
 * Visually hidden polite status region. PLAN.md M4: announce progress changes
 * only when the percentage actually moves, so screen readers are not spammed.
 */
export function LiveRegion({ message }: LiveRegionProps) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
