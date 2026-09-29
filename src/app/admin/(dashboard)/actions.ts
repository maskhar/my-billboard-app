// src/app/admin/(dashboard)/actions.ts
'use server';

import { getServerSession } from 'next-auth';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jumlah, keAngka, kurang } from '@/lib/money';
import { peranBoleh, PERAN_OMZET } from '@/lib/gerbang-peran';
import {
  bacaRentang,
  deretKunci,
  granularitas,
  kunciBulan,
  kunciHari,
  labelKunci,
  type KunciPreset,
  type PilihanRentang,
  type Rentang,
} from '@/lib/rentang-tanggal';

// Mendefinisikan tipe data yang akan dikembalikan.
//
// Diekspor karena bentuk ini dulu ditulis ulang di `RevenueSection` dan
// dilupakan sama sekali di `RevenueChart` (`data: any[]` di sana). Yang
// menghasilkan datanya adalah fungsi di bawah, jadi di sinilah bentuknya
// didefinisikan; keduanya sekarang mengimpornya. `export type` tidak
// meninggalkan apa pun saat dijalankan, jadi aturan "use server" — hanya
// fungsi async yang boleh diekspor — tidak dilanggar.
export type ChartData = {
  /** Label sumbu X: nama bulan, atau tanggal untuk mode harian. */
  name: string;
  /** Uang masuk bersih dalam rupiah penuh, sudah dikurangi refund. */
  total: number;
};

/**
 * Hasil laporan: datanya BESERTA rentang yang benar-benar dipakai.
 *
 * Rentangnya ikut kembali, bukan diasumsikan sama dengan yang diminta, karena
 * server adalah satu-satunya yang tahu rentang mana yang akhirnya berlaku:
 * tanggal yang tidak sah jatuh ke preset, dan urutan yang terbalik ditukar.
 * Client yang menggambar judulnya dari medan formulirnya sendiri akan menulis
 * "1 Jan – 31 Jan" di atas grafik enam bulan — dan angka yang terbaca lalu
 * dikutip sebagai angka Januari.
 *
 * `ditukar`/`ditolak` dibawa dengan alasan yang sama: koreksi yang tidak
 * terlihat adalah koreksi yang membuat admin salah membaca grafiknya sendiri.
 *
 * Seluruh medannya angka dan teks biasa — tidak ada `Prisma.Decimal` dan tidak
 * ada `Date`. Nilai ini menyeberang ke Client Component, dan `Decimal` yang
 * menyeberang menjadi objek tanpa metode di sisi sana.
 */
export type LaporanOmzet = {
  data: ChartData[];
  /** Preset yang berlaku; `null` bila rentangnya dua tanggal. */
  preset: KunciPreset | null;
  /** `YYYY-MM-DD` hari pertama; `null` untuk seluruh waktu. */
  dari: string | null;
  /** `YYYY-MM-DD` hari terakhir; `null` untuk seluruh waktu. */
  sampai: string | null;
  /** `'hari'` atau `'bulan'` — supaya UI bisa menyebut satuan batangnya. */
  satuan: 'hari' | 'bulan';
  /** Urutan tanggal yang diminta terbalik dan sudah ditukar. */
  ditukar: boolean;
  /** Ada tanggal tidak sah, dan pilihan jatuh ke preset. */
  ditolak: boolean;
  /** Total bersih seluruh rentang, dalam rupiah penuh. */
  totalBersih: number;
};

/**
 * Bentuk permintaan laporan.
 *
 * Seluruh medannya `string | undefined`, bukan union sempit, dan itu bukan
 * kelonggaran: Server Action adalah endpoint HTTP publik (lihat
 * `pastikanBolehLihatOmzet`), jadi argumennya datang dari luar apa pun yang
 * ditulis TypeScript di sisi client. Menuliskannya sebagai union sempit hanya
 * memindahkan validasinya ke tempat yang tidak ada saat dijalankan. Yang
 * memvalidasi adalah `bacaRentang`.
 */
