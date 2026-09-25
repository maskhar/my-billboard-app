// src/app/billboard/[slug]/page.tsx
import Link from 'next/link';
import BillboardDetailClient from './BillboardDetailClient';
import { Billboard, SystemSetting } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { uangUntukClient } from '@/lib/money';
import { STATUS_MENGUNCI_TANGGAL } from '@/lib/transisi-status';
import { dekripsi } from '@/lib/rahasia';

export const dynamic = 'force-dynamic';

// Tipe data gabungan untuk hasil fetch dari backend kita
type BillboardDetailData = Billboard & {
  bookings: { startDate: Date; endDate: Date }[];
};

// Sebelumnya halaman ini fetch ke `http://localhost:4001` — alamat yang
// ditulis langsung di kode, bukan dari variabel env. Artinya halaman detail
// produk hanya bisa hidup selama backend NestJS berjalan di mesin yang sama.
//
// Gate `publishStatus: 'PUBLISHED'` dipertahankan persis seperti di NestJS:
// billboard berstatus DRAFT tidak boleh bisa dibuka lewat tebakan slug.
//
// `bookings` disaring ke status yang benar-benar memblokir tanggal, dan hanya
// `startDate`/`endDate` yang diambil — sisa kolom booking memuat data pesanan
// orang lain (nilai transaksi, catatan refund) dan tidak ada urusannya dengan
// kalender ketersediaan publik.
async function getBillboardBySlug(slug: string): Promise<BillboardDetailData | null> {
  try {
    return await prisma.billboard.findFirst({
      where: {
        slug,
        publishStatus: 'PUBLISHED',
      },
      include: {
        bookings: {
          // Daftarnya dulu ditulis di sini sebagai tiga status. Padahal yang
          // benar-benar mengunci tanggal ada sembilan — termasuk
          // DESIGN_RECEIVED, IN_PRODUCTION, dan INSTALLATION. Akibatnya
          // tanggal yang sudah terjual tampak KOSONG di kalender publik,
          // pengunjung memilihnya, lalu ditolak 409 saat checkout. Kini
          // memakai daftar yang sama dengan pemeriksaan bentrok di
          // `booking/create`, supaya keduanya tidak bisa berbeda lagi.
          where: { status: { in: [...STATUS_MENGUNCI_TANGGAL] } },
          select: { startDate: true, endDate: true },
        },
      },
    });
  } catch (error) {
    console.error('Gagal mengambil detail billboard:', error);
    return null;
  }
}

// Fungsi ini dulu mengembalikan nilai tetap yang ditulis langsung di kode —
// termasuk `googleMapsApiKey: null`, selamanya. Akibatnya kunci Google Maps
// yang dimasukkan admin di /admin/settings, dienkripsi, dan disimpan rapi ke
// database TIDAK PERNAH sampai ke sini: peta di halaman detail produk tidak
// muncul, tanpa satu pun pesan yang menjelaskan kenapa. Admin akan menyimpulkan
// kuncinya salah dan menggantinya berulang kali.
//
// Kunci disimpan terenkripsi (lihat `src/lib/rahasia.ts`), jadi harus dibuka
// dulu sebelum dipakai; yang tersimpan tanpa awalan `enc:v1:` dianggap teks
// biasa peninggalan sebelum enkripsi diterapkan dan tetap terbaca.
//
// HANYA `googleMapsApiKey` yang menyeberang ke browser, dan memang harus:
// kunci Maps dipakai oleh skrip peta di sisi klien. `geminiApiKey` sengaja
// TIDAK ikut — ia hanya dipakai server, dan mengirimnya ke browser berarti
// membagikannya ke setiap pengunjung halaman.
async function getSystemSettings(): Promise<SystemSetting | null> {
    try {
        const setting = await prisma.systemSetting.findUnique({
            where: { id: 'default_config' },
            select: {
                id: true,
                siteName: true,
                siteDesc: true,
                googleMapsApiKey: true,
                updatedAt: true,
            },
        });

        if (!setting) return null;

        return {
            ...setting,
            googleMapsApiKey: dekripsi(setting.googleMapsApiKey),
            geminiApiKey: null,
        };
    } catch (error) {
        // Peta yang tidak muncul tidak boleh membuat seluruh halaman produk
        // gagal terbuka — sisa halaman masih berguna tanpanya.
        console.error('Gagal mengambil pengaturan sistem:', error);
        return null;
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
      // `price` bertipe Decimal — sebuah objek. Next.js mengubah setiap prop
      // menjadi JSON sebelum menyeberang ke komponen 'use client', dan objek
      // Decimal tidak bisa diubah: halaman detail produk gagal dirender saat
      // dijalankan. Karena `rawData` di sana bertipe `any`, pemeriksaan tipe
      // tidak menangkapnya.
      rawData={{ ...rawData, price: uangUntukClient(rawData.price) }}
      setting={setting}
      bookedDates={bookedDates}
      initialDate={selectedDate}
    />
  );
}

