// src/lib/alamat-chat.ts
//
// ==================================================================================
// SATU SUMBER ALAMAT CHAT SERVER — DAN TIDAK ADA LOCALHOST DI PRODUCTION
// ==================================================================================
//
// `NEXT_PUBLIC_*` bukan variabel runtime: nilainya DITANAM saat `next build`,
// lalu ikut terkirim ke browser setiap pengunjung. Sebelumnya tiga tempat
// menulis baris yang sama:
//
//     process.env.NEXT_PUBLIC_CHAT_URL || 'http://localhost:3001'
//
// Satu build produksi yang dibuat tanpa variabel itu terisi karena itu menanam
// `http://localhost:3001` ke dalam bundel. Browser setiap pengunjung lalu
// mencoba menyambung ke MESIN PENGUNJUNG SENDIRI: live chat mati untuk semua
// orang, tanpa satu pun galat di server, tanpa entri log, dan tanpa tanda bahwa
// ada yang salah konfigurasi. Kegagalan yang paling mahal adalah kegagalan yang
// tidak kelihatan.
//
// Karena itu di production tidak ada cadangan: fungsi ini mengembalikan `null`,
// pemanggilnya TIDAK membuka koneksi, dan yang tampil adalah pesan bahwa
// layanan chat belum dikonfigurasi. Salah konfigurasi yang terlihat bisa
// diperbaiki; yang diam tidak.
//
// Di luar production cadangan lokal dipertahankan — `npm run dev` di mesin
// pengembang memang menyalakan chat-server di 3001 — tapi dengan peringatan,
// supaya alasan nilai itu muncul tidak perlu ditebak.
//
// CATATAN PENTING BAGI YANG MENGUBAH BERKAS INI: penanaman nilai oleh Next hanya
// terjadi pada ekspresi yang ditulis PENUH sebagai `process.env.NEXT_PUBLIC_...`.
// Destructuring (`const { NEXT_PUBLIC_CHAT_URL } = process.env`) atau akses
// dinamis (`process.env[nama]`) TIDAK ditanam, dan di browser hasilnya selalu
// `undefined` — artinya production akan selalu terbaca "belum dikonfigurasi".
// Biarkan bentuknya seperti sekarang.

/** Alamat chat-server saat pengembangan lokal (`PORT=3001` di `chat-server/`). */
export const CADANGAN_CHAT_LOKAL = 'http://localhost:3001';

/** Pesan yang boleh ditampilkan ke pengguna saat alamat chat tidak tersedia. */
export const PESAN_CHAT_BELUM_DIKONFIGURASI =
  'Layanan chat belum tersedia. Silakan hubungi kami lewat email atau telepon.';

function tanpaGarisMiringAkhir(nilai: string): string {
  return nilai.endsWith('/') ? nilai.replace(/\/+$/, '') : nilai;
}

/**
 * Alamat chat-server untuk dipakai browser, atau `null` bila tidak ada alamat
 * yang layak dipakai.
 *
 * `null` HARUS diperlakukan sebagai "jangan menyambung": memaksa nilai apa pun
 * di tempatnya mengembalikan bug yang berkas ini ada untuk menutup.
 */
export function alamatChat(): string | null {
  const dariEnv = (process.env.NEXT_PUBLIC_CHAT_URL || '').trim();

  if (dariEnv) return tanpaGarisMiringAkhir(dariEnv);

  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[chat] NEXT_PUBLIC_CHAT_URL tidak ikut ter-build. Koneksi chat tidak dibuka. ' +
        'Isi variabel itu lalu BUILD ULANG — nilainya ditanam saat build, ' +
        'jadi mengisinya di server yang sudah jalan tidak berpengaruh.'
    );
    return null;
  }

  console.warn(
    '[chat] NEXT_PUBLIC_CHAT_URL belum diisi — memakai ' +
      `${CADANGAN_CHAT_LOKAL} untuk pengembangan lokal. ` +
      'Build produksi TIDAK memakai cadangan ini.'
  );
  return CADANGAN_CHAT_LOKAL;
}
