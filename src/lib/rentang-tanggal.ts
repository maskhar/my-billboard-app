// src/lib/rentang-tanggal.ts
//
// Rentang tanggal untuk laporan: dibaca dari pilihan admin, dihitung di WIB.
//
// KENAPA FILE INI ADA, DAN KENAPA BUKAN SEKADAR DUA `new Date(teks)`
// ------------------------------------------------------------------
// Butir audit 5.22 berbunyi "date-range filter di dashboard/revenue". Yang
// ditemukan saat memeriksa jalur yang akan dipasangi filter itu lebih penting
// daripada filternya sendiri, karena ketiganya membuat filter apa pun menjawab
// SALAH tepat di batas yang dipilih admin:
//
//  1. **Grafik dibukukan pada waktu lokal PROSES, bukan WIB.** Kunci embernya
//     dulu `d.getFullYear()` + `d.getMonth()` — keduanya membaca zona waktu
//     proses Node. Di Vercel proses itu berjalan pada UTC. Terukur: pembayaran
//     1 Oktober pukul 00.30 WIB tersimpan `2026-09-30T17:30:00Z`, dan rumus
//     lama membukukannya ke batang **September**. Jadi tujuh jam pertama setiap
//     hari selalu masuk ke hari sebelumnya, dan pada tanggal 1 ia masuk ke
//     BULAN sebelumnya — yaitu tepat pada batas yang dipakai orang untuk
//     menutup buku.
//
//  2. **Aritmetika bulan preset meluber.** `new Date(y, m - 1, tanggal)` pada
//     31 Maret menghasilkan **3 Maret**, bukan 28 Februari: 31 Februari tidak
//     ada, jadi JavaScript menggulungnya ke bulan berikutnya. Preset "1 Bulan"
//     karena itu kadang mencakup 28 hari dan mendarat di bulan yang salah, dan
//     tidak ada satu pun tanda di layar bahwa jangkauannya bukan yang tertulis
//     di tombolnya.
//
//  3. **`where` hanya punya `gte`, nol batas atas.** Itu memadai selama pilihan
//     admin hanya "sejak kapan". Rentang punya DUA ujung, dan ujung atas yang
//     tidak pernah dipasang berarti filter "1–31 Januari" menampilkan seluruh
//     data sejak 1 Januari sampai hari ini.
//
// Aturannya disatukan di sini, bukan ditulis di `actions.ts`, karena tiga
// pemanggil akan membacanya (Server Action laporan, halaman dashboard, dan
// tautan pada UI-nya) — dan aturan tanggal yang ditulis berkali-kali adalah
// aturan yang akan menyimpang. Cacat nomor 1 di atas justru bentuk itu: ia ada
// di `actions.ts` karena kunci embernya ditulis di sana, terpisah dari
// `src/lib/tanggal.ts` yang docstring-nya sudah memperingatkan anti-pola yang
// sama.
//
// KENAPA OFFSET DIPAKU `+07:00` DAN BUKAN DIHITUNG
// -----------------------------------------------
// WIB tidak punya daylight saving dan tidak pernah punya. Offsetnya tetap
// +07:00 sepanjang tahun, jadi `2026-10-01T00:00:00+07:00` adalah instan yang
// PERSIS, tanpa perlu satu pun pustaka zona waktu. Ini yang membuat batas
// rentang bisa dihitung tepat sementara tampilannya tetap lewat
// `src/lib/tanggal.ts`.
//
// KENAPA NOL IMPOR SELAIN `./tanggal`
// -----------------------------------
// Sama seperti `paginasi.ts`, `kueri-daftar.ts`, dan `saringan-daftar.ts`:
// modul ini dipakai dari Server Action DAN dari Client Component, dan di-
// `require` langsung di test tanpa satu pun mock. `./tanggal` sendiri nol impor.
// Relatif, bukan `@/lib/tanggal`: test memuat berkas ini tanpa penyelesai alias.

