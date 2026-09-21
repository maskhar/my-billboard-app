// src/app/api/admin/billboards/rollback/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') return NextResponse.json({ message: "401" }, { status: 401 });

    const { historyId } = await req.json();

    try {
        // 1. Ambil data history
        const history = await prisma.billboardHistory.findUnique({
            where: { id: historyId }
        });

        if (!history) return NextResponse.json({ message: "History not found" }, { status: 404 });

        // Parse Snapshot JSON
        const details = JSON.parse(history.snapshot);

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