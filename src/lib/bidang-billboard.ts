// src/lib/bidang-billboard.ts
//
// Penjaga kolom skalar `Billboard` — teks dan koordinat — untuk kedua route
// yang menulisnya.
//
// KENAPA FILE INI ADA
// -------------------
// `specs`, `includes`, `excludes`, dan `gallery` sudah punya penjaganya
// masing-masing. Kolom BIASA-nya belum, dan di situ ada tiga cacat yang
// bentuknya sama tapi akibatnya berbeda:
//
// 1. `title: body.title` di `create/route.ts` TIDAK PUNYA fallback sama sekali,
//    sementara sembilan tetangganya punya (`body.sku || "NO-SKU"`,
//    `body.address || "Alamat belum diisi"`, dan seterusnya). Permintaan tanpa
//    `title` karena itu menulis `undefined` ke kolom String non-null: Prisma
//    menolaknya, dan admin melihat "Gagal menyimpan data" tanpa keterangan
//    setelah seluruh form diisi. Yang lain memberi nilai baku; `title` hanya
//    terlewat.
//
// 2. `lat: Number(body.lat)` di `update/route.ts` tidak punya pemeriksaan
//    BERHINGGA dan tidak punya fallback — padahal `create/route.ts` punya
//    (`Number(body.lat) || -7.9`). Menyimpang di satu jalur saja, dan justru
//    jalur yang lebih berbahaya: `{"lat":"utara"}` maupun `lat` yang tidak
//    dikirim sama sekali menghasilkan `NaN`, kolom Float menolaknya, dan karena
//    penulisannya ada DI DALAM `$transaction`, `billboardHistory.create` ikut
//    batal. Jadi bukan hanya update yang gagal — jejak auditnya pun tidak ada.
//
//    `Number.isFinite`, bukan `typeof === 'number'`: `NaN` dan `Infinity`
//    keduanya bertipe number dan keduanya ditolak kolom Float. Alasan yang sama
//    tertulis di `api/admin/billboards/rollback/route.ts`.
//
// 3. `sku`, `address`, `type`, `mainImage`, `smartsucoUrl` diambil apa adanya
//    dari `req.json()`. Nilai bukan teks membuat Prisma menolak di lapisan
//    paling dalam, jadi jawabannya 500 "Gagal Update" — bukan 400 yang
//    menyebutkan bidang mana yang salah. Cacat yang sama yang diperbaiki untuk
//    `price` dan kedua kolom enum di kedua route ini: nilainya diperiksa lebih
//    dulu supaya pesannya berguna.
//
// Perhatikan bahwa yang ketiga BUKAN lubang keamanan seperti `specs` — kolom
// String tidak dirender sebagai anak elemen React dalam bentuk objek; Prisma
// menolaknya lebih dulu. Ia soal jawaban yang benar: 400 dengan nama bidangnya,
// bukan 500 tanpa keterangan.
//
// KENAPA NOL IMPOR
// ----------------
// Sama seperti `src/lib/spesifikasi-billboard.ts` dan `src/lib/tarif.ts`:
// tidak ada yang perlu diimpor, dan efek sampingnya berkas ini bisa dipakai
// dari Client Component tanpa menarik runtime Prisma ke bundel browser.

/**
 * Batas panjang kolom teks billboard.
 *
 * Kolomnya `String` tanpa batas di Postgres, jadi ini bukan batas database —
 * ia batas yang masuk akal untuk judul, alamat, dan URL yang ditampilkan di
 * kartu dan tabel. Tanpa batas apa pun, satu permintaan bisa menyimpan teks
 * sepanjang megabyte yang lalu dibaca ulang setiap kali halaman dibuka.
 */
export const PANJANG_TEKS_MAKS = 500;

/** Koordinat default: pusat Malang, dipakai bila tidak ada yang sah dikirim. */
export const LAT_DEFAULT = -7.9;
export const LNG_DEFAULT = 112.6;

/**
 * Teks yang layak disimpan, atau `null` bila tidak ada yang layak.
 *
 * Yang ditolak: nilai bukan teks (objek, array, angka, `null`), teks kosong
 * atau hanya spasi, dan teks yang melewati `PANJANG_TEKS_MAKS`.
 *
 * Pemanggil yang punya nilai baku memakai `?? baku`; pemanggil yang tidak punya
 * menjawab 400. Perbedaan itu sengaja diputuskan di route, bukan di sini: hanya
 * route yang tahu bidang mana yang wajib.
 */
export function teksBillboard(nilai: unknown): string | null {
  if (typeof nilai !== 'string') return null;

  const rapi = nilai.trim();
  if (rapi === '') return null;
  if (rapi.length > PANJANG_TEKS_MAKS) return null;

  return rapi;
}

/**
 * Koordinat sebagai bilangan berhingga, atau `null`.
 *
 * Menerima teks maupun angka: form mengirim `<input type="number">` sebagai
 * teks, sementara pemanggil program mengirim angka.
 *
 * `''` dan `'   '` ditolak walaupun `Number('')` adalah `0` — nol adalah
 * koordinat yang sah (di lepas pantai Afrika Barat), dan menyimpannya karena
 * kolomnya dibiarkan kosong berarti menempatkan billboard Malang di
 * Teluk Guinea tanpa ada yang mengeluh.
 */
export function koordinat(nilai: unknown): number | null {
  if (typeof nilai === 'number') return Number.isFinite(nilai) ? nilai : null;
  if (typeof nilai !== 'string') return null;

  const rapi = nilai.trim();
  if (rapi === '') return null;

  const angka = Number(rapi);
  return Number.isFinite(angka) ? angka : null;
}
