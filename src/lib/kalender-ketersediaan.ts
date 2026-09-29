// src/lib/kalender-ketersediaan.ts
//
// Kalender ketersediaan / timeline booking: aturan bulan dan selnya, tanpa JSX.
//
// KENAPA MODUL TERPISAH, BUKAN DIHITUNG DI HALAMANNYA
// --------------------------------------------------
// Butir audit 5.23 meminta "kalender ketersediaan / timeline booking untuk
// admin". Satu-satunya kalender yang sudah ada di repo ini,
// `src/components/AvailabilityCalendar.tsx`, salah pada dua hal sekaligus — dan
// keduanya adalah hal yang tidak terlihat dari layar:
//
//  1. **Batas harinya dihitung di zona waktu PROSES.** `new Date()` lalu
//     `setHours(0,0,0,0)` membaca zona mesin yang menjalankannya. Di Vercel itu
//     UTC, jadi "hari ini" pada pukul 06.00 WIB masih hari KEMARIN — dan
//     tanggal yang seharusnya sudah lewat masih bisa diklik pembeli sampai
//     pukul 07.00 WIB. `src/lib/tanggal.ts` sudah memperingatkan anti-pola ini
//     di docstring `kunciTanggal()`.
//
//  2. **`endDate` diperlakukan INKLUSIF.** Baris
//     `end.setHours(23,59,59,999)` disusul `date <= end` menandai hari
//     `endDate` sebagai terpakai. Di database `endDate` adalah batas
//     EKSKLUSIF: `api/booking/create/route.ts` membandingkannya dengan `lt`/
//     `gt`, bukan `lte`/`gte`, dan komentarnya menyebutkan alasannya. Jadi
//     kalender itu menyatakan satu hari terjual yang sebenarnya masih bisa
//     dijual — sekali per pesanan, selamanya, tanpa satu pun galat.
//
// Cacat kedua adalah kerugian uang langsung: hari yang tampak penuh tidak
// ditawarkan ke siapa pun. Cacat pertama adalah kebalikannya pada tujuh jam
// pertama setiap hari. Keduanya lahir dari aritmetika tanggal yang ditulis di
// dalam komponen, jadi aturannya ditaruh di sini — di modul yang bisa di-
// `require` langsung oleh test tanpa satu pun mock, dan yang tidak punya cara
// membaca zona waktu proses.
//
// KENAPA SEL DIHITUNG DARI KUNCI HARI, BUKAN DARI PERBANDINGAN INSTAN
// ------------------------------------------------------------------
// Ada dua cara menjawab "apakah hari K terpakai oleh pesanan B":
//
//   (a) irisan instan: `[awal K, awal K+1)` beririsan dengan `[B.startDate, B.endDate)`
//   (b) irisan kunci:  `kunciTanggal(B.startDate) <= K < kunciTanggal(B.endDate)`
//
// Keduanya TIDAK sama, dan perbedaannya bukan akademis. `startDate` ditulis
// `startOfDay()` di zona proses, dan di Vercel itu menghasilkan `T00:00:00Z` —
// yaitu pukul 07.00 WIB. Maka `endDate` sebuah pesanan yang berakhir 1 Oktober
// adalah `2026-10-01T00:00:00Z`, dan hari WIB 1 Oktober dimulai
// `2026-09-30T17:00:00Z`. Cara (a) melihat irisan tujuh jam dan menandai 1
// Oktober TERPAKAI.
//
// Tapi pesanan baru yang mulai 1 Oktober juga ditulis `2026-10-01T00:00:00Z`,
// dan gerbang tumpang-tindih di `booking/create` menuntut
// `startDate_baru < endDate_lama` — yang bernilai FALSE. Jadi database
// MENERIMA pesanan itu. Cara (a) karena itu menandai "penuh" sebuah hari yang
// masih dijual database: kalender yang menolak menjual hari yang sebenarnya
// kosong.
//
// Modul ini memakai cara (b). Ia sepakat dengan gerbang yang benar-benar
// menegakkan ketersediaan, dan ia tidak bergantung pada jam berapa `startOfDay`
// kebetulan jatuh.
//
// KENAPA NOL IMPOR SELAIN `./rentang-tanggal` DAN `./nomor-pesanan`
// ----------------------------------------------------------------
// Alasan yang sama seperti `paginasi.ts`, `kueri-daftar.ts`, dan
// `saringan-daftar.ts`: dipakai dari Server Component, dan di-`require`
// langsung di test tanpa penyelesai alias maupun mock. Keduanya impor RELATIF,
// dan keduanya sendiri nol impor di luar `./tanggal`. Tidak ada `@prisma/client`
// di sini — status pesanan masuk sebagai teks, sama seperti di
// `label-status.ts`, karena itulah bentuknya setelah menyeberang ke Client
// Component.

