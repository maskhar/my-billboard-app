// src/app/api/admin/billboards/rollback/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeJsonParse, arrayDariJson } from "@/lib/safe-json";
import { specsAman } from "@/lib/spesifikasi-billboard";
import { sahPublishStatus, daftarNilai, PublishStatus } from "@/lib/enum-guard";
import { idDariBody } from "@/lib/id-dari-body";
import { adalahDuplikatUnik } from "@/lib/db-error";
import { bacaBodyJson } from "@/lib/body-json";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    // Syaratnya dulu `role !== 'ADMIN'`, yang MENOLAK `SUPER_ADMIN` — sama
    // dengan kesalahan yang sudah diperbaiki di `admin/users/delete` dan
    // `admin/billboards/create`.
    if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
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

        // Snapshot yang rusak dulu melempar ke `catch` di bawah dan muncul
        // sebagai "Gagal Rollback" generik.
        const details = safeJsonParse<unknown>(
            history.snapshot,
            null,
            `BillboardHistory.snapshot id=${historyId}`
        );

        if (!details || typeof details !== 'object' || Array.isArray(details)) {
            return NextResponse.json(
                { message: "Data snapshot rusak, rollback dibatalkan agar data tidak tercampur." },
                { status: 422 }
            );
        }

        // SETIAP FIELD DIPERIKSA, BUKAN HANYA OBJEKNYA
        //
        // Ini bukan soal kerapian tipe. Snapshot ini teks JSON yang ditulis
        // versi kode mana pun sejak tabel ini ada, jadi field yang hilang adalah
        // keadaan yang nyata — bukan kemungkinan teoretis.
        //
        // Prisma memperlakukan `undefined` di dalam `data` sebagai "JANGAN UBAH
        // kolom ini". Dengan `Record<string, any>`, `details.lat` yang tidak ada
        // lolos compiler, lolos Prisma, dan `update` berhasil — koordinat
        // billboard TIDAK dipulihkan, tapi admin tetap dibalas "Rollback
        // Berhasil". Rollback yang sebagian adalah data yang tercampur antara dua
        // versi, dan tidak ada apa pun yang menandainya.
        //
        // Yang lebih halus: `lat`/`lng` bertipe Float dan `slug` unik. Snapshot
        // lama yang menyimpan koordinat sebagai teks ("-6.2") diterima compiler
        // lewat `any`, lalu ditolak database sebagai galat validasi — 500 "Gagal
        // Rollback" tanpa menyebut field mana yang salah.
        const isi = details as Record<string, unknown>;

        const teks = (kunci: string): string | null => {
            const nilai = isi[kunci];
            if (typeof nilai !== 'string') return null;
            const rapi = nilai.trim();
            return rapi === '' ? null : rapi;
        };

        const angka = (kunci: string): number | null => {
            const nilai = isi[kunci];
            // `Number.isFinite`, bukan `typeof === 'number'`: `NaN` dan
            // `Infinity` bertipe number dan ditolak kolom Float.
            return typeof nilai === 'number' && Number.isFinite(nilai) ? nilai : null;
        };

        const address = teks('address');
        const type = teks('type');
        const mainImage = teks('mainImage');
        const slug = teks('slug');
        const lat = angka('lat');
        const lng = angka('lng');

        const hilang: string[] = [];
        // Daftar ini hanya untuk PESANnya. Penyempitan tipenya dilakukan
        // terpisah di bawah lewat satu `if` eksplisit: TypeScript tidak bisa
        // menyimpulkan bahwa `address` bukan `null` dari `hilang.length === 0`,
        // dan memaksanya dengan `!` akan mengembalikan tepat lubang yang
        // pemeriksaan ini dibuat untuk menutup.
        if (address === null) hilang.push('address');
        if (type === null) hilang.push('type');
        if (mainImage === null) hilang.push('mainImage');
        if (slug === null) hilang.push('slug');
        if (lat === null) hilang.push('lat');
        if (lng === null) hilang.push('lng');

        if (
            address === null ||
            type === null ||
            mainImage === null ||
            slug === null ||
            lat === null ||
            lng === null
        ) {
            console.error(
                `[billboards/rollback] Snapshot id=${historyId} tidak lengkap: ` +
                `${hilang.join(', ')}. Rollback dibatalkan.`
            );
            return NextResponse.json(
                {
                    message:
                        `Snapshot ini tidak memuat ${hilang.join(', ')}, jadi rollback ` +
                        `dibatalkan — memulihkan sebagian akan mencampur data dua versi.`,
                },
                { status: 422 }
            );
        }

        // `sku` opsional di schema (`String?`), jadi ketidakhadirannya sah dan
        // dipulihkan sebagai `null` — BUKAN `undefined`, yang akan membiarkan sku
        // versi sekarang tertinggal setelah rollback.
        const sku = teks('sku');

        // ENAM KOLOM YANG DULU TIDAK PERNAH IKUT DIPULIHKAN
        // -------------------------------------------------
        // Snapshot ditulis dengan `JSON.stringify({ ...sebelum })` — SELURUH
        // baris billboard, termasuk `specs`, `includes`, `excludes`, `gallery`,
        // `smartsucoUrl`, `videoUrl`, dan `publishStatus`. Tapi `updateMany` di
        // bawah hanya menulis 11 kolom, jadi ketujuh sisanya tetap memakai nilai
        // versi SEKARANG setelah rollback selesai.
        //
        // Akibatnya bukan kolom yang tertinggal kosong, tapi satu baris yang
        // mencampur dua versi: harga dan alamat kembali ke versi lama sementara
        // daftar spesifikasi, galeri foto, dan status terbitnya tetap versi baru
        // — dan admin dibalas "Rollback Berhasil". Itu persis cacat yang
        // pemeriksaan field di atas dibuat untuk menutup, hanya pada kolom yang
        // waktu itu belum ikut didaftar.
        //
        // Kolom JSON dibaca lewat `arrayDariJson`, bukan langsung: snapshot lama
        // menyimpan `gallery` sebagai TEKS JSON (ditulis sebelum kolomnya
        // menjadi jsonb), yang baru menyimpannya sebagai array sungguhan.
        // `arrayDariJson` menerima kedua bentuk itu, jadi riwayat lama tetap
        // bisa dipulihkan alih-alih membuat baris jsonb yang ganda-encode.
        const specs = specsAman(
            arrayDariJson<unknown>(isi.specs, `BillboardHistory.snapshot.specs id=${historyId}`)
        );
        const daftarTeks = (kunci: string): string[] =>
            arrayDariJson<unknown>(isi[kunci], `BillboardHistory.snapshot.${kunci} id=${historyId}`)
                .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
                .map((v) => v.trim());

        const includes = daftarTeks('includes');
        const excludes = daftarTeks('excludes');
        const gallery = daftarTeks('gallery');

        // Keduanya `String?`, jadi `null` adalah pemulihan yang benar — bukan
        // `undefined`, yang berarti "jangan ubah" bagi Prisma.
        const smartsucoUrl = teks('smartsucoUrl');
        const videoUrl = teks('videoUrl');

        // `publishStatus` diperiksa terhadap enum-nya, bukan diteruskan. Snapshot
        // ditulis kode versi mana pun sejak tabel ini ada: baris yang lahir
        // sebelum kolom ini menjadi enum bisa memuat teks bebas, dan nilai asing
        // ditolak di lapisan database sebagai 500 "Gagal Rollback" tanpa menyebut
        // kolom mana yang salah.
        //
        // Ketidakhadirannya BUKAN kegagalan: snapshot yang lebih tua daripada
        // kolom ini memang tidak memuatnya. Baris seperti itu dipulihkan ke
        // `DRAFT` — pilihan yang aman, karena menerbitkan billboard yang status
        // terbitnya tidak diketahui berarti memajangnya ke publik atas dasar
        // dugaan.
        const publishStatusMentah = isi.publishStatus;
        if (publishStatusMentah !== undefined && !sahPublishStatus(publishStatusMentah)) {
            console.error(
                `[billboards/rollback] Snapshot id=${historyId} memuat publishStatus asing. ` +
                `Rollback dibatalkan.`
            );
            return NextResponse.json(
                {
                    message:
                        `Status terbit di snapshot ini tidak dikenali, jadi rollback ` +
                        `dibatalkan. Nilai yang sah: ${daftarNilai(PublishStatus)}.`,
                },
                { status: 422 }
            );
        }
        const publishStatus = sahPublishStatus(publishStatusMentah)
            ? publishStatusMentah
            : PublishStatus.DRAFT;

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
                    address,
                    sku,
                    type,
                    mainImage,
                    lat,
                    lng,
                    slug,

                    // Ketujuh kolom di bawah dulu tidak ikut, sehingga setiap
                    // rollback meninggalkan baris yang mencampur dua versi.
                    // Keempat kolom JSON bertipe jsonb — array masuk apa adanya,
                    // TANPA `JSON.stringify` (membungkusnya akan menyimpan teks
                    // JSON di dalam jsonb, dan pembacanya harus mengurai dua kali).
                    specs,
                    includes,
                    excludes,
                    gallery,
                    smartsucoUrl,
                    videoUrl,
                    publishStatus,

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