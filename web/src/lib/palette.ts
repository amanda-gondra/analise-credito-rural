/**
 * Colors of data. Validated with the dataviz palette checker (CIEDE2000, simulated color
 * vision deficiency) and WCAG contrast; see docs/decisoes-tecnicas.md.
 *
 * - Agricultura (leaf green) and Pecuária (petroleum) never change: dE 35.3 in normal vision,
 *   36.5 deuteranopia, 34.8 protanopia. No purple anywhere.
 * - Map ramps: six classes on fixed OKLCH lightness steps (0.94 ... 0.40), the same for the
 *   three ramps, so a class means the same share whatever the activity. Labels use ink on
 *   classes 0-3 (contrast >= 4.5) and white on 4-5 (>= 5.3).
 * - CATEGORY is for nominal series that are never shown with Agricultura/Pecuária in the
 *   same chart (purposes, states, regions); every chart that uses it also labels its series.
 */

export const ACTIVITY_COLOR = {
  agricultural: "#4f7f2d",
  livestock: "#315b6b",
} as const;

/** Real values (December 2025 prices): solid line. Nominal: gray dashed line. */
export const SERIES_COLOR = {
  real: "#174b32",
  nominal: "#7a847d",
} as const;

export const MAP_RAMP = {
  total: ["#dbf2e4", "#acdac0", "#7dbf9b", "#529c77", "#347857", "#1d533a"],
  agricultural: ["#e0f2d3", "#b9daa0", "#93bd6f", "#6e9a45", "#4f7629", "#345214"],
  livestock: ["#deeff5", "#b4d4e0", "#8cb6c5", "#6493a3", "#437080", "#264e5b"],
} as const;

/** Text on a map class: ink on the light classes, white on the dark ones. */
export const MAP_LABEL = ["#202923", "#202923", "#202923", "#202923", "#ffffff", "#ffffff"] as const;

/**
 * Blue, orange, teal, ochre, rose: lighter and more balanced than the earlier earth tones, and
 * none of them is the green of Agricultura or the petroleum of Pecuária. In this order (it is
 * part of the check) the dataviz validator passes every gate on white and on the page canvas:
 * OKLCH lightness 0.43-0.77, chroma >= 0.10, worst adjacent pair dE 11.6 under protanopia
 * (target >= 8) and 18.5 in normal vision (floor 15), every slot >= 3:1 against the surface.
 */
export const CATEGORY = ["#2b73a8", "#d9732c", "#1f9a8a", "#b8860b", "#c4527a"] as const;

export const PURPOSE_COLOR = {
  custeio: CATEGORY[0],
  investimento: CATEGORY[1],
  comercializacao: CATEGORY[2],
  industrializacao: CATEGORY[3],
} as const;

/** Each region keeps its color on every page (charts, the list of states). */
export const REGION_COLOR = {
  norte: CATEGORY[0],
  nordeste: CATEGORY[1],
  sudeste: CATEGORY[2],
  sul: CATEGORY[3],
  "centro-oeste": CATEGORY[4],
} as const;

export const NEUTRAL = {
  grid: "#e4e9e3",
  axis: "#5f6a63",
  ink: "#202923",
  muted: "#b9c1bb",
} as const;
