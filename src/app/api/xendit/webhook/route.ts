// src/app/api/xendit/webhook/route.ts
//
// Satu-satunya pintu yang berwenang menyatakan uang sudah masuk.
//
// Route ini sengaja tipis: seluruh urutan yang menentukan keamanan uang ada di
// `src/lib/pelunasan-webhook.ts`, supaya bisa diuji tanpa HTTP dan tanpa
// Postgres. Yang tinggal di sini hanya milik lapisan HTTP: membuktikan
// pengirimnya, menerjemahkan kegagalan menjadi status, dan mengirim email
// sesudah penulisan uang selesai.
//
// DUA HAL YANG TIDAK BOLEH HILANG DARI FILE INI
// ---------------------------------------------
// 1. Tanpa `XENDIT_CALLBACK_TOKEN`, SEMUA permintaan ditolak. Webhook yang
//    terbuka saat tokennya belum dipasang berarti siapa pun yang menebak URL ini
//    bisa menyatakan pesanan mana pun sudah dibayar.
// 2. Nilai token tidak pernah dicatat, bahkan pada penolakan. Log adalah tempat
//    rahasia paling sering bocor tanpa ada yang menyadarinya.

import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/mail';
import { keAngka, rupiah } from '@/lib/money';
import {
  GalatWebhookPembayaran,
  selesaikanDariWebhook,
  uraikanWebhookSesiSelesai,
  type NotifikasiPembayaran,
} from '@/lib/pelunasan-webhook';
import { tokenWebhookCocok } from '@/lib/xendit';

const NAMA_HEADER_TOKEN = 'x-callback-token';

/** Jawaban webhook tidak boleh disimpan cache perantara mana pun. */
const TANPA_SIMPAN = { 'Cache-Control': 'no-store' } as const;

function jawab(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: TANPA_SIMPAN });
}

export async function POST(req: Request) {
  // Gagal tertutup. `tokenWebhookCocok` sudah mencatat bahwa variabelnya belum
  // terisi tanpa menuliskan nilai apa pun.
  if (!tokenWebhookCocok(req.headers.get(NAMA_HEADER_TOKEN))) {
    console.warn('[xendit-webhook] token callback tidak cocok — permintaan ditolak.');
    return jawab({ message: 'Unauthorized' }, 401);
  }

  try {
    // Body rusak adalah penolakan permanen, bukan kegagalan server. `req.json()`
    // melempar SyntaxError yang — bila dibiarkan jatuh ke penanganan umum —
    // dijawab 500, dan provider mengulang kiriman yang tidak akan pernah sah.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new GalatWebhookPembayaran(400, 'PAYLOAD_TIDAK_SAH', 'Body webhook bukan JSON yang sah.');
    }

    const webhook = uraikanWebhookSesiSelesai(body);
    const hasil = await selesaikanDariWebhook(webhook);

    if (hasil.keadaan === 'DIABAIKAN') {
      // Sesi yang tidak dikenal bukan kegagalan pengiriman: menjawab galat hanya
      // membuat provider mengulanginya tanpa akhir.
      console.warn('[xendit-webhook] sesi tidak dikenal — diabaikan.');
      return jawab({ status: 'ok', ignored: true }, 200);
    }

    if (hasil.keadaan === 'DUPLIKAT') {
      return jawab({ status: 'ok', duplicate: true }, 200);
    }

    // Email dikirim HANYA oleh permintaan yang benar-benar menulis. Di situlah
    // pengiriman ulang dari provider berhenti menggandakan surat.
    //
    // Delivery webhook wajib berakhir sesudah semua efek samping fase ini selesai.
    // Promise lepas dapat dibekukan platform serverless sesaat setelah respons
    // dikirim; hasilnya Payment sudah PAID, tetapi surat pemenang tidak pernah
    // berangkat. Notifikasi tetap bukan fakta uang: kegagalan SMTP dicatat tanpa
    // membatalkan transaksi yang sudah commit.
    try {
      await kirimNotifikasi(hasil.notifikasi);
    } catch {
      console.error('[xendit-webhook] gagal mengirim notifikasi pembayaran.');
    }

    return jawab({ status: 'ok' }, 200);
  } catch (error) {
    if (error instanceof GalatWebhookPembayaran) {
      // Kode galat ikut supaya log provider bisa dibaca tanpa menebak, tetapi
      // pesannya tidak menyebut nominal, id pesanan, atau data pembeli.
      console.warn(`[xendit-webhook] ditolak: ${error.kode}`);
      return jawab({ message: error.message, kode: error.kode }, error.status);
    }

    // Jangan mencatat objek galat mentah: galat Prisma membawa query dan nilai
    // kolom, galat parsing membawa potongan body.
    const kategori = error instanceof Error ? error.name.slice(0, 80) : 'galat-tidak-dikenal';
    console.error(`[xendit-webhook] gagal memproses webhook: ${kategori}`);
    return jawab({ message: 'Error Server', kode: 'GALAT_SERVER' }, 500);
  }
}

function labelTujuan(tujuan: string): string {
  if (tujuan === 'DP') return 'DP';
  if (tujuan === 'PELUNASAN') return 'Pelunasan';
  if (tujuan === 'TAMBAHAN') return 'Biaya tambahan';
  return 'Pembayaran penuh';
}

async function kirimNotifikasi(notifikasi: NotifikasiPembayaran): Promise<void> {
  const nomor = notifikasi.bookingId.slice(-6).toUpperCase();
  const label = labelTujuan(notifikasi.tujuan);
  const nominal = rupiah(notifikasi.jumlah);
  const detail = {
    id: notifikasi.bookingId,
    billboardTitle: notifikasi.judulBillboard,
    billboardAddress: notifikasi.alamatBillboard,
    duration: notifikasi.durasi,
    total: keAngka(notifikasi.jumlah),
    status: 'MENUNGGU VERIFIKASI ADMIN',
  };

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      subject: `[${label}] Uang Masuk: ${nominal} — Order #${nomor}`,
      title: 'Ada Pembayaran Masuk',
      message:
        `${label} sebesar <b>${nominal}</b> masuk untuk pesanan #${nomor} ` +
        `dari <b>${notifikasi.namaPembeli ?? 'pembeli'}</b>.<br/>` +
        'Silakan cek dashboard lalu tekan Verifikasi.',
      orderDetail: detail,
    });
  } else {
    console.error('[xendit-webhook] ADMIN_EMAIL belum diisi — notifikasi admin dilewati.');
  }

  // Tidak ada jeda antar-SMTP di sini: pengiriman terjadi di dalam permintaan
  // webhook, dan setiap detik tambahan mendekatkan provider ke batas waktunya.
  // Pengiriman ulang akibat batas waktu aman — delivery berikutnya membaca
  // Payment yang sudah PAID dan berhenti sebagai duplicate — tetapi tetap
  // membuat surat berangkat terlambat tanpa alasan.
  if (notifikasi.emailPembeli) {
    await sendEmail({
      to: notifikasi.emailPembeli,
      subject: `${label} diterima — Order #${nomor}`,
      title: `${label} Telah Diterima`,
      message:
        `Terima kasih, ${label.toLowerCase()} sebesar <b>${nominal}</b> sudah masuk ke sistem kami. ` +
        'Tim Admin akan memverifikasi dalam waktu singkat.',
      orderDetail: { ...detail, status: 'SEDANG DIVERIFIKASI' },
    });
  }
}
