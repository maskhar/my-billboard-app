// src/app/api/booking/request-refund/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// API PERMOHONAN REFUND (server-side only)
//
// Dua tahap: step 'reason' (user menyertakan alasan) lalu step 'bank' (user
// menyertakan nomor rekening). Wajib login DAN order harus milik user yang
// sedang login pada kedua tahap.
export async function POST(req: Request) {
  // 1. Wajib login
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Login dulu" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_API_URL || "http://localhost:4001";

  try {
    const body = await req.json();
    const { step, orderId } = body ?? {};

    if (!orderId) {
      return NextResponse.json({ message: "orderId wajib diisi" }, { status: 400 });
    }
    if (step !== "reason" && step !== "bank") {
      return NextResponse.json({ message: "Invalid step" }, { status: 400 });
    }

    // 2. Order harus benar milik user yang sedang login
    const userId = (session.user as unknown as { id: string }).id;
    const order = await prisma.booking.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }
    if (order.userId !== userId) {
      console.warn(`⛔ [REFUND] ${session.user.email} meminta refund order milik user lain: ${orderId}`);
      return NextResponse.json({ message: "Order ini bukan milik Anda" }, { status: 403 });
    }

    // 3. Whitelist payload sesuai step - jangan teruskan body mentah dari client
    const payload: Record<string, unknown> =
      step === "reason"
        ? { step, orderId, reason: body.reason }
        : { step, orderId, bankName: body.bankName, bankAccount: body.bankAccount };

    console.log(`💸 [REFUND] step=${step} untuk order:`, orderId);

    // 4. Teruskan ke backend (logika bisnis tetap di backend)
    const res = await fetch(`${backendUrl}/api/bookings/request-refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    // 5. teruskan hasil backend apa adanya
    if (!res.ok) {
      const msg = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message || `Error tidak diketahui (HTTP ${res.status})`;
      return NextResponse.json({ message: msg }, { status: res.status });
    }

    return NextResponse.json(data ?? { message: "Permintaan diproses" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("🔥 Server Error (Request Refund):", reason);
    return NextResponse.json({ message: "Server Error" }, { status: 500 });
  }
}
