import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CategoryId, StoreId } from '../api/models';

/** Mirrors server/src/domain/settings.ts. */
export interface Settings {
  /** Default store filter; empty = all stores. */
  preferredStores: StoreId[];
  /** Categories never shown. */
  hiddenCategories: CategoryId[];
  updatedAt: string;
}

interface StoredState {
  settings: Settings;
  /** Changed locally but not yet saved on the server. */
  dirty: boolean;
}

const STORAGE_KEY = 'reklame-popusti.settings';
const DEFAULTS: Settings = {
  preferredStores: [],
  hiddenCategories: [],
  updatedAt: new Date(0).toISOString(),
};

function loadState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredState;
  } catch {
    // Unavailable or corrupt: defaults until the server copy arrives.
  }
  return { settings: DEFAULTS, dirty: false };
}

/** The user's preferences: applied at once, remembered locally, synced via the server. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<StoredState>(loadState());
  private syncing: Promise<void> | undefined;
  /** Bumped by reset(), so a sync still running for the previous account is discarded. */
  private generation = 0;

  readonly preferredStores = computed(() => this.state().settings.preferredStores);
  readonly hiddenCategories = computed(() => this.state().settings.hiddenCategories);

  constructor() {
    const onOnline = () => void this.sync();
    window.addEventListener('online', onOnline);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('online', onOnline));
  }

  save(change: Partial<Pick<Settings, 'preferredStores' | 'hiddenCategories'>>): void {
    this.update({
      settings: { ...this.state().settings, ...change, updatedAt: new Date().toISOString() },
      dirty: true,
    });
    void this.sync();
  }

  /** Forgets this device's copy (another account logged in, or logged out). */
  reset(): void {
    this.generation++;
    this.update({ settings: DEFAULTS, dirty: false });
  }

  /** Uploads settings chosen before logging in, unless they were never changed. */
  adoptLocal(): void {
    if (this.state().settings.updatedAt !== DEFAULTS.updatedAt) {
      this.update({ ...this.state(), dirty: true });
    }
  }

  /** Sends local changes, then takes the server copy (the newer one wins on the server). */
  sync(): Promise<void> {
    this.syncing ??= this.runSync().finally(() => {
      this.syncing = undefined;
    });
    return this.syncing;
  }

  private async runSync(): Promise<void> {
    const generation = this.generation;
    try {
      const sent = this.state().settings;
      const stored = this.state().dirty
        ? await firstValueFrom(this.http.put<Settings>('/api/settings', sent))
        : await firstValueFrom(this.http.get<Settings>('/api/settings'));
      if (generation !== this.generation) return;
      // A change made while the request ran stays (and is sent on the next sync).
      if (this.state().settings === sent || !this.state().dirty) {
        this.update({ settings: stored, dirty: false });
      }
    } catch {
      // Offline: keep the local copy; the next sync sends it.
    }
  }

  private update(state: StoredState): void {
    this.state.set(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Not persisted; still applies for this session.
    }
  }
}
