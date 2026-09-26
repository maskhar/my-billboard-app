// src/lib/sesi-pembayaran.ts
//
// Menyiapkan satu sesi Pembayaran Otomatis untuk tagihan milik pembeli.
//
// KENAPA LOGIKANYA DI SINI, BUKAN DI DALAM ROUTE
// ----------------------------------------------
// Urutan langkah di bawah adalah bagian yang paling mudah salah di seluruh alur
// uang, dan satu-satunya cara mengujinya tanpa menyentuh gerbang pembayaran
// sungguhan adalah dengan menggantikan database dan gerbangnya. Selama
// langkah-langkah ini tinggal di dalam route, ia hanya bisa diuji lewat HTTP
// dengan Postgres hidup — jadi dalam praktiknya tidak diuji sama sekali.
//
// Karena itu seluruh ketergantungan masuk lewat `Deps`: database, gerbang
// pembayaran, jam, dan pembangkit token. Route hanya menerjemahkan hasilnya
// menjadi jawaban HTTP.
//
// ======================= INVARIAN YANG MENENTUKAN SEGALANYA =======================
// KUNCI SDK HANYA DIKEMBALIKAN SETELAH ID SESI TERSIMPAN DI DATABASE.
//
// `POST /sessions` di gerbang pembayaran tidak menerima idempotency key, dan
// tidak ada endpoint untuk mencari sesi berdasarkan reference milik kita. Jadi
// bila proses mati — atau jawabannya tidak sampai — setelah sesi terbentuk tapi
// sebelum id-nya tersimpan, tidak ada cara bertanya "sesi tadi jadi atau tidak".
//
// Yang membuat keadaan itu tetap aman bukan pemulihan, melainkan urutan: sesi
// yang id-nya gagal tersimpan TIDAK PERNAH bisa dibayar siapa pun, karena kunci
// SDK-nya tidak pernah sampai ke browser mana pun. Ia hanya menganggur sampai
// kedaluwarsa sendiri. Kerugiannya satu sesi kosong di sisi gerbang; harga dari
// menebak-nebak adalah pembayaran yang tidak bisa dicocokkan ke tagihan mana pun.
// =================================================================================

import 'server-only';

import { Prisma, PaymentStatus, PaymentTujuan, BookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma as prismaAsli } from './prisma';
import { uangUntukClient } from './money';
import { keE164 } from './telepon';
import {
  GalatXendit,
  ambilSesiAktifUntukKomponen as ambilSesiAktifAsli,
  buatSesiPembayaran as buatSesiAsli,
  nominalUntukXendit,
  pastikanCustomer as pastikanCustomerAsli,
  type SesiXendit,
} from './xendit';

/** Umur sesi pembayaran yang kita minta. */
const UMUR_SESI_MS = 30 * 60 * 1000;

/**
 * Sisa waktu paling sedikit yang membuat sesi masih layak dibuat.
 *
 * Sesi tidak boleh hidup lebih lama daripada tenggat pesanannya — kalau boleh,
 * pembeli bisa membayar pesanan yang tanggalnya sudah dilepas ke orang lain.
 * Tapi sesi yang hanya berumur beberapa detik juga tidak berguna: pembeli baru
 * selesai mengisi kartu ketika sesinya sudah mati. Di bawah ambang ini lebih
 * jujur mengatakan tenggatnya habis.
 */
const SISA_WAKTU_MIN_MS = 2 * 60 * 1000;

/**
 * Berapa lama satu upaya pembuatan sesi menahan tagihan.
 *
 * HTTP gerbang punya batas 15 detik. Lease ini menyisakan ruang untuk customer,
 * penulisan DB, scheduler lambat, dan jawaban yang terlambat; lease 60 detik
 * dapat habis ketika POST pertama masih berjalan sehingga request kedua bisa
 * membuat sesi tambahan.
 */
const UMUR_CLAIM_MS = 2 * 60 * 1000;

/**
 * Galat yang sudah diterjemahkan menjadi jawaban untuk pembeli.
 *
 * `status` dan `kode` ditetapkan di sini, bukan di route, supaya tidak ada dua
 * tempat yang memutuskan kegagalan yang sama berarti 404 atau 409.
 */
export class GalatSesiPembayaran extends Error {
  constructor(
    readonly status: number,
    readonly kode: string,
    pesan: string
  ) {
    super(pesan);
    this.name = 'GalatSesiPembayaran';
  }
}

