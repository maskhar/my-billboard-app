// src/app/api/booking/cancel/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildNextAuthCookieHeader } from "@/lib/nextauth-cookie";

// API BATAL PESANAN (server-side only)
//
// Route ini adalah satu-satunya bridge browser -> backend untuk pembatalan.
// Wajib login DAN order harus milik user yang sedang login, sehingga orderId
// milik orang lain tidak bisa dibatalkan hanya karena diketahui.
export async function POST(req: Request) {
  // 1. Wajib login
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Login dulu" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_API_URL || "http://localhost:4001";

  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ message: "orderId wajib diisi" }, { status: 400 });
    }

    // 2. Order harus benar milik user yang sedang login
    const userId = (session.user as unknown as { id: string }).id;
    const order = await prisma.booking.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }
    if (order.userId !== userId) {
      console.warn(`⛔ [CANCEL] ${session.user.email} mencoba membatalkan order milik user lain: ${orderId}`);
      return NextResponse.json({ message: "Order ini bukan milik Anda" }, { status: 403 });
    }

    console.log("🚫 [CANCEL] Menerima permintaan batal untuk order:", orderId);

    // 3. Teruskan ke backend (logika bisnis tetap di backend).
    // Cookie session NextAuth ikut diteruskan karena backend memverifikasi
    // session-nya sendiri lewat global guard. Hanya cookie next-auth yang
    // diteruskan, bukan seluruh cookie milik pengguna.
    const cookieHeader = buildNextAuthCookieHeader(await cookies());
    const res = await fetch(`${backendUrl}/api/bookings/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({ orderId }),
      cache: "no-store",
    });

    const data = await res.json().catch(() => null);

    // 4. teruskan hasil backend apa adanya
    if (!res.ok) {
      const msg = Array.isArray(data?.message)
        ? data.message.join(", ")
        : data?.message || `Error tidak diketahui (HTTP ${res.status})`;
      return NextResponse.json({ message: msg }, { status: res.status });
    }

    return NextResponse.json(data ?? { message: "Pesanan dibatalkan" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("🔥 Server Error (Cancel):", reason);
    return NextResponse.json({ message: "Server Error" }, { status: 500 });
  }
}
