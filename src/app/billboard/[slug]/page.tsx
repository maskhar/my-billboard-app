// src/app/billboard/[slug]/page.tsx
import { notFound } from 'next/navigation';
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
//
// `try/catch` yang mengembalikan `null` DIHAPUS dari fungsi ini.
//
// Nilai `null` di sini punya dua arti yang tidak bisa dipisahkan lagi setelah
// digabung: "slug ini memang tidak ada" dan "database tidak bisa dihubungi".
// Keduanya lalu mendarat di cabang render yang sama dan mencetak "Billboard
// Tidak Ditemukan" — kalimat yang pada kasus kedua adalah kebohongan, dan
// kebohongan yang mahal: pengunjung yang mengeklik tautan dari iklan atau hasil
// pencarian menyimpulkan produknya sudah tidak dijual, lalu pergi. Halaman
// membalas 200 OK, jadi tidak ada satu pun pemantau yang berbunyi.
//
// Sekarang kegagalan query melempar ke `src/app/error.tsx` ("gagal dimuat"),
// sementara `null` kembali bermakna tunggal: baris yang dicari tidak ada, yang
// dijawab `notFound()` dengan status 404 yang benar.
async function getBillboardBySlug(slug: string): Promise<BillboardDetailData | null> {
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

  // `notFound()` menggantikan kartu buatan sendiri di sini.
  //
  // Blok lama mengembalikan JSX dengan status HTTP 200. Bagi mesin pencari itu
  // berarti "halaman ini ada dan isinya sah", jadi slug yang sudah dihapus tetap
  // terindeks dan terus muncul di hasil pencarian selamanya. `notFound()`
  // mengembalikan 404 yang sebenarnya dan merender `src/app/not-found.tsx`.
  if (!rawData) {
    notFound();
  }

  // Proses data seperti biasa
  const bookedDates = rawData.bookings.map(b => ({
    start: new Date(b.startDate).toISOString(),
    end: new Date(b.endDate).toISOString(),
  }));

  return (
    <BillboardDetailClient
      // Kolomnya disebut satu per satu, BUKAN `{ ...rawData }`.
      //
      // `price` bertipe Decimal — sebuah objek. Next.js mengubah setiap prop
      // menjadi JSON sebelum menyeberang ke komponen 'use client', dan objek
      // Decimal tidak bisa diubah: halaman detail produk gagal dirender saat
      // dijalankan. Karena `rawData` di sana bertipe `any`, pemeriksaan tipe
      // tidak menangkapnya.
      //
      // Sebaran `...rawData` juga menyeberangkan seluruh baris billboard,
      // termasuk `bookings` (tanggal pesanan orang lain) dan setiap kolom baru
      // yang kelak ditambahkan ke schema — otomatis, tanpa ada yang memutuskan.
      // Daftar eksplisit ini membuat penambahan kolom ke halaman publik menjadi
      // sebuah keputusan yang tertulis.
      rawData={{
        id: rawData.id,
        title: rawData.title,
        slug: rawData.slug,
        type: rawData.type,
        status: rawData.status,
        address: rawData.address,
        mainImage: rawData.mainImage,
        price: uangUntukClient(rawData.price),
        lat: rawData.lat,
        lng: rawData.lng,
        smartsucoUrl: rawData.smartsucoUrl,
        gallery: rawData.gallery,
        specs: rawData.specs,
        includes: rawData.includes,
        excludes: rawData.excludes,
      }}
      // Hanya `googleMapsApiKey` yang diteruskan. `setting` utuh memuat
      // `geminiApiKey`, dan walaupun `getSystemSettings` sudah memaksanya
      // `null`, mengirim objek utuh berarti kebocoran itu hanya sejauh satu
      // baris yang kelak lupa dihapus.
      setting={setting ? { googleMapsApiKey: setting.googleMapsApiKey } : null}
      bookedDates={bookedDates}
      initialDate={selectedDate}
    />
  );
}

