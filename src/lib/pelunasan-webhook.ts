// src/lib/pelunasan-webhook.ts
//
// Satu-satunya tempat yang mengubah tagihan Pembayaran Otomatis menjadi PAID.
// Browser hanya membuka komponen dan menyegarkan UI; bukti uang masuk hanya
// datang dari webhook Payment Session yang sudah lolos token callback Xendit.

import 'server-only';

import { BookingStatus, PaymentStatus, PaymentTujuan, Prisma } from '@prisma/client';
import { adalahDuplikatUnik } from './db-error';
import { keDecimal, lebihBesar, lebihKecil, nol } from './money';
import {
  STATUS_BOLEH_BAYAR_LANJUTAN,
  bayarLanjutan,
  sisaTagihan,
  tenggatPelunasan,
  type BarisPembayaran,
} from './pembayaran';
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
  /** Acuan tenggat pelunasan H-3 — lihat `tenggatPelunasan`. */
  startDate: Date;
  totalPrice: Prisma.Decimal;
  user: { email: string; name: string | null };
  billboard: { title: string; address: string };
  duration: number;
};

type BarisPayment = {
  id: string;
  bookingId: string;
  tujuan: PaymentTujuan;
  status: PaymentStatus;
  jumlah: Prisma.Decimal;
  providerReferenceId: string | null;
  providerSessionId: string | null;
  providerPaymentId: string | null;
  booking: BarisBooking;
};

type TabelPaymentWebhook = {
  findFirst(args: unknown): Promise<BarisPayment | null>;
  /**
   * Generik karena dipakai dua pembacaan dengan `select` berbeda: menghitung sisa
   * pokok (`BarisPembayaran`) dan mencari tagihan kembar (`id` +
   * `providerSessionId`). Bentuknya ditentukan pemanggil, bukan dipaksa satu.
   */
  findMany<T = BarisPembayaran>(args: unknown): Promise<T[]>;
  create(args: unknown): Promise<{ id: string }>;
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
  /**
   * Sisa pokok SESUDAH pembayaran ini tercatat, supaya surat tidak menagih uang
   * yang baru saja diterima.
   */
  sisaPokok: Prisma.Decimal;
  /** Tenggat pelunasan H-3; null bila tidak ada sisa pokok lagi. */
  tenggatPelunasan: Date | null;
  /** Status pesanan saat uang ini masuk. Ikut di surat yang perlu ditinjau. */
  statusPesanan: BookingStatus;
  /**
   * Alasan uang ini perlu DITINJAU ADMIN, atau `null` bila semuanya wajar.
   *
   * Uang yang sudah diterima gerbang pembayaran selalu dicatat — tidak ada
   * keadaan di mana menolaknya membuat uangnya kembali sendiri kepada pembeli.
   * Yang bisa dilakukan sistem adalah MENANDAI keadaan yang tidak semestinya
   * terjadi, dan penandaannya harus sampai ke manusia lewat surat, bukan berhenti
   * sebagai baris log yang tidak ada yang membacanya.
   */
  perluTinjauAdmin: AlasanTinjau | null;
};

/** Sebab sebuah setoran masuk ke dalam keadaan yang perlu ditinjau manusia. */
export type AlasanTinjau =
  /**
   * Pembayaran lanjutan masuk pada pesanan yang seharusnya tidak lagi menerima
   * uang: pesanan yang sedang direfund, sudah direfund, atau sudah dibatalkan.
   */
  | 'PESANAN_TIDAK_MENERIMA_BAYAR'
  /**
   * Tagihannya sudah ditutup (`EXPIRED`/`VOIDED`) sebelum uangnya tiba. Terjadi
   * ketika sesi dinyatakan mati berdasarkan tenggat sementara pembayarannya
   * masih berjalan di sisi bank.
   */
  | 'TAGIHAN_SUDAH_DITUTUP'
  /**
   * Uang terlambat mendarat di tagihan lama, dan tagihan PENGGANTI atas
   * kewajiban yang sama sudah punya sesi terbuka. Baris itu tidak ditutup
   * otomatis karena uang mungkin sedang mengalir ke sana juga — dua sesi hidup
   * atas satu kewajiban yang kini sudah lunas, dan hanya manusia yang bisa
   * memutuskan mana yang perlu dikembalikan.
   */
  | 'KEMBAR_BERSESI_TERBUKA';

