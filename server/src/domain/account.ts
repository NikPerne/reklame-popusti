import { z } from 'zod';

/** Emails are compared case-insensitively. */
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .transform((email) => email.toLowerCase())
  .pipe(z.email());

export const MIN_PASSWORD_LENGTH = 8;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(256),
  code: z.string().trim().min(1).max(256),
});

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

/** Who is logged in: the session's JWT payload. */
export interface SessionUser {
  /** The user id. */
  sub: string;
  email: string;
}

/** Parses SHARED_LISTS ("a@x,b@y; c@z,d@w") into groups of lower-case emails. */
export function parseSharedLists(value: string): string[][] | Error {
  const groups: string[][] = [];
  const seen = new Set<string>();
  for (const part of value.split(';')) {
    const emails = part
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) continue;
    const group: string[] = [];
    for (const raw of emails) {
      const parsed = emailSchema.safeParse(raw);
      if (!parsed.success) return new Error(`"${raw}" is not an email address`);
      if (seen.has(parsed.data)) return new Error(`${parsed.data} is in more than one group`);
      seen.add(parsed.data);
      group.push(parsed.data);
    }
    if (group.length > 1) groups.push(group.sort());
  }
  return groups;
}

export interface ListMembership {
  /** Key of the shopping list the user sees. */
  listId: string;
  /** The other accounts that see the same list. */
  sharedWith: string[];
}

/**
 * Users in a SHARED_LISTS group share one list, named after the group's first email (sorted),
 * so it stays the same when the env var is reordered. Everyone else has their own list.
 */
export function listMembership(user: SessionUser, sharedLists: string[][]): ListMembership {
  const group = sharedLists.find((g) => g.includes(user.email));
  if (!group?.[0]) return { listId: `user:${user.sub}`, sharedWith: [] };
  return { listId: `shared:${group[0]}`, sharedWith: group.filter((e) => e !== user.email) };
}
