// src/lib/petak-kalender.ts
//
// Jembatan antara PETAK KALENDER `react-calendar` dan KUNCI HARI `YYYY-MM-DD`.
//
// KENAPA INI TIDAK BOLEH `kunciTanggal()`
// ---------------------------------------
// `src/lib/tanggal.ts` mengubah INSTAN menjadi hari WIB, dan itu benar untuk
// segala yang datang dari database: `Booking.startDate` adalah satu titik waktu,
// dan hari WIB-nya adalah pertanyaan yang sah.
//
// Petak `react-calendar` bukan instan. Ia disusun sebagai
// `new Date(tahun, bulan, hari)` — tanggal kalender di zona PERAMBAN, tanpa
// makna waktu. Melewatkannya ke `kunciTanggal()` berarti menjawab "instan ini
// jatuh pada hari apa di Jakarta", padahal instannya sendiri adalah artefak zona
// peramban. Terukur: petak 1 Oktober pada peramban di Auckland (+13) adalah
// `2026-09-30T11:00:00Z`, dan `kunciTanggal()` menjawab `2026-09-30` — jadi
// pengunjung mengeklik 1 Oktober dan URL-nya bertuliskan 30 September.
//
// Sebaliknya `new Date('2026-10-01')` dibaca tengah malam UTC, dan pencocokan
// petak `react-calendar` memakai tanggal lokal — jadi di setiap zona di belakang
// UTC tanggal yang dipilih disorot pada petak hari sebelumnya.
//
// Kedua arah karena itu harus saling membalik TANPA melewati zona waktu sama
// sekali, dan keduanya tinggal di satu berkas supaya tidak bisa menyimpang.
// Modul ini tidak mengimpor apa pun: ia dipakai dari Client Component.

/** Pola kunci hari yang diterima. Tidak menerima `2026-1-1` maupun `2026-10`. */
const POLA_KUNCI = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Kunci hari `YYYY-MM-DD` dari satu petak kalender.
 *
 * Membaca medan kalender lokal objeknya dengan sengaja — lihat komentar kepala
 * berkas. Ini satu-satunya tempat di `src/` yang boleh melakukannya.
 */
export function kunciPetak(petak: Date): string {
  if (Number.isNaN(petak.getTime())) return '';

  const bulan = String(petak.getMonth() + 1).padStart(2, '0');
  const hari = String(petak.getDate()).padStart(2, '0');
  return `${petak.getFullYear()}-${bulan}-${hari}`;
}

/**
 * Petak kalender dari kunci hari `YYYY-MM-DD`, atau `null` bila bentuknya salah.
 *
 * `null` dan bukan "hari ini": `?date=besok` yang jatuh ke hari ini akan
 * menyorot petak yang tidak pernah dipilih pengunjung, dan tanggal itulah yang
 * lalu terkirim ke `booking/create`.
 */
export function petakDariKunci(kunci: string): Date | null {
  const cocok = POLA_KUNCI.exec(kunci);
  if (!cocok) return null;

  const tahun = Number(cocok[1]);
  const bulan = Number(cocok[2]);
  const hari = Number(cocok[3]);

  const petak = new Date(tahun, bulan - 1, hari);

  // `new Date(2026, 12, 40)` tidak melempar, ia BERGULIR — jadi `2026-13-40`
  // akan menjadi tanggal yang sah dan tampak dipilih dengan sengaja. Dibaca
  // ulang untuk memastikan ia benar-benar hari yang diminta.
  if (kunciPetak(petak) !== kunci) return null;

  return petak;
}

/**
 * Satu rentang terpakai, sebagai KUNCI HARI WIB.
 *
 * Namanya menyebut `sampaiEksklusif` dengan sengaja. `end` tidak mengatakan
 * apakah hari itu ikut terpakai, dan ketidakjelasan itulah yang melahirkan
 * cacatnya: kalender publik memakai `date <= end`, padahal `booking/create`
 * memakai `endDate: { gt: startDate }` dan constraint
 * `booking_tanpa_tumpang_tindih` sepakat dengannya.
 */
