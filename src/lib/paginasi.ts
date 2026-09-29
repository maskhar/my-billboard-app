// src/lib/paginasi.ts
//
// Satu tempat untuk aturan paginasi daftar admin.
//
// KENAPA FILE INI ADA
// -------------------
// Butir audit 5.18 berbunyi "nol pagination di seluruh admin". Premis itu sudah
// basi: empat halaman daftar — inventori, transaksi, pengguna, pengajuan —
// semuanya sudah punya `skip`/`take`, `count`, dan tombol Sebelumnya/Berikutnya.
// Yang benar-benar tersisa adalah bahwa keempatnya menulis aturan yang sama
// empat kali, dan **keempatnya salah dengan cara yang sama**:
//
//   const halaman = Number.isFinite(mentah) && mentah >= 1 ? Math.floor(mentah) : 1;
//
// Nomor halaman dijepit ke BAWAH tapi tidak ke ATAS. `?halaman=999` pada 30
// baris menghasilkan `skip: 24950`, jadi:
//
//  1. Tabelnya kosong — tanpa satu pun kalimat yang menjelaskan kenapa, dan
//     keadaan kosong itu tidak bisa dibedakan dari "belum ada data" maupun dari
//     "backend mati" (cacat yang sama yang sudah diperbaiki di butir 5.15).
//  2. Navigasinya menulis "Halaman 999 dari 2" dan hanya memunculkan tombol
//     "Sebelumnya", karena `halaman < totalHalaman` bernilai salah. Tombol itu
//     membawa ke halaman 998, yang juga kosong. Admin harus menyunting URL
//     dengan tangan untuk keluar.
//
// Ini bukan hipotetis: URL halaman admin disalin ke chat, di-bookmark, dan
// dibuka lagi setelah barisnya terhapus — jumlah halaman MENGECIL seiring waktu,
// jadi setiap tautan lama adalah calon halaman yang terkurung.
//
// KENAPA JEPITANNYA MENJADI PENGALIHAN, BUKAN PEMBETULAN DIAM-DIAM
// ---------------------------------------------------------------
// Jepitan ke atas hanya bisa dihitung SETELAH `count` diketahui, dan `count`
// berjalan di transaksi yang sama dengan `findMany` — jadi `skip` sudah terkirim
// sebelum jawabannya ada. Membetulkan nomornya hanya untuk tampilan akan
// menghasilkan kalimat "Halaman 2 dari 2" di atas tabel yang kosong, yaitu
// kebohongan yang lebih sulit dilacak daripada gejala aslinya.
//
// `hitungPaginasi()` karena itu melaporkan `terlaluJauh`, dan pemanggilnya
// mengalihkan ke nomor yang sah. Ongkosnya satu render tambahan, dan hanya pada
// URL yang memang di luar jangkauan.
//
// KENAPA NOL IMPOR
// ----------------
// Alasan yang sama seperti `src/lib/tanggal.ts` dan `src/lib/tarif.ts`: modul ini
// dipakai dari Server Component dan bisa di-`require` langsung di test tanpa satu
// pun mock. Menarik `@prisma/client` atau `next/navigation` ke sini membuat
// keduanya tidak mungkin.

/**
 * Jumlah baris per halaman untuk seluruh daftar admin.
 *
 * Sebelumnya dideklarasikan empat kali dengan nilai yang kebetulan sama. Nilai
 * yang kebetulan sama adalah nilai yang akan menyimpang: siapa pun yang
 * menaikkannya di satu halaman tidak punya cara mengetahui tiga lainnya ada.
 */
export const PER_HALAMAN = 25;

export type HasilPaginasi = {
  /** Nomor halaman yang SAH — sudah dijepit di kedua arah. */
  halaman: number;
  /** Jumlah halaman; minimum 1 bahkan saat datanya kosong. */
  totalHalaman: number;
  /** Baris yang dilewati. Selalu ≥ 0. */
  skip: number;
  /** Baris yang diambil. */
  take: number;
  /** Total baris menurut `count`. */
  total: number;
  /**
   * `true` bila nomor yang diminta melewati halaman terakhir DAN datanya tidak
   * kosong. Pemanggil wajib mengalihkan, bukan merender.
   *
   * Sengaja `false` saat `total === 0`: daftar yang memang kosong harus
   * menampilkan keadaan kosongnya, bukan mengalihkan ke dirinya sendiri —
   * `?halaman=1` pada nol baris juga "melewati halaman terakhir" secara
   * aritmetika, dan mengalihkannya akan menjadi putaran tanpa akhir.
   */
  terlaluJauh: boolean;
};

