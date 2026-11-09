import { MAP_RAMP } from "../../lib/palette";
import { SHARE_CLASSES, shareClassLabel } from "../../lib/shareClasses";
import type { Ramp } from "./BrazilMap";

export function MapLegend({ ramp, title }: { ramp: Ramp; title: string }) {
  const colors = MAP_RAMP[ramp];
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 text-sm font-medium text-ink">{title}</figcaption>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-2 sm:grid-cols-3 xl:grid-cols-1">
        {Array.from({ length: SHARE_CLASSES }, (_, index) => SHARE_CLASSES - 1 - index).map((index) => (
          <li key={index} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3.5 w-6 shrink-0 rounded-sm ring-1 ring-ink/10"
              style={{ backgroundColor: colors[index] }}
            />
            <span className="tabular">{shareClassLabel(index)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