export type PermintaanOmzet = {
  preset?: string;
  dari?: string;
  sampai?: string;
};

// Peran yang boleh melihat data keuangan perusahaan: `PERAN_OMZET` di
// `src/lib/gerbang-peran.ts`. Daftarnya dulu ditulis di sini sebagai
// `['ADMIN', 'SUPER_ADMIN']` — array teks yang melebar menjadi `string[]`,
// sehingga `SUPER_ADMINN` pun lolos kompilasi dan gerbangnya diam-diam
// tertutup selamanya.

// Penjaga akses untuk Server Action.
//
// Server Action di Next.js adalah endpoint HTTP publik dengan id yang bisa
// ditemukan dari bundle JavaScript — bukan fungsi internal. Fakta bahwa ia
// hanya dipanggil dari halaman admin tidak melindungi apa pun: siapa pun bisa
// memanggilnya langsung. Karena itu tiap action harus memeriksa sesinya sendiri.
async function pastikanBolehLihatOmzet() {
  const session = await getServerSession(authOptions);
  if (!session || !peranBoleh(PERAN_OMZET, session.user.role)) {
    throw new Error('Unauthorized');
  }
}

/**
 * Klausa tanggal untuk satu kolom waktu.
 *
 * Batas ATAS-nya ikut dipasang, dan itu yang sebelumnya tidak ada. Query lama
 * hanya menulis `gte: startDate`, yang memadai selama pilihan admin hanya
 * "sejak kapan"; begitu rentang punya dua ujung, ujung atas yang hilang membuat
 * filter "1–31 Januari" menampilkan seluruh data sejak 1 Januari sampai hari
 * ini — dengan kedua medan tanggal di layar tetap menunjukkan Januari.
 *
 * `lt`, bukan `lte`: `sampaiEksklusif` sudah berupa awal hari SETELAH hari
 * terakhir (lihat `Rentang`). `lte` di sana akan memasukkan seluruh hari
 * tambahan itu.
 *
 * Rentang `null` menghasilkan `{ not: null }` — bukan objek kosong. Kolom
 * waktunya nullable (`Payment.paidAt` kosong sampai uangnya masuk), dan baris
 * dengan waktu `null` tidak bisa dibukukan ke ember mana pun. Menyaringnya di
 * database, bukan di TypeScript, berarti barisnya tidak ikut terkirim.
 */
function klausaWaktu(rentang: Rentang | null): Prisma.DateTimeNullableFilter {
  if (rentang === null) return { not: null };
  return { gte: rentang.mulai, lt: rentang.sampaiEksklusif };
}

/**
 * Ambil dan bukukan omzet bersih untuk rentang pilihan admin.
 *
 * Tanda tangannya berubah dari satu teks periode menjadi objek permintaan.
 * Bentuk lama (`'daily' | '1m' | … | 'all'`) menjepit DUA keputusan ke dalam
 * satu nama — panjang rentang dan granularitas batang — sehingga "30 hari
 * terakhir per bulan" dan "setahun per hari" tidak bisa diminta, dan rentang
 * yang tidak berakhir hari ini tidak bisa diminta sama sekali. Sekarang admin
 * memilih rentangnya dan granularitasnya diturunkan darinya.
 */
