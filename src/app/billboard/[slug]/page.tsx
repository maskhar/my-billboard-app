// src/app/billboard/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BillboardDetailClient from './BillboardDetailClient';
import { Billboard } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { uangUntukClient } from '@/lib/money';
import { STATUS_MENGUNCI_TANGGAL } from '@/lib/transisi-status';
import { dekripsi } from '@/lib/rahasia';
import { ambilIdentitasSitus } from '@/lib/identitas-situs';
import { keTautanWa } from '@/lib/telepon';
import { kunciTanggal } from '@/lib/tanggal';

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
// Tipenya `SystemSetting` utuh dulu tertulis di sini, padahal `select` di bawah
// hanya mengambil lima kolom. Setiap kolom baru di schema karena itu menjadi
// galat `tsc` di berkas ini — persis apa yang terjadi saat `waNumber`
// ditambahkan — dan jalan keluar yang paling mudah adalah menambahkannya ke
// `select`, yang berarti kolom itu ikut menyeberang ke Client Component tanpa
// ada yang memutuskannya. Tipe sempit ini membuat pilihan sebaliknya yang mudah.
type PengaturanPeta = {
  googleMapsApiKey: string | null;
};

async function getSystemSettings(): Promise<PengaturanPeta | null> {
    try {
        // SATU kolom. `id`, `siteName`, `siteDesc`, dan `updatedAt` ikut diambil
        // di sini sebelumnya, lalu diteruskan lewat `...setting` — tidak satu pun
        // dipakai halaman ini, dan `siteName`/`siteDesc` sekarang punya
        // pembacanya sendiri di `ambilIdentitasSitus()`. Sisa yang berguna
        // hanyalah kunci peta.
        const setting = await prisma.systemSetting.findUnique({
            where: { id: 'default_config' },
            select: { googleMapsApiKey: true },
        });

        if (!setting) return null;

        return { googleMapsApiKey: dekripsi(setting.googleMapsApiKey) };
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

/**
 * Judul, keterangan, dan kartu bagikan untuk satu billboard.
 *
 * KENAPA HALAMAN INI YANG PERTAMA MENDAPATKANNYA
 * ----------------------------------------------
 * Nol berkas di repo ini menyetel `openGraph` atau `twitter`, dan inilah satu
 * halaman yang paling sering dibagikan: sales mengirim tautan billboard ke calon
 * penyewa lewat WhatsApp, dan yang muncul di sana sebelumnya adalah tautan
 * telanjang — alamat mentah tanpa judul, tanpa harga, tanpa satu pun foto.
 * Untuk produk yang keputusannya visual (di mana papannya, seberapa besar,
 * menghadap ke mana), kartu tanpa gambar berarti penerimanya harus membuka
 * tautannya dulu sebelum tahu apa yang ditawarkan. Sebagian tidak.
 *
 * `generateMetadata` memakai query yang SAMA dengan halamannya, termasuk gate
 * `publishStatus: 'PUBLISHED'`. Next memanggil keduanya dalam satu permintaan
 * render dan Prisma di sini tidak di-cache antar keduanya, jadi ini memang satu
 * query tambahan — harga yang dibayar supaya metadata tidak pernah bisa
 * menyebut billboard yang halamannya sendiri menjawab 404.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // TIDAK MELEMPAR. `generateMetadata` yang gagal menjatuhkan seluruh halaman,
  // termasuk halaman yang datanya sendiri baik-baik saja — dan yang hilang bila
  // ia diam hanyalah judul tab. Bandingkan dengan query isi halaman di
  // `getBillboardBySlug`, yang justru HARUS melempar.
  let data: { title: string; address: string; type: string; mainImage: string } | null = null;
  try {
    data = await prisma.billboard.findFirst({
      where: { slug, publishStatus: 'PUBLISHED' },
      select: { title: true, address: true, type: true, mainImage: true },
    });
  } catch (error) {
    console.error('[billboard/metadata] Gagal membaca billboard:', error);
  }

  // Slug yang tidak ada dibiarkan memakai metadata layout akar: halamannya akan
  // memanggil `notFound()` beberapa milidetik kemudian, dan menebak judul untuk
  // halaman 404 hanya menghasilkan judul yang salah.
  if (!data) return {};

  const deskripsi =
    `${data.type} di ${data.address}. Lihat ketersediaan tanggal, harga sewa, ` +
    `dan lokasi di peta.`;

  return {
    // Layout akar menempelkan nama usaha lewat `template`, jadi di sini cukup
    // judul billboard-nya sendiri — tanpa itu namanya tertulis dua kali.
    title: data.title,
    description: deskripsi,
    openGraph: {
      title: data.title,
      description: deskripsi,
      type: 'website',
      // `mainImage` non-null di schema, dan halaman ini sudah merendernya
      // sebagai gambar utama. Ukuran tidak disebutkan: nilai yang ditebak dan
      // tidak cocok membuat sebagian pratinjau memotong gambarnya, dan tanpa
      // atribut itu pengambil pratinjau mengukurnya sendiri.
      images: [{ url: data.mainImage, alt: data.title }],
    },
    twitter: {
      // `summary_large_image`, bukan `summary`: foto papan adalah isi utamanya,
      // dan kartu kecil menampilkannya sebagai ikon persegi di samping teks.
      card: 'summary_large_image',
      title: data.title,
      description: deskripsi,
      images: [data.mainImage],
    },
  };
}

export default async function DetailPage({ params, searchParams }: Props) {
  // [FIX] Unrwap KEDUA promise, baik params maupun searchParams
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const selectedDate = resolvedSearchParams?.date as string || "";

  // Ambil data menggunakan fungsi fetch yang baru dan bersih
  const [rawData, setting, identitas] = await Promise.all([
    getBillboardBySlug(resolvedParams.slug), // Gunakan slug dari params yang sudah di-unwrap
    getSystemSettings(),
    // Baris `SystemSetting` yang sama sudah dibaca `getSystemSettings()` di
    // atas, tapi `ambilIdentitasSitus()` dibungkus `cache()` React dan layout
    // akar sudah memanggilnya pada permintaan ini — jadi ini bukan query kedua.
    // Menambahkan `waNumber` ke `getSystemSettings()` justru akan
    // menyeberangkannya lewat objek yang dikirim ke Client Component, dan
    // komentar di fungsi itu menjelaskan kenapa objek utuh tidak diteruskan.
    ambilIdentitasSitus(),
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

  // Pesan pembukanya menyebut titik yang sedang dilihat pengunjung.
  //
  // Tanpa itu sales menerima "Halo" tanpa konteks, lalu harus bertanya balik
  // media mana yang dimaksud — pada percakapan yang justru dibuka karena
  // pengunjung ingin cepat. Judulnya di-encode oleh `keTautanWa`, jadi tanda `&`
  // di nama titik tidak memotong pesannya di tengah.
  const tautanWa = keTautanWa(
    identitas.nomorWa,
    `Halo, saya ingin bertanya tentang ${rawData.title}.`
  );

  // Rentang terpakai diserahkan sebagai KUNCI HARI WIB, bukan instan ISO.
  //
  // Sebelumnya `toISOString()`, dan peramban lalu mengubahnya kembali menjadi
  // hari lewat `setHours(0,0,0,0)` — yaitu tengah malam di zona PERAMBAN.
  // Pesanan yang mulai 1 Oktober WIB tersimpan `2026-09-30T17:00:00Z`, jadi
  // pada peramban di UTC seluruh bloknya terbaca maju sehari. Konversi zona
  // kini hanya terjadi sekali, di sini, di tempat zonanya diketahui.
  //
  // Namanya `sampaiEksklusif` supaya tidak bisa disalahbaca lagi: `endDate` di
  // database adalah batas eksklusif — `booking/create` memakai
  // `endDate: { gt: startDate }` dan constraint `booking_tanpa_tumpang_tindih`
  // sepakat dengannya. Rumus lama menandai hari itu terpakai, sehingga satu
  // hari yang masih bisa dijual hilang dari kalender pada setiap pesanan.
  const bookedDates = rawData.bookings.map((b) => ({
    mulai: kunciTanggal(b.startDate),
    sampaiEksklusif: kunciTanggal(b.endDate),
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
      // Tautan `wa.me` yang sudah jadi, bukan nomornya.
      //
      // Client Component tidak perlu tahu nomornya untuk merender tombol, dan
      // memberinya nomor mentah berarti pembentuk tautannya ditulis untuk kedua
      // kalinya di sisi browser — tempat `keE164()` tidak pernah dijalankan.
      // `null` berarti belum diatur atau bentuknya tidak sah, dan tombolnya
      // tidak dirender sama sekali.
      tautanWa={tautanWa}
      bookedDates={bookedDates}
      initialDate={selectedDate}
    />
  );
}

