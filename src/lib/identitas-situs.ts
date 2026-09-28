// src/lib/identitas-situs.ts
//
// Membaca `SystemSetting.siteName` dan `siteDesc` — pengaturan yang sampai
// sekarang DISIMPAN tapi tidak pernah dibaca siapa pun.
//
// KENAPA PERLU
// ------------
// Halaman `/admin/settings` punya dua kotak isian, keduanya menulis ke kolom
// yang benar, dan API-nya bahkan sudah membersihkan serta memotong panjangnya
// (lihat `bersihkanTeks` di `api/admin/settings/route.ts`). Yang tidak ada
// adalah pembacanya: di luar halaman pengaturannya sendiri, nol berkas membaca
// `siteName` atau `siteDesc`. Admin mengganti nama usahanya, menekan Simpan,
// menerima "Pengaturan Disimpan" — dan tidak ada satu pun huruf di situs yang
// berubah. Pengaturan yang tidak berefek lebih buruk daripada pengaturan yang
// tidak ada: yang kedua jujur.
//
// Nama itu sebelumnya ditulis langsung di kode pada tiga tempat
// (`admin/(dashboard)/page.tsx`, `admin/login/page.tsx`, dan prompt Gemini di
// `api/admin/settings/route.ts`), jadi mengubahnya di halaman pengaturan
// meninggalkan tiga tempat yang masih menyebut nama lama.
//
// FALLBACK-NYA `NAMA_PENJUAL`, BUKAN TEKS BARU
// --------------------------------------------
// `src/lib/penjual.ts` sudah menjadi sumber identitas penjual untuk invoice dan
// surat — dokumen yang diserahkan ke pelanggan, yang nilainya tidak boleh ikut
// berubah hanya karena isian di halaman pengaturan dikosongkan. Memakainya
// sebagai fallback membuat keduanya sepakat selama admin belum mengisi apa pun,
// dan tidak pernah memunculkan nama ketiga.

import 'server-only';

import { cache } from 'react';
import { connection } from 'next/server';
import { prisma } from '@/lib/prisma';
import { NAMA_PENJUAL } from '@/lib/penjual';
import { keE164 } from '@/lib/telepon';

/** Keterangan singkat situs, dipakai bila admin belum mengisinya. */
export const DESKRIPSI_SITUS_BAWAAN = 'Platform Sewa Billboard Terlengkap';

export type IdentitasSitus = {
  nama: string;
  deskripsi: string;
  /**
   * Nomor WhatsApp sales dalam bentuk E.164, atau `null` bila belum diatur.
   *
   * Tidak punya fallback ke konstanta apa pun, beda dengan `nama`. Nama usaha
   * yang salah membuat judul tab keliru; nomor telepon yang salah mengirim
   * pengunjung ke orang asing atau ke nomor mati, lalu ia menyimpulkan
   * perusahaannya tidak menjawab. `null` di sini berarti pemanggilnya TIDAK
   * merender tombol kontak sama sekali.
   */
  nomorWa: string | null;
};

export const IDENTITAS_BAWAAN: IdentitasSitus = {
  nama: NAMA_PENJUAL,
  deskripsi: DESKRIPSI_SITUS_BAWAAN,
  nomorWa: null,
};

/**
 * Nama dan keterangan situs sebagaimana diatur admin.
 *
 * TIDAK PERNAH MELEMPAR, dan itu disengaja. Pemanggil pertamanya adalah
 * `generateMetadata` di layout akar — dijalankan untuk setiap halaman, termasuk
 * halaman galat. Melempar dari sana membuat database yang sedang tidak bisa
 * dihubungi menjatuhkan seluruh situs, padahal yang gagal hanya judul tab.
 * Bandingkan dengan query yang isi halamannya sendiri: di sana kegagalan justru
 * HARUS melempar, supaya tidak dirender sebagai "tidak ada data".
 *
 * Nilai kosong di database diperlakukan sama dengan belum diatur: kolomnya
 * `String` non-null, jadi teks kosong tetap tersimpan sah, dan judul tab kosong
 * bukan pilihan yang pernah dimaksudkan admin.
 *
 * Dibungkus `cache()` React: satu permintaan halaman memanggilnya paling tidak
 * dua kali (`generateMetadata` lalu komponen halamannya), dan tanpa ini nama
 * usaha dibaca dua kali dari database untuk setiap pemuatan halaman. Cache-nya
 * per-permintaan, bukan lintas permintaan — nama yang baru disimpan admin tetap
 * langsung terlihat.
 */
