// src/app/api/auth/reset-password/route.ts
//
// Langkah 2 dari dua: token ditukar dengan sandi baru.
//
// Ini satu-satunya jalur di aplikasi yang menulis `User.password` TANPA
// membuktikan sandi lama dan TANPA sesi. Yang menggantikan kedua bukti itu hanya
// satu hal: pemanggil bisa menunjukkan token yang pernah kami kirim ke kotak
// masuk pemilik akun. Karena itu setiap syarat di bawah adalah syarat keamanan,
// bukan validasi kenyamanan.
//
// URUTANNYA DISENGAJA
// -------------------
//   1. batas laju per asal      — sebelum body dibaca
//   2. bentuk token             — sebelum database disentuh
//   3. sandi baru diperiksa     — sebelum token dicari, supaya sandi yang tidak
//                                 memenuhi syarat tidak menghanguskan token
//   4. baris token dicari       — lewat hash, bukan token
//   5. kelayakan token          — `tokenMasihBisaDipakai`
//   6. tandai terpakai (CAS)    — pemenang balapan menulis, yang lain berhenti
//   7. sandi ditulis + token lain akun ini dilumpuhkan
//
// Langkah 3 sebelum 4 adalah yang paling mudah dibalik dan paling merugikan bila
// dibalik: token yang hangus karena sandi barunya cuma 6 karakter memaksa
// pengguna meminta tautan baru untuk kesalahan yang bisa ia perbaiki di tempat —
// dan batas tiga tautan per jam di route penerbit akan segera menutup jalannya.

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { amankanHtml } from '@/lib/html';
import { judulSuratAkun, sendEmail } from '@/lib/mail';
import { BIAYA_HASH_SANDI, periksaSandiBaru } from '@/lib/sandi';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { asalPermintaan } from '@/lib/asal-permintaan';
import { bentukTokenSah, hashTokenReset, tokenMasihBisaDipakai } from '@/lib/reset-sandi';
import { bacaBodyJson } from "@/lib/body-json";

// Kuncinya alamat asal, BUKAN token: token yang salah tidak punya pemilik yang
// bisa dilindungi, dan membatasi per token justru memberi penyerang satu
// penghitung baru untuk setiap tebakan.
//
// Batas ini bukan penjaga utama terhadap penebakan token — 256 bit acak sudah
// menjadikan penebakan mustahil. Yang ia tahan adalah biaya: tanpa itu, satu
// pemanggil bisa memaksa satu query ke tabel token untuk setiap permintaan,
// tanpa sesi, tanpa batas.
const BATAS_TUKAR_PER_ASAL = 20;
const JENDELA_TUKAR_MS = 15 * 60 * 1000;

// Satu pesan untuk token yang tidak ada, sudah terpakai, dan sudah kedaluwarsa.
//
// Membedakannya akan memberi tahu pemegang token asing mana dari ketiganya yang
// ia pegang — yaitu memberi tahu bahwa tokennya PERNAH sah, yang berarti alamat
// email yang ia targetkan memang terdaftar dan memang pernah meminta reset.
// Ketiganya juga menuntut tindakan yang sama dari pengguna: minta tautan baru.
const PESAN_TOKEN_TIDAK_BERLAKU =
  'Tautan reset tidak berlaku atau sudah kedaluwarsa. Silakan minta tautan baru.';

