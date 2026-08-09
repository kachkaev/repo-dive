import { LoaderCircleIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Marks content that is re-rendering from a deferred value: the children dim
 * while they lag behind the controls, and a spinner floats over them once the
 * wait is long enough to read as a freeze.
 *
 * The spinner's delay is a pure CSS one (`animate-late-fade-in` holds it
 * invisible for the first half second), not a `setTimeout`: the deferred pass
 * this waits on is exactly what would keep a timer's `setState` from being
 * cheap — that urgent update would throw the in-progress render away and start
 * it again, making the very wait it announces longer. A CSS animation instead
 * starts with the element and runs regardless of what React is busy with.
 */
export function StaleOverlay({
  stale,
  children,
}: {
  stale: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative" aria-busy={stale}>
      <div className="transition-opacity" style={{ opacity: stale ? 0.6 : 1 }}>
        {children}
      </div>
      {stale ? (
        // Decorative: `aria-busy` above is what announces the wait, and the
        // stale content stays readable underneath meanwhile.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grid animate-late-fade-in place-items-center"
        >
          {/* The marks under the spinner are only dimmed, not hidden, so it
              needs its own backdrop to stay legible over a dense chart. */}
          <span className="rounded-full bg-background/85 p-2">
            <LoaderCircleIcon className="size-5 text-muted-foreground motion-safe:animate-spin" />
          </span>
        </div>
      ) : undefined}
    </div>
  );
}