/**
 * Apa yang boleh diketahui browser.
 *
 * Sengaja daftar pendek. `providerReferenceId`, id customer, dan isi jawaban
 * gerbang pembayaran tidak ada di sini: tidak satu pun dibutuhkan untuk memasang
 * komponen pembayaran, dan setiap nilai tambahan adalah satu hal lagi yang bisa
 * berakhir di HTML yang tersimpan di cache.
 */
export type HasilSesiPembayaran = {
  paymentId: string;
  tujuan: PaymentTujuan;
  /** Angka biasa — `Decimal` tidak bisa menyeberang ke browser sebagai JSON. */
  jumlah: number;
  /**
   * Kunci berumur pendek milik sesi ini. Hanya untuk browser pembeli yang baru
   * saja dibuktikan sebagai pemilik pesanan. Jangan dicatat, disimpan, ditaruh
   * di URL, atau dipasang sebagai atribut DOM.
   */
  componentsSdkKey: string;
  /** ISO 8601, untuk hitung mundur di layar. */
  expiresAt: string;
};
//
// `paymentSessionId` TIDAK ADA di daftar di atas, dan jangan ditambahkan
// kembali tanpa kebutuhan yang nyata. Halaman pembayaran tidak memerlukannya:
// kunci SDK sudah mengikat komponen ke sesi yang benar, dan `paymentId` sudah
// cukup untuk mencocokkan tampilan dengan tagihan. Id sesi penyedia yang ikut
// menyeberang hanya menambah satu nilai lagi yang bisa berakhir di HTML
// tersimpan, di log browser, atau di laporan galat pihak ketiga.

// ---------------------------------------------------------------------------
// Ketergantungan
// ---------------------------------------------------------------------------

type BarisTagihan = {
  id: string;
  tujuan: PaymentTujuan;
  jumlah: Prisma.Decimal;
  providerReferenceId: string | null;
  providerSessionId: string | null;
  createdAt: Date;
};

type BarisPesanan = {
  id: string;
  status: BookingStatus;
  expiresAt: Date | null;
  payments: BarisTagihan[];
};

type BarisPengguna = {
  id: string;
  email: string;
  name: string | null;
  whatsapp: string | null;
  xenditCustomerId: string | null;
};

/**
 * Bagian database yang dipakai modul ini.
 *
 * Ditulis sebagai bentuk minimum, bukan `PrismaClient`, supaya test bisa
 * memasang penggantinya tanpa server Postgres — dan supaya terlihat jelas
 * operasi apa saja yang menyentuh tabel uang.
 */
export type TabelTagihan = {
  findFirst(args: unknown): Promise<BarisTagihan | null>;
  create(args: unknown): Promise<BarisTagihan>;
  updateMany(args: unknown): Promise<{ count: number }>;
};

