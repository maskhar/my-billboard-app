// src/app/api/user/update-profile/route.ts
//
// Route ini adalah PENULIS IDENTITAS KEDUA di repo ini, dan aturannya dulu
// berbeda dari penulis pertama (`api/booking/create` lewat
// `@/lib/identitas-penyewa`). Tiga akibatnya:
//
//   1. `if (!name)` memeriksa keberadaan, bukan tipe. `{"name":{"not":""}}`
//      lolos karena objek selalu truthy, lalu masuk ke `prisma.user.update` dan
//      ditolak sebagai galat internal — pengguna membaca "Terjadi kesalahan pada
//      server" untuk isian yang ia ketik sendiri.
//   2. `whatsapp` ditulis APA ADANYA, tanpa satu pun pemeriksaan. Nomor yang
//      diketik `0812-3456-789` tersimpan bersama tanda hubungnya, sementara
//      `api/register` dan checkout menyimpannya ternormalisasi. Gerbang
//      pembayaran di `sesi-pembayaran.ts` memeriksanya dengan `keE164`, jadi
//      pengguna yang "sudah mengisi nomor WhatsApp di Pengaturan Akun" tetap
//      ditolak `PROFIL_BELUM_LENGKAP` saat membayar — dan halaman pengaturan
//      tadi menjawabnya "Profil berhasil diperbarui!".
//      Nilai kosong pun lolos: `whatsapp: ''` menghapus nomor yang sudah benar.
//   3. Tidak ada batas panjang, padahal kolomnya `String` tanpa batas di
//      Postgres.
//
// Sekarang aturannya satu: `bacaIdentitasPenyewa`, modul yang sama dengan yang
// dipakai checkout. Dua penulis dengan aturan yang sama tidak bisa menyimpang.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { bacaIdentitasPenyewa } from '@/lib/identitas-penyewa';
import { bacaBodyJson } from "@/lib/body-json";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
        return NextResponse.json({ message: 'Tidak terautentikasi.' }, { status: 401 });
    }

    try {
        const hasilBody = await bacaBodyJson(req, 'user/update-profile');
        if (!hasilBody.ok) return hasilBody.jawaban;
        const body = hasilBody.body;

        // `perluFaktur: false` — NPWP tidak wajib di halaman pengaturan. Bila
        // terisi ia tetap disimpan, sama seperti di checkout.
        const identitas = bacaIdentitasPenyewa(body, false);
        if (!identitas.sah) {
            return NextResponse.json({ message: identitas.pesan }, { status: 400 });
        }

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                name: identitas.nilai.name,
                whatsapp: identitas.nilai.whatsapp,
                // Kosong berarti "tidak diubah", bukan "dihapus": formulir
                // pengaturan hari ini tidak menampilkan kedua kolom ini sama
                // sekali, jadi menulis `null` akan menghanguskan NPWP yang
                // pembeli isi di checkout setiap kali ia mengganti namanya.
                ...(identitas.nilai.companyName !== null
                    ? { companyName: identitas.nilai.companyName }
                    : {}),
                ...(identitas.nilai.npwp !== null ? { npwp: identitas.nilai.npwp } : {}),
            },
            // Tanpa `select`, `update` memulangkan seluruh baris — termasuk hash
            // password dan kolom OTP — ke memori proses.
            select: { id: true },
        });

        return NextResponse.json({ message: 'Profil berhasil diperbarui.' }, { status: 200 });

    } catch (error) {
        console.error("Error updating profile:", error);
        return NextResponse.json({ message: 'Terjadi kesalahan pada server.' }, { status: 500 });
    }
}