export const ambilIdentitasSitus = cache(async function ambilIdentitasSitus(): Promise<IdentitasSitus> {
  // `connection()` MENANDAI pemanggilnya sebagai halaman yang dirender saat
  // diminta, bukan saat build — dan tanpa ini seluruh maksud modul ini hilang
  // tepat di production.
  //
  // Next me-prerender halaman tanpa penanda dinamis pada `next build`. Prisma
  // bukan salah satu penanda itu, jadi `/about`, `/admin/login`, dan
  // `generateMetadata` layout akar terbit sebagai `○ (Static)`: nama usaha yang
  // tertulis di HTML-nya adalah nama yang ada di database PADA SAAT BUILD. Admin
  // mengganti `siteName`, menekan Simpan, menerima "Pengaturan Disimpan" — dan
  // halaman-halaman itu tetap menyebut nama lama sampai ada yang men-deploy
  // ulang. Persis cacat yang modul ini dibuat untuk menutup, kembali lewat pintu
  // yang berbeda, dan hanya di production: `next dev` merender setiap
  // permintaan, jadi di mesin pengembang semuanya tampak benar.
  //
  // Ditaruh DI SINI, bukan sebagai `export const dynamic = 'force-dynamic'` di
  // tiap halaman: pemanggil berikutnya akan lupa menuliskannya, dan lupanya
  // tidak menghasilkan satu pun galat — hanya nama usaha yang basi.
  //
  // DI LUAR `try`, dan ini bukan pilihan gaya. Cara Next membatalkan prerender
  // adalah MELEMPAR sebuah sinyal yang harus lolos sampai ke rendernya.
  // `catch` di bawah akan menelannya, lalu mengembalikan `IDENTITAS_BAWAAN`
  // dengan tenang — halamannya tetap dipanggang statis, kini berisi nama
  // bawaan, dan satu-satunya jejaknya hanya baris `console.error` di log build
  // yang mengaku "gagal membaca pengaturan situs".
  await connection();

  try {
    const baris = await prisma.systemSetting.findUnique({
      where: { id: 'default_config' },
      // Hanya dua kolom ini. Baris yang sama memuat `geminiApiKey` dan
      // `googleMapsApiKey` terenkripsi; fungsi ini dipanggil dari layout akar
      // yang merender setiap halaman publik, jadi keduanya tidak boleh ikut
      // terbaca hanya karena satu hari ada yang mengganti `select` ini dengan
      // `include`.
      select: { siteName: true, siteDesc: true, waNumber: true },
    });

    return {
      nama: bersih(baris?.siteName) ?? IDENTITAS_BAWAAN.nama,
      deskripsi: bersih(baris?.siteDesc) ?? IDENTITAS_BAWAAN.deskripsi,
      // Dilewatkan `keE164()` di sini, bukan dipercaya apa adanya. Kolomnya
      // memang hanya pernah ditulis lewat penyaring yang sama di
      // `api/admin/settings`, tapi nilai yang masuk lewat `psql` atau lewat
      // versi route yang lebih tua tidak punya jaminan bentuk — dan nomor yang
      // bentuknya salah menjadi tombol yang mendarat di halaman galat
      // WhatsApp, yang dibaca pengunjung sebagai perusahaan yang tidak
      // menjawab.
      nomorWa: keE164(baris?.waNumber),
    };
  } catch (error) {
    console.error('[identitas-situs] Gagal membaca pengaturan situs:', error);
    return IDENTITAS_BAWAAN;
  }
});

function bersih(nilai: string | null | undefined): string | null {
  if (typeof nilai !== 'string') return null;
  const rapi = nilai.trim();
  return rapi === '' ? null : rapi;
}

/**
 * Nama situs yang aman diselipkan ke dalam prompt model bahasa.
 *
 * Nilainya ditulis admin dan berakhir di dalam kalimat perintah yang dikirim ke
 * Gemini. Tanpa pembersihan ini, nama berisi baris baru atau tanda kutip bisa
 * menutup kalimatnya lalu menambahkan perintah sendiri — pola yang sama dengan
 * menyambung string ke dalam query SQL. Risikonya di sini kecil (hanya
 * SUPER_ADMIN yang bisa menulisnya, dan hasilnya cuma slogan yang ia lihat
 * sendiri), tapi harganya satu baris.
 */
export function namaUntukPrompt(nama: string): string {
  return nama.replace(/[\r\n"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