function notifikasiDari(
  payment: BarisPayment,
  sisaPokok: Prisma.Decimal,
  perluTinjauAdmin: AlasanTinjau | null
): NotifikasiPembayaran {
  return {
    bookingId: payment.booking.id,
    emailPembeli: payment.booking.user.email,
    namaPembeli: payment.booking.user.name,
    judulBillboard: payment.booking.billboard.title,
    alamatBillboard: payment.booking.billboard.address,
    durasi: payment.booking.duration,
    tujuan: payment.tujuan,
    jumlah: payment.jumlah,
    sisaPokok,
    tenggatPelunasan: lebihBesar(sisaPokok, 0)
      ? tenggatPelunasan(payment.booking.startDate)
      : null,
    statusPesanan: payment.booking.status,
    perluTinjauAdmin,
  };
}

/**
 * Terbitkan tagihan pelunasan bila masih ada sisa pokok. Kembalikan sisa itu.
 *
 * Dipanggil DI DALAM transaksi yang baru saja menandai sebuah tagihan PAID, jadi
 * pembacaan di bawah sudah melihat setoran terbaru. Di sinilah pembeli DP
 * mendapat jalur melunasi: tanpa ini tidak ada kode mana pun yang pernah menulis
 * baris `Payment` bertujuan PELUNASAN, sehingga panel "Sisa Yang Harus Dilunasi"
 * di kartu pesanan adalah angka tanpa tombol.
 *
 * Syaratnya "masih ada sisa pokok", BUKAN `tujuan === DP`. Dengan begitu `FULL`
 * yang lunas tidak menerbitkan apa pun tanpa perlu cabang sendiri, dan sebuah
 * pelunasan sebagian (bila suatu saat diizinkan) tetap menghasilkan tagihan
 * lanjutan yang benar.
 *
 * `TAMBAHAN` dilewati sepenuhnya: biaya tambahan berada DI LUAR `totalPrice`,
 * jadi membayarnya tidak mengubah sisa pokok dan tidak boleh memicu tagihan
 * pokok baru.
 *
 * `bolehTerbitkan: false` membuat fungsi ini hanya MENGHITUNG sisanya. Dipakai
 * ketika uang tiba pada pesanan yang sudah tidak menerima pembayaran: sisanya
 * tetap perlu untuk surat notifikasi, tetapi menerbitkan tagihannya berarti
 * menagih kewajiban yang sudah tidak ada pada pesanan yang justru sedang
 * direfund atau dibatalkan.
 */
async function terbitkanPelunasanBila(
  tx: { payment: TabelPaymentWebhook },
  payment: BarisPayment,
  bolehTerbitkan = true
): Promise<Prisma.Decimal> {
  const seluruhTagihan = await tx.payment.findMany({
    where: { bookingId: payment.booking.id },
    select: { tujuan: true, status: true, jumlah: true },
  });

  const sisa = sisaTagihan(payment.booking.totalPrice, seluruhTagihan);

  if (!bolehTerbitkan) return sisa;
  if (payment.tujuan === PaymentTujuan.TAMBAHAN) return sisa;
  if (!lebihBesar(sisa, 0)) return sisa;

  // Indeks unik bersyarat `payment_satu_tagihan_menganggur` hanya mengizinkan
  // SATU baris PENDING per (bookingId, tujuan). Keberadaannya diperiksa di sini,
  // bukan dengan menangkap P2002 sesudahnya: di Postgres, galat di tengah
  // transaksi membuat transaksi itu aborted, sehingga query berikutnya gagal dan
  // `catch` tidak menyelamatkan apa pun.
  //
  // Bila dua penulis paralel tetap bertemu di indeks itu, seluruh transaksi ini
  // rollback — termasuk penandaan PAID — dan delivery webhook berikutnya dari
  // Xendit mengulanginya dengan bersih. Tidak ada uang yang hilang dan tidak ada
  // surat ganda, karena email hanya dikirim oleh jalur yang benar-benar commit.
  const sudahAda = seluruhTagihan.some(
    (t) => t.tujuan === PaymentTujuan.PELUNASAN && t.status === PaymentStatus.PENDING
  );
  if (sudahAda) return sisa;

  await tx.payment.create({
    data: {
      bookingId: payment.booking.id,
      tujuan: PaymentTujuan.PELUNASAN,
      jumlah: sisa,
      status: PaymentStatus.PENDING,
    },
    select: { id: true },
  });

  return sisa;
}