import {
  awalHariWib,
  geserBulan,
  geserHari,
  hariDalamBulan,
} from './rentang-tanggal';
import { kunciTanggal } from './tanggal';
import { nomorPesanan } from './nomor-pesanan';

/** Bentuk kunci bulan yang sah: `YYYY-MM`. */
const POLA_BULAN = /^\d{4}-\d{2}$/;

/**
 * Berapa bulan ke depan/ke belakang yang boleh diminta dari bulan ini.
 *
 * Bukan kehati-hatian berlebih: `?bulan=999999-01` lolos regex di atas, dan
 * setiap bulan yang diminta adalah satu query rentang ke database. Batas ini
 * membuat tautan yang di-bookmark tetap masuk jangkauan sementara tahun yang
 * dirangkai sembarangan tidak pernah menjadi query.
 *
 * 36 bulan ke belakang menutup kontrak yang sudah selesai dan masih ditanyakan
 * pembeli; 36 ke depan menutup pemesanan paling jauh yang pernah masuk (durasi
 * maksimum `DURASI_MAX` bulan dari tanggal mulai yang juga di masa depan).
 */
export const BATAS_BULAN = 36;

/**
 * Apakah `mentah` adalah kunci bulan WIB yang benar-benar ada.
 *
 * Polanya saja tidak cukup: `2026-13` dan `2026-00` LOLOS regex. Keduanya lalu
 * dipakai menyusun `2026-13-01`, yang `new Date` gulung menjadi Januari 2027 —
 * kalender menampilkan bulan yang tidak pernah diminta siapa pun sementara
 * judulnya menuliskan bulan yang diketik. Ini bentuk cacat yang sama dengan
 * `2026-02-30` di `kunciTanggalSah()`.
 */
export function kunciBulanSah(mentah: unknown): mentah is string {
  if (typeof mentah !== 'string' || !POLA_BULAN.test(mentah)) return false;

  const bulan = Number(mentah.slice(5, 7));
  return bulan >= 1 && bulan <= 12;
}

/** Kunci bulan `YYYY-MM` yang sedang berjalan, di WIB. */
export function bulanSekarang(sekarang: Date = new Date()): string {
  return kunciTanggal(sekarang).slice(0, 7);
}

/**
 * Geser kunci bulan. Positif = MAJU, negatif = mundur.
 *
 * Tandanya sengaja kebalikan dari `geserBulan()` di `rentang-tanggal.ts`, yang
 * menghitung mundur karena pemanggil terbanyaknya adalah preset "3 bulan
 * terakhir". Di kalender yang diminta adalah "bulan berikutnya", dan tombol
 * bernama "›" yang memanggil `geser(-1)` adalah baris yang akan dibalik
 * seseorang enam bulan dari sekarang.
 *
 * Dilangkahi lewat tanggal 1, jadi penjepitan akhir bulan tidak pernah
 * terlibat: `31 Jan` + 1 bulan adalah pertanyaan yang tidak perlu dijawab di
 * sini.
 */
export function geserKunciBulan(bulan: string, langkah: number): string {
  return geserBulan(`${bulan}-01`, -langkah).slice(0, 7);
}

/** Selisih bulan `a - b`, dalam bulan kalender. */
function selisihBulan(a: string, b: string): number {
  const [ta, ba] = a.split('-').map(Number);
  const [tb, bb] = b.split('-').map(Number);
  return (ta - tb) * 12 + (ba - bb);
}

/**
 * Hasil pembacaan bulan dari luar.
 *
 * `ditolak` ada supaya UI bisa MENGATAKANNYA, alasan yang sama seperti
 * `PilihanRentang.ditolak`: kalender yang diam-diam jatuh ke bulan ini
 * menampilkan Oktober sementara URL yang dibuka bertuliskan Januari, dan
 * angkanya dibaca sebagai angka Januari.
 */
