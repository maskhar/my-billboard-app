// src/app/admin/(dashboard)/actions.ts
'use server';

import { getServerSession } from 'next-auth';
import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jumlah, keAngka, kurang } from '@/lib/money';

// Mendefinisikan tipe data yang akan dikembalikan
type ChartData = {
  name: string;
  total: number;
};

// Peran yang boleh melihat data keuangan perusahaan.
const REVENUE_ROLES = ['ADMIN', 'SUPER_ADMIN'];

// Penjaga akses untuk Server Action.
//
// Server Action di Next.js adalah endpoint HTTP publik dengan id yang bisa
// ditemukan dari bundle JavaScript — bukan fungsi internal. Fakta bahwa ia
// hanya dipanggil dari halaman admin tidak melindungi apa pun: siapa pun bisa
// memanggilnya langsung. Karena itu tiap action harus memeriksa sesinya sendiri.
async function pastikanBolehLihatOmzet() {
  const session = await getServerSession(authOptions);
  if (!session || !REVENUE_ROLES.includes(session.user.role)) {
    throw new Error('Unauthorized');
  }
}

// Fungsi Server Action utama
export async function getRevenueData(
  period: 'daily' | '1m' | '3m' | '6m' | '12m' | 'all'
): Promise<ChartData[]> {
  await pastikanBolehLihatOmzet();

  const now = new Date();
  let startDate: Date;

  // Tentukan tanggal mulai berdasarkan periode yang dipilih
  switch (period) {
    case 'daily':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30); // 30 hari terakhir
      break;
    case '1m':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      break;
    case '3m':
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case '6m':
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      break;
    case '12m':
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case 'all':
    default:
      startDate = new Date(0); // Awal waktu (untuk mengambil semua data)
      break;
  }

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
        paidAt: { gte: startDate },
      },
      select: { jumlah: true, paidAt: true },
    }),
    prisma.booking.findMany({
      where: {
        status: BookingStatus.REFUNDED,
        refundedAt: { gte: startDate },
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

  // Proses data mentah menjadi format grafik
  if (period === 'daily') {
    return prosesHarian(masuk, keluar, startDate);
  } else {
    return prosesBulanan(masuk, keluar);
  }
}

// Catatan untuk kedua helper di bawah:
//
// Nominal bertipe Decimal (objek), bukan angka biasa. Menjumlahkannya dengan
// `+` menyambung teks alih-alih menambah: 0 + Decimal(100000) menjadi
// "0100000", lalu angka berikutnya disambung lagi. Grafik akan menampilkan
// deretan digit tanpa arti, tanpa satu pun pesan error. Penjumlahan dikerjakan
// sebagai Decimal, baru dijadikan angka biasa di akhir karena pustaka grafik
// menuntut `number`.

/** Satu peristiwa uang: kapan terjadi dan berapa nominalnya. */
type Titik = { waktu: Date; nominal: Prisma.Decimal | null };

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

/**
 * Lipat penerimaan dan refund ke dalam satu ember per periode.
 *
 * Kuncinya `YYYY-MM[-DD]` yang bisa diurutkan sebagai teks, TERPISAH dari label
 * yang dibaca manusia. Dulu labelnya sendiri yang menjadi kunci Map, sehingga
 * urutan batang mengikuti urutan baris yang datang dari database. Begitu refund
 * ikut dibukukan, sebuah periode yang hanya berisi refund akan muncul di ujung
 * grafik — tidak pada tempatnya di garis waktu.
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

function prosesBulanan(masuk: Titik[], keluar: Titik[]): ChartData[] {
  const kunciBulan = (d: Date) =>
    `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;

  // Bulan tanpa satu pun peristiwa uang sengaja tidak dimunculkan sebagai nol —
  // perilaku yang sama dengan sebelumnya.
  const ember = lipat(masuk, keluar, kunciBulan, new Map());

  return Array.from(ember.keys())
    .sort()
    .map((kunci) => {
      const [tahun, bulan] = kunci.split('-');
      return {
        name: `${NAMA_BULAN[Number(bulan) - 1]} '${tahun.slice(-2)}`,
        total: keAngka(ember.get(kunci)),
      };
    });
}

function prosesHarian(masuk: Titik[], keluar: Titik[], startDate: Date): ChartData[] {
  const kunciHari = (d: Date) =>
    `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d
      .getDate()
      .toString()
      .padStart(2, '0')}`;

  // Inisialisasi 30 hari terakhir dengan nol, supaya hari tanpa transaksi tetap
  // terlihat sebagai celah di grafik, bukan hilang dari garis waktu.
  const awal = new Map<string, Prisma.Decimal>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    awal.set(kunciHari(d), new Prisma.Decimal(0));
  }

  const ember = lipat(masuk, keluar, kunciHari, awal);

  return Array.from(ember.keys())
    .sort()
    .map((kunci) => {
      const [, bulan, hari] = kunci.split('-');
      return { name: `${hari}/${bulan}`, total: keAngka(ember.get(kunci)) };
    });
}