export type RentangTerpakai = {
  /** Hari pertama yang terpakai, `YYYY-MM-DD` di WIB. */
  mulai: string;
  /** Hari pertama yang SUDAH BEBAS lagi, `YYYY-MM-DD` di WIB. */
  sampaiEksklusif: string;
};

/**
 * Apakah satu hari tidak bisa dipilih: sudah lewat, atau sudah terjual.
 *
 * KENAPA INI FUNGSI DAN BUKAN CLOSURE DI DALAM KOMPONEN
 * -----------------------------------------------------
 * Rumusnya empat perbandingan, dan keempatnya adalah tempat cacat hidup —
 * `<=` yang seharusnya `<` di sini berarti satu hari yang masih bisa dijual
 * ditandai penuh, sekali per pesanan, selamanya, tanpa satu pun galat. Sebagai
 * closure di dalam komponen ber-JSX-dan-hook, ia hanya bisa diuji dengan
 * MENYALIN rumusnya ke dalam test — dan salinan yang tetap benar sementara yang
 * dirender berubah adalah test yang melaporkan hijau atas kode yang salah.
 * Terukur: mutasi `<` → `<=` pada versi closure-nya tidak membunuh satu pun
 * test. Di sini ia membunuh test.
 *
 * @param rentang      Rentang terjual, kunci hari WIB.
 * @param kunciHariIni Hari ini menurut WIB — dari `kunciTanggal(new Date())`,
 *                     bukan dari hari peramban pengunjung.
 * @param kunci        Hari yang ditanyakan, dari `kunciPetak(petak)`.
 */
export function petakTerpakai(
  rentang: readonly RentangTerpakai[],
  kunciHariIni: string,
  kunci: string
): boolean {
  // Kunci kosong berarti `kunciPetak` menerima `Invalid Date`. Dimatikan:
  // hari yang tidak bisa dinamai tidak bisa dijual, dan membiarkannya lolos
  // berarti mengirim `?date=` kosong ke checkout.
  if (!kunci) return true;

  // `<`, BUKAN `<=`. Hari ini sendiri masih bisa dipesan — `booking/create`
  // menerimanya, dan mematikannya di sini berarti menolak penjualan yang sah.
  if (kunci < kunciHariIni) return true;

  // `kunci < sampaiEksklusif`, BUKAN `<=`. Hari pada `sampaiEksklusif` adalah
  // hari pertama yang sudah bebas kembali.
  //
  // `some`, bukan `every`: satu rentang yang memuatnya sudah cukup. `every`
  // akan membuat hari terjual tampak kosong begitu ada pesanan kedua.
  return rentang.some(
    (r) => kunci >= r.mulai && kunci < r.sampaiEksklusif
  );
}

/**
 * Batas bawah navigasi kalender, dari hari WIB.
 *
 * `minDate` menyaring LEBIH DULU daripada `tileDisabled`, jadi
 * `minDate={new Date()}` memakai hari peramban: pengunjung yang perambannya
 * sudah lewat tengah malam sementara di Jakarta belum kehilangan satu hari yang
 * sebenarnya masih dijual, dan `tileDisabled` tidak bisa mengembalikannya.
 *
 * Tengah malam LOKAL supaya tanggalnya sendiri lolos — `react-calendar`
 * membandingkan petak dengan `minDate` sebagai objek tanggal.
 */
export function batasBawahNavigasi(kunciHariIni: string): Date {
  // `??` ke `new Date()` tidak pernah terpakai: `kunciTanggal()` selalu
  // menjawab `YYYY-MM-DD`. Ia ada supaya tipenya bukan `Date | null`, dan
  // bawaannya dipilih yang paling ketat — bukan tanpa batas bawah.
  return petakDariKunci(kunciHariIni) ?? new Date();
}