export async function getRevenueData(
  permintaan: PermintaanOmzet = {}
): Promise<LaporanOmzet> {
  await pastikanBolehLihatOmzet();

  // Divalidasi SETELAH gerbang peran, bukan sebelumnya. Bentuk masukan yang
  // salah tidak boleh dijawab berbeda dari sesi yang tidak berhak: galat parse
  // yang lebih cepat daripada penolakan akses memberi tahu pemanggil anonim
  // bahwa endpoint ini ada dan menerima bentuk apa — dan `bacaRentang` tidak
  // menyentuh database, jadi menahannya di belakang gerbang tidak berbiaya.
  const pilihan = bacaRentang(permintaan);
  const { rentang } = pilihan;

  // GRAFIK DIBUKUKAN DARI LEDGER, BUKAN DARI STATUS PESANAN.
  //
  // Sebelumnya grafik ini menjumlahkan `Booking.totalPrice` dan membukukannya
  // pada `Booking.paidAt`. Tiga akibatnya:
  //
  //   1. Nilai KONTRAK dihitung sebagai uang. Pesanan DP yang baru menyetor
  //      40% memunculkan batang setinggi 100% pada bulan DP-nya masuk.
  //   2. Pelunasan sisa tidak pernah muncul sama sekali — `Booking.paidAt`
  //      hanya satu kolom dan tidak berubah saat sisanya dibayar, jadi uang
  //      yang masuk berbulan-bulan kemudian tercatat di bulan DP.
  //   3. Refund ikut menaikkan batang, karena daftar statusnya dulu memuat
  //      `REFUNDED` — bulan terjadinya pengembalian dana justru terlihat
  //      sebagai bulan penjualan terbaik.
  //
  // Sekarang setiap penerimaan dibukukan pada `Payment.paidAt` miliknya
  // sendiri, dan refund yang selesai menjadi PENGURANG pada
  // `Booking.refundedAt`. Satu batang bisa bernilai negatif bila pada periode
  // itu yang keluar lebih besar dari yang masuk; itu memang keadaannya.
  const [penerimaan, refund] = await Promise.all([
    prisma.payment.findMany({
      where: {
        status: PaymentStatus.PAID,
        paidAt: klausaWaktu(rentang),
      },
      select: { jumlah: true, paidAt: true },
    }),
    prisma.booking.findMany({
      where: {
        status: BookingStatus.REFUNDED,
        refundedAt: klausaWaktu(rentang),
      },
      select: { refundAmount: true, refundedAt: true },
    }),
  ]);

  const masuk: Titik[] = penerimaan.flatMap((p) =>
    p.paidAt === null ? [] : [{ waktu: p.paidAt, nominal: p.jumlah }]
  );
  const keluar: Titik[] = refund.flatMap((b) =>
    b.refundedAt === null ? [] : [{ waktu: b.refundedAt, nominal: b.refundAmount }]
  );

  return susunLaporan(masuk, keluar, pilihan);
}

// Catatan untuk helper di bawah:
//
// Nominal bertipe Decimal (objek), bukan angka biasa. Menjumlahkannya dengan
// `+` menyambung teks alih-alih menambah: 0 + Decimal(100000) menjadi
// "0100000", lalu angka berikutnya disambung lagi. Grafik akan menampilkan
// deretan digit tanpa arti, tanpa satu pun pesan error. Penjumlahan dikerjakan
// sebagai Decimal, baru dijadikan angka biasa di akhir karena pustaka grafik
// menuntut `number`.

/** Satu peristiwa uang: kapan terjadi dan berapa nominalnya. */
type Titik = { waktu: Date; nominal: Prisma.Decimal | null };

/**
 * Lipat penerimaan dan refund ke dalam satu ember per periode.
 *
 * Kuncinya `YYYY-MM[-DD]` yang bisa diurutkan sebagai teks, TERPISAH dari label
 * yang dibaca manusia. Dulu labelnya sendiri yang menjadi kunci Map, sehingga
 * urutan batang mengikuti urutan baris yang datang dari database. Begitu refund
 * ikut dibukukan, sebuah periode yang hanya berisi refund akan muncul di ujung
 * grafik — tidak pada tempatnya di garis waktu.
 *
 * `kunciDari` sekarang datang dari `src/lib/rentang-tanggal.ts`, dan itu
 * perbaikan cacat, bukan pemindahan berkas. Rumus lamanya `d.getFullYear()` +
 * `d.getMonth()` membaca zona waktu PROSES, dan proses produksi berjalan pada
 * UTC: pembayaran 1 Oktober pukul 00.30 WIB tersimpan `2026-09-30T17:30:00Z`
 * dan dibukukan ke batang **September**. Tujuh jam pertama setiap hari selalu
 * masuk ke hari sebelumnya, dan pada tanggal 1 ke bulan sebelumnya — yaitu
 * tepat pada batas yang dipakai orang untuk menutup buku.
 */