/**
 * Tutup tagihan KEMBAR yang menganggur setelah sebuah tagihan tertutup dibayar.
 *
 * Hanya perlu pada jalur pemulihan. Pada jalur normal, indeks unik bersyarat
 * `payment_satu_tagihan_menganggur` menjamin baris `PENDING` yang dibayar itu
 * satu-satunya untuk pasangan `(bookingId, tujuan)`-nya, jadi tidak ada kembar
 * yang bisa ada.
 *
 * Jalur pemulihan berbeda: baris yang dibayar tadi sudah `EXPIRED` atau
 * `VOIDED`, dan justru karena itu sebuah baris PENGGANTI boleh dibuat
 * (`tutupLaluBukaUlang` di `sesi-pembayaran.ts`). Ketika uang yang terlambat
 * akhirnya masuk ke baris lama, pengganti itu menjadi tagihan atas kewajiban
 * yang BARU SAJA dibayar — dan pembeli yang menekan tombol Bayar di sana
 * membayar dua kali untuk satu hal.
 *
 * Pengganti yang sesinya SUDAH dibuka tidak ikut ditutup: uang mungkin sedang
 * masuk ke sana pada detik ini juga, dan baris yang tertutup tidak bisa
 * menampungnya. Keadaan itu dikembalikan sebagai `false` agar pemanggil
 * menandainya untuk ditinjau manusia.
 *
 * @returns `true` bila tidak ada kembar berbahaya yang tertinggal.
 */
