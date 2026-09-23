// src/lib/rahasia.ts
//
// Enkripsi nilai rahasia yang terpaksa disimpan di database (task 3.22).
//
// `SystemSetting.geminiApiKey` dan `SystemSetting.googleMapsApiKey` selama ini
// tersimpan sebagai teks biasa. Artinya siapa pun yang bisa membaca satu baris
// dari tabel itu memegang kunci berbayar milik pemilik usaha: hasil `pg_dump`
// yang tertinggal di folder backup, kredensial database yang bocor, atau —
// bila PostgREST/Supabase anon key pernah diaktifkan untuk schema `public` —
// permintaan HTTP biasa. Kunci yang bocor dipakai orang lain, dan tagihannya
// tetap datang ke pemiliknya.
//
// Enkripsi di sini TIDAK menggantikan pembatasan akses database. Yang ia
// lakukan: memisahkan "bisa membaca tabel" dari "bisa memakai kuncinya".
// Penyerang yang hanya memegang salinan database tidak mendapat apa-apa,
// karena kunci pembukanya hidup di environment variable proses aplikasi —
// tempat yang berbeda, dengan cara bocor yang berbeda.
//
// AES-256-GCM dipilih karena ia juga MENGOTENTIKASI: nilai yang diubah orang
// di tingkat database akan gagal didekripsi, bukan diam-diam menghasilkan
// sampah yang lalu dikirim ke pihak ketiga.

import crypto from 'crypto';

const NAMA_ENV = 'SETTINGS_ENCRYPTION_KEY';
const PENANDA = 'enc:v1:';

/**
 * Mengambil kunci 32 byte dari environment.
 *
 * Nilai yang diharapkan: 64 karakter heksadesimal (32 byte). Dibuat sekali
 * dengan `openssl rand -hex 32`, lalu disimpan di `.env` dan JANGAN pernah
 * masuk ke git. Mengganti kunci ini membuat seluruh nilai yang sudah
 * terenkripsi tidak bisa dibuka lagi — kunci API harus dimasukkan ulang
 * lewat halaman setelan.
 */
function ambilKunci(): Buffer | null {
  const mentah = process.env[NAMA_ENV];
  if (!mentah) return null;

  const bersih = mentah.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(bersih)) {
    // Sengaja tidak mencetak nilainya, hanya bentuknya yang salah.
    console.error(
      `[rahasia] ${NAMA_ENV} harus 64 karakter heksadesimal (32 byte). ` +
        `Buat dengan: openssl rand -hex 32`
    );
    return null;
  }

  return Buffer.from(bersih, 'hex');
}

/** Apakah enkripsi siap dipakai? Dipakai route untuk menolak menyimpan. */
export function enkripsiSiap(): boolean {
  return ambilKunci() !== null;
}

/**
 * Mengenkripsi satu nilai rahasia.
 *
 * Melempar bila kunci belum diatur. Ini disengaja: menyimpan diam-diam dalam
 * bentuk teks biasa ketika enkripsi gagal adalah cara paling halus untuk
 * membuat pemilik usaha mengira datanya terlindungi padahal tidak.
 */
export function enkripsi(nilai: string): string {
  const kunci = ambilKunci();
  if (!kunci) {
    throw new Error(
      `${NAMA_ENV} belum diatur, jadi nilai rahasia tidak bisa disimpan dengan aman.`
    );
  }

  // IV acak per nilai. Memakai IV tetap pada GCM membocorkan isi pesan.
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kunci, iv);
  const terenkripsi = Buffer.concat([cipher.update(nilai, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PENANDA + Buffer.concat([iv, tag, terenkripsi]).toString('base64');
}

/**
 * Membuka nilai yang dienkripsi `enkripsi()`.
 *
 * Nilai tanpa penanda dikembalikan apa adanya — itu kunci lama yang tersimpan
 * sebagai teks biasa sebelum perubahan ini. Dengan begitu aplikasi tetap
 * berjalan, dan nilai itu ikut terenkripsi begitu admin menyimpan ulang.
 *
 * Mengembalikan `null` bila pembukaan gagal (kunci salah, atau nilai di
 * database pernah diubah orang), bukan melempar — pemanggilnya tinggal
 * memperlakukannya seperti kunci yang belum diatur.
 */
export function dekripsi(tersimpan: string | null | undefined): string | null {
  if (!tersimpan) return null;
  if (!tersimpan.startsWith(PENANDA)) return tersimpan;

  const kunci = ambilKunci();
  if (!kunci) {
    console.error(`[rahasia] Ada nilai terenkripsi di database tetapi ${NAMA_ENV} belum diatur.`);
    return null;
  }

  try {
    const paket = Buffer.from(tersimpan.slice(PENANDA.length), 'base64');
    const iv = paket.subarray(0, 12);
    const tag = paket.subarray(12, 28);
    const badan = paket.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', kunci, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(badan), decipher.final()]).toString('utf8');
  } catch (error) {
    console.error('[rahasia] Gagal membuka nilai terenkripsi. Kunci berubah, atau data diubah.');
    return null;
  }
}