import { kunciTanggal } from './tanggal';

/**
 * Offset WIB. Tetap sepanjang tahun — lihat komentar di atas.
 */
const OFFSET_WIB = '+07:00';

/** Bentuk kunci tanggal yang sah: `YYYY-MM-DD`. */
const POLA_KUNCI = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Batas granularitas harian, dalam hari.
 *
 * Rentang yang lebih panjang dari ini dibukukan per BULAN. Angkanya bukan
 * selera: batang harian di atas dua bulan menjadi lebih rapat daripada lebar
 * satu piksel label sumbunya, jadi grafiknya berhenti bisa dibaca justru pada
 * rentang yang paling sering diminta ("setahun"). 62 = dua bulan terpanjang
 * yang berdampingan (Juli + Agustus), supaya "dua bulan penuh" tidak jatuh ke
 * sisi yang salah karena panjang bulannya.
 */
export const BATAS_HARIAN_HARI = 62;

/** Satu hari dalam milidetik. Dipakai hanya untuk MENGUKUR selisih, tidak untuk melangkah. */
const MS_HARI = 24 * 60 * 60 * 1000;

/**
 * Rentang yang sudah divalidasi: setengah terbuka `[mulai, sampaiEksklusif)`.
 *
 * Ujung atasnya EKSKLUSIF, dan itu keputusan yang paling mudah salah di seluruh
 * modul ini. Rentang "sampai 31 Oktober" yang ditulis `lte: awal 31 Oktober`
 * membuang seluruh pembayaran yang masuk pada 31 Oktober setelah pukul 00.00 —
 * yaitu hampir semuanya. Yang benar adalah `lt: awal 1 November`, dan bentuk
 * setengah terbuka menuliskannya tanpa satu pun `23:59:59.999` yang harus
 * diingat pemanggil.
 *
 * `kunciMulai`/`kunciSampai` dibawa apa adanya supaya UI bisa mengisi ulang
 * medan `<input type="date">` dan tautan bisa menuliskannya kembali TANPA
 * memformat `Date` lagi — pemformatan kedua adalah tempat cacat nomor 1 di atas
 * lahir.
 */
export type Rentang = {
  /** Instan pertama yang masuk hitungan. */
  mulai: Date;
  /** Instan pertama yang TIDAK masuk hitungan. */
  sampaiEksklusif: Date;
  /** `YYYY-MM-DD` hari pertama, di WIB. */
  kunciMulai: string;
  /** `YYYY-MM-DD` hari TERAKHIR yang masuk hitungan, di WIB. */
  kunciSampai: string;
};

/**
 * Preset rentang yang boleh diminta, beserta labelnya.
 *
 * Daftarnya TERTUTUP dengan alasan yang sama seperti kunci urut di
 * `saringan-daftar.ts`: nilainya datang dari luar (Server Action adalah endpoint
 * HTTP publik, lihat `actions.ts`), jadi ia tidak boleh dipakai untuk apa pun
 * yang dirangkai.
 *
 * `harian` sengaja tidak lagi ada sebagai preset terpisah. Dulu ia berarti "30
 * hari terakhir, digambar per hari" — dua keputusan yang dijepit menjadi satu
 * nama, sehingga tidak ada cara meminta 30 hari terakhir per bulan maupun
 * setahun per hari. Sekarang granularitasnya DITURUNKAN dari panjang rentangnya
 * (lihat `granularitas`), jadi presetnya cukup menyebut panjangnya saja.
 */
export const PRESET_RENTANG = {
  '30h': { label: '30 Hari', mundurHari: 29 },
  '1b': { label: '1 Bulan', mundurBulan: 1 },
  '3b': { label: '3 Bulan', mundurBulan: 3 },
  '6b': { label: '6 Bulan', mundurBulan: 6 },
  '12b': { label: '1 Tahun', mundurBulan: 12 },
  semua: { label: 'Semua Waktu' },
} as const;

