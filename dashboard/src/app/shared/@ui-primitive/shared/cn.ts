import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** The shadcn className combinator: clsx for conditionals, twMerge for overrides. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