export type DbSesi = {
  booking: {
    findFirst(args: unknown): Promise<BarisPesanan | null>;
  };
  user: {
    findUnique(args: unknown): Promise<BarisPengguna | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  payment: TabelTagihan;
  /**
   * Hanya dipakai untuk penggantian tagihan: menutup baris mati dan membuka
   * penggantinya harus jadi satu langkah, kalau tidak kegagalan di antaranya
   * meninggalkan pesanan `PENDING_PAYMENT` tanpa satu pun tagihan menganggur —
   * pembeli tidak bisa membayar dan tidak ada yang menunjukkan sebabnya.
   *
   * HTTP gerbang pembayaran TIDAK PERNAH dijalankan di dalamnya.
   */
  $transaction<T>(kerja: (tx: { payment: TabelTagihan }) => Promise<T>): Promise<T>;
};

export type GerbangSesi = {
  pastikanCustomer: typeof pastikanCustomerAsli;
  buatSesiPembayaran: typeof buatSesiAsli;
  ambilSesiAktifUntukKomponen: typeof ambilSesiAktifAsli;
};

export type Deps = {
  db: DbSesi;
  gerbang: GerbangSesi;
  /** Jam disuntikkan agar test tenggat tidak bergantung waktu nyata. */
  sekarang: () => Date;
  /** Token claim. Harus tidak bisa diduga: ia yang menentukan siapa pemenang. */
  tokenBaru: () => string;
};

export type DepsSebagian = Omit<Partial<Deps>, 'db' | 'gerbang'> & {
  db?: Partial<DbSesi>;
  gerbang?: Partial<GerbangSesi>;
};

function depsBawaan(): Deps {
  return {
    db: prismaAsli as unknown as DbSesi,
    gerbang: {
      pastikanCustomer: pastikanCustomerAsli,
      buatSesiPembayaran: buatSesiAsli,
      ambilSesiAktifUntukKomponen: ambilSesiAktifAsli,
    },
    sekarang: () => new Date(),
    tokenBaru: () => randomUUID(),
  };
}

/**
 * Gabungkan pengganti dengan bawaan SATU TINGKAT LEBIH DALAM untuk `db` dan
 * `gerbang`.
 *
 * Penggabungan dangkal membuat test yang hanya mengganti `payment` kehilangan
 * `booking`, `user`, dan `$transaction` — dan kehilangan itu muncul sebagai
 * "bukan fungsi" di tengah alur uang, bukan sebagai kesalahan penyusunan test.
 */
function gabungDeps(depsSebagian?: DepsSebagian): Deps {
  const bawaan = depsBawaan();
  if (!depsSebagian) return bawaan;

  const { db, gerbang, ...sisa } = depsSebagian;
  return {
    ...bawaan,
    ...sisa,
    db: { ...bawaan.db, ...db },
    gerbang: { ...bawaan.gerbang, ...gerbang },
  };
}

// ---------------------------------------------------------------------------
// Bagian-bagian
// ---------------------------------------------------------------------------

const PILIH_TAGIHAN = {
  id: true,
  tujuan: true,
  jumlah: true,
  providerReferenceId: true,
  providerSessionId: true,
  createdAt: true,
} as const;

/**
 * Reference internal satu baris tagihan.
 *
 * Diturunkan dari id barisnya, jadi upaya kedua pada baris yang sama memakai
 * reference yang sama. Itu disengaja: reference adalah identitas BARIS, dan
 * webhook yang tiba terlambat mencari barisnya lewat nilai ini. Reference yang
 * berubah tiap upaya berarti pembayaran sah yang tidak bisa dicocokkan.
 */
function referensiUntuk(paymentId: string): string {
  return `pay_${paymentId}`;
}

/** Label tagihan untuk pembeli. Nama gerbang pembayaran tidak pernah muncul. */
function deskripsiTagihan(bookingId: string, tujuan: PaymentTujuan): string {
  const nomor = bookingId.slice(-6).toUpperCase();
  const bagian =
    tujuan === PaymentTujuan.DP
      ? 'DP'
      : tujuan === PaymentTujuan.PELUNASAN
        ? 'Pelunasan'
        : tujuan === PaymentTujuan.TAMBAHAN
          ? 'Biaya tambahan'
          : 'Pembayaran penuh';
  return `${bagian} pesanan #${nomor}`;
}

/**
 * Tagihan mana yang dibayar sekarang.
 *
 * Yang paling tua lebih dulu. Satu pesanan bisa punya beberapa tagihan
 * menganggur dengan tujuan berbeda (pelunasan dan biaya tambahan hidup
 * bersamaan), dan membayar yang paling lama menunggu adalah urutan yang bisa
 * dijelaskan kepada pembeli maupun kepada pembukuan.
 */
function tagihanBerikutnya(payments: BarisTagihan[]): BarisTagihan | null {
  const urut = [...payments].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return urut[0] ?? null;
}

/**
 * Sampai kapan sesi ini boleh hidup.
 *
 * Dijepit oleh tenggat pesanan: sesi yang hidup lebih lama daripada tenggatnya
 * berarti pembeli masih bisa membayar pesanan yang tanggalnya sudah dilepas ke
 * orang lain oleh penyapu.
 */
function tenggatSesi(sekarang: Date, tenggatPesanan: Date): Date {
  const batasSesi = sekarang.getTime() + UMUR_SESI_MS;
  return new Date(Math.min(batasSesi, tenggatPesanan.getTime()));
}

/**
 * Pastikan pembeli ini punya customer di gerbang pembayaran, dan simpan id-nya.
 *
 * Penyimpanannya bersyarat (`xenditCustomerId: null`). Dua permintaan bersamaan
 * dari satu pembeli bisa sama-sama membuat customer; yang menulis lebih dulu
 * menang, dan yang kalah MEMAKAI nilai pemenang alih-alih menimpanya. Kalau
 * ditimpa, dua baris ledger pembeli yang sama akan menunjuk ke dua customer dan
 * riwayat pembayarannya di sisi gerbang terbelah dua.
 */
async function pastikanCustomerTersimpan(deps: Deps, pengguna: BarisPengguna): Promise<string> {
  if (pengguna.xenditCustomerId) return pengguna.xenditCustomerId;

  const customer = await deps.gerbang.pastikanCustomer({
    referenceId: pengguna.id,
    email: pengguna.email,
    nama: pengguna.name,
    nomorHp: keE164(pengguna.whatsapp),
  });

  const hasil = await deps.db.user.updateMany({
    where: { id: pengguna.id, xenditCustomerId: null },
    data: { xenditCustomerId: customer.id },
  });

  if (hasil.count === 1) return customer.id;

  // Permintaan lain menang. Nilainya dibaca ulang, bukan diasumsikan sama
  // dengan yang baru kita buat.
  const terkini = await deps.db.user.findUnique({
    where: { id: pengguna.id },
    select: { id: true, email: true, name: true, whatsapp: true, xenditCustomerId: true },
  });
  if (terkini?.xenditCustomerId) return terkini.xenditCustomerId;

  throw new GalatSesiPembayaran(
    503,
    'CUSTOMER_GAGAL_TERSIMPAN',
    'Data pembayaran Anda belum selesai disiapkan. Coba lagi sebentar.'
  );
}

// ---------------------------------------------------------------------------
// Alur utama
// ---------------------------------------------------------------------------

/**
 * Siapkan sesi Pembayaran Otomatis untuk satu pesanan milik `userId`.
 *
 * Hanya PEMILIK pesanan yang dilayani. Admin tidak termasuk: ini alur pembeli,
 * dan admin yang bisa membuka sesi pembayaran orang lain adalah admin yang bisa
 * memasukkan kartunya sendiri ke pesanan pelanggan.
 */
export async function siapkanSesiPembayaran(
  input: { bookingId: string; userId: string },
  depsSebagian?: DepsSebagian
): Promise<HasilSesiPembayaran> {
  const deps = gabungDeps(depsSebagian);
  const sekarang = deps.sekarang();

  // KEPEMILIKAN IKUT KE DALAM QUERY, bukan diperiksa sesudahnya. Pesanan orang
  // lain tidak pernah terbaca, jadi tidak ada baris yang bisa bocor lewat
  // penanganan galat atau lewat log.
  const pesanan = await deps.db.booking.findFirst({
    where: { id: input.bookingId, userId: input.userId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      payments: {
        where: { status: PaymentStatus.PENDING },
        select: PILIH_TAGIHAN,
      },
    },
  });

  // Satu jawaban untuk "tidak ada" dan "bukan milik Anda". Membedakannya berarti
  // memberi tahu orang asing id pesanan mana yang benar-benar ada.
  if (!pesanan) {
    throw new GalatSesiPembayaran(404, 'PESANAN_TIDAK_DITEMUKAN', 'Pesanan tidak ditemukan.');
  }

  if (pesanan.status !== BookingStatus.PENDING_PAYMENT) {
    throw new GalatSesiPembayaran(
      409,
      'STATUS_TIDAK_MENUNGGU_BAYAR',
      'Pesanan ini tidak sedang menunggu pembayaran.'
    );
  }

  // Tenggat null tidak berarti "selamanya". Tanpa tenggat, sesi tidak bisa
  // dijepit ke umur pesanan dan pembeli dapat membayar setelah slot dilepas.
  if (!pesanan.expiresAt) {
    throw new GalatSesiPembayaran(
      409,
      'TENGGAT_TIDAK_TERSEDIA',
      'Tenggat pembayaran pesanan ini tidak tersedia. Silakan buat pesanan baru.'
    );
  }

  if (pesanan.expiresAt.getTime() <= sekarang.getTime()) {
    throw new GalatSesiPembayaran(
      409,
      'TENGGAT_LEWAT',
      'Tenggat pembayaran pesanan ini sudah lewat. Silakan buat pesanan baru.'
    );
  }

  const tenggat = tenggatSesi(sekarang, pesanan.expiresAt);
  if (tenggat.getTime() - sekarang.getTime() < SISA_WAKTU_MIN_MS) {
    throw new GalatSesiPembayaran(
      409,
      'TENGGAT_TERLALU_DEKAT',
      'Sisa waktu pembayaran tidak cukup untuk menyelesaikan transaksi. Silakan buat pesanan baru.'
    );
  }

  let tagihan = tagihanBerikutnya(pesanan.payments);
  if (!tagihan) {
    throw new GalatSesiPembayaran(
      409,
      'TIDAK_ADA_TAGIHAN',
      'Tidak ada tagihan yang menunggu pembayaran untuk pesanan ini.'
    );
  }

  // PROFIL DIPERIKSA SEBELUM GERBANG DIPANGGIL. Data yang kurang akan ditolak di
  // sana dengan galat yang tidak menyebut kolom mana yang salah, dan penolakan
  // itu terjadi setelah sesi mungkin sudah dibuat.
  const pengguna = await deps.db.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, name: true, whatsapp: true, xenditCustomerId: true },
  });

  if (!pengguna) {
    throw new GalatSesiPembayaran(404, 'PESANAN_TIDAK_DITEMUKAN', 'Pesanan tidak ditemukan.');
  }

  const kurang: string[] = [];
  if (!pengguna.name || !pengguna.name.trim()) kurang.push('nama lengkap');
  if (!pengguna.email || !pengguna.email.trim()) kurang.push('email');
  if (!keE164(pengguna.whatsapp)) kurang.push('nomor WhatsApp');

  if (kurang.length > 0) {
    throw new GalatSesiPembayaran(
      422,
      'PROFIL_BELUM_LENGKAP',
      `Lengkapi ${kurang.join(', ')} di Pengaturan Akun sebelum membayar.`
    );
  }

  const customerId = await pastikanCustomerTersimpan(deps, pengguna);

  // --- Sesi yang sudah ada: pakai ulang bila masih hidup -------------------
  //
  // Respons yang hilang di jaringan, tab yang dimuat ulang, atau React yang
  // menjalankan effect dua kali semuanya sampai ke sini. Membuat sesi baru untuk
  // setiap kejadian itu berarti menumpuk sesi menganggur untuk satu tagihan.
  if (tagihan.providerSessionId) {
    let keadaan: Awaited<ReturnType<typeof ambilSesiAktifAsli>>;
    try {
      keadaan = await deps.gerbang.ambilSesiAktifUntukKomponen(tagihan.providerSessionId, {
        referenceId: tagihan.providerReferenceId ?? referensiUntuk(tagihan.id),
        customerId,
        nominal: nominalUntukXendit(tagihan.jumlah),
      });
    } catch (error) {
      // Keadaan sesi lama TIDAK diketahui. Menggantinya di sini berarti menagih
      // ulang kewajiban yang mungkin sudah dibayar pada sesi tersebut.
      throw galatBacaSesi(error);
    }

    if (keadaan.keadaan === 'AKTIF') {
      return {
        paymentId: tagihan.id,
        tujuan: tagihan.tujuan,
        jumlah: uangUntukClient(tagihan.jumlah),
        componentsSdkKey: keadaan.sesi.components_sdk_key,
        expiresAt: keadaan.sesi.expires_at,
      };
    }

    if (keadaan.keadaan === 'DIBAYAR') {
      // Pembayaran sudah masuk ke sesi ini; webhook yang akan melunasi barisnya.
      // Tagihan pengganti di sini adalah tagihan kedua untuk satu kewajiban.
      throw new GalatSesiPembayaran(
        409,
        'MENUNGGU_KONFIRMASI',
        'Pembayaran Anda sedang dikonfirmasi. Status pesanan diperbarui otomatis begitu konfirmasi masuk.'
      );
    }

    if (keadaan.keadaan === 'TIDAK_PASTI') {
      throw new GalatSesiPembayaran(
        409,
        'SESI_BELUM_PASTI',
        'Status pembayaran sebelumnya belum dapat dipastikan. Tunggu sebentar lalu coba lagi.'
      );
    }

    // Terbukti berakhir tanpa pembayaran: baris lama ditutup dan tagihan
    // pengganti dibuka dalam satu langkah.
    tagihan = await tutupLaluBukaUlang(deps, pesanan.id, tagihan);
  }

  // Nominal dihitung dari baris yang AKHIRNYA dipakai. Baris pengganti bisa
  // datang dari permintaan lain, dan nominal baris sebelumnya sudah tidak
  // mewakili tagihan yang akan dibayar.
  const nominal = nominalUntukXendit(tagihan.jumlah);

  // --- Claim: satu upaya, satu pemenang -----------------------------------
  //
  // Jam dibaca ULANG di sini, bukan dipakai dari awal permintaan. Pembuatan
  // customer di atas bisa memakan belasan detik; lease yang dihitung dari jam
  // lama dapat habis ketika POST /sessions belum selesai, dan itulah kondisi
  // yang mengizinkan sesi kedua terbentuk untuk satu tagihan.
  const mulaiClaim = deps.sekarang();
  const token = deps.tokenBaru();
  const referenceId = tagihan.providerReferenceId ?? referensiUntuk(tagihan.id);
  const claimSampai = new Date(mulaiClaim.getTime() + UMUR_CLAIM_MS);

  const claim = await deps.db.payment.updateMany({
    where: {
      id: tagihan.id,
      status: PaymentStatus.PENDING,
      // Baris yang sudah punya sesi tidak boleh diklaim: sesinya akan ditimpa.
      providerSessionId: null,
      OR: [
        { sesiClaimExpiresAt: null },
        { sesiClaimExpiresAt: { lte: mulaiClaim } },
      ],
    },
    data: {
      sesiClaimToken: token,
      sesiClaimedAt: mulaiClaim,
      sesiClaimExpiresAt: claimSampai,
      // Reference dipersist SEBELUM gerbang dipanggil. Kalau ia baru disimpan
      // sesudahnya, webhook dari sesi yang sempat terbentuk tidak punya satu pun
      // nilai untuk menemukan barisnya.
      providerReferenceId: referenceId,
    },
  });

  if (claim.count === 0) {
    // Permintaan lain sedang memegang upaya ini. Pembeli menunggu sebentar, dan
    // TIDAK ada sesi kedua yang dibuat.
    throw new GalatSesiPembayaran(
      409,
      'SEDANG_DISIAPKAN',
      'Pembayaran untuk tagihan ini sedang disiapkan. Tunggu sebentar lalu coba lagi.'
    );
  }

  // --- Panggilan gerbang: DI LUAR transaksi apa pun ------------------------
  const sesi = await buatSesiTervalidasi(deps, {
    paymentId: tagihan.id,
    token,
    referenceId,
    customerId,
    nominal,
    deskripsi: deskripsiTagihan(pesanan.id, tagihan.tujuan),
    tenggat,
  });

  // --- Simpan dulu, baru serahkan kuncinya --------------------------------
  const tersimpan = await deps.db.payment.updateMany({
    where: {
      id: tagihan.id,
      // Hanya pemegang claim boleh menyimpan. Upaya lama yang jawabannya baru
      // tiba setelah lease-nya habis tidak boleh menimpa sesi yang lebih baru.
      sesiClaimToken: token,
      providerSessionId: null,
    },
    data: {
      providerSessionId: sesi.payment_session_id,
      expiresAt: new Date(sesi.expires_at),
      sesiClaimToken: null,
      sesiClaimedAt: null,
      sesiClaimExpiresAt: null,
    },
  });

  if (tersimpan.count === 0) {
    // Sesi ini menjadi yatim: id-nya tidak tersimpan, jadi kuncinya TIDAK
    // diserahkan dan tidak ada yang bisa membayarnya. Dibiarkan kedaluwarsa.
    throw new GalatSesiPembayaran(
      409,
      'SEDANG_DISIAPKAN',
      'Pembayaran untuk tagihan ini sedang disiapkan. Tunggu sebentar lalu coba lagi.'
    );
  }

  return {
    paymentId: tagihan.id,
    tujuan: tagihan.tujuan,
    jumlah: uangUntukClient(tagihan.jumlah),
    componentsSdkKey: sesi.components_sdk_key,
    expiresAt: sesi.expires_at,
  };
}