export type PilihanBulan = {
  /** Kunci bulan yang berlaku, `YYYY-MM`. */
  bulan: string;
  /** Ada bulan yang diminta tapi tidak sah atau di luar jangkauan. */
  ditolak: boolean;
};

/**
 * Baca `?bulan=` mentah menjadi kunci bulan yang aman dipakai sebagai rentang.
 *
 * Array (`?bulan=2026-01&bulan=2026-02`) diambil nilai PERTAMA-nya: Next
 * menyerahkan array untuk parameter ganda, dan `String(['a','b'])` adalah
 * `'a,b'` yang gagal regex — jadi tanpa penanganan ini satu parameter ganda
 * melempar admin ke bulan ini tanpa satu pun tanda.
 */
export function bacaBulan(
  mentah: string | string[] | undefined | null,
  sekarang: Date = new Date()
): PilihanBulan {
  const satu = Array.isArray(mentah) ? mentah[0] : mentah;
  const ini = bulanSekarang(sekarang);

  if (satu === undefined || satu === null || String(satu).trim() === '') {
    return { bulan: ini, ditolak: false };
  }

  if (!kunciBulanSah(satu)) return { bulan: ini, ditolak: true };

  const jarak = selisihBulan(satu, ini);
  if (jarak < -BATAS_BULAN || jarak > BATAS_BULAN) {
    return { bulan: ini, ditolak: true };
  }

  return { bulan: satu, ditolak: false };
}

/**
 * Rentang instan satu bulan, setengah terbuka `[mulai, sampaiEksklusif)`.
 *
 * Bentuk setengah terbuka dengan alasan yang sama seperti `Rentang` di
 * `rentang-tanggal.ts`: ujung atas yang ditulis `lte: awal 31 Oktober` membuang
 * seluruh pesanan yang menyentuh 31 Oktober setelah pukul 00.00. Yang benar
 * adalah `lt: awal 1 November`, dan bentuk ini menuliskannya tanpa satu pun
 * `23:59:59.999` yang harus diingat pemanggil.
 */
export type RentangBulan = {
  /** Instan pertama bulan itu, di WIB. */
  mulai: Date;
  /** Instan pertama bulan BERIKUTNYA, di WIB. */
  sampaiEksklusif: Date;
  /** `YYYY-MM-DD` tanggal 1. */
  kunciAwal: string;
  /** `YYYY-MM-DD` tanggal TERAKHIR bulan itu. */
  kunciAkhir: string;
  /** Jumlah hari bulan itu, 28–31. */
  jumlahHari: number;
};

export function rentangBulan(bulan: string): RentangBulan {
  const tahun = Number(bulan.slice(0, 4));
  const bln = Number(bulan.slice(5, 7));
  const jumlahHari = hariDalamBulan(tahun, bln);

  const kunciAwal = `${bulan}-01`;
  const kunciAkhir = `${bulan}-${String(jumlahHari).padStart(2, '0')}`;

  return {
    mulai: awalHariWib(kunciAwal),
    sampaiEksklusif: awalHariWib(geserHari(kunciAkhir, 1)),
    kunciAwal,
    kunciAkhir,
    jumlahHari,
  };
}

/** Satu kolom hari di kepala kalender. */
export type HariKalender = {
  /** `YYYY-MM-DD`. */
  kunci: string;
  /** Nomor hari dalam bulan, 1–31. */
  tanggal: number;
  /** `S`, `M`, `R`, … inisial nama hari Indonesia. */
  inisial: string;
  /** Sabtu atau Minggu. */
  akhirPekan: boolean;
  /** Hari ini menurut WIB. */
  hariIni: boolean;
  /** Sudah lewat menurut WIB. */
  lewat: boolean;
};

/**
 * Inisial nama hari, Minggu dulu — urutan yang dipakai `getUTCDay()`.
 *
 * Hanya inisial, bukan nama pendek: satu kolom kalender sebulan selebar 31
 * kolom, dan "Sen" pada lebar itu terpotong menjadi "Se" yang tidak dibaca
 * siapa pun.
 */
const INISIAL_HARI = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

