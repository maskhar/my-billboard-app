// src/app/api/booking/request-refund/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import { keAngka, nol, persen, rupiah, type NilaiUang } from "@/lib/money";
import { BookingStatus, Prisma } from "@prisma/client";
import { STATUS_BOLEH_AJUKAN_REFUND } from "@/lib/transisi-status";

/** Bagian dari uang masuk yang dikembalikan; sisanya potongan biaya admin. */
const PERSEN_REFUND = 90;

/**
 * Berapa uang yang BENAR-BENAR sudah diterima dari pesanan ini.
 *
 * Ini bukan `totalPrice`. `totalPrice` adalah nilai pesanan — apa yang
 * disepakati akan dibayar seluruhnya — sedangkan yang boleh dikembalikan
 * hanya yang sudah masuk ke rekening.
 *
 * Cara membacanya, diturunkan dari skema dan alur yang ada:
 *
 *   - `dpAmount` diisi `booking/create` HANYA bila pembeli memilih skema DP;
 *     pada pesanan lunas kolom itu 0 (bukan null). Jadi `dpAmount` bernilai
 *     bukan-nol berarti "pembeli membayar sebagian, sebesar angka ini".
 *   - Pelunasan sisa 40% belum punya jalur di sistem ini: tidak ada route yang
 *     menaikkan `dpAmount` menjadi `totalPrice`, dan tidak ada kolom terpisah
 *     yang mencatat pembayaran kedua. Maka selama `dpAmount` masih bukan-nol,
 *     uang yang ada di tangan tetap sebesar `dpAmount` — apa pun status
 *     pesanannya.
 *   - Pada pesanan lunas (`dpAmount` nol), uang yang masuk adalah `totalPrice`.
 *
 * Bug yang diperbaiki: rumus lama `persen(totalPrice, 90)` mengambil 90% dari
 * NILAI PESANAN. Pembeli yang baru menyetor DP Rp 20.010.000 atas pesanan
 * Rp 33.350.000 membuat sistem memerintahkan admin mentransfer Rp 30.015.000
 * — Rp 10.005.000 lebih besar dari seluruh uang yang pernah diterima dari
 * orang itu, per transaksi, tanpa satu pun peringatan.
 */
function uangYangSudahMasuk(order: { totalPrice: NilaiUang; dpAmount: NilaiUang }): NilaiUang {
  // `if (order.dpAmount)` TIDAK bisa dipakai: Decimal(0) adalah objek, dan
  // setiap objek bernilai "benar" di JavaScript — lihat catatan di money.ts.
  return nol(order.dpAmount) ? order.totalPrice : order.dpAmount;
}

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
              subject: `⚠️ Permintaan Refund: #${order.id.slice(-6).toUpperCase()}`,
              title: "User Minta Batal",
              message: `User <b>${order.user.name}</b> mengajukan pembatalan untuk billboard <b>${order.billboard.title}</b>.<br/>Alasan: "${alasan}"`,
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

      // Kepemilikan ditegakkan di tingkat query. Ini step yang menentukan
      // rekening tujuan transfer, jadi pemiliknya wajib dipastikan.
      const orderData = await prisma.booking.findFirst({
          where: { id: orderId, userId: session.user.id }
      });

      if (!orderData) {
          return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      // Step ini hanya boleh dijalankan atas pesanan yang sudah disetujui admin
      // untuk direfund. Tanpa penjaga ini, siapa pun pemilik pesanan bisa
      // melompati step A dan langsung menulis nomor rekening + nominal refund
      // ke pesanan yang statusnya tidak pernah ditinjau siapa pun — termasuk
      // pesanan yang sudah `REFUNDED`, yang berarti transfer kedua.
      if (orderData.status !== BookingStatus.WAITING_BANK) {
          return NextResponse.json(
              {
                  message:
                      `Pesanan berstatus ${orderData.status} belum siap menerima data rekening. ` +
                      `Rekening hanya bisa diisi setelah Admin menyetujui pengajuan refund.`,
              },
              { status: 409 }
          );
      }

      // `totalPrice * 0.90` menghasilkan NaN: nominal bertipe Decimal (objek),
      // bukan angka biasa. NaN lalu ditulis ke kolom refundAmount dan ditolak
      // database, sehingga seluruh pengajuan refund gagal di tengah jalan.
      //
      // Dan bahkan setelah dihitung dengan benar, DASARNYA masih salah:
      // rumus lama mengambil 90% dari `totalPrice` (nilai pesanan), bukan dari
      // uang yang benar-benar diterima. Lihat `uangYangSudahMasuk` di atas —
      // pada pesanan DP, selisihnya adalah kerugian langsung sebesar puluhan
      // juta rupiah per transaksi.
      const uangMasuk = uangYangSudahMasuk(orderData);

      // Dibulatkan ke rupiah utuh: 90% hampir selalu meninggalkan pecahan sen,
      // dan admin mentransfer dalam rupiah penuh. Tanpa pembulatan, nominal
      // yang tercatat di `refundAmount` selalu meleset tipis dari yang
      // benar-benar ditransfer, dan selisihnya menggantung di pembukuan.
      const refundNominal = persen(uangMasuk, PERSEN_REFUND)
          .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

      // Pesanan yang belum menerima uang sama sekali tidak punya apa pun untuk
      // dikembalikan. Membiarkannya lewat berarti memerintahkan admin
      // mentransfer Rp 0 — dan mengunci pesanan di alur refund tanpa hasil.
      if (nol(uangMasuk)) {
          return NextResponse.json(
              { message: "Belum ada pembayaran yang tercatat pada pesanan ini, jadi tidak ada dana yang bisa dikembalikan." },
              { status: 409 }
          );
      }

      const { count } = await prisma.booking.updateMany({
          where: {
              id: orderId,
              userId: session.user.id,
              // Status ikut disyaratkan di query agar dua permintaan yang tiba
              // bersamaan tidak sama-sama lolos pemeriksaan di atas.
              status: BookingStatus.WAITING_BANK,
          },
          data: {
              status: "PROCESS_REFUND",
              userBankName: namaBank,
              userBankAccount: nomorRekening,
              refundAmount: refundNominal
          },
      });

      if (count === 0) {
          return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      const order = await prisma.booking.findUniqueOrThrow({
          where: { id: orderId },
          include: { billboard: true, user: true }
      });

      // NOTIFIKASI KE ADMIN
      if (adminEmail) {
          await sendEmail({
              to: adminEmail,
              subject: `💰 Segera Proses Transfer: #${order.id.slice(-6).toUpperCase()}`,
              title: "Data Rekening Masuk",
              // Dasar perhitungan ikut ditulis supaya admin bisa memeriksa
              // angkanya sebelum mentransfer, bukan hanya mempercayainya.
              message:
                  `User telah memasukkan data rekening. Mohon segera transfer pengembalian dana <b>${rupiah(refundNominal)}</b>.<br/><br/>` +
                  `Nilai pesanan: ${rupiah(order.totalPrice)}<br/>` +
                  `Uang yang sudah diterima: <b>${rupiah(uangMasuk)}</b>${nol(order.dpAmount) ? ' (lunas)' : ' (DP)'}<br/>` +
                  `Dikembalikan ${PERSEN_REFUND}% dari uang yang diterima: <b>${rupiah(refundNominal)}</b><br/><br/>` +
                  `Bank: ${namaBank} - ${nomorRekening}`,
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