/** Sesi baru yang sudah dibuktikan lengkap, jadi tidak perlu `!` di hilirnya. */
type SesiSiapPakai = SesiXendit & { components_sdk_key: string; expires_at: string };

/**
 * Buat sesi lalu buktikan kelengkapannya sebelum ia dipakai.
 *
 * Kegagalan gerbang dan sesi yang tidak lengkap sama-sama dilewatkan ke
 * `tanganiGagalGerbang`, supaya hanya ADA SATU tempat yang memutuskan apakah
 * claim dilepas. Sesi tidak lengkap adalah hasil yang PASTI (jawaban diterima,
 * isinya tidak bisa dipakai), jadi claim-nya dilepas dan pembeli boleh langsung
 * mencoba lagi.
 */
async function buatSesiTervalidasi(
  deps: Deps,
  arg: {
    paymentId: string;
    token: string;
    referenceId: string;
    customerId: string;
    nominal: number;
    deskripsi: string;
    tenggat: Date;
  }
): Promise<SesiSiapPakai> {
  // `tanganiGagalGerbang` selalu melempar, tetapi TypeScript tidak membawa
  // fakta itu keluar dari `await` di blok catch. Nilai null menjaga jalur
  // defensif ini tetap terbukti sebelum `sesi` dibaca.
  let sesi: SesiXendit | null = null;
  try {
    sesi = await deps.gerbang.buatSesiPembayaran({
      referenceId: arg.referenceId,
      customerId: arg.customerId,
      jumlah: arg.nominal,
      deskripsi: arg.deskripsi,
      expiresAt: arg.tenggat,
    });
  } catch (error) {
    await tanganiGagalGerbang(deps, arg.paymentId, arg.token, error);
  }

  if (!sesi || !sesi.components_sdk_key || !sesi.expires_at) {
    // `buatSesiPembayaran` sudah menolak sesi tanpa kunci/tenggat; pemeriksaan
    // ini menjaga agar perubahan di sana tidak diam-diam meloloskan sesi yang
    // tidak bisa dipakai ke bawah sini.
    await lepasClaim(deps, arg.paymentId, arg.token);
    throw new GalatSesiPembayaran(
      502,
      'SESI_TIDAK_LENGKAP',
      'Pembayaran belum bisa dibuka. Coba lagi sebentar.'
    );
  }

  return sesi as SesiSiapPakai;
}

