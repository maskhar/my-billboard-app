// src/app/api/booking/[id]/payment-session/route.ts
//
// Membuka Pembayaran Otomatis untuk satu pesanan milik pembeli yang memanggil.
//
// Route ini sengaja tipis: seluruh urutan yang menentukan keamanan uang ada di
// `src/lib/sesi-pembayaran.ts`, supaya bisa diuji tanpa HTTP dan tanpa Postgres.
// Yang tinggal di sini hanya hal-hal yang memang milik lapisan HTTP: siapa yang
// memanggil, seberapa sering ia boleh memanggil, dan bagaimana kegagalan
// diterjemahkan menjadi status.
//
// SATU HAL YANG TIDAK BOLEH HILANG DARI FILE INI
// ----------------------------------------------
// Jawaban route ini memuat kunci sesi berumur pendek. Kunci itu boleh dibaca
// browser pembeli pemiliknya, dan tidak boleh dibaca apa pun yang lain — termasuk
// cache bersama, log akses yang menyimpan body, dan riwayat browser. Karena itu
// `Cache-Control: no-store` dipasang pada SETIAP jawaban, bukan hanya yang
// berhasil, dan kunci tidak pernah masuk ke URL.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { GalatSesiPembayaran, siapkanSesiPembayaran } from '@/lib/sesi-pembayaran';

/**
 * Berapa kali satu pembeli boleh meminta sesi.
 *
 * Batasnya per PEMBELI, bukan per alamat IP: beberapa pembeli di satu kantor
 * berbagi satu IP, dan membatasi mereka bersama-sama berarti pembeli kedua tidak
 * bisa membayar karena pembeli pertama baru saja membayar. Sebaliknya satu orang
 * yang memuat ulang halaman terus-menerus hanya membebani kuotanya sendiri.
 *
 * Angkanya longgar dengan sengaja. Membuka sesi adalah hal yang WAJAR dilakukan
 * beberapa kali: sesi habis, e-wallet mengembalikan pembeli ke halaman, atau tab
 * dimuat ulang. Yang ingin dicegah bukan pemakaian normal, melainkan perulangan
 * otomatis yang membanjiri gerbang pembayaran dengan sesi menganggur.
 */
const BATAS_PER_PENGGUNA = 10;
const JENDELA_PENGGUNA_MS = 60_000;

/**
 * Batas kedua, per pesanan.
 *
 * Batas per pembeli saja tidak cukup: pembeli dengan banyak pesanan tetap bisa
 * menumpuk sesi menganggur pada SATU pesanan sampai kuota penggunanya habis.
 * Batas ini menjaga agar satu tagihan tidak pernah menghasilkan lebih dari
 * segelintir sesi per menit, berapa pun pesanan lain yang ia punya.
 */
const BATAS_PER_PESANAN = 5;
const JENDELA_PESANAN_MS = 60_000;

/** Kunci sesi tidak boleh tersimpan di mana pun kecuali memori browser pembeli. */
const TANPA_SIMPAN = { 'Cache-Control': 'no-store' } as const;

function jawab(
  body: unknown,
  status: number,
  headerTambahan?: Record<string, string>
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { ...TANPA_SIMPAN, ...headerTambahan },
  });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  // Parameter route dibaca DI DALAM `try`. Di luarnya, penolakan dari
  // `ctx.params` akan melewati jawaban terkendali di bawah — dan jawaban
  // pengganti dari framework tidak membawa `Cache-Control: no-store`.
  let bookingId = '';

  try {
    ({ id: bookingId } = await ctx.params);

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jawab({ message: 'Sesi Habis.', kode: 'TIDAK_LOGIN' }, 401);
    }

    // ADMIN DITOLAK DI SINI, BUKAN DIIZINKAN SEPERTI DI HALAMAN LACAK PESANAN.
    //
    // Halaman lacak pesanan memang membolehkan admin melihat pesanan siapa pun —
    // itu tugasnya. Tapi ini bukan melihat: ini membuka alat bayar yang menerima
    // kartu. Admin yang bisa membukanya pada pesanan pelanggan bisa memasukkan
    // kartunya sendiri ke sana, dan sejak itu tidak ada lagi cara membedakan
    // pembayaran pelanggan dari pembayaran admin di dalam pembukuan.
    if (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN') {
      return jawab(
        { message: 'Pesanan tidak ditemukan.', kode: 'PESANAN_TIDAK_DITEMUKAN' },
        404
      );
    }

    const batasPengguna = rateLimit({
      key: `sesi-bayar:pengguna:${session.user.id}`,
      limit: BATAS_PER_PENGGUNA,
      windowMs: JENDELA_PENGGUNA_MS,
    });

    if (!batasPengguna.success) {
      return jawab(
        {
          message: `Terlalu banyak permintaan pembayaran. Coba lagi dalam ${batasPengguna.retryAfterSeconds} detik.`,
          kode: 'TERLALU_SERING',
        },
        429,
        rateLimitHeaders(BATAS_PER_PENGGUNA, batasPengguna)
      );
    }

    // Kunci pesanan diawali id pembeli. Tanpa itu, orang asing bisa menghabiskan
    // kuota sebuah pesanan hanya dengan menebak id-nya — menolak pembayaran
    // pemilik yang sah tanpa pernah bisa membaca pesanannya.
    const batasPesanan = rateLimit({
      key: `sesi-bayar:pesanan:${session.user.id}:${bookingId}`,
      limit: BATAS_PER_PESANAN,
      windowMs: JENDELA_PESANAN_MS,
    });

    if (!batasPesanan.success) {
      return jawab(
        {
          message: `Pembayaran pesanan ini baru saja diminta. Coba lagi dalam ${batasPesanan.retryAfterSeconds} detik.`,
          kode: 'TERLALU_SERING',
        },
        429,
        rateLimitHeaders(BATAS_PER_PESANAN, batasPesanan)
      );
    }

    const hasil = await siapkanSesiPembayaran({
      bookingId,
      userId: session.user.id,
    });

    return jawab(hasil, 200, rateLimitHeaders(BATAS_PER_PESANAN, batasPesanan));
  } catch (error) {
    if (error instanceof GalatSesiPembayaran) {
      // Pesan pada `GalatSesiPembayaran` memang ditulis untuk dibaca pembeli.
      // Kode galat internalnya ikut supaya halaman bisa memilih tindakan yang
      // tepat (mis. mengarahkan ke Pengaturan Akun) tanpa mencocokkan teks.
      return jawab({ message: error.message, kode: error.kode }, error.status);
    }

    // Jangan mencatat objek galat mentah. Galat Prisma dapat membawa query dan
    // nilai kolom; galat gerbang dapat membawa body/headers. Keduanya berisiko
    // memuat data pembeli atau rahasia, sedangkan route hanya perlu kategori
    // pendek untuk diagnosis server.
    const kategori = error instanceof Error ? error.name.slice(0, 80) : 'galat-tidak-dikenal';
    console.error(`[payment-session] gagal menyiapkan sesi: ${kategori}`);
    return jawab({ message: 'Error Server', kode: 'GALAT_SERVER' }, 500);
  }
}
