// src/app/billboard/[slug]/page.tsx
import Link from 'next/link';
import BillboardDetailClient from './BillboardDetailClient';
import { Billboard, SystemSetting } from '@prisma/client';

// Tipe data gabungan untuk hasil fetch dari backend kita
type BillboardDetailData = Billboard & {
  bookings: { startDate: Date; endDate: Date }[];
};

// Fungsi untuk mengambil data SATU billboard dari backend NestJS
async function getBillboardBySlug(slug: string): Promise<BillboardDetailData | null> {
  try {
    const res = await fetch(`http://localhost:4001/api/billboards/${slug}`, { 
      cache: 'no-store' // Selalu ambil data terbaru
    });
    // Jika backend mengembalikan status 404 (Not Found) atau error lain
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch (error) {
    console.error("Gagal melakukan fetch ke backend untuk detail billboard:", error);
    return null;
  }
}

// Fungsi dummy untuk settings, akan kita refaktor nanti
async function getSystemSettings(): Promise<SystemSetting | null> {
    return {
        id: 'default_config',
        siteName: 'Utero Cloud',
        siteDesc: 'Platform Sewa Billboard Terlengkap',
        geminiApiKey: null,
        googleMapsApiKey: null,
        updatedAt: new Date()
    }
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function DetailPage({ params, searchParams }: Props) {
  // [FIX] Unrwap KEDUA promise, baik params maupun searchParams
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const selectedDate = resolvedSearchParams?.date as string || "";

  // Ambil data menggunakan fungsi fetch yang baru dan bersih
  const [rawData, setting] = await Promise.all([
    getBillboardBySlug(resolvedParams.slug), // Gunakan slug dari params yang sudah di-unwrap
    getSystemSettings()
  ]);

  // Kondisi "Tidak Ditemukan" akan aktif jika fetch gagal atau backend mengembalikan 404
  if (!rawData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col gap-4 font-sans">
        <h1 className="text-2xl font-bold text-gray-400">Billboard Tidak Ditemukan</h1>
        <Link href="/" className="text-utero font-bold hover:underline">Kembali ke Peta</Link>
      </div>
    );
  }

  // Proses data seperti biasa
  const bookedDates = rawData.bookings.map(b => ({
    start: new Date(b.startDate).toISOString(),
    end: new Date(b.endDate).toISOString(),
  }));

  return (
    <BillboardDetailClient
      rawData={rawData}
      setting={setting}
      bookedDates={bookedDates}
      initialDate={selectedDate}
    />
  );
}

