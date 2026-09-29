// src/app/api/auth/request-reset/route.ts
//
// Langkah 1 dari dua: pengguna mengaku lupa sandinya, kami kirim tautan.
//
// KENAPA ROUTE INI ADA
// --------------------
// Sebelum ini, satu-satunya jalan keluar dari sandi yang terlupa adalah meminta
// admin mengubahnya lewat panel — artinya pengguna harus menghubungi seseorang,
// dan seseorang itu harus memegang kemampuan menyetel sandi akun orang lain.
// Halaman login memang tidak pernah menawarkan tautan "Lupa sandi", jadi
// cacatnya tidak terlihat sebagai tombol rusak; ia terlihat sebagai fitur yang
// tidak ada.
//
// KENAPA DI `/api/auth/`, BUKAN `/api/user/`
// ------------------------------------------
// `src/middleware.ts` memasang `/api/user/:path*` di matcher-nya: route di
// bawah prefiks itu WAJIB membawa token sesi yang sah. Pengguna yang lupa
// sandinya tidak punya sesi — itu seluruh alasan ia di sini. Menaruhnya di
// `/api/user/` akan membuat pemulihan akun hanya tersedia bagi orang yang sudah
// masuk. `/api/auth/` tidak ada di matcher; `[...nextauth]` juga hidup di bawah
// prefiks itu dan tidak dijaga sesi, dengan alasan yang sama.
//
// JAWABANNYA SELALU SAMA
// ----------------------
// Terdaftar atau tidak, akun Google atau akun sandi: satu pesan, satu status.
// Ini mengikuti disiplin yang sudah dipegang `src/lib/auth.ts:55`
// (`PESAN_KREDENSIAL_SALAH`) dan `api/register` ("Email sudah terdaftar" yang
// tidak membedakan cara daftarnya). Membedakan jawabannya di sini akan
// mengembalikan alat pemeriksa yang sudah ditutup di dua tempat lain: siapa pun
// bisa menguji satu daftar alamat dan tahu mana yang punya akun di sini, dan
// mana yang punya sandi.

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { amankanHtml } from '@/lib/html';
import { judulSuratAkun, sendEmail } from '@/lib/mail';
import { originAplikasi } from '@/lib/xendit';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { asalPermintaan } from '@/lib/asal-permintaan';
import {
  UMUR_TOKEN_RESET_MS,
  tautanResetSandi,
  terbitkanTokenReset,
} from '@/lib/reset-sandi';
import { bacaBodyJson } from "@/lib/body-json";

// DUA KUNCI, DUA PENYALAHGUNAAN YANG BERBEDA — pola yang sama dengan
// `src/lib/auth.ts`, dan di sini keduanya lebih perlu:
//
//   1. Per ALAMAT EMAIL menahan pelecehan terhadap satu orang. Tanpa batas ini
//      siapa pun bisa mengirim seratus email reset ke alamat orang lain; korban
//      tidak kehilangan akunnya, tapi kotak masuknya dibanjiri surat resmi dari
//      kami, dan surat yang kelewat sering datang adalah surat yang berhenti
//      dibaca — termasuk saat resetnya benar-benar dia yang minta.
//   2. Per ALAMAT ASAL menahan satu penyerang yang menyapu banyak alamat, yang
//      sama sekali tidak tersentuh batas per email.
//
// Batas per email dihitung SEBELUM akun dicari, sama seperti di `auth.ts`:
// penghitung yang naik setelah pencarian membuat pesan "terlalu banyak
// permintaan" ikut memberitahu apakah alamatnya terdaftar.
//
// Angkanya kecil karena pemakaian wajarnya kecil: orang yang lupa sandinya
// meminta satu tautan, lalu membuka emailnya.
const BATAS_RESET_PER_EMAIL = 3;
const BATAS_RESET_PER_ASAL = 10;
const JENDELA_RESET_MS = 60 * 60 * 1000;

