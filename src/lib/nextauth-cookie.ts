// src/lib/nextauth-cookie.ts
//
// Dipakai oleh server-side Next.js (route handler & Server Component) untuk
// meneruskan cookie session ke backend. Logika ini sengaja meniru
// backend/src/auth/nextauth-cookie.ts supaya nama cookie yang dicari di sisi
// server dan di sisi backend tidak pernah berbeda.
//
// next-auth v4 memberi prefiks `__Secure-` hanya bila situs berjalan di HTTPS
// (node_modules/next-auth/core/lib/cookie.js). Ditentukan dari NEXTAUTH_URL,
// bukan hardcode, supaya otomatis ikut saat pindah ke domain HTTPS.
export function getNextAuthSessionCookieName(nextAuthUrl?: string): string {
  const secure = (nextAuthUrl ?? '').startsWith('https://');
  return secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

export interface CookieJar {
  get: (name: string) => { name: string; value: string } | undefined;
  getAll: (name?: string) => { name: string; value: string }[];
}

/**
 * Rakit header `Cookie:` dari seluruh pecahan cookie session NextAuth.
 *
 * Cookie > 4096 byte dipecah next-auth menjadi
 * `next-auth.session-token.0`, `.1`, dst (lihat ALLOWED_COOKIE_SIZE di
 * node_modules/next-auth/core/lib/cookie.js), jadi cookie HARUS ikut dikirim
 * apa adanya. Header `Cookie` yang sama persis dibaca ulang oleh
 * `getToken()` di backend.
 */
export function buildNextAuthCookieHeader(jar: CookieJar): string | undefined {
  const prefix = getNextAuthSessionCookieName(process.env.NEXTAUTH_URL);
  const parts = jar
    .getAll()
    .filter((c) => c.name === prefix || c.name.startsWith(`${prefix}.`));

  if (parts.length === 0) return undefined;
  return parts.map(({ name, value }) => `${name}=${value}`).join('; ');
}
