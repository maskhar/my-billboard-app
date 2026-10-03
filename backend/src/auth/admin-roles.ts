// backend/src/auth/admin-roles.ts
/**
 * Role yang dianggap admin untuk endpoint billboards & orders.
 *
 * Daftar ini menggantikan konstanta lama di `common/admin-check.helper.ts`
 * (yang dihapus). Sengaja tidak menyertakan `CS` dan `OPERATOR` — keduanya
 * belum punya scope admin di Opsi C dan harus mendapat 403.
 *
 * Dipakai seragam oleh `@Roles(...ADMIN_ROLES)` di controller supaya validasi
 * admin hanya punya satu sumber kebenaran.
 */
export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;