/**
 * Hari dalam seminggu untuk sebuah kunci tanggal.
 *
 * Dihitung dari kunci sebagai tanggal UTC MURNI, bukan dari
 * `awalHariWib(kunci).getUTCDay()`. Yang kedua salah: `awalHariWib('2026-10-01')`
 * adalah `2026-09-30T17:00:00Z`, jadi `getUTCDay()` menjawab hari SEBELUMNYA —
 * dan seluruh kolom kalender bergeser satu hari, dengan akhir pekan menyorot
 * Jumat dan Sabtu.
 *
 * `T00:00:00Z` di sini bukan pembacaan zona waktu apa pun; ia aritmetika
 * kalender atas teks `YYYY-MM-DD`, dan jawabannya tidak bergantung pada mesin.
 */
function hariMinggu(kunci: string): number {
  return new Date(`${kunci}T00:00:00Z`).getUTCDay();
}

/**
 * Susun kolom hari satu bulan.
 *
 * `hariIni` dan `lewat` diturunkan dari `kunciTanggal(sekarang)` — bukan dari
 * `new Date()` yang di-`setHours(0,0,0,0)`. Itu satu-satunya cara "hari ini"
 * berarti hari yang sama bagi admin di Jakarta dan bagi proses Node di Vercel
 * yang berjalan pada UTC.
 */
export function hariKalender(bulan: string, sekarang: Date = new Date()): HariKalender[] {
  const { kunciAwal, jumlahHari } = rentangBulan(bulan);
  const kunciHariIni = kunciTanggal(sekarang);

  const hari: HariKalender[] = [];
  let kunci = kunciAwal;

  for (let i = 0; i < jumlahHari; i++) {
    const dow = hariMinggu(kunci);
    hari.push({
      kunci,
      tanggal: i + 1,
      inisial: INISIAL_HARI[dow],
      akhirPekan: dow === 0 || dow === 6,
      hariIni: kunci === kunciHariIni,
      lewat: kunci < kunciHariIni,
    });
    kunci = geserHari(kunci, 1);
  }

  return hari;
}

/**
 * Pesanan dalam bentuk yang dibutuhkan kalender, dan TIDAK lebih.
 *
 * Sengaja bukan tipe Prisma: modul ini tidak mengimpor `@prisma/client`, dan
 * bentuk sempit ini juga yang membatasi apa yang boleh menyeberang ke browser.
 * Nominal, data pembeli, dan kolom provider Xendit tidak ada di sini — sebuah
 * kalender tidak butuh satu pun dari itu, dan kolom yang tidak diminta tidak
 * bisa bocor.
 */
export type PesananKalender = {
  id: string;
  billboardId: string;
  status: string;
  startDate: Date | string;
  /** Batas EKSKLUSIF. Lihat komentar kepala berkas. */
  endDate: Date | string;
  /** Nama pemesan, untuk dibaca admin di bilah timeline-nya. */
  namaPenyewa?: string | null;
};

/**
 * Satu batang timeline: satu pesanan, dipotong pada batas bulan yang dilihat.
 *
 * `kolomMulai`/`kolomSampai` berbasis 1 dan INKLUSIF keduanya, karena itulah
 * bentuk yang dipakai `grid-column: start / end` setelah ditambah satu — dan
 * menyimpan salah satunya eksklusif berarti satu dari dua pembaca berikutnya
 * akan salah menebak yang mana.
 */
export type SegmenKalender = {
  bookingId: string;
  billboardId: string;
  /** Nomor pesanan yang dibaca manusia, tanpa `#`. */
  nomor: string;
  status: string;
  namaPenyewa: string | null;
  /** Hari pertama yang terpakai DI BULAN INI, 1-basis. */
  kolomMulai: number;
  /** Hari terakhir yang terpakai DI BULAN INI, 1-basis, inklusif. */
  kolomSampai: number;
  /** Pesanannya sudah berjalan sebelum tanggal 1 bulan ini. */
  mulaiSebelumBulan: boolean;
  /** Pesanannya masih berlanjut setelah hari terakhir bulan ini. */
  sampaiSetelahBulan: boolean;
  /** `YYYY-MM-DD` hari pertama pesanan, TIDAK dipotong batas bulan. */
  kunciMulaiAsli: string;
  /** `YYYY-MM-DD` hari terakhir pesanan (inklusif), TIDAK dipotong. */
  kunciSampaiAsli: string;
  /**
   * Baris ke berapa batang ini digambar di dalam satu titik, 0-basis.
   *
   * Hampir selalu 0: constraint GIST `booking_tanpa_tumpang_tindih` melarang
   * dua pesanan berstatus mengunci berbagi tanggal pada titik yang sama, jadi
   * batangnya tidak bisa bertumpuk. "Hampir" itulah alasan kolom ini ada —
   * constraint-nya menyebut daftar status di SQL yang dipelihara tangan
   * (lihat docstring `STATUS_MENGUNCI_TANGGAL`), jadi status baru yang lupa
   * ditambahkan ke migrasinya akan menghasilkan tumpang-tindih yang nyata.
   * Kalender adalah satu-satunya layar yang bisa memperlihatkannya — tapi hanya
   * bila batangnya tidak saling menimpa. Dua batang di koordinat grid yang sama
   * menggambar yang satu di atas yang lain, jadi pelanggaran yang paling penting
   * dilihat justru menjadi yang paling tidak terlihat.
   */
  jalur: number;
};

