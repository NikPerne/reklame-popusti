export const STORES = {
  mercator: { name: 'Mercator', website: 'https://www.mercator.si' },
  lidl: { name: 'Lidl', website: 'https://www.lidl.si' },
  hofer: { name: 'Hofer', website: 'https://www.hofer.si' },
  spar: { name: 'Spar', website: 'https://www.spar.si' },
  dm: { name: 'dm', website: 'https://www.dm.si' },
  mueller: { name: 'Müller', website: 'https://www.mueller.si' },
  eurospin: { name: 'Eurospin', website: 'https://www.eurospin.si' },
  tus: { name: 'Tuš', website: 'https://www.tus.si' },
} as const;

export type StoreId = keyof typeof STORES;

export const STORE_IDS = Object.keys(STORES) as StoreId[];

export function isStoreId(value: string): value is StoreId {
  return Object.hasOwn(STORES, value);
}
