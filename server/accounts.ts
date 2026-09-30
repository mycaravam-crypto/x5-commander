// Player accounts: a callsign and a password, no email. Passwords are scrypt-hashed (node:crypto); a sign-in is a random
// session token, kept by the browser in an HttpOnly cookie and stored here only as its SHA-256.
import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type User = { id: number; name: string };

export const NAME_MIN = 3, NAME_MAX = 16, PASSWORD_MIN = 8, PASSWORD_MAX = 200;
export const SESSION_DAYS = 90;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

// A callsign as an account name: upper case, letters, digits and _ . - only. null if it isn't one.
export function parseName(v: unknown) {
  if (typeof v !== 'string') return null;
  const n = v.trim().toUpperCase();
  return n.length >= NAME_MIN && n.length <= NAME_MAX && /^[A-Z0-9_.-]+$/.test(n) ? n : null;
}
export const parsePassword = (v: unknown) => typeof v === 'string' && v.length >= PASSWORD_MIN && v.length <= PASSWORD_MAX ? v : null;

const derive = (pw: string, salt: Buffer, o = SCRYPT) => new Promise<Buffer>((res, rej) =>
  scrypt(pw.normalize('NFKC'), salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions, (e, k) => e ? rej(e) : res(k)));
// Stored as scrypt$N$r$p$salt$hash (base64url), so the cost can be raised later without breaking old hashes.
export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), (await derive(pw, salt)).toString('base64url')].join('$');
}
export async function verifyPassword(pw: string, stored: string) {
  const [kind, N, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = await derive(pw, Buffer.from(salt, 'base64url'), { N: +N, r: +r, p: +p, keylen: want.length });
  return timingSafeEqual(got, want);
}
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

export function openAccounts(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
      id      INTEGER PRIMARY KEY,
      name    TEXT    NOT NULL UNIQUE,
      pw      TEXT    NOT NULL,
      created TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash    TEXT    PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);`);
  const byName = db.prepare('SELECT id, name, pw FROM users WHERE name = ?');
  const insertUser = db.prepare('INSERT INTO users (name, pw) VALUES (?, ?)');
  const insertSession = db.prepare('INSERT INTO sessions (hash, user_id, expires) VALUES (?, ?, ?)');
  const bySession = db.prepare('SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.hash = ? AND s.expires > ?');
  const dropSession = db.prepare('DELETE FROM sessions WHERE hash = ?');
  const prune = db.prepare('DELETE FROM sessions WHERE expires <= ?');
  // A wrong name costs the same as a wrong password, so timing doesn't tell which names exist.
  let dummy: Promise<string> | undefined;

  const newSession = (userId: number) => {
    const token = randomBytes(32).toString('base64url');
    prune.run(Date.now());
    insertSession.run(sha(token), userId, Date.now() + SESSION_DAYS * 864e5);
    return token;
  };
  return {
    // A new account and its first session; 'taken' if the name is.
    async signup(name: string, pw: string): Promise<{ user: User; token: string } | 'taken'> {
      name = name.toUpperCase();
      if (byName.get(name)) return 'taken';
      const hash = await hashPassword(pw);
      try {
        const id = Number(insertUser.run(name, hash).lastInsertRowid);
        return { user: { id, name }, token: newSession(id) };
      } catch (e) {
        if (String(e).includes('UNIQUE')) return 'taken'; // signed up at the same moment
        throw e;
      }
    },
    // A new session for a name and password; null if either is wrong.
    async login(name: string, pw: string): Promise<{ user: User; token: string } | null> {
      const u = byName.get(name.toUpperCase()) as (User & { pw: string }) | undefined;
      if (!u) { await verifyPassword(pw, await (dummy ??= hashPassword('x5-no-such-user'))); return null; }
      if (!await verifyPassword(pw, u.pw)) return null;
      return { user: { id: u.id, name: u.name }, token: newSession(u.id) };
    },
    user: (token: string | undefined): User | null => token ? (bySession.get(sha(token), Date.now()) as User | undefined) ?? null : null,
    logout: (token: string | undefined) => { if (token) dropSession.run(sha(token)); },
  };
}
export type Accounts = ReturnType<typeof openAccounts>;
