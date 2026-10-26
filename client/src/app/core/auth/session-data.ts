import { Injectable, inject } from '@angular/core';
import { SettingsService } from '../settings/settings-service';
import { ShoppingListService } from '../shopping-list/shopping-list-service';

const ACCOUNT_KEY = 'reklame-popusti.account';

function readAccount(): string | null {
  try {
    return localStorage.getItem(ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function writeAccount(email: string | null): void {
  try {
    if (email) localStorage.setItem(ACCOUNT_KEY, email);
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Not remembered; the next login compares against nothing.
  }
}

/**
 * Keeps the shopping list and settings saved on this device tied to one account, so that
 * logging in as someone else never shows (or uploads) the previous person's data.
 */
@Injectable({ providedIn: 'root' })
export class SessionData {
  private readonly shoppingList = inject(ShoppingListService);
  private readonly settings = inject(SettingsService);

  /** Called once the logged-in account is known; then syncs with the server. */
  loggedIn(email: string | null): void {
    if (email) {
      const previous = readAccount();
      if (previous === null) {
        // Data from before accounts existed (or a fresh device): it belongs to this account.
        this.shoppingList.adoptLocal();
        this.settings.adoptLocal();
      } else if (previous !== email) {
        this.shoppingList.reset();
        this.settings.reset();
      }
      writeAccount(email);
    }
    void this.shoppingList.sync();
    void this.settings.sync();
  }

  /** Forgets this device's copy of the account's data. */
  loggedOut(): void {
    this.shoppingList.reset();
    this.settings.reset();
    writeAccount(null);
  }
}
