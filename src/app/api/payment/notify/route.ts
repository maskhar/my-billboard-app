// src/app/api/payment/notify/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// API NOTIFIKASI PEMBAYARAN MASUK (server-side only)
//
// Route ini adalah satu-satunya bridge browser -> backend untuk notifikasi bayar.
// PAYMENT_WEBHOOK_SECRET TIDAK PERNAH dikirim ke client: secret dibaca dari
// process.env di server lalu diteruskan sebagai header x-webhook-secret ke backend.
export async function POST(req: Request) {
  // 1. Wajib login
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Login dulu" }, { status: 401 });
  }

  // 2. Secret hanya boleh dibaca di server
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("PAYMENT_WEBHOOK_SECRET belum dikonfigurasi di server.");
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }

  const backendUrl = process.env.BACKEND_API_URL || "http://localhost:4001";

  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ message: "orderId wajib diisi" }, { status: 400 });
    }

    // 3. Order harus benar milik user yang sedang login
    const userId = (session.user as unknown as { id: string }).id;
    const order = await prisma.booking.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }
    if (order.userId !== userId) {
      console.warn(`⛔ [NOTIFY] ${session.user.email} mencoba bayar order milik user lain: ${orderId}`);
      return NextResponse.json({ message: "Order ini bukan milik Anda" }, { status: 403 });
    }

    console.log("💰 [NOTIFY] Menerima sinyal bayar untuk order:", orderId);

    // 4. Teruskan ke backend, secret lewat header saja
    const res = await fetch(`${backendUrl}/api/payments/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({ orderId }),
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

    return NextResponse.json(data ?? { status: "ok" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("🔥 Server Error (Notify):", reason);
    return NextResponse.json({ message: "Server Error" }, { status: 500 });
  }
}
