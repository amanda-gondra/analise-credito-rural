/** Joins class names, skipping the empty ones: cn("a", cond && "b"). */
export function cn(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
