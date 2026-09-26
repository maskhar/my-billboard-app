// src/lib/pelunasan-webhook.ts
//
// Satu-satunya tempat yang mengubah tagihan Pembayaran Otomatis menjadi PAID.
// Browser hanya membuka komponen dan menyegarkan UI; bukti uang masuk hanya
// datang dari webhook Payment Session yang sudah lolos token callback Xendit.

import 'server-only';

import { BookingStatus, PaymentStatus, Prisma } from '@prisma/client';
import { adalahDuplikatUnik } from './db-error';
import { keDecimal, lebihKecil, nol } from './money';
import { prisma as prismaAsli } from './prisma';
import { transisiSah } from './transisi-status';

const EVENT_SELESAI = 'payment_session.completed';
const STATUS_SELESAI = 'COMPLETED';
const MATA_UANG = 'IDR';
const JENIS_SESI = 'PAY';
const MODE_KOMPONEN = 'COMPONENTS';

export class GalatWebhookPembayaran extends Error {
  constructor(
    readonly status: number,
    readonly kode: string,
    pesan: string
  ) {
    super(pesan);
    this.name = 'GalatWebhookPembayaran';
  }
}

export type WebhookSesiSelesai = {
  event: typeof EVENT_SELESAI;
  created: string | null;
  data: {
    paymentSessionId: string;
    referenceId: string;
    paymentId: string;
    status: typeof STATUS_SELESAI;
    currency: typeof MATA_UANG;
    sessionType: typeof JENIS_SESI;
    mode: typeof MODE_KOMPONEN;
    amount: Prisma.Decimal;
    /** Data provider yang aman untuk audit; SDK key sengaja tidak ikut. */
    callbackPayload: Prisma.InputJsonValue;
  };
};

type BarisBooking = {
  id: string;
  status: BookingStatus;
  paidAt: Date | null;
  user: { email: string; name: string | null };
  billboard: { title: string; address: string };
  duration: number;
};

type BarisPayment = {
  id: string;
  bookingId: string;
  tujuan: string;
  status: PaymentStatus;
  jumlah: Prisma.Decimal;
  providerReferenceId: string | null;
  providerSessionId: string | null;
  providerPaymentId: string | null;
  booking: BarisBooking;
};

