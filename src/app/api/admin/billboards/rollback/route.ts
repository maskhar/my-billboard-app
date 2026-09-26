// src/app/api/admin/billboards/rollback/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeJsonParse } from "@/lib/safe-json";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    // Syaratnya dulu `role !== 'ADMIN'`, yang MENOLAK `SUPER_ADMIN` — sama
    // dengan kesalahan yang sudah diperbaiki di `admin/users/delete` dan
    // `admin/billboards/create`.
    if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
        return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
    }

    const { historyId } = await req.json();

    try {
        // 1. Ambil data history
        const history = await prisma.billboardHistory.findUnique({
            where: { id: historyId }
        });

        if (!history) return NextResponse.json({ message: "History not found" }, { status: 404 });

        // Snapshot yang rusak dulu melempar ke `catch` di bawah dan muncul
        // sebagai "Gagal Rollback" generik. Lebih buruk lagi kalau hasilnya
        // objek kosong: setiap field jadi `undefined`, dan Prisma memperlakukan
        // `undefined` sebagai "jangan ubah kolom ini" — rollback akan dilaporkan
        // BERHASIL padahal tidak ada satu pun field yang dipulihkan.
        const details = safeJsonParse<Record<string, any> | null>(
            history.snapshot,
            null,
            `BillboardHistory.snapshot id=${historyId}`
        );

        if (!details || typeof details !== 'object') {
            return NextResponse.json(
                { message: "Data snapshot rusak, rollback dibatalkan agar data tidak tercampur." },
                { status: 422 }
            );
        }

        // 2. Kembalikan data ke Billboard Utama
        await prisma.billboard.update({
            where: { id: history.billboardId },
            data: {
                title: history.title,
                price: history.price,
                status: history.status,
                // Balikin data dari snapshot JSON
                address: details.address,
                sku: details.sku,
                type: details.type,
                mainImage: details.mainImage,
                lat: details.lat,
                lng: details.lng,
                slug: details.slug,
                updatedById: session.user.id // Ditandai rollback oleh admin yg klik
            }
        });

        // 3. (Opsional) Hapus history ini karena sudah dipakai, atau biarkan saja sebagai log
        // Kita biarkan saja agar jadi jejak "Bahwa pernah dirollback"
        
        return NextResponse.json({ message: "Rollback Berhasil" });
    } catch (e) {
        return NextResponse.json({ message: "Gagal Rollback" }, { status: 500 });
    }
}