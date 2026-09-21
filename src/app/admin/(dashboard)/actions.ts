// src/app/admin/(dashboard)/actions.ts
'use server';

import { prisma } from '@/lib/prisma';

// Mendefinisikan tipe data yang akan dikembalikan
type ChartData = {
  name: string;
  total: number;
};

// Fungsi Server Action utama
export async function getRevenueData(
  period: 'daily' | '1m' | '3m' | '6m' | '12m' | 'all'
): Promise<ChartData[]> {
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

  // Query ke database untuk mengambil data booking yang relevan
  const revenueRecords = await prisma.booking.findMany({
    where: {
      status: { in: ['PAID_CONFIRMED', 'ACTIVE', 'REFUNDED'] },
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

// Helper function untuk memproses data menjadi tampilan per bulan
function processDataForMonthlyView(records: { paidAt: Date | null, totalPrice: number }[], startDate: Date): ChartData[] {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    const dataMap = new Map<string, number>();

    records.forEach(record => {
        if (record.paidAt) {
            const monthKey = `${monthNames[record.paidAt.getMonth()]} '${record.paidAt.getFullYear().toString().slice(-2)}`;
            const currentTotal = dataMap.get(monthKey) || 0;
            dataMap.set(monthKey, currentTotal + record.totalPrice);
        }
    });

    return Array.from(dataMap, ([name, total]) => ({ name, total }));
}

// Helper function untuk memproses data menjadi tampilan per hari (untuk 30 hari terakhir)
function processDataForDailyView(records: { paidAt: Date | null, totalPrice: number }[], startDate: Date): ChartData[] {
    const dataMap = new Map<string, number>();
    
    // Inisialisasi 30 hari terakhir dengan omzet 0
    for (let i = 0; i < 30; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        const dayKey = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        dataMap.set(dayKey, 0);
    }

    records.forEach(record => {
        if (record.paidAt) {
            const dayKey = `${record.paidAt.getDate().toString().padStart(2, '0')}/${(record.paidAt.getMonth() + 1).toString().padStart(2, '0')}`;
            const currentTotal = dataMap.get(dayKey) || 0;
            dataMap.set(dayKey, currentTotal + record.totalPrice);
        }
    });
    
    return Array.from(dataMap, ([name, total]) => ({ name, total }));
}
