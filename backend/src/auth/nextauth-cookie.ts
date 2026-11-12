// backend/src/auth/nextauth-cookie.ts
/**
 * Penentuan nama cookie session NextAuth, diturunkan dari env yang sama dengan
 * frontend. next-auth v4 memakai prefiks `__Secure-` hanya bila situs dijalankan
 * di atas HTTPS (lihat node_modules/next-auth/jwt/index.js dan
 * node_modules/next-auth/core/lib/cookie.js).
 *
 * Fungsi ini disalin ke Next.js nanti (route handler / Server Component) supaya
 * nama cookie yang dicari backend dan yang dicari frontend tidak pernah berbeda.
 */
export function getNextAuthSessionCookieName(nextAuthUrl?: string): string {
  const secure = (nextAuthUrl ?? '').startsWith('https://');
  return secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}