function lipat(
  masuk: Titik[],
  keluar: Titik[],
  kunciDari: (d: Date) => string,
  awal: Map<string, Prisma.Decimal>
): Map<string, Prisma.Decimal> {
  const ember = awal;

  for (const t of masuk) {
    const k = kunciDari(t.waktu);
    ember.set(k, jumlah(ember.get(k) ?? new Prisma.Decimal(0), t.nominal));
  }
  for (const t of keluar) {
    const k = kunciDari(t.waktu);
    ember.set(k, kurang(ember.get(k) ?? new Prisma.Decimal(0), t.nominal));
  }

  return ember;
}

/**
 * Susun hasil akhir dari peristiwa uang dan rentang yang berlaku.
 *
 * Satu fungsi untuk harian dan bulanan, menggantikan `prosesHarian` +
 * `prosesBulanan` yang isinya nyaris kembar. Yang berbeda hanya kunci embernya
 * dan deret ember yang harus disiapkan lebih dulu, dan keduanya sekarang
 * dijawab `rentang-tanggal.ts` — termasuk yang dulu salah: praunggah 30 hari
 * di `prosesHarian` melangkah dengan `setDate` pada waktu lokal proses, jadi
 * deret harinya sendiri pun tergeser di produksi.
 *
 * Diekspor? Tidak. Ia dipanggil `getRevenueData` dan diuji lewatnya — berkas
 * ini `'use server'`, dan setiap yang diekspor di sini menjadi endpoint HTTP.
 * Fungsi pembukuan murni yang menjadi endpoint adalah permukaan serang tanpa
 * satu pun manfaat.
 */
function susunLaporan(
  masuk: Titik[],
  keluar: Titik[],
  pilihan: PilihanRentang
): LaporanOmzet {
  const { rentang } = pilihan;
  const satuan = granularitas(rentang);
  const kunciDari = satuan === 'hari' ? kunciHari : kunciBulan;

  // Periode tanpa transaksi diunggah lebih dulu sebagai nol, supaya ia tetap
  // menempati tempatnya di garis waktu. Bulan kosong yang HILANG membuat batang
  // bulan ketiga berdiri langsung di sebelah bulan pertama, dan bentuk itu
  // terbaca sebagai penjualan yang berlanjut — kebalikan dari keadaannya.
  const awal = new Map<string, Prisma.Decimal>();
  for (const kunci of deretKunci(rentang)) {
    awal.set(kunci, new Prisma.Decimal(0));
  }

  const ember = lipat(masuk, keluar, kunciDari, awal);

  // Diurutkan menurut KUNCI, bukan label. `YYYY-MM-DD` urut sebagai teks;
  // `01/10` tidak, dan `Okt '26` sama sekali tidak.
  const urut = Array.from(ember.keys()).sort();

  const data = urut.map((kunci) => ({
    name: labelKunci(kunci),
    total: keAngka(ember.get(kunci)),
  }));

  // Total dijumlahkan sebagai Decimal atas ISI EMBER, bukan dengan menjumlahkan
  // `data[].total` yang sudah menjadi `number`. Pembulatan per batang yang
  // dijumlahkan menghasilkan total yang tidak sama dengan penjumlahan nominal
  // aslinya, dan angka inilah yang dibandingkan admin dengan mutasi rekening.
  let total = new Prisma.Decimal(0);
  for (const kunci of urut) {
    total = jumlah(total, ember.get(kunci));
  }

  return {
    data,
    preset: pilihan.preset,
    dari: rentang?.kunciMulai ?? null,
    sampai: rentang?.kunciSampai ?? null,
    satuan,
    ditukar: pilihan.ditukar,
    ditolak: pilihan.ditolak,
    totalBersih: keAngka(total),
  };
}
