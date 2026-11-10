/**
 * Numbers in Brazilian Portuguese. Values are rounded (half away from zero, Intl's default),
 * never truncated: 66,56% becomes 66,6%. A non-breaking space keeps "R$" and its number on
 * the same line.
 */

const NBSP = String.fromCharCode(0x00a0); // no-break space
const MINUS = String.fromCharCode(0x2212); // minus sign, not a hyphen

const decimal = (digits: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const ONE_DECIMAL = decimal(1);
const TWO_DECIMALS = decimal(2);
const INTEGER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const SCALES = [
  { size: 1e9, short: "bi", long: "bilhões" },
  { size: 1e6, short: "mi", long: "milhões" },
  { size: 1e3, short: "mil", long: "mil" },
] as const;

function signed(text: string, value: number, sign: boolean): string {
  if (value < 0) return `${MINUS}${text}`;
  return sign && value > 0 ? `+${text}` : text;
}

/** R$ 361,2 bi · R$ 4,6 bi · R$ 147,0 mil · R$ 850. long: R$ 361,2 bilhões. */
export function formatMoney(value: number | null | undefined, options: { long?: boolean } = {}): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  const scale = SCALES.find((item) => absolute >= item.size);
  const body = scale
    ? `${ONE_DECIMAL.format(absolute / scale.size)}${NBSP}${options.long ? scale.long : scale.short}`
    : INTEGER.format(absolute);
  return signed(`R$${NBSP}${body}`, value, false);
}

/** R$ 361.224.312.199,25 */
export function formatMoneyFull(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return signed(`R$${NBSP}${TWO_DECIMALS.format(Math.abs(value))}`, value, false);
}

/** Axis ticks: 400 bi, 12 mi, 0. */
export function formatMoneyTick(value: number): string {
  if (value === 0) return "0";
  const absolute = Math.abs(value);
  const scale = SCALES.find((item) => absolute >= item.size);
  if (!scale) return signed(INTEGER.format(absolute), value, false);
  const scaled = absolute / scale.size;
  const text = Number.isInteger(scaled) ? INTEGER.format(scaled) : ONE_DECIMAL.format(scaled);
  return signed(`${text}${NBSP}${scale.short}`, value, false);
}

/** 13,4% · with sign: +4,9% / -9,5% (with a true minus sign). The value is already a percentage (13.4, not 0.134). */
export function formatPercent(
  value: number | null | undefined,
  options: { digits?: number; sign?: boolean } = {},
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatter = options.digits === undefined || options.digits === 1 ? ONE_DECIMAL : decimal(options.digits);
  return signed(`${formatter.format(Math.abs(value))}%`, value, options.sign ?? false);
}

/** 2.456.525 */
export function formatInteger(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return signed(INTEGER.format(Math.abs(value)), value, false);
}

/** 2,46 mi · 42,8 mil · 850 (counts such as contracts). */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute >= 1e6) return signed(`${TWO_DECIMALS.format(absolute / 1e6)}${NBSP}mi`, value, false);
  if (absolute >= 1e4) return signed(`${ONE_DECIMAL.format(absolute / 1e3)}${NBSP}mil`, value, false);
  return formatInteger(value);
}

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

export function monthName(month: number, short = false): string {
  const name = MONTHS[month - 1];
  if (!name) return String(month);
  return short ? name.slice(0, 3) : name;
}

/** 24/10/2026, in the time zone of Brasília (collection dates come in UTC). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(date);
}

/** 2017–2025, or 2025 when the period is one year. */
export function formatPeriod(start: number, end: number): string {
  return start === end ? String(start) : `${start}–${end}`;
}
