import { describe, expect, it } from "vitest";

import shapes from "../data/uf-shapes.json";
import { MATOPIBA, UFS, ufInfo } from "./domain";
import { DEFAULT_FILTERS, apiParams, changedFilters, compareTab, readFilters, readRegion, readUfList, writeFilters } from "./filters";
import { formatCount, formatDate, formatMoney, formatMoneyFull, formatMoneyTick, formatPercent, formatPeriod } from "./format";
import { CATEGORY, MAP_RAMP } from "./palette";
import { niceTicks, spreadLabels } from "./scale";
import { SHARE_BREAKS, shareClass, shareClassLabel } from "./shareClasses";

const NBSP = String.fromCharCode(0x00a0);
const MINUS = String.fromCharCode(0x2212);
const nbsp = (text: string) => text.replaceAll(NBSP, " ");

describe("format", () => {
  it("writes money as in the answers of the assistant", () => {
    expect(nbsp(formatMoney(361_224_312_199.25))).toBe("R$ 361,2 bi");
    expect(nbsp(formatMoney(4_593_570_702.79))).toBe("R$ 4,6 bi");
    expect(nbsp(formatMoney(147_046.87))).toBe("R$ 147,0 mil");
    expect(nbsp(formatMoney(850))).toBe("R$ 850");
    expect(nbsp(formatMoney(361_224_312_199.25, { long: true }))).toBe("R$ 361,2 bilhões");
    expect(formatMoney(null)).toBe("—");
  });

  it("rounds, never truncates", () => {
    expect(formatPercent(66.56)).toBe("66,6%");
    expect(formatPercent(13.37)).toBe("13,4%");
    expect(nbsp(formatMoney(4_550_000_000))).toBe("R$ 4,6 bi");
  });

  it("shows signs with a true minus", () => {
    expect(formatPercent(-9.51, { sign: true })).toBe(`${MINUS}9,5%`);
    expect(formatPercent(4.94, { sign: true })).toBe("+4,9%");
    expect(formatPercent(0, { sign: true })).toBe("0,0%");
  });

  it("writes full amounts, counts, ticks, dates and periods", () => {
    expect(nbsp(formatMoneyFull(361_224_312_199.25))).toBe("R$ 361.224.312.199,25");
    expect(nbsp(formatCount(2_456_525))).toBe("2,46 mi");
    expect(nbsp(formatCount(42_760))).toBe("42,8 mil");
    expect(formatCount(850)).toBe("850");
    expect(nbsp(formatMoneyTick(450e9))).toBe("450 bi");
    expect(nbsp(formatMoneyTick(16.5e9))).toBe("16,5 bi");
    expect(formatMoneyTick(0)).toBe("0");
    expect(formatDate("2026-10-24T02:30:00Z")).toBe("23/10/2026"); // Brasília time
    expect(formatPeriod(2017, 2025)).toBe("2017–2025");
    expect(formatPeriod(2025, 2025)).toBe("2025");
  });
});