/**
 * Terjemahkan kegagalan PEMBACAAN sesi lama.
 *
 * Membaca sesi tidak punya efek samping, jadi tidak ada claim yang perlu
 * dilepas. Yang penting di sini satu hal: kegagalan pembacaan TIDAK BOLEH jatuh
 * ke 500 generik, karena route yang menerjemahkannya begitu akan menyembunyikan
 * bahwa keadaan tagihan lama belum diketahui.
 */
function galatBacaSesi(error: unknown): unknown {
  if (!(error instanceof GalatXendit)) return error;

  if (error.kodeGalat === 'SESI_TIDAK_SESUAI') {
    // Jawaban milik tagihan lain. Ini bukan keadaan yang bisa ditunggu.
    return new GalatSesiPembayaran(
      409,
      'SESI_TIDAK_COCOK',
      'Data pembayaran pesanan ini perlu diperiksa ulang. Hubungi kami bila terus berulang.'
    );
  }

  return new GalatSesiPembayaran(
    503,
    'SESI_BELUM_PASTI',
    'Status pembayaran sebelumnya belum dapat dipastikan. Tunggu sebentar lalu coba lagi.'
  );
}

/** Lepas lease, hanya bila masih dipegang token ini. */
async function lepasClaim(deps: Deps, paymentId: string, token: string): Promise<void> {
  await deps.db.payment.updateMany({
    where: { id: paymentId, sesiClaimToken: token },
    data: { sesiClaimToken: null, sesiClaimedAt: null, sesiClaimExpiresAt: null },
  });
}