// Satu-satunya jawaban sukses. Kalimatnya sengaja tidak menyebut "email Anda
// terdaftar" maupun "jika terdaftar" dengan nada mencurigakan — ia menyatakan
// apa yang dilakukan sistem, dan itu benar pada kedua cabang.
const PESAN_TERKIRIM =
  'Bila alamat itu terdaftar dan memakai sandi, tautan reset sudah dikirim. ' +
  'Periksa kotak masuk Anda, termasuk folder spam.';

export async function POST(req: Request) {
  try {
    // Diperiksa SEBELUM body dibaca: menolak setelah pekerjaannya selesai tidak
    // menghemat apa pun.
    //
    // `asalPermintaan` boleh `null`, dan saat itu batas per asal DILEWATI —
    // bukan diganti kunci tetap. Kunci tetap membuat semua pengunjung berbagi
    // satu penghitung, sehingga sepuluh permintaan dari siapa pun akan menutup
    // pemulihan akun bagi semua orang selama sejam. Batas per email di bawah
    // tetap berlaku pada jalur itu, dan itu yang melindungi satu korban.
    const asal = asalPermintaan(req);
    if (asal) {
      const batasAsal = rateLimit({
        key: `reset-asal:${asal}`,
        limit: BATAS_RESET_PER_ASAL,
        windowMs: JENDELA_RESET_MS,
      });
      if (!batasAsal.success) {
        return NextResponse.json(
          {
            message: `Terlalu banyak permintaan dari jaringan ini. Coba lagi dalam ${batasAsal.retryAfterSeconds} detik.`,
          },
          { status: 429, headers: rateLimitHeaders(BATAS_RESET_PER_ASAL, batasAsal) }
        );
      }
    }

    const hasilBody = await bacaBodyJson(req, 'auth/request-reset');
    if (!hasilBody.ok) return hasilBody.jawaban;
    const body = hasilBody.body;

    // Dinormalkan sebelum dijadikan kunci pembatas DAN sebelum dicari, sama
    // seperti `auth.ts` dan `api/register`. Tanpa ini `Budi@X.test` dan
    // `budi@x.test` memakai dua penghitung terpisah untuk satu akun yang sama,
    // dan batas per email tinggal dilipatgandakan dengan mengubah besar-kecil
    // hurufnya.
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json({ message: 'Email wajib diisi.' }, { status: 400 });
    }

    // Bentuk email ditolak dengan pesan sendiri, dan itu TIDAK membocorkan apa
    // pun: "bukan alamat email" adalah fakta tentang teks yang dikirim, bukan
    // tentang siapa yang terdaftar di sini.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ message: 'Format email tidak valid.' }, { status: 400 });
    }

    const batasEmail = rateLimit({
      key: `reset-email:${email}`,
      limit: BATAS_RESET_PER_EMAIL,
      windowMs: JENDELA_RESET_MS,
    });
    if (!batasEmail.success) {
      return NextResponse.json(
        {
          message: `Terlalu banyak permintaan untuk alamat ini. Coba lagi dalam ${batasEmail.retryAfterSeconds} detik.`,
        },
        { status: 429, headers: rateLimitHeaders(BATAS_RESET_PER_EMAIL, batasEmail) }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      // Kolomnya dipilih satu per satu. `findUnique` tanpa `select` membawa
      // seluruh baris — termasuk `password`, `ktp`, `npwp`, dan
      // `xenditCustomerId` — ke memori pada SETIAP permintaan, juga yang
      // alamatnya tidak terdaftar sama sekali.
      select: { id: true, name: true, email: true, password: true },
    });

    // Akun tanpa sandi (mendaftar lewat Google) tidak diberi tautan, dan
    // jawabannya tetap sama. Menerbitkan token untuk akun seperti itu berarti
    // membuat jalur masuk berbasis sandi pada akun yang sengaja tidak punya
    // sandi — dan pemiliknya tidak pernah memintanya. Yang benar bagi dia adalah
    // tombol "Masuk dengan Google" yang sudah ada di halaman login.
    if (user && user.password) {
      const { mentah, hash } = terbitkanTokenReset();
      const sekarang = new Date();

      // Token lama akun ini dilumpuhkan lebih dulu. Tanpa ini, tiga permintaan
      // menghasilkan tiga tautan yang SEMUANYA berlaku sampai kedaluwarsa —
      // termasuk tautan pertama yang mungkin dipicu penyerang dan sudah ia baca
      // di suatu tempat. Yang berlaku selalu tautan terakhir yang diminta.
      //
      // `usedAt` ditandai, bukan barisnya dihapus: baris yang dihapus tidak bisa
      // membedakan "token belum pernah ada" dari "token sudah tidak berlaku",
      // dan riwayat permintaannya ikut hilang justru saat sengketa membutuhkannya.
      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: sekarang },
        }),
        prisma.passwordResetToken.create({
          data: {
            tokenHash: hash,
            userId: user.id,
            expiresAt: new Date(sekarang.getTime() + UMUR_TOKEN_RESET_MS),
            // Untuk jejak sengketa saja. Tidak pernah menjadi syarat menukar
            // token: alamat pembaca email hampir selalu berbeda dari alamat
            // peminta (ponsel lawan kantor), jadi menuntutnya sama akan menolak
            // pemilik akun yang sah.
            asalIp: asal,
          },
        }),
      ]);

      // `originAplikasi()` MELEMPAR bila `APP_ORIGIN` belum diisi, dan itu
      // disengaja — lihat alasannya di `src/lib/reset-sandi.ts` pada
      // `tautanResetSandi`. Ditangkap di sini supaya jawabannya tetap seragam:
      // pemanggil tidak boleh bisa membedakan "server salah konfigurasi untuk
      // alamat ini" dari "alamat tidak terdaftar".
      let tautan: string | null = null;
      try {
        tautan = tautanResetSandi(originAplikasi(), mentah);
      } catch (galat) {
        // Nilai token TIDAK ikut dicatat. Yang dicatat hanya bahwa origin-nya
        // belum siap — nama variabelnya sudah ada di pesan `originAplikasi`.
        console.error('[request-reset] origin aplikasi belum siap:', galat);
      }

      if (tautan) {
        const menit = Math.round(UMUR_TOKEN_RESET_MS / 60000);
        // `message` adalah HTML yang sudah jadi, jadi PEMANGGIL yang wajib
        // membungkus setiap nilai pengguna dengan `amankanHtml` — aturannya
        // ditulis di kepala `src/lib/mail.ts`. Di sini nilai penggunanya adalah
        // `name`, yang diisi sendiri saat mendaftar: nama `<img src=x onerror=…>`
        // akan dirender sebagai markup di kliennya sendiri tanpa pembungkus ini.
        //
        // `tautan` juga dibungkus karena ia berada di dalam atribut `href`
        // berkutip; tokennya sudah lewat `encodeURIComponent` di `tautanResetSandi`.
        await sendEmail({
          to: user.email,
          subject: judulSuratAkun({ topik: 'Permintaan reset sandi' }),
          title: 'Atur ulang sandi Anda',
          message:
            `Halo ${amankanHtml(user.name ?? 'pengguna')},<br/><br/>` +
            'Kami menerima permintaan untuk mengatur ulang sandi akun ini. ' +
            `Tautan di bawah berlaku <b>${menit} menit</b> dan hanya bisa dipakai sekali.<br/><br/>` +
            `<a href="${amankanHtml(tautan)}">Atur ulang sandi</a><br/><br/>` +
            'Bila bukan Anda yang meminta, abaikan surat ini — sandi Anda tidak ' +
            'berubah, dan tautan di atas akan kedaluwarsa dengan sendirinya. ' +
            'Jangan teruskan surat ini kepada siapa pun: tautan di dalamnya ' +
            'cukup untuk mengganti sandi akun Anda.',
        });
      }
    }

    // Satu jawaban untuk ketiga cabang: akun tidak ada, akun Google, dan tautan
    // terkirim. Statusnya pun sama — 200 pada semuanya.
    return NextResponse.json({ message: PESAN_TERKIRIM }, { status: 200 });
  } catch (error) {
    // Detail internal tidak dikirim ke client: pesan Prisma bisa memuat nama
    // kolom dan isi query.
    console.error('Gagal memproses permintaan reset sandi:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
