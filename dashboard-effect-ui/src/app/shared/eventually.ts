import { Effect, Schedule } from "effect";

/**
 * For tests of a live mount: runs `assertion` until it stops throwing, a few
 * milliseconds apart for up to a second, and fails with its last error if it
 * never does. The runtime renders on its own schedule, so a test waits for
 * the Model to settle rather than for a fixed time.
 */
export const eventually = (assertion: () => void) =>
  Effect.try({ try: assertion, catch: (error) => error }).pipe(
    Effect.retry({ schedule: Schedule.spaced("5 millis"), times: 200 }),
    Effect.orDie,
  );
