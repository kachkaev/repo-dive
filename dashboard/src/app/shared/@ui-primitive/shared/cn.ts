import { twMerge as mergeTailwindClasses } from "tailwind-merge";

/**
 * Same as `ClassNameValue` from `tailwind-merge`, but without support for
 * arrays (to keep arguments simple)
 */
export type ClassNameValue = string | null | undefined | 0 | false;

/**
 * @example `cn('foo', condition && 'bar', condition && 'baz')`
 */
export function cn(...inputs: ClassNameValue[]): string {
  return mergeTailwindClasses(inputs);
}

/**
 * Narrows a Base UI component's `className` prop — natively a string or a
 * per-state callback — to the plain-string form these wrappers merge with
 * {@link cn}.
 */
export type PropsWithPlainClassName<Props> = Props & { className?: string };