export async function POST(req: Request) {
  try {
    const asal = asalPermintaan(req);
    if (asal) {
      const batas = rateLimit({
        key: `tukar-reset:${asal}`,
        limit: BATAS_TUKAR_PER_ASAL,
        windowMs: JENDELA_TUKAR_MS,
      });
      if (!batas.success) {
        return NextResponse.json(
          { message: `Terlalu banyak percobaan. Coba lagi dalam ${batas.retryAfterSeconds} detik.` },
          { status: 429, headers: rateLimitHeaders(BATAS_TUKAR_PER_ASAL, batas) }
        );
      }
    }

    const hasilBody = await bacaBodyJson(req, 'auth/reset-password');
    if (!hasilBody.ok) return hasilBody.jawaban;
    const body = hasilBody.body;

    // Bentuknya dulu. `bentukTokenSah` juga mempersempit tipenya, jadi
    // `hashTokenReset` di bawah tidak menerima `unknown`.
    if (!bentukTokenSah(body?.token)) {
      return NextResponse.json({ message: PESAN_TOKEN_TIDAK_BERLAKU }, { status: 400 });
    }
    const token = body.token;

    // Sebelum token dicari — lihat catatan urutan di kepala berkas.
    const sandiBaru = periksaSandiBaru(body?.password);
    if (!sandiBaru.sah) {
      return NextResponse.json({ message: sandiBaru.pesan }, { status: 400 });
    }

    const baris = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashTokenReset(token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { email: true, name: true, password: true } },
      },
    });

    const sekarang = new Date();
    if (!tokenMasihBisaDipakai(baris, sekarang)) {
      return NextResponse.json({ message: PESAN_TOKEN_TIDAK_BERLAKU }, { status: 400 });
    }
    // `tokenMasihBisaDipakai` sudah menolak `null`, tapi TypeScript tidak
    // mengikuti narrowing lewat batas fungsi. Penjaga ini tidak pernah benar saat
    // dijalankan; ia ada supaya tipe di bawahnya tidak perlu `!`.
    if (!baris) {
      return NextResponse.json({ message: PESAN_TOKEN_TIDAK_BERLAKU }, { status: 400 });
    }

    // Akun yang kehilangan sandinya di antara penerbitan dan penukaran (mis.
    // diubah admin menjadi akun Google) tidak ditulisi sandi baru lewat jalur
    // ini. Menulisnya akan MEMBUAT sandi pada akun yang sengaja tidak punya.
    if (!baris.user.password) {
      return NextResponse.json({ message: PESAN_TOKEN_TIDAK_BERLAKU }, { status: 400 });
    }

    // Sandi baru yang sama dengan yang lama ditolak, sama seperti di
    // `api/user/change-password`: menjawab "berhasil" atas sandi yang tidak
    // berubah membuat pengguna percaya akunnya sudah diselamatkan padahal belum —
    // justru saat ia mereset karena menduga sandinya bocor.
    //
    // Diperiksa SEBELUM token ditandai terpakai, supaya ia masih bisa mencoba
    // sandi lain dengan tautan yang sama.
    if (await bcrypt.compare(sandiBaru.nilai, baris.user.password)) {
      return NextResponse.json(
        { message: 'Sandi baru harus berbeda dari sandi sebelumnya.' },
        { status: 400 }
      );
    }

    // Hash dihitung di LUAR transaksi. `bcrypt.hash` dengan cost 12 memakan
    // ratusan milidetik; menahan transaksi database selama itu berarti menahan
    // koneksi dari pool untuk pekerjaan yang tidak menyentuh database sama sekali.
    const hashSandi = await bcrypt.hash(sandiBaru.nilai, BIAYA_HASH_SANDI);

    // KLAIM TOKEN LEBIH DULU, DENGAN SYARAT `usedAt: null`.
    //
    // Ini compare-and-set, bukan "baca lalu tulis": syarat `usedAt: null` ada di
    // dalam `WHERE`, jadi Postgres yang memutuskan siapa pemenangnya. Dua
    // permintaan dengan token yang sama (klik ganda, atau dua tab) sama-sama lolos
    // `tokenMasihBisaDipakai` di atas — keduanya membacanya sebelum salah satu
    // menulis. Yang membedakan hanyalah `count` di sini: satu mendapat 1, yang
    // lain 0.
    //
    // Klaim ini berada di dalam transaksi yang sama dengan penulisan sandi, jadi
    // tidak ada keadaan di mana token hangus tapi sandinya tidak berubah.
    const hasil = await prisma.$transaction(async (tx) => {
      const klaim = await tx.passwordResetToken.updateMany({
        where: { id: baris.id, usedAt: null },
        data: { usedAt: sekarang },
      });
      if (klaim.count === 0) return { menang: false as const };

      await tx.user.update({
        where: { id: baris.userId },
        data: { password: hashSandi },
      });

      // Token lain milik akun ini dilumpuhkan sekalian. Pemilik yang mengklik
      // "lupa sandi" tiga kali punya tiga tautan; setelah salah satunya dipakai,
      // dua sisanya tidak boleh tetap menjadi kunci ke akun yang sudah diamankan.
      await tx.passwordResetToken.updateMany({
        where: { userId: baris.userId, usedAt: null },
        data: { usedAt: sekarang },
      });

      return { menang: true as const };
    });

    if (!hasil.menang) {
      return NextResponse.json({ message: PESAN_TOKEN_TIDAK_BERLAKU }, { status: 400 });
    }

    // Surat pemberitahuan, DI LUAR transaksi dan setelah commit. `sendEmail`
    // tidak pernah melempar, jadi SMTP yang mati tidak membatalkan sandi yang
    // sudah tertulis — pengguna yang berhasil mereset tidak boleh dijawab "gagal"
    // karena surat pemberitahuannya tidak terkirim.
    //
    // Suratnya bukan formalitas: bila yang mereset ternyata bukan pemiliknya,
    // surat inilah satu-satunya tanda bahwa akunnya baru saja diambil, dan
    // semakin cepat ia tahu semakin besar peluangnya bertindak.
    //
    // Tidak memuat tautan apa pun. Surat "sandi Anda baru diubah" yang berisi
    // tautan adalah pola yang sama dengan phishing, dan melatih penerima
    // mengkliknya.
    await sendEmail({
      to: baris.user.email,
      subject: judulSuratAkun({ topik: 'Sandi berhasil diubah' }),
      title: 'Sandi akun Anda sudah diubah',
      message:
        `Halo ${amankanHtml(baris.user.name ?? 'pengguna')},<br/><br/>` +
        'Sandi akun ini baru saja diatur ulang lewat tautan reset, dan tautan itu ' +
        'sekarang tidak berlaku lagi.<br/><br/>' +
        '<b>Bila bukan Anda yang melakukannya</b>, akun Anda mungkin sudah diakses ' +
        'orang lain. Segera hubungi kami lewat halaman kontak — jangan membalas ' +
        'surat ini. Kami tidak pernah meminta sandi Anda lewat email.',
    });

    return NextResponse.json({ message: 'Sandi berhasil diubah. Silakan masuk.' }, { status: 200 });
  } catch (error) {
    console.error('Gagal menukar token reset sandi:', error);
    return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
  }
}