export type HasilSegmen = {
  /** Batang yang harus digambar, urut menurut kolom mulainya. */
  segmen: SegmenKalender[];
  /**
   * Pesanan yang rentangnya NOL hari atau terbalik, jadi tidak mengunci satu
   * hari pun dan tidak digambar.
   *
   * Dilaporkan terpisah alih-alih dibuang diam-diam. Baris seperti ini tidak
   * bisa terjadi lewat `booking/create` (durasi minimum 1 bulan), jadi
   * keberadaannya berarti data yang ditulis tangan atau migrasi yang meleset —
   * dan kalender adalah satu-satunya layar yang bisa memperlihatkannya. Kalau
   * ia digambar sebagai satu hari, admin akan melihat pesanan yang tampak
   * mengunci tanggal sementara database menjualnya ke orang lain.
   */
  rentangKosong: string[];
};

/**
 * Ubah daftar pesanan menjadi batang timeline untuk satu bulan.
 *
 * Pemotongan batas bulan dilakukan di sini, bukan di komponennya, karena
 * `Math.max`/`Math.min` atas dua angka kolom adalah tempat off-by-one tinggal:
 * pesanan yang MULAI sebelum tanggal 1 dan berakhir di tengah bulan harus
 * dimulai di kolom 1 dengan penanda "berlanjut dari bulan lalu", bukan di kolom
 * negatif.
 *
 * Pemanggil bertanggung jawab menyaring status yang mengunci tanggal
 * (`STATUS_MENGUNCI_TANGGAL` di `transisi-status.ts`). Penyaringan itu TIDAK
 * dilakukan di sini: daftar status yang mengunci diturunkan dari `TRANSISI_SAH`,
 * dan mengimpornya berarti menarik `@prisma/client` ke modul ini.
 */