type TabelPaymentWebhook = {
  findFirst(args: unknown): Promise<BarisPayment | null>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

type TabelBookingWebhook = {
  updateMany(args: unknown): Promise<{ count: number }>;
};

export type DbPelunasanWebhook = {
  payment: TabelPaymentWebhook;
  $transaction<T>(
    kerja: (tx: { payment: TabelPaymentWebhook; booking: TabelBookingWebhook }) => Promise<T>
  ): Promise<T>;
};

export type DepsPelunasanWebhook = {
  db: DbPelunasanWebhook;
  sekarang: () => Date;
};

export type DepsSebagianPelunasanWebhook = Omit<Partial<DepsPelunasanWebhook>, 'db'> & {
  db?: Partial<DbPelunasanWebhook>;
};

function depsBawaan(): DepsPelunasanWebhook {
  return {
    db: prismaAsli as unknown as DbPelunasanWebhook,
    sekarang: () => new Date(),
  };
}

function gabungDeps(depsSebagian?: DepsSebagianPelunasanWebhook): DepsPelunasanWebhook {
  const bawaan = depsBawaan();
  if (!depsSebagian) return bawaan;

  const { db, ...sisa } = depsSebagian;
  return {
    ...bawaan,
    ...sisa,
    db: { ...bawaan.db, ...db },
  };
}

function teksWajib(nilai: unknown, nama: string): string {
  if (typeof nilai !== 'string' || nilai.trim().length === 0) {
    throw new GalatWebhookPembayaran(400, 'PAYLOAD_TIDAK_SAH', `${nama} wajib diisi.`);
  }
  return nilai;
}

function objek(nilai: unknown, nama: string): Record<string, unknown> {
  if (!nilai || typeof nilai !== 'object' || Array.isArray(nilai)) {
    throw new GalatWebhookPembayaran(400, 'PAYLOAD_TIDAK_SAH', `${nama} harus berupa objek.`);
  }
  return nilai as Record<string, unknown>;
}

/**
 * Urai persis event yang berwenang melunasi tagihan.
 *
 * Webhook Payment Session mengirim `amount` sebagai string, sedangkan jawaban
 * POST /sessions mengirimnya sebagai number. Keduanya diterima, lalu tetap
 * dibandingkan tepat dengan nilai Decimal yang tersimpan pada Payment.
 */
export function uraikanWebhookSesiSelesai(body: unknown): WebhookSesiSelesai {
  const envelope = objek(body, 'Webhook');
  const event = teksWajib(envelope.event, 'event');
  if (event !== EVENT_SELESAI) {
    throw new GalatWebhookPembayaran(400, 'EVENT_TIDAK_DIDUKUNG', 'Event webhook tidak didukung.');
  }

  const data = objek(envelope.data, 'data');
  const status = teksWajib(data.status, 'data.status');
  const currency = teksWajib(data.currency, 'data.currency');
  const sessionType = teksWajib(data.session_type, 'data.session_type');
  const mode = teksWajib(data.mode, 'data.mode');

  if (status !== STATUS_SELESAI || currency !== MATA_UANG || sessionType !== JENIS_SESI || mode !== MODE_KOMPONEN) {
    throw new GalatWebhookPembayaran(400, 'SESI_TIDAK_SESUAI', 'Status sesi tidak sesuai untuk pelunasan.');
  }

  const amountMentah = data.amount;
  if (
    !(
      (typeof amountMentah === 'string' && amountMentah.trim().length > 0) ||
      (typeof amountMentah === 'number' && Number.isFinite(amountMentah))
    )
  ) {
    throw new GalatWebhookPembayaran(400, 'NOMINAL_TIDAK_SAH', 'Nominal webhook tidak sah.');
  }

  const amount = keDecimal(amountMentah);
  if (!amount.isFinite() || nol(amount) || lebihKecil(amount, 0)) {
    throw new GalatWebhookPembayaran(400, 'NOMINAL_TIDAK_SAH', 'Nominal webhook tidak sah.');
  }

  const paymentSessionId = teksWajib(data.payment_session_id, 'data.payment_session_id');
  const referenceId = teksWajib(data.reference_id, 'data.reference_id');
  const paymentId = teksWajib(data.payment_id, 'data.payment_id');

  // Jangan simpan payload mentah. `components_sdk_key` dapat hadir di schema
  // webhook provider dan tidak boleh bertahan di database, log, atau backup.
  const callbackPayload: Prisma.InputJsonValue = {
    event,
    created: typeof envelope.created === 'string' ? envelope.created : null,
    data: {
      payment_session_id: paymentSessionId,
      reference_id: referenceId,
      payment_id: paymentId,
      status,
      currency,
      session_type: sessionType,
      mode,
      amount: amount.toString(),
    },
  };

  return {
    event: EVENT_SELESAI,
    created: typeof envelope.created === 'string' ? envelope.created : null,
    data: {
      paymentSessionId,
      referenceId,
      paymentId,
      status: STATUS_SELESAI,
      currency: MATA_UANG,
      sessionType: JENIS_SESI,
      mode: MODE_KOMPONEN,
      amount,
      callbackPayload,
    },
  };
}

export type HasilPelunasanWebhook =
  | { keadaan: 'DISELESAIKAN'; notifikasi: NotifikasiPembayaran }
  | { keadaan: 'DUPLIKAT' }
  | { keadaan: 'DIABAIKAN' };

export type NotifikasiPembayaran = {
  bookingId: string;
  emailPembeli: string;
  namaPembeli: string | null;
  judulBillboard: string;
  alamatBillboard: string;
  durasi: number;
  tujuan: string;
  jumlah: Prisma.Decimal;
};

function notifikasiDari(payment: BarisPayment): NotifikasiPembayaran {
  return {
    bookingId: payment.booking.id,
    emailPembeli: payment.booking.user.email,
    namaPembeli: payment.booking.user.name,
    judulBillboard: payment.booking.billboard.title,
    alamatBillboard: payment.booking.billboard.address,
    durasi: payment.booking.duration,
    tujuan: payment.tujuan,
    jumlah: payment.jumlah,
  };
}

function paymentSama(payment: BarisPayment, webhook: WebhookSesiSelesai): boolean {
  return (
    payment.providerSessionId === webhook.data.paymentSessionId &&
    payment.providerReferenceId === webhook.data.referenceId
  );
}

/**
 * Tulis fakta uang dan perpindahan status dalam satu transaksi.
 *
 * `providerPaymentId` unik menjadi pagar terakhir: satu transaksi provider tidak
 * boleh menyelesaikan dua tagihan, bahkan bila data provider rusak atau webhook
 * terkirim dengan pasangan reference/session yang tidak semestinya.
 */
export async function selesaikanDariWebhook(
  webhook: WebhookSesiSelesai,
  depsSebagian?: DepsSebagianPelunasanWebhook
): Promise<HasilPelunasanWebhook> {
  const deps = gabungDeps(depsSebagian);

  try {
    return await deps.db.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({
        where: {
          OR: [
            { providerSessionId: webhook.data.paymentSessionId },
            { providerReferenceId: webhook.data.referenceId },
          ],
        },
        include: {
          booking: {
            include: { user: true, billboard: true },
          },
        },
      });

      // Salah satu identifier yang cocok tidak cukup. Keduanya harus menunjuk
      // baris yang sama agar reference dari sesi A tidak bisa melunasi sesi B.
      if (!payment || !paymentSama(payment, webhook)) return { keadaan: 'DIABAIKAN' };

      if (!keDecimal(payment.jumlah).equals(webhook.data.amount)) {
        throw new GalatWebhookPembayaran(400, 'NOMINAL_TIDAK_SESUAI', 'Nominal webhook tidak sesuai tagihan.');
      }

      if (payment.status === PaymentStatus.PAID) {
        if (payment.providerPaymentId !== webhook.data.paymentId) {
          throw new GalatWebhookPembayaran(409, 'KONFLIK_PAYMENT_ID', 'Payment provider tidak sesuai tagihan.');
        }
        return { keadaan: 'DUPLIKAT' };
      }

      if (payment.status !== PaymentStatus.PENDING) {
        throw new GalatWebhookPembayaran(409, 'TAGIHAN_TIDAK_MENUNGGU', 'Tagihan tidak lagi menunggu pembayaran.');
      }

      if (!transisiSah(payment.booking.status, BookingStatus.PAID_CONFIRMED)) {
        throw new GalatWebhookPembayaran(409, 'STATUS_PESANAN_TIDAK_SESUAI', 'Status pesanan tidak dapat dilunasi.');
      }

      const sekarang = deps.sekarang();
      const paymentTertulis = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: PaymentStatus.PENDING,
          providerSessionId: webhook.data.paymentSessionId,
          providerReferenceId: webhook.data.referenceId,
          providerPaymentId: null,
        },
        data: {
          status: PaymentStatus.PAID,
          paidAt: sekarang,
          providerPaymentId: webhook.data.paymentId,
          callbackPayload: webhook.data.callbackPayload,
        },
      });

      if (paymentTertulis.count === 0) {
        // Transaction lain menang. Ia dibaca pada delivery webhook berikutnya;
        // jangan mengirim email dari jalur yang tidak benar-benar menulis.
        throw new GalatWebhookPembayaran(409, 'PEMBAYARAN_SEDANG_DIPROSES', 'Pembayaran sedang diproses.');
      }

      const bookingTertulis = await tx.booking.updateMany({
        where: { id: payment.booking.id, status: payment.booking.status },
        data: {
          status: BookingStatus.PAID_CONFIRMED,
          paidAt: payment.booking.paidAt ?? sekarang,
        },
      });

      if (bookingTertulis.count === 0) {
        throw new GalatWebhookPembayaran(409, 'PESANAN_SEDANG_DIPROSES', 'Pesanan sedang diproses.');
      }

      return { keadaan: 'DISELESAIKAN', notifikasi: notifikasiDari(payment) };
    });
  } catch (error) {
    if (error instanceof GalatWebhookPembayaran) throw error;

    if (adalahDuplikatUnik(error, 'providerPaymentId')) {
      throw new GalatWebhookPembayaran(
        409,
        'KONFLIK_PAYMENT_ID',
        'Payment provider sudah terhubung ke tagihan lain.'
      );
    }

    throw error;
  }
}