async function tutupKembarMenganggur(
  tx: { payment: TabelPaymentWebhook },
  payment: BarisPayment
): Promise<boolean> {
  const kembar = await tx.payment.findMany<{ id: string; providerSessionId: string | null }>({
    where: {
      bookingId: payment.booking.id,
      tujuan: payment.tujuan,
      status: PaymentStatus.PENDING,
      id: { not: payment.id },
    },
    select: { id: true, providerSessionId: true },
  });

  if (kembar.length === 0) return true;

  const bisaDitutup = kembar.filter((k) => k.providerSessionId === null).map((k) => k.id);

  if (bisaDitutup.length > 0) {
    await tx.payment.updateMany({
      where: { id: { in: bisaDitutup }, status: PaymentStatus.PENDING, providerSessionId: null },
      data: {
        status: PaymentStatus.VOIDED,
        sesiClaimToken: null,
        sesiClaimedAt: null,
        sesiClaimExpiresAt: null,
      },
    });
  }

  return bisaDitutup.length === kembar.length;
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

      // ================== UANG YANG SUDAH MASUK SELALU DICATAT ==================
      //
      // Dua gerbang di bawah ini dulu MELEMPAR 409, dan keduanya melempar untuk
      // keadaan yang uangnya SUDAH BERADA DI XENDIT. Menolak webhook tidak
      // mengembalikan uang itu kepada pembeli; yang terjadi hanyalah Xendit
      // mengulang kiriman sampai berhenti mencoba, lalu setoran nyata itu tidak
      // punya satu baris pun di pembukuan kita. Pembeli membayar, kami tidak
      // mencatat, dan tagihannya masih terbuka — jadi ia ditagih lagi.
      //
      // Dua keadaan yang dimaksud, keduanya BUKAN hipotesis:
      //
      // 1. TAGIHAN SUDAH DITUTUP. `ambilSesiAktifUntukKomponen` menyatakan sesi
      //    `MATI` ketika tenggatnya lewat lebih dari 10 menit — sebuah DUGAAN
      //    dari jam, bukan fakta dari Xendit. Virtual account yang dibayar di
      //    menit terakhir bisa baru diselesaikan bank sesudah itu. Barisnya sudah
      //    `EXPIRED` (`tutupLaluBukaUlang`), lalu webhooknya tiba.
      //
      // 2. PESANAN TIDAK LAGI MENERIMA BAYAR. Sesi pelunasan yang sudah dibuka
      //    tidak ditutup `tutupTagihanMenganggur` (lihat `tutup-tagihan.ts`:
      //    baris bersesi sengaja ditinggalkan), jadi pembeli masih bisa
      //    menyelesaikan pembayaran di tab yang terbuka setelah pesanannya masuk
      //    jalur refund atau dibatalkan.
      //
      // Karena itu keduanya kini DICATAT lalu DITANDAI untuk ditinjau admin.
      // Perbedaannya penting: mencatat membuat uangnya ada di pembukuan dan bisa
      // dikembalikan lewat jalur refund yang sudah ada; menolak membuat uangnya
      // tidak ada di mana pun kecuali di dashboard Xendit.
      //
      // Yang TIDAK dilonggarkan: nominal tetap harus sama persis, kedua
      // identifier provider tetap harus cocok, `providerPaymentId` tetap unik,
      // dan baris yang sudah `PAID` tetap duplikat. Gerbang-gerbang itu menjaga
      // agar yang dicatat benar-benar uang ini, bukan uang lain.
      // =========================================================================
      let perluTinjau: AlasanTinjau | null = null;

      if (payment.status !== PaymentStatus.PENDING) {
        // Sisa kemungkinannya hanya EXPIRED dan VOIDED: PAID sudah ditangani di
        // atas sebagai duplikat, dan PENDING adalah jalur normal.
        perluTinjau = 'TAGIHAN_SUDAH_DITUTUP';
      }

      // TUJUAN MENENTUKAN APAKAH STATUS PESANAN BERGERAK.
      //
      // `DP` dan `FULL` adalah pembayaran PERTAMA: menerimanya berarti pesanan
      // berpindah dari "menunggu bayar" ke "sudah dibayar". Di situ
      // `PAID_CONFIRMED` adalah transisi yang benar dan harus divalidasi.
      //
      // `PELUNASAN` dan `TAMBAHAN` adalah pembayaran LANJUTAN pada pesanan yang
      // sudah berjalan, dan keduanya TIDAK memindahkan status sama sekali.
      const pembayaranPertama = !bayarLanjutan(payment.tujuan);

      // Daftar yang sama dipakai `periksaKelayakanSesi` untuk MENOLAK pembukaan
      // sesi baru. Di sini sesinya sudah dibuka dan uangnya sudah masuk, jadi
      // jawabannya tidak bisa "tidak" — hanya "catat, lalu beri tahu manusia".
      //
      // Berlaku untuk SEMUA tujuan, bukan hanya pembayaran lanjutan. `DP` pun
      // bisa tiba pada pesanan `CANCELLED`: penyapu menghanguskan pesanan yang
      // lewat tenggat 24 jam sementara sesi DP-nya sudah dibuka, dan
      // `tutupTagihanMenganggur` sengaja meninggalkan baris bersesi. Pembeli yang
      // menyelesaikan pembayaran beberapa detik kemudian mengirim uang nyata ke
      // pesanan yang baru saja dibatalkan sistem sendiri.
      //
      // `PENDING_PAYMENT` ada di dalam daftar, jadi jalur normal DP/FULL tidak
      // tersentuh sama sekali. Alasan ini menimpa `TAGIHAN_SUDAH_DITUTUP` karena
      // status pesanan menjelaskan keadaannya lebih baik daripada status barisnya.
      if (!STATUS_BOLEH_BAYAR_LANJUTAN.includes(payment.booking.status)) {
        perluTinjau = 'PESANAN_TIDAK_MENERIMA_BAYAR';
      }

      // STATUS PESANAN HANYA BERGERAK BILA PERPINDAHANNYA SAH.
      //
      // Dulu transisi yang tidak sah dijawab 409, dan itu membuang uang bersama
      // penolakannya. Sekarang uangnya tetap tercatat, hanya status pesanannya
      // yang tidak dipaksa bergerak — pesanan `CANCELLED` tidak dihidupkan
      // kembali oleh uang yang terlambat, tetapi uang itu ada di pembukuan dan
      // bisa dikembalikan lewat jalur refund yang sudah ada.
      //
      // `transisiSah(x, x)` bernilai true, jadi `DP` yang webhooknya dikirim
      // ulang pada pesanan yang sudah `PAID_CONFIRMED` tetap lolos dan tidak
      // mengubah apa pun selain memastikan `paidAt` terisi.
      const gerakkanStatus =
        pembayaranPertama && transisiSah(payment.booking.status, BookingStatus.PAID_CONFIRMED);

      const sekarang = deps.sekarang();
      const paymentTertulis = await tx.payment.updateMany({
        where: {
          id: payment.id,
          // Status yang disyaratkan adalah status yang BENAR-BENAR DIBACA di atas,
          // bukan `PENDING` mati. Pada jalur pemulihan barisnya `EXPIRED` atau
          // `VOIDED`, dan menuntut `PENDING` di sini berarti `count === 0` lalu
          // 409 — persis kegagalan yang seluruh perubahan ini ada untuk menutup.
          // Sifat compare-and-swap-nya tidak hilang: nilainya tetap harus sama
          // dengan saat dibaca, jadi penulis lain yang menang tetap terdeteksi.
          status: payment.status,
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

      if (gerakkanStatus) {
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
      }

      // TAGIHAN KEMBAR DITUTUP SETELAH UANGNYA TERCATAT, BUKAN SEBELUM.
      //
      // Hanya perlu di jalur pemulihan: `tutupLaluBukaUlang` membuat baris
      // PENGGANTI begitu baris lama dinyatakan `EXPIRED`. Ketika uang terlambat
      // justru mendarat di baris LAMA, baris pengganti itu menjadi tagihan atas
      // kewajiban yang baru saja dibayar — pembeli melihat tombol Bayar untuk
      // sesuatu yang sudah lunas.
      if (perluTinjau === 'TAGIHAN_SUDAH_DITUTUP') {
        const bersih = await tutupKembarMenganggur(tx, payment);

        // Pengganti yang sesinya sudah terbuka TIDAK ditutup — uang mungkin
        // sedang mengalir ke sana detik ini. Keadaan itu perlu mata manusia:
        // dua sesi hidup atas satu kewajiban yang sudah lunas.
        if (!bersih) perluTinjau = 'KEMBAR_BERSESI_TERBUKA';
      }

      // Tagihan pokok berikutnya hanya diterbitkan bila pesanannya memang masih
      // menerima pembayaran. Menerbitkan `PELUNASAN` pada pesanan `CANCELLED`
      // atau `REFUNDED` berarti menagih kewajiban yang sudah tidak ada, dan
      // `periksaKelayakanSesi` akan menolak pembayarannya — tagihan tanpa jalur
      // bayar, persis cacat yang fase ini ada untuk menutup.
      const sisaPokok = await terbitkanPelunasanBila(
        tx,
        payment,
        perluTinjau !== 'PESANAN_TIDAK_MENERIMA_BAYAR'
      );

      return {
        keadaan: 'DISELESAIKAN',
        notifikasi: notifikasiDari(payment, sisaPokok, perluTinjau),
      };
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
