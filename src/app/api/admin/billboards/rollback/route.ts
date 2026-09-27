// src/app/api/admin/billboards/rollback/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeJsonParse } from "@/lib/safe-json";
import { idDariBody } from "@/lib/id-dari-body";

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
        const { historyId: historyIdMentah } = await req.json();

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

        // 2. Kembalikan data ke Billboard Utama
        await prisma.billboard.update({
            where: { id: history.billboardId },
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
                updatedById: session.user.id // Ditandai rollback oleh admin yg klik
            }
        });

        // 3. (Opsional) Hapus history ini karena sudah dipakai, atau biarkan saja sebagai log
        // Kita biarkan saja agar jadi jejak "Bahwa pernah dirollback"
        
        return NextResponse.json({ message: "Rollback Berhasil" });
    } catch (e) {
        console.error('[billboards/rollback] Gagal memulihkan data billboard:', e);
        return NextResponse.json({ message: "Gagal Rollback" }, { status: 500 });
    }
}