/**
 * Tutup baris yang sesinya mati, lalu buka baris pengganti dengan tujuan dan
 * nominal yang sama.
 *
 * Bentrokan pada indeks unik bersyarat `payment_satu_tagihan_menganggur`
 * ditangani dengan MEMBACA ULANG, bukan dengan mencocokkan nama kolom pada
 * metadata P2002 — indeks itu ditulis tangan di migrasi dan Prisma tidak selalu
 * melaporkan targetnya.
 */
async function tutupLaluBukaUlang(
  deps: Deps,
  bookingId: string,
  tagihan: BarisTagihan
): Promise<BarisTagihan> {
  try {
    return await deps.db.$transaction(async (tx) => {
      const ditutup = await tx.payment.updateMany({
        where: { id: tagihan.id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.EXPIRED,
          sesiClaimToken: null,
          sesiClaimedAt: null,
          sesiClaimExpiresAt: null,
        },
      });

      if (ditutup.count === 0) {
        // Baris sudah tidak menganggur — mungkin webhook baru saja melunasinya.
        // Membuat tagihan kedua di sini berarti menagih uang yang mungkin sudah masuk.
        throw new GalatSesiPembayaran(
          409,
          'TAGIHAN_BERUBAH',
          'Status tagihan ini baru saja berubah. Muat ulang halaman untuk melihat keadaan terbaru.'
        );
      }

      return tx.payment.create({
        data: {
          bookingId,
          tujuan: tagihan.tujuan,
          jumlah: tagihan.jumlah,
          status: PaymentStatus.PENDING,
        },
        select: PILIH_TAGIHAN,
      });
    });
  } catch (error) {
    if (error instanceof GalatSesiPembayaran) throw error;
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    // Permintaan lain sudah membuka tagihan pengganti. Transaksi yang gagal
    // merollback penutupan kita, jadi baris lama tetap aman; cukup pakai pemenang
    // tanpa pernah menyisakan pesanan dengan nol tagihan PENDING.
    const pemenang = await deps.db.payment.findFirst({
      where: { bookingId, tujuan: tagihan.tujuan, status: PaymentStatus.PENDING },
      select: PILIH_TAGIHAN,
    });
    if (pemenang) return pemenang;

    throw new GalatSesiPembayaran(
      409,
      'TAGIHAN_BERUBAH',
      'Status tagihan ini baru saja berubah. Muat ulang halaman untuk melihat keadaan terbaru.'
    );
  }
}

