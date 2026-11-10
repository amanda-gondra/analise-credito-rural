import { describe, expect, it } from "vitest";

import type {
  ActivityShare,
  AverageContract,
  MatopibaYear,
  MonthShare,
  PurposeShare,
  RegionYear,
  StateYear,
  YearlyTotal,
} from "../../api/types";
import {
  activityReading,
  averageReading,
  matopibaReading,
  purposeReading,
  regionShareReading,
  seasonalityReading,
  statesShareReading,
  trendReading,
} from "./readings";

// The readings only pick rows, so partial rows are enough; spaces are normalized because the
// money format uses a non-breaking space.
const rows = <T,>(items: Partial<T>[]) => items as T[];
const plain = (text: string | null) => text?.replace(/\s+/g, " ") ?? null;

describe("chart readings", () => {
  it("reads the end year of the trend, with the sign of the real change", () => {
    const totals = rows<YearlyTotal>([
      { year: 2024, amount_nominal: 400e9, change_real_pct: 3.2 },
      { year: 2025, amount_nominal: 361.2e9, change_real_pct: -9.54 },
    ]);
    expect(plain(trendReading(totals, 2025))).toBe("Em 2025: R$ 361,2 bi concedidos (valor nominal), queda real de 9,5% sobre 2024.");
    expect(plain(trendReading(totals, 2024))).toContain("alta real de 3,2% sobre 2023");
    expect(trendReading(totals, 2023)).toBeNull();
  });

  it("calls a change that rounds to zero stable, and leaves out a missing change", () => {
    expect(trendReading(rows<YearlyTotal>([{ year: 2020, amount_nominal: 1e9, change_real_pct: -0.04 }]), 2020)).toContain(
      "estável em termos reais sobre 2019",
    );
    expect(plain(trendReading(rows<YearlyTotal>([{ year: 2017, amount_nominal: 1e9, change_real_pct: null }]), 2017))).toBe(
      "Em 2017: R$ 1,0 bi concedidos (valor nominal).",
    );
  });

  it("reads both activities of the year, or nothing when one is missing", () => {
    const shares = rows<ActivityShare>([
      { year: 2024, activity: "agricultural", share_pct: 60 },
      { year: 2025, activity: "agricultural", share_pct: 69.3 },
      { year: 2025, activity: "livestock", share_pct: 30.7 },
    ]);
    const text = activityReading(shares, 2025);
    expect(text).toContain("69,3%");
    expect(text).toContain("30,7%");
    expect(text).not.toContain("60,0%");
    expect(activityReading(shares, 2024)).toBeNull();
  });

  it("names the two largest purposes of the year and ignores missing shares", () => {
    const shares = rows<PurposeShare>([
      { year: 2025, purpose: "custeio", share_pct: 55.4 },
      { year: 2025, purpose: "investimento", share_pct: 39.1 },
      { year: 2025, purpose: "comercializacao", share_pct: null },
      { year: 2024, purpose: "investimento", share_pct: 80 },
    ]);
    expect(purposeReading(shares, 2025)).toBe("Em 2025, custeio teve a maior parte: 55,4%; investimento, 39,1%.");
    expect(purposeReading(shares, 2019)).toBeNull();
  });

  it("names the month with the largest average share", () => {
    const months = rows<MonthShare>([
      { month: 7, avg_share_pct: 10.1 },
      { month: 8, avg_share_pct: 13.4 },
      { month: 9, avg_share_pct: 12 },
    ]);
    expect(seasonalityReading(months, "2017–2025")).toMatch(/^Agosto é o mês de maior contratação: em média 13,4% /);
  });

  it("reads the period row of the average, never a yearly row", () => {
    const averages = rows<AverageContract>([
      { year: 2025, contracts: 10, average_real: 1 },
      { year: null, contracts: 18_825_518, average_real: 163_300 },
    ]);
    expect(plain(averageReading(averages, "2017–2025"))).toBe(
      "Em 2017–2025: R$ 163,3 mil por contrato, em 18.825.518 contratos (valores de dez/2025).",
    );
    expect(averageReading(rows<AverageContract>([{ year: null, contracts: 0, average_real: null }]), "2025")).toBeNull();
  });

  it("names the region and the state with the largest share of the year", () => {
    const regions = rows<RegionYear>([
      { year: 2025, region: "sul", share_pct: 31.7 },
      { year: 2025, region: "sudeste", share_pct: 25 },
      { year: 2024, region: "norte", share_pct: 90 },
    ]);
    expect(regionShareReading(regions, 2025)).toBe("Em 2025, o Sul teve a maior participação: 31,7% do crédito do Brasil.");

    const states = rows<StateYear>([
      { year: 2025, state: "MG", share_of_brazil_pct: 13.4 },
      { year: 2025, state: "SP", share_of_brazil_pct: 12.1 },
    ]);
    expect(statesShareReading(states, 2025)).toContain("Minas Gerais");
    expect(statesShareReading(states, 2020)).toBeNull();
  });

  it("reads the MATOPIBA row and its largest state, and nothing without the bloc row", () => {
    const years = rows<MatopibaYear>([
      { year: 2025, state: null, share_of_brazil_pct: 9.8 },
      { year: 2025, state: "BA", share_of_brazil_pct: 3.9 },
      { year: 2025, state: "TO", share_of_brazil_pct: 2.1 },
    ]);
    const text = matopibaReading(years, 2025);
    expect(text).toContain("9,8% do crédito rural do Brasil");
    expect(text).toContain("Bahia (3,9%)");
    expect(matopibaReading(years.slice(1), 2025)).toBeNull();
  });
});
