import type { UnitPriceUnit } from '../domain/offer.js';
import { parseDecimal } from './text.js';

/** How many base units (kg, l, piece) one of these units is. */
const UNIT_FACTORS: Record<string, { unit: UnitPriceUnit; factor: number }> = {
  kg: { unit: 'kg', factor: 1 },
  g: { unit: 'kg', factor: 0.001 },
  l: { unit: 'l', factor: 1 },
  ml: { unit: 'l', factor: 0.001 },
  cl: { unit: 'l', factor: 0.01 },
  kos: { unit: 'piece', factor: 1 },
  kom: { unit: 'piece', factor: 1 },
};

/**
 * Parses unit-price texts like "1 kg = 0,90", "100 g = 1,25" or "1,90 €/1 kg" into a price per
 * kg, l or piece. Returns undefined for anything it does not understand.
 */
export function parseUnitPriceText(
  text: string | null | undefined,
): { amount: number; unit: UnitPriceUnit } | undefined {
  if (!text) return undefined;
  // Non-breaking spaces (char 160) appear in some stores' price texts.
  const normalized = text.replaceAll(String.fromCharCode(160), ' ').toLowerCase();

  // "1 kg = 0,90" (Lidl) or "1,90 €/1 kg" (Hofer)
  const quantityFirst = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l|kos|kom)\b\s*=\s*(\d+(?:[.,]\d+)?)/.exec(
    normalized,
  );
  const priceFirst =
    /(\d+(?:[.,]\d+)?)\s*€?\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(kg|g|ml|cl|l|kos|kom)\b/.exec(normalized);

  let quantity: number | undefined;
  let unitName: string | undefined;
  let price: number | undefined;
  if (quantityFirst) {
    quantity = parseDecimal(quantityFirst[1]);
    unitName = quantityFirst[2];
    price = parseDecimal(quantityFirst[3]);
  } else if (priceFirst) {
    price = parseDecimal(priceFirst[1]);
    quantity = priceFirst[2] ? parseDecimal(priceFirst[2]) : 1;
    unitName = priceFirst[3];
  }

  const unit = unitName ? UNIT_FACTORS[unitName] : undefined;
  if (!unit || !quantity || !price || quantity <= 0 || price <= 0) return undefined;
  const amount = Math.round((price / (quantity * unit.factor)) * 1000) / 1000;
  return { amount, unit: unit.unit };
}