/**
 * Apakah POST /sessions mungkin sudah menghasilkan sesi walau hasilnya gagal
 * dibaca oleh aplikasi.
 *
 * 408, 429, dan 5xx tidak selalu berarti permintaan belum diproses: proxy atau
 * gerbang bisa mengirimkannya sesudah upstream menerima POST. Jawaban bukan JSON
 * juga sering merupakan halaman galat proxy sesudah request diteruskan. Semua
 * keadaan itu mempertahankan claim sampai lease habis; retry langsung dapat
 * membentuk sesi kedua.
 */
function hasilnyaTidakDiketahui(error: GalatXendit): boolean {
  if (
    ['BATAS_WAKTU', 'JARINGAN_GAGAL', 'JAWABAN_TERPUTUS', 'JAWABAN_BUKAN_JSON'].includes(
      error.kodeGalat
    )
  ) {
    return true;
  }
  return error.status === 408 || error.status === 429 || error.status >= 500;
}

/**
 * Terjemahkan kegagalan gerbang, dan putuskan apakah claim dilepas.
 *
 * Inilah bedanya "pasti gagal" dan "tidak diketahui":
 *
 *   - Ditolak dengan jawaban jelas (400/401/422 dan sejenisnya) berarti tidak
 *     ada sesi yang terbentuk. Claim dilepas supaya pembeli bisa mencoba lagi
 *     segera setelah penyebabnya diperbaiki.
 *   - Batas waktu, koneksi putus, atau jawaban terpotong berarti sesinya MUNGKIN
 *     sudah ada. Claim TIDAK dilepas — dibiarkan habis oleh waktu — supaya upaya
 *     berikutnya tidak berlomba dengan panggilan yang mungkin masih berjalan.
 */
async function tanganiGagalGerbang(
  deps: Deps,
  paymentId: string,
  token: string,
  error: unknown
): Promise<never> {
  const hasilTidakPasti = error instanceof GalatXendit && hasilnyaTidakDiketahui(error);

  if (!hasilTidakPasti) {
    // Pelepasan bersyarat pada token: lease yang sudah berpindah pemilik tidak
    // boleh dibuka oleh upaya lama.
    await lepasClaim(deps, paymentId, token);
  }

  if (error instanceof GalatXendit) {
    throw new GalatSesiPembayaran(
      hasilTidakPasti ? 503 : 502,
      'GERBANG_MENOLAK',
      hasilTidakPasti
        ? 'Pembayaran belum bisa dibuka karena jawaban penyedia tidak sampai. Tunggu sebentar lalu coba lagi.'
        : 'Pembayaran belum bisa dibuka saat ini. Coba lagi sebentar.'
    );
  }

  throw error;
}
