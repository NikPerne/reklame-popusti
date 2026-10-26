import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { ConditionKind, Offer, StoreId, UnitPriceUnit } from '../api/models';

/** Mirrors the server's shopping item (server/src/domain/shopping-list.ts). */
export interface ShoppingItem {
  /** The offer id. */
  id: string;
  store: StoreId;
  productName: string;
  price: number;
  regularPrice?: number;
  unitPrice?: { amount: number; unit: UnitPriceUnit };
  condition?: { kind: ConditionKind; text: string };
  imageUrl?: string;
  sourceUrl?: string;
  validTo?: string;
  checked: boolean;
  updatedAt: string;
}

type PendingChange =
  { kind: 'put'; item: ShoppingItem } | { kind: 'delete'; id: string } | { kind: 'clear-checked' };

interface StoredState {
  items: ShoppingItem[];
  pending: PendingChange[];
}

const STORAGE_KEY = 'reklame-popusti.shopping-list';

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredState;
  } catch {
    // Unavailable or corrupt storage: start empty; the server copy fills it on the next sync.
  }
  return { items: [], pending: [] };
}

function applyChange(items: ShoppingItem[], change: PendingChange): ShoppingItem[] {
  switch (change.kind) {
    case 'put':
      return [...items.filter((i) => i.id !== change.item.id), change.item];
    case 'delete':
      return items.filter((i) => i.id !== change.id);
    case 'clear-checked':
      return items.filter((i) => !i.checked);
  }
}

/** Retrying makes no sense for these (the server rejected the change itself). */
function isPermanentFailure(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401
  );
}

/**
 * The shopping list. Changes apply locally at once (so it works offline in the store), are
 * remembered in localStorage and sent to the server when online; the server copy is shared
 * between devices.
 */
@Injectable({ providedIn: 'root' })
export class ShoppingListService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<StoredState>(loadState());
  private syncing: Promise<void> | undefined;

  readonly items = computed(() => this.state().items);
  readonly ids = computed(() => new Set(this.items().map((i) => i.id)));
  /** Items still to buy. */
  readonly openCount = computed(() => this.items().filter((i) => !i.checked).length);
  /** Changes not yet saved on the server (e.g. while offline). */
  readonly pendingCount = computed(() => this.state().pending.length);

  constructor() {
    const onOnline = () => void this.sync();
    window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('online', onOnline));
  }

  has(offerId: string): boolean {
    return this.ids().has(offerId);
  }

  /** Adds the offer to the list, or removes it if it is already there. */
  toggle(offer: Offer): void {
    if (this.has(offer.id)) {
      this.change({ kind: 'delete', id: offer.id });
      return;
    }
    this.change({
      kind: 'put',
      item: {
        id: offer.id,
        store: offer.store,
        productName: offer.productName,
        price: offer.price,
        ...(offer.regularPrice !== undefined && { regularPrice: offer.regularPrice }),
        ...(offer.unitPrice && { unitPrice: offer.unitPrice }),
        ...(offer.condition && { condition: offer.condition }),
        ...(offer.imageUrl && { imageUrl: offer.imageUrl }),
        ...(offer.sourceUrl && { sourceUrl: offer.sourceUrl }),
        ...(offer.validTo && { validTo: offer.validTo }),
        checked: false,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  setChecked(id: string, checked: boolean): void {
    const item = this.items().find((i) => i.id === id);
    if (!item || item.checked === checked) return;
    this.change({ kind: 'put', item: { ...item, checked, updatedAt: new Date().toISOString() } });
  }

  remove(id: string): void {
    this.change({ kind: 'delete', id });
  }

  clearChecked(): void {
    if (this.items().some((i) => i.checked)) this.change({ kind: 'clear-checked' });
  }

  /** Sends pending changes, then loads the server copy. Safe to call any time. */
  sync(): Promise<void> {
    this.syncing ??= this.runSync().finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }

  private change(change: PendingChange): void {
    this.update((s) => ({ items: applyChange(s.items, change), pending: [...s.pending, change] }));
    void this.sync();
  }

  private async runSync(): Promise<void> {
    // Send changes one by one, oldest first; stop at the first network problem.
    while (this.state().pending.length > 0) {
      const [next] = this.state().pending;
      if (!next) break;
      try {
        await firstValueFrom(this.send(next));
      } catch (error) {
        if (!isPermanentFailure(error)) return;
      }
      this.update((s) => ({ ...s, pending: s.pending.slice(1) }));
    }

    try {
      const { items } = await firstValueFrom(
        this.http.get<{ items: ShoppingItem[] }>('/api/shopping-list'),
      );
      // Changes made while the request was running stay on top of the server copy.
      this.update((s) => ({ items: s.pending.reduce(applyChange, items), pending: s.pending }));
    } catch {
      // Offline: keep the local copy.
    }
  }

  private send(change: PendingChange) {
    switch (change.kind) {
      case 'put':
        return this.http.put(
          `/api/shopping-list/items/${encodeURIComponent(change.item.id)}`,
          change.item,
        );
      case 'delete':
        return this.http.delete(`/api/shopping-list/items/${encodeURIComponent(change.id)}`);
      case 'clear-checked':
        return this.http.post('/api/shopping-list/clear-checked', {});
    }
  }

  private update(fn: (state: StoredState) => StoredState): void {
    this.state.update(fn);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      // Not persisted; still works for this session.
    }
  }
}
