// src/app/admin/(dashboard)/actions.ts
'use server';

import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { jumlah, keAngka } from '@/lib/money';
import { wherePendapatan } from '@/lib/revenue';

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

  // Query ke database untuk mengambil data booking yang relevan.
  //
  // Daftar statusnya dipakai bersama kartu "Total Omzet" lewat
  // `wherePendapatan()`. Dulu daftar itu ditulis ulang di sini, dan keduanya
  // sama-sama memasukkan `REFUNDED` — batang grafik ikut meninggi pada bulan
  // terjadinya refund, seolah bulan itu penjualannya bagus, padahal uangnya
  // justru keluar. Karena daftarnya kini satu, grafik dan kartu KPI tidak lagi
  // bisa menyimpang diam-diam satu sama lain.
  const revenueRecords = await prisma.booking.findMany({
    where: {
      ...wherePendapatan(),
      paidAt: {
        gte: startDate,
      },
    },
    select: {
      totalPrice: true,
      paidAt: true,
    },
    orderBy: {
      paidAt: 'asc',
    },
  });

  // Proses data mentah menjadi format grafik
  if (period === 'daily') {
    return processDataForDailyView(revenueRecords, startDate);
  } else {
    return processDataForMonthlyView(revenueRecords, startDate);
  }
}

// Catatan untuk kedua helper di bawah:
//
// `totalPrice` bertipe Decimal (objek), bukan angka biasa. Menjumlahkannya
// dengan `+` menyambung teks alih-alih menambah: 0 + Decimal(100000) menjadi
// "0100000", lalu angka berikutnya disambung lagi. Grafik omzet akan
// menampilkan deretan digit tanpa arti, tanpa satu pun pesan error.
// Penjumlahan dikerjakan sebagai Decimal, baru dijadikan angka biasa di
// akhir karena pustaka grafik menuntut `number`.

type RekamOmzet = { paidAt: Date | null; totalPrice: Prisma.Decimal };

// Helper function untuk memproses data menjadi tampilan per bulan
function processDataForMonthlyView(records: RekamOmzet[], startDate: Date): ChartData[] {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    const dataMap = new Map<string, Prisma.Decimal>();

    records.forEach(record => {
        if (record.paidAt) {
            const monthKey = `${monthNames[record.paidAt.getMonth()]} '${record.paidAt.getFullYear().toString().slice(-2)}`;
            const currentTotal = dataMap.get(monthKey) ?? new Prisma.Decimal(0);
            dataMap.set(monthKey, jumlah(currentTotal, record.totalPrice));
        }
    });

    return Array.from(dataMap, ([name, total]) => ({ name, total: keAngka(total) }));
}

// Helper function untuk memproses data menjadi tampilan per hari (untuk 30 hari terakhir)
function processDataForDailyView(records: RekamOmzet[], startDate: Date): ChartData[] {
    const dataMap = new Map<string, Prisma.Decimal>();

    // Inisialisasi 30 hari terakhir dengan omzet 0
    for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        dataMap.set(dayKey, new Prisma.Decimal(0));
    }

    records.forEach(record => {
        if (record.paidAt) {
            const dayKey = `${record.paidAt.getDate().toString().padStart(2, '0')}/${(record.paidAt.getMonth() + 1).toString().padStart(2, '0')}`;
            const currentTotal = dataMap.get(dayKey) ?? new Prisma.Decimal(0);
            dataMap.set(dayKey, jumlah(currentTotal, record.totalPrice));
        }
    });

    return Array.from(dataMap, ([name, total]) => ({ name, total: keAngka(total) }));
}
