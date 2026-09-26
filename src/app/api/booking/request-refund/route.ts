// src/app/api/booking/request-refund/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { amankanHtml } from "@/lib/html";
import { judulSurat, sendEmail } from "@/lib/mail";
import { keAngka, nol, persen, rupiah } from "@/lib/money";
import { sudahLunas, uangMasuk as uangMasukLedger } from "@/lib/pembayaran";
import { BookingStatus, Prisma } from "@prisma/client";
import { STATUS_BOLEH_AJUKAN_REFUND } from "@/lib/transisi-status";

/** Bagian dari uang masuk yang dikembalikan; sisanya potongan biaya admin. */
const PERSEN_REFUND = 90;

/**
 * Kolom Payment yang cukup untuk menjawab "berapa uang yang sudah masuk".
 *
 * Sengaja sempit. Baris Payment juga memuat kaitan ke gerbang pembayaran
 * (`providerSessionId`, `providerPaymentId`, `callbackPayload`), dan tidak satu
 * pun dari itu dibutuhkan untuk menghitung refund.
 */
const PILIH_PEMBAYARAN = { tujuan: true, status: true, jumlah: true } as const;

/**
 * Ambil teks dari body dengan batas panjang, atau `null` bila bukan teks/kosong.
 *
 * Nilai dari body tidak pernah dijamin bertipe apa pun: klien bisa mengirim
 * angka, objek, atau tidak mengirim sama sekali. Prisma menolak tipe yang salah
 * dengan galat yang jatuh ke 500 tanpa penjelasan, dan teks tanpa batas panjang
 * ikut tertulis apa adanya ke database lalu tampil di panel admin.
 */
function teksDariBody(nilai: unknown, batas: number): string | null {
  if (typeof nilai !== 'string') return null;
  const rapi = nilai.trim();
  if (rapi === "") return null;
  return rapi.slice(0, batas);
}

/**
 * Bersihkan nomor rekening: hanya angka, strip, dan spasi yang diterima.
 *
 * Kolom ini dibaca admin saat MENTRANSFER UANG. Apa pun yang lolos ke sini akan
 * tampil di layar admin sebagai tujuan transfer, jadi bentuknya dipastikan
 * dulu — bukan supaya "rapi", tapi supaya yang dibaca admin memang nomor
 * rekening dan bukan teks sembarang yang menyamar sebagai satu.
 *
 * Panjangnya dibatasi longgar (8–34 digit): rekening bank Indonesia umumnya
 * 10–16 digit, batas atas mengikuti panjang maksimum IBAN.
 */
function nomorRekeningSah(nilai: unknown): string | null {
  const teks = teksDariBody(nilai, 40);
  if (teks === null) return null;
  if (!/^[0-9][0-9\s-]*[0-9]$/.test(teks)) return null;

  const digit = teks.replace(/\D/g, "");
  if (digit.length < 8 || digit.length > 34) return null;

  return teks;
}

