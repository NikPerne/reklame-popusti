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
  // The patterns use \s, which also matches the non-breaking spaces some stores use.
  const normalized = text.toLowerCase();

  // "1 kg = 0,90" (Lidl) or "1,90 €/1 kg" (Hofer)
  const quantityFirst = /(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l|kos|kom)\b\s*=\s*(\d+(?:[.,]\d+)?)/.exec(
    normalized,
  );
  const priceFirst =
    /(\d+(?:[.,]\d+)?)\s*€?\s*\/\s*(\d+(?:[.,]\d+)?)?\s*(kg|g|ml|cl|l|kos|kom)\b/.exec(normalized);
  // "za kg 7,00 €" (Eurospin)
  const perUnit = /\bza\s+(kg|l|kos)\s+(\d+(?:[.,]\d+)?)/.exec(normalized);

  let quantity: number | undefined;
  let unitName: string | undefined;
  let price: number | undefined;
  if (perUnit) {
    quantity = 1;
    unitName = perUnit[1];
    price = parseDecimal(perUnit[2]);
  } else if (quantityFirst) {
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

/**
 * Unit price from a package size in a product name, for stores that don't publish one:
 * "Jogurt, 430 g" → €/kg, "Detergent, 50 pranj 2,7 l" → €/l, "Desert, 6 x 37 g" → €/kg.
 * The last size in the name wins (it is usually the package size).
 */
export function unitPriceFromName(
  price: number,
  name: string,
): { amount: number; unit: UnitPriceUnit } | undefined {
  const sizes = [
    ...name
      .toLowerCase()
      .matchAll(/(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l|kos|kosov|kom)(?![a-zčšž])/g),
  ];
  const last = sizes.at(-1);
  if (!last) return undefined;
  const count = last[1] ? Number(last[1]) : 1;
  const quantity = parseDecimal(last[2]);
  const unit = UNIT_FACTORS[last[3] === 'kosov' ? 'kos' : (last[3] ?? '')];
  if (!unit || !quantity || quantity <= 0 || !(price > 0)) return undefined;
  const amount = Math.round((price / (count * quantity * unit.factor)) * 1000) / 1000;
  return { amount, unit: unit.unit };
}