describe("filters in the URL", () => {
  it("reads valid values and falls back to the defaults", () => {
    expect(readFilters(new URLSearchParams(""))).toEqual(DEFAULT_FILTERS);
    expect(readFilters(new URLSearchParams("start_year=2020&end_year=2021&activity=livestock&purpose=custeio"))).toEqual({
      startYear: 2020,
      endYear: 2021,
      activity: "livestock",
      purpose: "custeio",
    });
    expect(readFilters(new URLSearchParams("start_year=2012&activity=pecuaria&purpose=x"))).toEqual(DEFAULT_FILTERS);
    expect(readFilters(new URLSearchParams("start_year=2025&end_year=2017"))).toEqual(DEFAULT_FILTERS);
  });

  it("writes only what differs from the defaults and keeps other parameters", () => {
    const params = writeFilters(new URLSearchParams("state=PI"), { ...DEFAULT_FILTERS, activity: "agricultural" });
    expect(params.toString()).toBe("state=PI&activity=agricultural");
    expect(writeFilters(new URLSearchParams("start_year=2020"), DEFAULT_FILTERS).toString()).toBe("");
  });

  it("builds API parameters only with the filters a route accepts", () => {
    const filters = { startYear: 2024, endYear: 2025, activity: "livestock" as const, purpose: "custeio" as const };
    expect(apiParams(filters)).toEqual({ start_year: 2024, end_year: 2025 });
    expect(apiParams(filters, ["activity"])).toEqual({ start_year: 2024, end_year: 2025, activity: "livestock" });
    expect(changedFilters(filters)).toBe(3);
  });

  it("reads lists of UFs, regions and the tab of Comparar", () => {
    expect(readUfList("pi, MA,pi,XX,ce,ba,to,go")).toEqual(["PI", "MA", "CE", "BA", "TO"]);
    expect(readRegion("Centro-Oeste")).toBe("centro-oeste");
    expect(readRegion("matopiba")).toBeNull();
    expect(compareTab(new URLSearchParams("states=PI,MA"))).toBe("estados");
    expect(compareTab(new URLSearchParams("aba=regioes&states=PI"))).toBe("regioes");
    expect(compareTab(new URLSearchParams(""))).toBe("regioes");
  });
});

describe("map", () => {
  it("has the 27 UFs of the API, each with a path and a centroid inside the drawing", () => {
    const api = [
      "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
      "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
    ];
    expect(shapes.ufs.map((item) => item.uf)).toEqual(api);
    const [x, y, width, height] = shapes.viewBox as [number, number, number, number];
    for (const item of shapes.ufs) {
      expect(item.d).toMatch(/^M\d+ \d+l/);
      expect(item.cx).toBeGreaterThan(x);
      expect(item.cx).toBeLessThan(x + width);
      expect(item.cy).toBeGreaterThan(y);
      expect(item.cy).toBeLessThan(y + height);
    }
    expect(UFS.filter((item) => item.region === "nordeste")).toHaveLength(9);
    expect(MATOPIBA.every((uf) => ufInfo(uf))).toBe(true);
    expect(ufInfo("pi")?.name).toBe("Piauí");
  });

  it("puts each share in one of six fixed classes", () => {
    expect(shareClass(0.02)).toBe(0);
    expect(shareClass(0.5)).toBe(1);
    expect(shareClass(2.49)).toBe(2);
    expect(shareClass(2.5)).toBe(3);
    expect(shareClass(13.4)).toBe(5);
    expect(shareClass(null)).toBeNull();
    expect(SHARE_BREAKS).toHaveLength(MAP_RAMP.total.length - 1);
    expect(shareClassLabel(0)).toBe("menos de 0,5%");
    expect(shareClassLabel(3)).toBe("2,5% a 5%");
    expect(shareClassLabel(5)).toBe("10% ou mais");
  });

  it("uses no purple anywhere in the data colors", () => {
    const hues = [...Object.values(MAP_RAMP).flat(), ...CATEGORY].map((hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) return null;
      const d = max - min;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    });
    expect(hues.filter((hue) => hue !== null && hue > 255 && hue < 320)).toEqual([]);
  });
});

describe("axes", () => {
  it("rounds the axis to 1, 2, 2,5 or 5 times a power of ten", () => {
    expect(niceTicks(3.4)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(19.7e9)).toEqual([0, 5e9, 10e9, 15e9, 20e9]);
    expect(niceTicks(452e9)).toEqual([0, 200e9, 400e9, 600e9]);
    expect(niceTicks(13.4)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });

  it("pushes apart names at the end of lines that end together", () => {
    const offsets = spreadLabels(
      [
        { key: "TO", value: 2.6 },
        { key: "MA", value: 2.5 },
        { key: "BA", value: 4.2 },
      ],
      5,
      200,
    );
    expect(offsets.BA).toBe(0);
    expect(offsets.TO).toBe(0);
    expect(offsets.MA).toBeCloseTo(11); // 4 px apart become 15 px
  });
});
