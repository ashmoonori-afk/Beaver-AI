// Tailwind class merger used by every component (shadcn convention).
// `clsx` resolves conditional class lists; `twMerge` dedupes conflicts
// like `bg-red-500 bg-blue-500` into the last-wins value.

import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
