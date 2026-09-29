// src/app/api/admin/billboards/rollback/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bacaSnapshotBillboard } from "@/lib/snapshot-billboard";
import { idDariBody } from "@/lib/id-dari-body";
import { adalahDuplikatUnik } from "@/lib/db-error";
import { bacaBodyJson } from "@/lib/body-json";
import { peranBoleh, PERAN_PENGELOLA } from "@/lib/gerbang-peran";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    // Syaratnya dulu `role !== 'ADMIN'`, yang MENOLAK `SUPER_ADMIN` — sama
    // dengan kesalahan yang sudah diperbaiki di `admin/users/delete` dan
    // `admin/billboards/create`.
    if (!session || !peranBoleh(PERAN_PENGELOLA, session.user.role)) {
        return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
    }

    try {
        // `req.json()` dulu dipanggil DI LUAR `try`. Body yang bukan JSON
        // karena itu melempar tanpa penangkap: Next menjawabnya sebagai galat
        // runtime, bukan 400, dan jejaknya masuk log sebagai kerusakan server.
        const hasilBody = await bacaBodyJson(req, 'admin/billboards/rollback');
        if (!hasilBody.ok) return hasilBody.jawaban;
        const { historyId: historyIdMentah } = hasilBody.body;

        // Satu-satunya route di `admin/billboards` yang dulu tidak memeriksa
        // pengenalnya sama sekali — bukan tipe, bukan pula keberadaannya.
        // `undefined` di dalam `where` milik `findUnique` adalah galat
        // validasi, dan objek `{"not":""}` pun begitu; keduanya muncul ke admin
        // sebagai "Gagal Rollback" yang sama.
        const historyId = idDariBody(historyIdMentah);
        if (historyId === null) {
            return NextResponse.json({ message: "ID riwayat tidak valid." }, { status: 400 });
        }

        // 1. Ambil data history
        const history = await prisma.billboardHistory.findUnique({
            where: { id: historyId }
        });

        if (!history) return NextResponse.json({ message: "History not found" }, { status: 404 });

        // SELURUH pembacaan snapshot ada di `src/lib/snapshot-billboard.ts`,
        // bukan di sini. Alasannya bukan kerapian: route pratinjau diff
        // (`admin/billboards/rollback/preview`) HARUS membaca snapshot dengan
        // kode yang sama dengan yang menuliskannya. Pratinjau yang punya
        // pembacanya sendiri bisa menyimpang, dan pratinjau yang menyimpang
        // memperlihatkan admin perubahan yang bukan perubahan yang terjadi —
        // lebih berbahaya daripada tidak ada pratinjau sama sekali.
        const hasilSnapshot = bacaSnapshotBillboard(history.snapshot, historyId);
        if (!hasilSnapshot.ok) {
            if (hasilSnapshot.log) {
                console.error(`[billboards/rollback] ${hasilSnapshot.log}`);
            }
            return NextResponse.json(
                { message: hasilSnapshot.pesan },
                { status: hasilSnapshot.status }
            );
        }
        const kolom = hasilSnapshot.kolom;


        // 2. Arsipkan keadaan SEKARANG, lalu pulihkan — dalam satu transaksi
        //
        // KENAPA HARUS ADA ARSIPNYA
        // -------------------------
        // Rollback dulu hanya menimpa billboard dan tidak menulis satu baris
        // riwayat pun, padahal `api/admin/billboards/update` selalu menulisnya.
        // Akibatnya rollback adalah SATU-SATUNYA operasi di modul ini yang
        // menghancurkan data tanpa meninggalkan salinannya: versi yang ditimpa
        // hilang untuk selamanya, dan rollback itu sendiri tidak bisa
        // dibatalkan. Admin yang salah memilih baris riwayat — dua baris
        // berurutan tampak mirip di layar — tidak punya jalan kembali.
        //
        // Sekarang setiap rollback menyisakan jejaknya sendiri, jadi ia bisa
        // di-rollback lagi seperti perubahan biasa.
        //
        // KENAPA HARUS SATU TRANSAKSI
        // ---------------------------
        // Pembacaan di langkah 1 dan penulisan di sini dulu terpisah: di antara
        // keduanya, admin lain bisa menyunting billboard yang sama. Snapshot
        // yang dibaca menjadi usang, dan rollback menimpa perubahan yang bahkan
        // belum sempat terbaca — tanpa peringatan apa pun.
        //
        // `updateMany` dengan `updatedAt: sebelum.updatedAt` adalah gerbang
        // bandingkan-lalu-tukar: bila ada yang menyunting di sela itu, nilainya
        // sudah berubah, `count` menjadi 0, dan seluruh transaksi dibatalkan.
        const hasil = await prisma.$transaction(async (tx) => {
            const sebelum = await tx.billboard.findUnique({
                where: { id: history.billboardId },
            });

            // Billboard-nya bisa sudah dihapus sejak riwayat ini ditulis.
            // `BillboardHistory` ber-`onDelete: Cascade`, jadi ini hanya
            // mungkin terjadi pada balapan — tapi 404 yang jelas lebih baik
            // daripada galat relasi yang tidak terbaca.
            if (!sebelum) return { jenis: 'hilang' as const };

            await tx.billboardHistory.create({
                data: {
                    billboardId: sebelum.id,
                    title: sebelum.title,
                    price: sebelum.price,
                    status: sebelum.status,
                    changedById: session.user.id,
                    // `snapshot` bertipe String, jadi `JSON.stringify` di sini
                    // BENAR — sama dengan yang dilakukan `update/route.ts`.
                    // Bentuknya pun harus sama: rollback berikutnya membaca
                    // baris ini dengan pembaca yang sama.
                    snapshot: JSON.stringify({ ...sebelum }),
                },
            });

            const { count } = await tx.billboard.updateMany({
                where: {
                    id: history.billboardId,
                    // Gerbang balapan. Tanpa ini, suntingan yang datang antara
                    // pembacaan dan penulisan tertimpa tanpa jejak.
                    updatedAt: sebelum.updatedAt,
                },
                data: {
                    title: history.title,
                    price: history.price,
                    status: history.status,
                    // Balikin data dari snapshot JSON
                    address: kolom.address,
                    sku: kolom.sku,
                    type: kolom.type,
                    mainImage: kolom.mainImage,
                    lat: kolom.lat,
                    lng: kolom.lng,
                    slug: kolom.slug,

                    // Ketujuh kolom di bawah dulu tidak ikut, sehingga setiap
                    // rollback meninggalkan baris yang mencampur dua versi.
                    // Keempat kolom JSON bertipe jsonb — array masuk apa adanya,
                    // TANPA `JSON.stringify` (membungkusnya akan menyimpan teks
                    // JSON di dalam jsonb, dan pembacanya harus mengurai dua kali).
                    specs: kolom.specs,
                    includes: kolom.includes,
                    excludes: kolom.excludes,
                    gallery: kolom.gallery,
                    smartsucoUrl: kolom.smartsucoUrl,
                    videoUrl: kolom.videoUrl,
                    publishStatus: kolom.publishStatus,

                    updatedById: session.user.id, // Ditandai rollback oleh admin yg klik
                },
            });

            if (count === 0) return { jenis: 'balapan' as const };
            return { jenis: 'berhasil' as const };
        });

        if (hasil.jenis === 'hilang') {
            return NextResponse.json(
                { message: "Billboard-nya sudah tidak ada, rollback dibatalkan." },
                { status: 404 }
            );
        }

        if (hasil.jenis === 'balapan') {
            return NextResponse.json(
                {
                    message:
                        "Billboard ini baru saja disunting orang lain. Muat ulang halamannya " +
                        "dan pilih lagi riwayat yang ingin dipulihkan — rollback dibatalkan " +
                        "agar perubahan itu tidak tertimpa tanpa terbaca.",
                },
                { status: 409 }
            );
        }

        // 3. Baris riwayat yang dipulihkan SENGAJA tidak dihapus: ia tetap
        // menjadi jejak bahwa versi itu pernah ada, dan kini berdampingan
        // dengan arsip keadaan yang baru saja digantikannya.

        return NextResponse.json({ message: "Rollback Berhasil" });
    } catch (e) {
        // `slug` dan `sku` keduanya unik. Snapshot yang memulihkan nilai yang
        // sementara ini sudah dipakai billboard lain ditolak database, dan
        // tanpa cabang ini admin hanya membaca "Gagal Rollback" — tidak ada
        // petunjuk bahwa yang perlu diubah adalah billboard YANG LAIN.
        if (adalahDuplikatUnik(e, 'slug')) {
            return NextResponse.json(
                {
                    message:
                        "Link URL (slug) di snapshot ini sedang dipakai billboard lain, " +
                        "jadi rollback dibatalkan. Ubah slug billboard itu dulu.",
                },
                { status: 409 }
            );
        }
        if (adalahDuplikatUnik(e, 'sku')) {
            return NextResponse.json(
                {
                    message:
                        "SKU di snapshot ini sedang dipakai billboard lain, jadi rollback " +
                        "dibatalkan. Ubah SKU billboard itu dulu.",
                },
                { status: 409 }
            );
        }

        console.error('[billboards/rollback] Gagal memulihkan data billboard:', e);
        return NextResponse.json({ message: "Gagal Rollback" }, { status: 500 });
    }
}