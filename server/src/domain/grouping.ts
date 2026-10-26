import { normalizeSearchText } from './offer.js';
import type { StoreId } from './stores.js';

export interface GroupingInput {
  id: string;
  store: StoreId;
  productName: string;
  price: number;
  eans?: string[];
}

/**
 * Finds offers that are the same product, so search can show them as one result:
 * - offers sharing any barcode (across stores; stores list different pack barcodes, so this is
 *   a graph, not a simple "same first barcode"),
 * - offers of one store with the same name and price (e.g. Mercator lists some products twice).
 *
 * Returns a group key for every offer that has at least one twin; singles get none.
 */
export function computeGroups(offers: readonly GroupingInput[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    // Path compression keeps later lookups short.
    let node = id;
    while (node !== root) {
      const next = parent.get(node) ?? root;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };

  for (const offer of offers) parent.set(offer.id, offer.id);

  const firstWithKey = new Map<string, string>();
  const link = (key: string, id: string) => {
    const first = firstWithKey.get(key);
    if (first) union(first, id);
    else firstWithKey.set(key, id);
  };
  for (const offer of offers) {
    for (const ean of offer.eans ?? []) link(`ean:${ean}`, offer.id);
    link(`dup:${offer.store}:${normalizeSearchText(offer.productName)}:${offer.price}`, offer.id);
  }

  const members = new Map<string, GroupingInput[]>();
  for (const offer of offers) {
    const root = find(offer.id);
    members.set(root, [...(members.get(root) ?? []), offer]);
  }

  const groups = new Map<string, string>();
  for (const group of members.values()) {
    if (group.length < 2) continue;
    // A stable key: the smallest barcode in the group, else the smallest member id.
    const eans = group.flatMap((o) => o.eans ?? []).sort();
    const key = eans[0] ? `ean:${eans[0]}` : `id:${group.map((o) => o.id).sort()[0] ?? ''}`;
    for (const offer of group) groups.set(offer.id, key);
  }
  return groups;
}
