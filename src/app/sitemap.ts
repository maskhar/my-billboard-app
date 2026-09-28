// src/app/sitemap.ts
//
// Sebelum berkas ini ada, repo tidak punya sitemap sama sekali — dan `robots.ts`
// sudah menuliskan alasannya untuk tidak berpura-pura punya:
//
//     // Baris `sitemap` SENGAJA tidak ada: repo ini belum punya
//     // `src/app/sitemap.ts` maupun `public/sitemap.xml`, dan menunjuk ke
//     // berkas yang menjawab 404 membuat crawler mencatat situs ini sebagai
//     // salah konfigurasi. Tambahkan barisnya bersamaan dengan sitemap-nya,
//     // bukan sebelumnya.
//
// Ini "bersamaan" itu. Kedua berkas berubah dalam satu commit.
//
// KENAPA PERLU, UNTUK SITUS SEPERTI INI
// --------------------------------------
// Halaman produk di sini adalah `/billboard/[slug]`, dan tidak ada satu pun
// halaman yang menaut ke SELURUH-nya: beranda menampilkan sebagian, dan sisanya
// hanya sampai lewat pencarian atau peta yang dirender di klien. Crawler yang
// hanya mengikuti tautan karena itu tidak pernah menemukan sebagian besar
// inventaris — persis halaman yang ada gunanya diindeks. Sitemap adalah satu
// tempat yang menyebut semuanya.
//
// YANG TIDAK MASUK, DAN KENAPA
// -----------------------------
// Daftar `TERLARANG` di `robots.ts` dan `matcher` di `src/middleware.ts` adalah
// satu keputusan yang sama: area yang menuntut login. Tidak satu pun dari
// mereka muncul di sini. Sitemap yang menyebut `/dashboard` sementara
// `robots.txt` melarangnya bukan sekadar mubazir — ia sinyal yang bertabrakan,
// dan Google Search Console melaporkannya sebagai galat.
//
// `/checkout` dan `/pembayaran/selesai` juga tidak masuk: keduanya hanya berarti
// di tengah satu alur, dan pengunjung yang mendarat di sana dari hasil pencarian
// menemukan halaman yang tidak bisa ia pakai.
//
// HANYA `PUBLISHED`
// ------------------
// Filternya sama persis dengan `src/app/billboard/[slug]/page.tsx`: apa pun
// selain `PUBLISHED` menjawab 404 di sana. Menyebut billboard `DRAFT` di sini
// berarti mengirim crawler ke 404 yang kita tulis sendiri — dan `ARCHIVED`
// adalah billboard yang sengaja ditarik dari peredaran.

import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { originAplikasi } from '@/lib/xendit';

// DIRENDER PER PERMINTAAN, BUKAN SAAT BUILD.
//
// Tanpa baris ini Next memanggil fungsi di bawah saat `npm run build` dan
// menyimpan hasilnya sebagai berkas statis. Dua akibatnya, dan keduanya
// terbukti:
//
// 1. Build GAGAL di mesin yang `APP_ORIGIN`-nya belum diisi — mesin build
//    memang tidak perlu punya env produksi, dan `src/instrumentation.ts`
//    SENGAJA dilewati Next pada fase build (lihat komentar di berkas itu), jadi
//    tidak ada yang bisa menjamin variabelnya ada di sana. `Export encountered
//    an error on /sitemap.xml/route` menghentikan seluruh deploy.
// 2. Bahkan bila build-nya lolos, daftarnya dibekukan pada isi database saat
//    build. Setiap billboard baru yang dipasang admin karena itu TIDAK pernah
//    masuk sitemap sampai ada yang men-deploy ulang — padahal alasan utama
//    sitemap ini ada adalah supaya inventaris yang tidak tertaut dari mana pun
//    bisa ditemukan.
//
// Ongkosnya satu query ringan (dua kolom) per permintaan `/sitemap.xml`, dan
// yang memintanya adalah mesin pencari, beberapa kali sehari.
export const dynamic = 'force-dynamic';

/**
 * Halaman publik yang tidak berasal dari database.
 *
 * `changeFrequency` dan `priority` diisi apa adanya, bukan ditebak besar-besar:
 * keduanya PETUNJUK yang boleh diabaikan mesin pencari, dan nilai yang
 * dilebih-lebihkan (semuanya `priority: 1.0`, semuanya `always`) tidak
 * menghasilkan apa pun selain sinyal yang tidak informatif.
 */
const HALAMAN_STATIS = [
  // `/`, bukan string kosong. `originAplikasi()` mengembalikan origin tanpa
  // garis miring penutup, jadi jalur kosong menghasilkan `https://contoh.test`
  // — alamat yang sah tapi bukan bentuk kanonik beranda, dan berbeda dari
  // alamat yang ditaut seluruh halaman lain di situs ini.
  { jalur: '/', frekuensi: 'daily' as const, prioritas: 1.0 },
  { jalur: '/about', frekuensi: 'yearly' as const, prioritas: 0.5 },
  { jalur: '/sewakan-tempat', frekuensi: 'monthly' as const, prioritas: 0.7 },
  // `/login` dan `/register` SENGAJA tidak ada. Keduanya tidak punya isi yang
  // berguna di hasil pencarian, dan halaman login yang terindeks atas nama
  // usaha ini adalah hasil yang menyesatkan pengunjung pertama.
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // `originAplikasi()` MELEMPAR bila `APP_ORIGIN` belum diisi atau bentuknya
  // salah, dan di sini lemparan itu benar: sitemap berisi alamat absolut, dan
  // sitemap dengan origin yang salah lebih buruk daripada tidak ada sitemap —
  // ia mengajari mesin pencari alamat yang tidak pernah bisa dibuka.
  //
  // Sejak `src/instrumentation.ts` ada, `APP_ORIGIN` sudah diperiksa saat boot
  // di produksi, jadi lemparan di sini hanya mungkin di pengembangan.
  const origin = originAplikasi();

  const sekarang = new Date();

  const statis: MetadataRoute.Sitemap = HALAMAN_STATIS.map((h) => ({
    url: `${origin}${h.jalur}`,
    lastModified: sekarang,
    changeFrequency: h.frekuensi,
    priority: h.prioritas,
  }));

  let billboard: MetadataRoute.Sitemap = [];
  try {
    const baris = await prisma.billboard.findMany({
      where: { publishStatus: 'PUBLISHED' },
      // Hanya dua kolom. Tabel ini memuat harga dan koordinat; tidak ada
      // alasan keduanya ikut terbaca untuk menyusun daftar alamat.
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });

    billboard = baris.map((b) => ({
      url: `${origin}/billboard/${b.slug}`,
      // `updatedAt` yang nyata, bukan `new Date()`. Tanggal yang selalu
      // "sekarang" memberi tahu crawler bahwa SETIAP halaman berubah setiap
      // kali sitemap diminta, sehingga ia berhenti memercayai kolom ini
      // seluruhnya — dan halaman yang benar-benar berubah tidak lagi menonjol.
      lastModified: b.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));
  } catch (error) {
    // Database yang sedang tidak bisa dihubungi TIDAK boleh membuat sitemap
    // menjawab 500. Crawler yang menerima 500 di sini mencatat seluruh sitemap
    // sebagai gagal dan menjadwal ulang jauh di kemudian hari; sitemap yang
    // hanya berisi halaman statis tetap berguna hari ini.
    console.error('[sitemap] Gagal membaca daftar billboard:', error);
  }

  return [...statis, ...billboard];
}
