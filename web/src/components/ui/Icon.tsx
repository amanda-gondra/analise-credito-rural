/**
 * Line icons drawn for this site (24 x 24, stroke = currentColor). Decorative by default;
 * a button that shows only an icon gives its name through aria-label.
 */
import type { SVGProps } from "react";

export type IconName =
  | "chat"
  | "send"
  | "minus"
  | "close"
  | "menu"
  | "open"
  | "arrow-right"
  | "arrow-left"
  | "info"
  | "alert"
  | "filter"
  | "download"
  | "chevron-down"
  | "refresh"
  | "map-pin"
  | "check";

const PATHS: Record<IconName, string[]> = {
  // Speech bubble with three dots: a rounded square with a short tail at the lower left.
  chat: ["M5 4.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-4.5 3.5V17.5H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z", "M8 11h.01", "M12 11h.01", "M16 11h.01"],
  send: ["M21 3 10.5 13.5", "M21 3l-6.5 18-4-7.5L3 9.5 21 3Z"],
  minus: ["M5 12h14"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  open: ["M14 4h6v6", "M20 4l-9 9", "M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"],
  "arrow-right": ["M5 12h14", "M13 6l6 6-6 6"],
  "arrow-left": ["M19 12H5", "M11 6l-6 6 6 6"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 11v5", "M12 8h.01"],
  alert: ["M12 3 2 20h20L12 3Z", "M12 10v4", "M12 17h.01"],
  filter: ["M4 6h16", "M7 12h10", "M10 18h4"],
  download: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  "chevron-down": ["M6 9l6 6 6-6"],
  refresh: ["M20 12a8 8 0 1 1-2.34-5.66", "M20 4v5h-5"],
  "map-pin": ["M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z", "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }: IconProps) {
  const dots = name === "chat";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name].map((d, index) => (
        <path key={d} d={d} strokeWidth={dots && index > 0 ? Number(strokeWidth) * 1.6 : undefined} />
      ))}
    </svg>
  );
}