export async function POST(req: Request) {
  // Route ini sebelumnya tidak punya autentikasi sama sekali. Siapa pun bisa
  // mengajukan refund atas order milik orang lain DAN menentukan nomor rekening
  // tujuan transfer pada STEP B — artinya dana pelanggan bisa dialihkan ke
  // rekening penyerang. Sesi + kepemilikan order kini wajib di kedua step.
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

  const body = await req.json();
  const adminEmail = process.env.ADMIN_EMAIL; // Email Bos

  // `orderId` dulu diteruskan ke Prisma apa adanya. Bila klien mengirim objek
  // atau angka, query gagal dengan galat yang jatuh ke 500 — bukan pesan yang
  // bisa dimengerti siapa pun.
  const orderId = teksDariBody(body.orderId, 64);
  if (!orderId) {
      return NextResponse.json({ message: "ID pesanan tidak valid." }, { status: 400 });
  }

  // STEP A: User kirim ALASAN (Tahap Awal)
  if (body.step === 'reason') {
      // Alasan pembatalan tampil di panel admin dan dikirim lewat email.
      const alasan = teksDariBody(body.reason, 1000);
      if (!alasan) {
          return NextResponse.json(
              { message: "Alasan pembatalan wajib diisi." },
              { status: 400 }
          );
      }

      // Kepemilikan ditegakkan di tingkat query.
      //
      // `status` ikut disaring di sini. Sebelumnya step ini menerima pesanan
      // dengan status APA PUN, termasuk yang sudah `CANCELLED` dan yang sudah
      // `REFUNDED`. Pesanan yang dananya sudah ditransfer keluar bisa diajukan
      // refund lagi, masuk kembali ke antrean admin, dan dibayar untuk kedua
      // kalinya — uangnya keluar dua kali atas satu transaksi yang sama.
      // Pesanan `PENDING_PAYMENT` juga tertolak di sini, dan memang harus:
      // belum ada uang yang masuk untuk dikembalikan, jalurnya `booking/cancel`.
      const { count } = await prisma.booking.updateMany({
          where: {
              id: orderId,
              userId: session.user.id,
              status: { in: [...STATUS_BOLEH_AJUKAN_REFUND] },
          },
          data: {
              status: "REVIEW_REFUND",
              cancelReason: alasan,
          },
      });

      if (count === 0) {
          // Dibedakan: pesanannya memang bukan milik user (atau tidak ada),
          // atau ada tapi statusnya tidak mengizinkan. Tanpa pembedaan ini
          // user melihat "Pesanan tidak ditemukan" untuk pesanan yang jelas
          // terpampang di layarnya.
          const milikUser = await prisma.booking.findFirst({
              where: { id: orderId, userId: session.user.id },
              select: { status: true },
          });

          if (!milikUser) {
              return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
          }

          return NextResponse.json(
              {
                  message:
                      `Pesanan berstatus ${milikUser.status} tidak bisa diajukan refund. ` +
                      `Pengajuan hanya berlaku untuk pesanan berstatus: ${STATUS_BOLEH_AJUKAN_REFUND.join(', ')}.`,
              },
              { status: 409 }
          );
      }

      const order = await prisma.booking.findUniqueOrThrow({
          where: { id: orderId },
          include: { billboard: true, user: true }
      });

      // NOTIFIKASI KE ADMIN
      if (adminEmail) {
          await sendEmail({
              to: adminEmail,
              subject: judulSurat({
                  topik: 'Permintaan refund',
                  idPesanan: order.id,
                  untukAdmin: true,
              }),
              title: "User Minta Batal",
              // Alasan ditulis pembeli dan dibaca admin sebagai kiriman sistem:
              // tanpa pengamanan, tag di dalamnya dirender sebagai markup.
              message: `User <b>${amankanHtml(order.user.name)}</b> mengajukan pembatalan untuk billboard <b>${amankanHtml(order.billboard.title)}</b>.<br/>Alasan: "${amankanHtml(alasan)}"`,
              orderDetail: {
                id: order.id,
                total: keAngka(order.totalPrice),
                status: "REVIEW REFUND",
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration
              }
          });
      }

      return NextResponse.json({ message: "Alasan dikirim" });
  }

  // STEP B: User kirim REKENING (Tahap Kedua)
  if (body.step === 'bank') {
      // Dua field di bawah dulu ditulis ke database apa adanya dari body.
      // Keduanya adalah tujuan transfer yang dibaca admin sebelum mengirim
      // uang: nilai apa pun yang lolos ke sini akan tampil di layarnya sebagai
      // rekening yang sah. Bentuknya dipastikan dulu, dan ditolak dengan pesan
      // yang bisa dibaca pengguna — bukan dibiarkan gagal sebagai 500 di
      // lapisan Prisma, atau lebih buruk, tersimpan.
      const namaBank = teksDariBody(body.bankName, 60);
      if (!namaBank) {
          return NextResponse.json(
              { message: "Nama bank wajib diisi." },
              { status: 400 }
          );
      }

      const nomorRekening = nomorRekeningSah(body.bankAccount);
      if (!nomorRekening) {
          return NextResponse.json(
              {
                  message:
                      "Nomor rekening tidak valid. Isi dengan angka saja (8–34 digit), " +
                      "boleh dipisah spasi atau strip.",
              },
              { status: 400 }
          );
      }

      // Perhitungan uang, validasi status, dan CAS harus hidup dalam satu
      // transaksi. Kalau Payment PAID terbaca sebelum transaksi lalu baris lain
      // menulis refund, nominal yang dikirim ke admin tidak lagi fakta saat ini.
      const hasil = await prisma.$transaction(async (tx) => {
          const orderData = await tx.booking.findFirst({
              where: { id: orderId, userId: session.user.id },
              include: {
                  billboard: true,
                  user: true,
                  payments: { select: PILIH_PEMBAYARAN },
              },
          });

          if (!orderData) return { keadaan: 'TIDAK_DITEMUKAN' } as const;

          // Step ini hanya berlaku setelah admin menyetujui pengajuan refund.
          if (orderData.status !== BookingStatus.WAITING_BANK) {
              return { keadaan: 'STATUS_TIDAK_SAH', status: orderData.status } as const;
          }

          // Payment PAID adalah fakta uang. `dpAmount` adalah rencana ketika
          // booking dibuat, sehingga tidak pernah dipakai di sini.
          const uangMasuk = uangMasukLedger(orderData.payments);
          if (nol(uangMasuk)) return { keadaan: 'BELUM_ADA_UANG_MASUK' } as const;

          const refundNominal = persen(uangMasuk, PERSEN_REFUND)
              .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

          const { count } = await tx.booking.updateMany({
              where: {
                  id: orderId,
                  userId: session.user.id,
                  status: BookingStatus.WAITING_BANK,
              },
              data: {
                  status: BookingStatus.PROCESS_REFUND,
                  userBankName: namaBank,
                  userBankAccount: nomorRekening,
                  refundAmount: refundNominal,
              },
          });

          if (count === 0) return { keadaan: 'BERUBAH' } as const;

          return {
              keadaan: 'TERSIMPAN',
              order: orderData,
              uangMasuk,
              refundNominal,
              lunas: sudahLunas(orderData.totalPrice, orderData.payments),
          } as const;
      });

      if (hasil.keadaan === 'TIDAK_DITEMUKAN') {
          return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      if (hasil.keadaan === 'STATUS_TIDAK_SAH') {
          return NextResponse.json(
              {
                  message:
                      `Pesanan berstatus ${hasil.status} belum siap menerima data rekening. ` +
                      `Rekening hanya bisa diisi setelah Admin menyetujui pengajuan refund.`,
              },
              { status: 409 }
          );
      }

      if (hasil.keadaan === 'BELUM_ADA_UANG_MASUK') {
          return NextResponse.json(
              { message: "Belum ada pembayaran yang tercatat pada pesanan ini, jadi tidak ada dana yang bisa dikembalikan." },
              { status: 409 }
          );
      }

      if (hasil.keadaan === 'BERUBAH') {
          return NextResponse.json(
              { message: "Status pesanan baru saja berubah. Muat ulang halaman lalu coba lagi." },
              { status: 409 }
          );
      }

      const { order, uangMasuk, refundNominal, lunas } = hasil;

      // NOTIFIKASI KE ADMIN
      if (adminEmail) {
          await sendEmail({
              to: adminEmail,
              subject: judulSurat({
                  topik: 'Segera proses transfer refund',
                  idPesanan: order.id,
                  nominal: refundNominal,
                  untukAdmin: true,
              }),
              title: "Data Rekening Masuk",
              // Dasar perhitungan ikut ditulis supaya admin bisa memeriksa
              // angkanya sebelum mentransfer, bukan hanya mempercayainya.
              message:
                  `User telah memasukkan data rekening. Mohon segera transfer pengembalian dana <b>${rupiah(refundNominal)}</b>.<br/><br/>` +
                  `Nilai pesanan: ${rupiah(order.totalPrice)}<br/>` +
                  `Uang yang sudah diterima: <b>${rupiah(uangMasuk)}</b>${lunas ? ' (lunas)' : ' (sebagian)'}<br/>` +
                  `Dikembalikan ${PERSEN_REFUND}% dari uang yang diterima: <b>${rupiah(refundNominal)}</b><br/><br/>` +
                  `Bank: ${amankanHtml(namaBank)} - ${amankanHtml(nomorRekening)}`,
              orderDetail: {
                id: order.id,
                total: keAngka(refundNominal), // Total yg harus ditransfer
                status: "PROCESS REFUND",
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration
              }
          });
      }

      return NextResponse.json({ message: "Rekening disimpan" });
  }

  return NextResponse.json({ message: "Invalid step" }, { status: 400 });
}