export type KunciPreset = keyof typeof PRESET_RENTANG;

export const KUNCI_PRESET = Object.keys(PRESET_RENTANG) as [KunciPreset, ...KunciPreset[]];

/** Preset baku. Enam bulan: cukup panjang untuk melihat tren, cukup pendek untuk dibaca. */
export const PRESET_BAKU: KunciPreset = '6b';

/**
 * Jumlah hari dalam satu bulan kalender.
 *
 * `Date.UTC(tahun, bulan, 0)` adalah hari TERAKHIR bulan sebelumnya — bentuk
 * yang tidak perlu tahu apa-apa soal tahun kabisat. UTC, bukan konstruktor
 * lokal: yang dibaca hanya nomor harinya, dan konstruktor lokal membuat
 * jawabannya bergantung pada zona proses.
 */
function hariDalamBulan(tahun: number, bulan: number): number {
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

function duaDigit(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Apakah `mentah` adalah kunci tanggal WIB yang benar-benar ada.
 *
 * Pemeriksaan bolak-balik, bukan hanya polanya. `2026-02-30` LOLOS regex dan
 * diterima `new Date` — JavaScript menggulungnya menjadi 2 Maret. Filter yang
 * menerimanya menampilkan rentang yang tidak pernah diminta siapa pun, dengan
 * medan tanggal di layar tetap menunjukkan tanggal yang diketik admin. Jadi
 * satu-satunya cara memastikan tanggalnya ada adalah memformat hasilnya kembali
 * dan menuntut teksnya sama.
 */
export function kunciTanggalSah(mentah: unknown): mentah is string {
  if (typeof mentah !== 'string' || !POLA_KUNCI.test(mentah)) return false;

  const d = new Date(`${mentah}T00:00:00${OFFSET_WIB}`);
  if (Number.isNaN(d.getTime())) return false;

  return kunciTanggal(d) === mentah;
}

/** Instan pertama hari `kunci` di WIB. */
function awalHari(kunci: string): Date {
  return new Date(`${kunci}T00:00:00${OFFSET_WIB}`);
}

/**
 * Geser kunci tanggal sebanyak `hari`, di kalender WIB.
 *
 * Melangkah lewat `Date` UTC lalu diformat ulang ke WIB, bukan lewat
 * penjumlahan `MS_HARI` pada instan: keduanya sama untuk WIB (nol DST), tapi
 * bentuk ini tetap benar bila suatu hari modul ini dipakai untuk zona lain,
 * dan ia tidak menggoda pembaca berikutnya menyalin `+ MS_HARI` ke tempat yang
 * DST-nya ada.
 */
function geserHari(kunci: string, hari: number): string {
  const d = awalHari(kunci);
  d.setUTCDate(d.getUTCDate() + hari);
  return kunciTanggal(d);
}

/**
 * Geser kunci tanggal sebanyak `bulan` ke belakang, di kalender WIB, dengan
 * tanggal DIJEPIT ke akhir bulan tujuan.
 *
 * Ini yang menggantikan `new Date(y, m - n, tanggal)`. Terukur pada rumus lama:
 *
 *   31 Maret − 1 bulan  → 3 Maret   (bukan 28 Februari)
 *   31 Mei   − 3 bulan  → 3 Maret   (bukan 28 Februari)
 *   31 Maret − 6 bulan  → 1 Oktober (bukan 30 September)
 *
 * Penjepitan membuat "1 bulan sebelum 31 Maret" menjadi 28 Februari — jawaban
 * yang dimaksud setiap orang yang menekan tombolnya, dan satu-satunya jawaban
 * yang tidak melompati satu bulan penuh.
 */
function geserBulan(kunci: string, bulan: number): string {
  const [tahun, bln, tgl] = kunci.split('-').map(Number);

  // Dihitung sebagai jumlah bulan absolut supaya pembagiannya tidak perlu
  // menangani angka negatif per cabang. `Math.floor` benar untuk keduanya.
  const total = tahun * 12 + (bln - 1) - bulan;
  const tahunTujuan = Math.floor(total / 12);
  const bulanTujuan = total - tahunTujuan * 12 + 1;

  const tglTujuan = Math.min(tgl, hariDalamBulan(tahunTujuan, bulanTujuan));

  return `${tahunTujuan}-${duaDigit(bulanTujuan)}-${duaDigit(tglTujuan)}`;
}

/**
 * Susun `Rentang` dari dua kunci tanggal WIB yang sudah dipastikan sah.
 *
 * Urutan yang terbalik DITUKAR, tidak dijatuhkan ke baku. Alasannya sama
 * seperti nilai baku yang eksplisit di `bacaPilihan`: yang harus dihindari
 * bukan galatnya, melainkan keadaan di mana pilihan admin HILANG tanpa suara.
 * Rentang yang jatuh ke baku menampilkan enam bulan sementara kedua medan
 * tanggal di layar tetap menunjukkan Januari — angka yang dibaca lalu dikutip
 * ke rapat sebagai angka Januari. Menukarnya menampilkan rentang yang jelas
 * dimaksud, dan pemanggil bisa mengatakannya lewat `ditukar`.
 */
function susun(kunciA: string, kunciB: string): Rentang {
  const [kunciMulai, kunciSampai] = kunciA <= kunciB ? [kunciA, kunciB] : [kunciB, kunciA];

  return {
    mulai: awalHari(kunciMulai),
    // Hari SETELAH hari terakhir. Lihat alasan eksklusifnya di tipe `Rentang`.
    sampaiEksklusif: awalHari(geserHari(kunciSampai, 1)),
    kunciMulai,
    kunciSampai,
  };
}

/**
 * Rentang dari preset, relatif terhadap `sekarang`.
 *
 * `semua` mengembalikan `null` — bukan rentang sejak epoch. Keduanya berbeda
 * pada query yang dihasilkan: `null` berarti TIDAK ADA klausa tanggal sama
 * sekali, sedangkan `gte: new Date(0)` adalah klausa yang harus dievaluasi
 * database atas setiap baris dan menghalangi pemakaian indeks pada kolom yang
 * nilainya `null` (pembayaran yang belum dibayar). Perbedaan itu juga yang
 * membuat "semua waktu" tidak perlu diam-diam memotong data sebelum 1970.
 */
export function rentangPreset(preset: KunciPreset, sekarang: Date = new Date()): Rentang | null {
  const def = PRESET_RENTANG[preset];
  const hariIni = kunciTanggal(sekarang);

  if ('mundurHari' in def) {
    // Inklusif: "30 Hari" berarti hari ini DAN 29 hari sebelumnya, bukan 31 hari.
    return susun(geserHari(hariIni, -def.mundurHari), hariIni);
  }

  if ('mundurBulan' in def) {
    return susun(geserBulan(hariIni, def.mundurBulan), hariIni);
  }

  return null;
}

/**
 * Hasil pembacaan pilihan rentang dari luar.
 *
 * `ditukar` dan `ditolak` ada supaya UI bisa MENGATAKANNYA. Filter yang diam-
 * diam memperbaiki masukan adalah filter yang membuat admin membaca angka dari
 * rentang yang bukan yang ia ketik — dan itu cacat yang sama bentuknya dengan
 * kotak cari yang menjawab "tidak ada" atas baris yang ada.
 */
export type PilihanRentang = {
  /** Preset yang berlaku; `null` bila rentangnya ditentukan dua tanggal. */
  preset: KunciPreset | null;
  /** Rentang yang berlaku; `null` berarti seluruh waktu. */
  rentang: Rentang | null;
  /** Urutan tanggal yang diminta terbalik dan sudah ditukar. */
  ditukar: boolean;
  /** Ada tanggal yang diminta tapi tidak sah, dan pilihan jatuh ke preset. */
  ditolak: boolean;
};

/**
 * Baca pilihan rentang: dua tanggal bila keduanya sah, kalau tidak presetnya.
 *
 * Nilainya boleh datang dari mana pun — parameter URL, atau argumen Server
 * Action, yang keduanya di bawah kendali pemanggil, bukan kita. Karena itu tidak
 * ada satu pun cabang di sini yang memercayai bentuk masukannya.
 *
 * Satu tanggal tanpa pasangannya DITOLAK, bukan dilengkapi. "Sejak 1 Januari
 * sampai kapan pun" dan "seluruh Januari" adalah dua pertanyaan berbeda, dan
 * menebak yang mana yang dimaksud dari medan yang setengah terisi akan salah
 * separuh waktu — sementara medan yang setengah terisi biasanya berarti admin
 * belum selesai mengetik.
 */
export function bacaRentang(
  mentah: {
    preset?: unknown;
    dari?: unknown;
    sampai?: unknown;
  },
  sekarang: Date = new Date()
): PilihanRentang {
  const adaTanggal = mentah.dari !== undefined || mentah.sampai !== undefined;
  const dariSah = kunciTanggalSah(mentah.dari);
  const sampaiSah = kunciTanggalSah(mentah.sampai);

  if (dariSah && sampaiSah) {
    const dari = mentah.dari as string;
    const sampai = mentah.sampai as string;
    return {
      preset: null,
      rentang: susun(dari, sampai),
      ditukar: dari > sampai,
      ditolak: false,
    };
  }

  const preset = KUNCI_PRESET.find((k) => k === mentah.preset) ?? PRESET_BAKU;

  return {
    preset,
    rentang: rentangPreset(preset, sekarang),
    ditukar: false,
    // Medan yang KOSONG bukan masukan yang ditolak — itu keadaan awal kedua
    // medan tanggal, dan menyalakan peringatan di sana membuat peringatan itu
    // berhenti dibaca sebelum ada yang salah.
    ditolak: adaTanggal && (mentah.dari !== '' || mentah.sampai !== ''),
  };
}

/**
 * Jumlah hari yang dicakup rentang.
 *
 * Diukur dari selisih instan, bukan dengan melangkah hari per hari: yang
 * dibutuhkan hanya panjangnya, dan keduanya tepat karena WIB nol DST.
 */
export function panjangHari(rentang: Rentang): number {
  return Math.round((rentang.sampaiEksklusif.getTime() - rentang.mulai.getTime()) / MS_HARI);
}

/**
 * Granularitas batang grafik untuk sebuah rentang.
 *
 * Diturunkan dari panjang rentangnya, BUKAN dipilih terpisah oleh pemanggil.
 * Dulu keduanya satu nama (`'daily'`), yang berarti "30 hari" dan "per hari"
 * tidak bisa diminta terpisah. Sekarang admin memilih rentangnya dan
 * granularitasnya mengikuti, sehingga tidak ada kombinasi yang menghasilkan
 * grafik dengan 400 batang setebal setengah piksel.
 *
 * `null` (seluruh waktu) selalu bulanan: panjangnya tidak diketahui sebelum
 * datanya dibaca, dan satu-satunya jawaban yang aman untuk rentang tak terbatas
 * adalah yang embernya paling sedikit.
 */
export function granularitas(rentang: Rentang | null): 'hari' | 'bulan' {
  if (rentang === null) return 'bulan';
  return panjangHari(rentang) <= BATAS_HARIAN_HARI ? 'hari' : 'bulan';
}

/**
 * Kunci ember bulanan di WIB: `YYYY-MM`.
 *
 * Inilah pengganti `d.getFullYear()` + `d.getMonth()` yang membukukan tujuh jam
 * pertama setiap hari ke hari sebelumnya — dan pada tanggal 1, ke BULAN
 * sebelumnya. Lihat cacat nomor 1 di komentar kepala berkas.
 */
export function kunciBulan(nilai: Date): string {
  return kunciTanggal(nilai).slice(0, 7);
}

/** Kunci ember harian di WIB: `YYYY-MM-DD`. Alias bernama, supaya pemanggil membaca maksudnya. */
export function kunciHari(nilai: Date): string {
  return kunciTanggal(nilai);
}

/**
 * Deret kunci ember yang harus ADA di grafik, walau nol transaksi.
 *
 * Periode kosong wajib muncul sebagai nol, bukan hilang dari garis waktu. Dua
 * bulan tanpa pemasukan yang dihapus dari grafik membuat batang bulan ketiga
 * berdiri langsung di sebelah bulan pertama — dan bentuk itu terbaca sebagai
 * penjualan yang berlanjut, yaitu kebalikan dari keadaannya.
 *
 * Untuk rentang `null` deretnya KOSONG: tidak ada awal yang diketahui, jadi
 * embernya hanya yang benar-benar punya data. Itu memang perilaku "semua waktu"
 * sebelumnya, dan di sana ia benar.
 */
export function deretKunci(rentang: Rentang | null): string[] {
  if (rentang === null) return [];

  const kunci: string[] = [];

  if (granularitas(rentang) === 'hari') {
    let hari = rentang.kunciMulai;
    while (hari <= rentang.kunciSampai) {
      kunci.push(hari);
      hari = geserHari(hari, 1);
    }
    return kunci;
  }

  // Bulanan: dari bulan `kunciMulai` sampai bulan `kunciSampai`, inklusif.
  // Dilangkahi lewat tanggal 1 setiap bulan supaya penjepitan akhir bulan tidak
  // pernah terlibat — `31 Jan` + 1 bulan adalah pertanyaan yang tidak perlu
  // dijawab di sini.
  let bulan = `${rentang.kunciMulai.slice(0, 7)}-01`;
  const bulanAkhir = rentang.kunciSampai.slice(0, 7);
  while (bulan.slice(0, 7) <= bulanAkhir) {
    kunci.push(bulan.slice(0, 7));
    bulan = geserBulan(bulan, -1);
  }

  return kunci;
}

/**
 * Label sumbu X untuk sebuah kunci ember.
 *
 * Nama bulan ditulis di sini, bukan di `actions.ts`, karena labelnya harus cocok
 * dengan kuncinya — dan keduanya bersebelahan hanya bila ditulis bersebelahan.
 */
const NAMA_BULAN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des',
];

export function labelKunci(kunci: string): string {
  const bagian = kunci.split('-');

  // `YYYY-MM-DD` → `01/10`. Hari di depan, sesuai kebiasaan penulisan tanggal
  // di sini; bulannya ikut supaya batang di perbatasan bulan tidak ambigu.
  if (bagian.length === 3) return `${bagian[2]}/${bagian[1]}`;

  // `YYYY-MM` → `Okt '26`.
  return `${NAMA_BULAN[Number(bagian[1]) - 1]} '${bagian[0].slice(-2)}`;
}

/**
 * Teks rentang untuk dibaca admin, mis. `1 Jan 2026 – 31 Jan 2026`.
 *
 * Ada di modul ini supaya yang TERTULIS di layar berasal dari rentang yang sama
 * dengan yang dikirim ke database. Judul grafik yang disusun dari medan
 * formulirnya sendiri akan tetap menampilkan rentang yang diketik admin
 * walaupun yang dipakai query ternyata yang lain — dan itu keadaan di mana
 * angka yang salah dibaca sebagai angka yang benar.
 *
 * Memakai `tanggalRingkas` lewat pemanggil, bukan di sini: modul ini
 * mengembalikan KUNCI, dan pemformatan untuk manusia tetap milik
 * `src/lib/tanggal.ts`.
 */
export function kunciRentang(rentang: Rentang | null): { dari: string; sampai: string } | null {
  if (rentang === null) return null;
  return { dari: rentang.kunciMulai, sampai: rentang.kunciSampai };
}
