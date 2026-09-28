// src/lib/tipe-pengguna.ts
//
// Bentuk data pengguna DI SISI BROWSER, dan daftar role sebagai teks.
//
// KENAPA TERPISAH DARI TIPE PRISMA
// --------------------------------
// Form profil dan modal tambah-pengguna adalah Client Component. Mengimpor
// nilai `Role` dari `@prisma/client` di sana menarik runtime Prisma ke bundle
// browser — itu sebabnya `src/lib/enum-guard.ts` tidak bisa dipakai di sini,
// walaupun daftar isinya sama.
//
// KENAPA `as any` DI HALAMAN INDUK HARUS HILANG
// ---------------------------------------------
// `users/[userId]/page.tsx` menyusun objek pilihan berisi 13 kolom, lalu
// menyerahkannya sebagai `plainUser as any` kepada form yang menuntut
// `User & { identitasTersamar?: boolean }` — tipe baris LENGKAP, termasuk
// `password`, `createdAt`, dan `xenditCustomerId`. Objeknya tidak pernah
// memuat itu, jadi tuntutan tipenya bohong dan `as any` yang menutupinya:
// form boleh membaca `user.password` dan TypeScript menyetujuinya, padahal
// nilainya `undefined` saat dijalankan. Tipe di bawah menyatakan apa yang
// benar-benar dikirim, sehingga kolom yang tidak ada menjadi galat kompilasi.

/** Nilai `Role` sebagai teks. Daftarnya sama dengan `enum Role` di schema. */
export type RolePengguna = 'USER' | 'ADMIN' | 'SUPER_ADMIN' | 'OPERATOR' | 'CS';

/**
 * Role beserta label yang ditampilkan, dalam SATU daftar.
 *
 * Dua `<select>` role di repo ini — modal tambah-pengguna dan form profil —
 * dulu masing-masing menuliskan lima `<option>` sendiri. Role baru yang
 * ditambahkan ke schema tidak muncul di keduanya sampai seseorang ingat
 * menyunting dua file; lebih buruk, satu daftar bisa memuat role yang sudah
 * dihapus, dan admin yang memilihnya mendapat 400 tanpa sebab yang terlihat.
 */
export const OPSI_ROLE: readonly { nilai: RolePengguna; label: string }[] = [
  { nilai: 'USER', label: 'User' },
  { nilai: 'OPERATOR', label: 'Operator' },
  { nilai: 'CS', label: 'Customer Service' },
  { nilai: 'ADMIN', label: 'Admin' },
  { nilai: 'SUPER_ADMIN', label: 'Super Admin' },
];

/**
 * Apakah `nilai` salah satu role yang dikenal?
 *
 * Dipakai form saat membaca role yang datang dari server: nilai asing tidak
 * boleh membuat `<select>` kehilangan kendali (`value={undefined}` membuatnya
 * TAK TERKENDALI, menampilkan pilihan pertama sementara state tetap kosong).
 */
export function sahRolePengguna(nilai: unknown): nilai is RolePengguna {
  return OPSI_ROLE.some((opsi) => opsi.nilai === nilai);
}

/**
 * Kolom pengguna yang benar-benar diserahkan `users/[userId]/page.tsx` kepada
 * form profil.
 *
 * `password`, `xenditCustomerId`, `createdAt`, dan `updatedAt` SENGAJA tidak
 * ada: halaman induk tidak mengirimkannya, dan yang pertama tidak boleh pernah
 * menyeberang ke browser dalam bentuk apa pun.
 */
export type PenggunaUntukForm = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: RolePengguna;
  whatsapp: string | null;
  companyName: string | null;
  /** Utuh untuk SUPER_ADMIN, tersamar untuk peran lain. */
  ktp: string | null;
  npwp: string | null;
  /**
   * Apakah `ktp`/`npwp` di atas adalah samaran, bukan nomor asli.
   *
   * Tanpa penanda ini form akan menyimpan kembali string bertitik-titik itu ke
   * database dan menimpa nomor aslinya — kerusakan permanen yang terlihat
   * seperti penyimpanan biasa yang berhasil.
   */
  identitasTersamar: boolean;
  ktpAddress: string | null;
  officeAddress: string | null;
  username: string | null;
  authProvider: string;
  isVerified: boolean;
};