/**
 * Ubah `?halaman=` mentah menjadi nomor halaman yang aman dipakai sebagai
 * `skip`.
 *
 * Yang ditolak dan kenapa:
 *
 *  - `undefined` / `''` → 1. Tidak ada parameter berarti halaman pertama.
 *  - `'abc'` → `NaN` → 1. `skip: NaN` ditolak Prisma sebagai galat runtime,
 *    yang terbaca admin sebagai "halaman rusak".
 *  - `'-5'` → 1. `skip` negatif juga galat Prisma.
 *  - `'1e9'` → 1e9 diterima bentuknya, lalu dijepit `hitungPaginasi()`.
 *  - `'Infinity'` → 1. `Number.isFinite` menahannya; tanpa itu `skip: Infinity`
 *    lolos seluruh saringan tanda.
 *  - `'2.7'` → 2. Dibulatkan ke bawah, bukan ditolak: tautan yang tercemar satu
 *    karakter tetap membawa ke halaman yang dimaksud.
 *  - Array (`?halaman=2&halaman=5`) → nilai PERTAMA. Next menyerahkan array
 *    untuk parameter ganda, dan `Number(['2','5'])` adalah `NaN` — jadi tanpa
 *    penanganan ini satu parameter ganda melempar admin kembali ke halaman 1.
 */
export function bacaHalaman(mentah: string | string[] | undefined | null): number {
  const satu = Array.isArray(mentah) ? mentah[0] : mentah;
  if (satu === undefined || satu === null || String(satu).trim() === '') return 1;

  const angka = Number(satu);
  if (!Number.isFinite(angka) || angka < 1) return 1;

  return Math.floor(angka);
}

/**
 * Hitung jendela baris untuk satu halaman.
 *
 * `perHalaman` yang tidak masuk akal (nol, negatif, pecahan, `NaN`) jatuh ke
 * `PER_HALAMAN`: pembagian dengan nol menghasilkan `Infinity` halaman, dan
 * `take: 0` menghasilkan tabel yang selalu kosong pada data yang ada.
 */
export function hitungPaginasi(
  halamanDiminta: number,
  total: number,
  perHalaman: number = PER_HALAMAN,
): HasilPaginasi {
  const take =
    Number.isFinite(perHalaman) && perHalaman >= 1 ? Math.floor(perHalaman) : PER_HALAMAN;

  // `count` seharusnya selalu bilangan bulat ≥ 0, tapi nilai ini ikut
  // menentukan `skip` yang dikirim ke database. Nilai rusak ditahan di nol
  // alih-alih diteruskan.
  const totalAman = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;

  const totalHalaman = Math.max(1, Math.ceil(totalAman / take));

  const diminta =
    Number.isFinite(halamanDiminta) && halamanDiminta >= 1 ? Math.floor(halamanDiminta) : 1;
  const halaman = Math.min(diminta, totalHalaman);

  return {
    halaman,
    totalHalaman,
    skip: (halaman - 1) * take,
    take,
    total: totalAman,
    terlaluJauh: totalAman > 0 && diminta > totalHalaman,
  };
}

/**
 * Susun URL halaman lain dengan MEMBAWA seluruh parameter yang sedang aktif.
 *
 * Kenapa fungsinya ada alih-alih template string di tiap halaman: tiga dari
 * empat halaman daftar punya saringan (`?status=`), dan tautan yang hanya
 * menulis `?halaman=` **membuang saringan itu**. Admin yang sedang membuka tab
 * "Perlu Refund" menekan "Berikutnya" dan mendarat di seluruh transaksi tanpa
 * satu pun petunjuk bahwa tabnya berganti.
 *
 * `undefined` dan `''` dibuang, jadi pemanggil boleh menyerahkan saringan yang
 * sedang kosong tanpa menghasilkan `?status=&halaman=2`.
 *
 * Nilainya di-encode oleh `URLSearchParams`, jadi status atau kata kunci yang
 * memuat `&` tidak bisa menyuntikkan parameter kedua.
 */
export function urlHalaman(
  basis: string,
  halaman: number,
  lain: Record<string, string | undefined | null> = {},
): string {
  const params = new URLSearchParams();

  for (const [kunci, nilai] of Object.entries(lain)) {
    if (nilai === undefined || nilai === null || nilai === '') continue;
    params.set(kunci, String(nilai));
  }

  // `halaman` ditulis TERAKHIR supaya ia menang bila pemanggil ikut
  // menyerahkannya di `lain` — misalnya saat seluruh `searchParams` diteruskan
  // apa adanya. Tanpa ini tombol "Berikutnya" bisa menunjuk ke halaman yang
  // sedang dibuka.
  params.set('halaman', String(halaman));

  return `${basis}?${params.toString()}`;
}
