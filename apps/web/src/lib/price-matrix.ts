/**
 * Pure logic for the admin price-matrix editor (service × car type and
 * package × car type grids). The component holds per-cell draft strings and a
 * per-cell save status; these helpers convert between the canonical minor units
 * the API stores and the major-unit strings the operator types, index the saved
 * prices for O(1) cell lookup, and decide whether a draft is worth persisting.
 * Framework-free so the editing state is trivially unit-tested.
 */

/** Stable map key for a (row, column) cell — row is a service or package id. */
export function priceKey(rowId: string, carTypeId: string): string {
  return `${rowId}:${carTypeId}`;
}

/** A price row normalized away from the service/package field-name difference. */
export interface PriceCell {
  rowId: string;
  carTypeId: string;
  amountMinor: number;
}

/** Index normalized price rows by cell key → amount (minor units). */
export function indexPrices(cells: PriceCell[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const cell of cells) {
    map.set(priceKey(cell.rowId, cell.carTypeId), cell.amountMinor);
  }
  return map;
}

/**
 * Parse a major-unit input string into canonical minor units. An empty/blank
 * string is `null` (the cell has no price), as is anything non-numeric or
 * negative — so the UI can distinguish "cleared / invalid" from a real 0.
 */
export function parseAmountToMinor(
  raw: string,
  minorFactor: number,
): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * minorFactor);
}

/** Render saved minor units back into the major-unit string an input shows. */
export function formatMinorToInput(
  minor: number | undefined,
  minorFactor: number,
): string {
  if (minor == null) return "";
  return String(minor / minorFactor);
}

/**
 * Whether a draft differs from the saved value and is worth an upsert. An empty
 * or invalid draft is never dirty (there is nothing valid to save); an
 * unchanged amount is not dirty either.
 */
export function isCellDirty(
  draftRaw: string,
  savedMinor: number | undefined,
  minorFactor: number,
): boolean {
  const parsed = parseAmountToMinor(draftRaw, minorFactor);
  if (parsed == null) return false;
  return parsed !== savedMinor;
}

export type CellStatus = "idle" | "saving" | "saved" | "error";
