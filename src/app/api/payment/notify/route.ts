// src/app/api/payment/notify/route.ts
//
// Endpoint lama dinonaktifkan pada saat webhook Payment Session otoritatif
// dipasang di `/api/xendit/webhook`.
//
// Jangan mengembalikan penulisan `Booking` atau `Payment` ke sini. Dua penulis
// settlement independen membuat satu pembayaran bisa punya dua jalur validasi,
// dan jalur lama menerima `orderId` yang dipilih pengirim. Semua pembayaran
// otomatis kini hanya diselesaikan oleh webhook provider yang memakai
// `x-callback-token` dan identifier sesi yang sudah dipersist server.

import { NextResponse } from 'next/server';

const TANPA_SIMPAN = { 'Cache-Control': 'no-store' } as const;

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    {
      message: 'Endpoint notifikasi lama sudah tidak digunakan.',
      kode: 'ENDPOINT_LAMA_DINONAKTIFKAN',
    },
    { status: 410, headers: TANPA_SIMPAN }
  );
}