export function segmenKalender(
  bulan: string,
  pesanan: readonly PesananKalender[]
): HasilSegmen {
  const { kunciAwal, kunciAkhir } = rentangBulan(bulan);

  const segmen: SegmenKalender[] = [];
  const rentangKosong: string[] = [];

  for (const p of pesanan) {
    const kunciMulai = kunciTanggal(p.startDate);
    const kunciAkhirEksklusif = kunciTanggal(p.endDate);

    // Tanggal yang tidak bisa dibaca sama sekali. `kunciTanggal()` menjawab
    // `''` untuk itu, dan `'' < apa pun` bernilai true — jadi tanpa gerbang ini
    // satu baris rusak menjadi batang yang membentang sepanjang bulan.
    if (kunciMulai === '' || kunciAkhirEksklusif === '') {
      rentangKosong.push(p.id);
      continue;
    }

    // Hari TERAKHIR yang terpakai: sehari sebelum batas eksklusifnya.
    const kunciSampai = geserHari(kunciAkhirEksklusif, -1);

    if (kunciSampai < kunciMulai) {
      rentangKosong.push(p.id);
      continue;
    }

    // Di luar bulan yang dilihat sama sekali.
    if (kunciSampai < kunciAwal || kunciMulai > kunciAkhir) continue;

    const potongMulai = kunciMulai < kunciAwal ? kunciAwal : kunciMulai;
    const potongSampai = kunciSampai > kunciAkhir ? kunciAkhir : kunciSampai;

    segmen.push({
      bookingId: p.id,
      billboardId: p.billboardId,
      nomor: nomorPesanan(p.id),
      status: p.status,
      namaPenyewa: p.namaPenyewa ?? null,
      kolomMulai: Number(potongMulai.slice(8, 10)),
      kolomSampai: Number(potongSampai.slice(8, 10)),
      mulaiSebelumBulan: kunciMulai < kunciAwal,
      sampaiSetelahBulan: kunciSampai > kunciAkhir,
      kunciMulaiAsli: kunciMulai,
      kunciSampaiAsli: kunciSampai,
      // Diisi setelah pengurutan: jalur bergantung pada urutan kolom mulainya.
      jalur: 0,
    });
  }

  segmen.sort((a, b) => a.kolomMulai - b.kolomMulai || a.nomor.localeCompare(b.nomor));

  // Penempatan jalur: satu batang masuk ke jalur pertama yang kolom
  // terakhirnya sudah lewat. Karena daftarnya sudah urut menurut `kolomMulai`,
  // satu lintasan cukup — tidak perlu membandingkan setiap pasangan.
  //
  // Dikelompokkan per `billboardId`: dua pesanan pada titik BERBEDA tidak
  // bertumpuk walau tanggalnya sama, dan menaruhnya di jalur berlainan akan
  // membuat setiap baris titik setinggi jumlah pesanan seluruh bulan.
  const akhirJalur = new Map<string, number[]>();
  for (const s of segmen) {
    const jalurTitik = akhirJalur.get(s.billboardId) ?? [];

    let j = jalurTitik.findIndex((akhir) => akhir < s.kolomMulai);
    if (j === -1) {
      j = jalurTitik.length;
      jalurTitik.push(s.kolomSampai);
    } else {
      jalurTitik[j] = s.kolomSampai;
    }

    s.jalur = j;
    akhirJalur.set(s.billboardId, jalurTitik);
  }

  return { segmen, rentangKosong };
}

/**
 * Berapa jalur yang dibutuhkan satu titik di bulan ini. Minimum 1.
 *
 * Dipakai untuk menentukan tinggi baris. `1` bahkan saat tidak ada satu pun
 * segmen: baris kosong yang tingginya nol menghilangkan nama titiknya dari
 * layar, sehingga titik yang seluruh bulannya tersedia — yaitu yang paling
 * ingin dilihat admin — menjadi satu-satunya yang tidak tampil.
 */
export function jumlahJalur(segmen: readonly SegmenKalender[]): number {
  let maks = 0;
  for (const s of segmen) maks = Math.max(maks, s.jalur + 1);
  return Math.max(1, maks);
}

/**
 * Berapa hari dalam bulan ini yang TIDAK terpakai satu pesanan pun.
 *
 * Dihitung dari himpunan kunci hari, bukan dengan menjumlahkan panjang setiap
 * batang: dua pesanan bisa berdempet, dan pada data yang sudah rusak bisa
 * bertumpuk — penjumlahan panjang lalu menghasilkan "32 hari terpakai dari 31",
 * yaitu angka yang membuat seluruh baris ringkasan berhenti dipercaya.
 */
export function hariKosong(bulan: string, segmen: readonly SegmenKalender[]): number {
  const { jumlahHari } = rentangBulan(bulan);

  const terpakai = new Set<number>();
  for (const s of segmen) {
    for (let k = s.kolomMulai; k <= s.kolomSampai; k++) terpakai.add(k);
  }

  return jumlahHari - terpakai.size;
}

/** Nama bulan Indonesia lengkap, untuk judul kalender. */
const NAMA_BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Judul bulan yang dibaca admin: `Oktober 2026`.
 *
 * Ditulis di sini, bukan lewat `toLocaleDateString`, karena judul itu harus
 * menyebut bulan yang SAMA dengan yang dikirim ke database. `toLocaleDateString`
 * atas `new Date(bulan + '-01')` membaca tengah malam UTC, yang di WIB adalah
 * pukul 07.00 tanggal yang sama — benar untuk tanggal 1, tapi bentuk yang sama
 * disalin ke tempat lain akan salah. Kunci bulannya sudah teks; memformatnya
 * lewat `Date` hanya menambah satu kesempatan salah.
 */
export function labelBulan(bulan: string): string {
  const nama = NAMA_BULAN_PANJANG[Number(bulan.slice(5, 7)) - 1];
  if (nama === undefined) return bulan;
  return `${nama} ${bulan.slice(0, 4)}`;
}
