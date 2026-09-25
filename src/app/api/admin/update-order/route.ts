import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import { BookingStatus, daftarNilai, sahBookingStatus } from "@/lib/enum-guard";
import { pesanTransisiDitolak, transisiSah } from "@/lib/transisi-status";
import { keAngka, kurang, lebihKecil, nol, rupiah } from "@/lib/money";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  // 1. Cek Admin
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // `installationProof` sempat hilang di sini: `OrderActions.tsx` mengirimnya
  // saat status diubah ke ACTIVE, route NestJS lama menerimanya, tapi route ini
  // tidak pernah membacanya. Akibatnya admin melihat "Update Sukses", status
  // berubah, tapi foto bukti pemasangan tidak tersimpan — dan
  // `dashboard/order/[id]/page.tsx` (isLive = ACTIVE && !!installationProof)
  // tidak pernah menampilkan order sebagai tayang.
  const { orderId, newStatus, reason, refundProof, isLocked, installationProof } = await req.json();

  // Kolom `status` bertipe enum, jadi nilai asing ditolak database di lapisan
  // paling dalam — muncul ke admin sebagai "Gagal Update" tanpa keterangan,
  // setelah email sempat disusun. Diperiksa di sini, di pintu masuk.
  if (!sahBookingStatus(newStatus)) {
      return NextResponse.json(
          { message: `Status tidak dikenal. Pilihan: ${daftarNilai(BookingStatus)}` },
          { status: 400 }
      );
  }

  // `orderId` dulu diteruskan ke Prisma tanpa diperiksa tipenya. Nilai selain
  // teks membuat query gagal dengan galat yang jatuh ke "Gagal Update" — pesan
  // yang tidak memberitahu admin apa pun tentang penyebabnya.
  if (typeof orderId !== 'string' || orderId.trim() === "") {
      return NextResponse.json({ message: "ID pesanan tidak valid." }, { status: 400 });
  }

  try {
      // Pesanan dibaca SEKALI di sini, lalu dipakai ulang untuk pemeriksaan
      // transisi dan pengisian timestamp di bawah. Sebelumnya baris yang sama
      // diambil sampai dua kali dalam satu permintaan.
      const currentOrder = await prisma.booking.findUnique({ where: { id: orderId } });

      if (!currentOrder) {
          return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      // Enum hanya memastikan kata yang dikirim DIKENAL, bukan bahwa
      // perpindahannya masuk akal. Sebelum pemeriksaan ini ada, satu salah klik
      // bisa memindahkan pesanan `REFUNDED` kembali ke `ACTIVE`: dananya sudah
      // ditransfer keluar, tapi pesanannya hidup lagi, tanggal billboard
      // terkunci lagi, dan pelanggan menerima email "Pembayaran Berhasil! Order
      // Aktif." untuk pesanan yang baru saja dikembalikan dananya. Peta lengkap
      // beserta alasan tiap jalurnya ada di src/lib/transisi-status.ts.
      if (!transisiSah(currentOrder.status, newStatus)) {
          return NextResponse.json(
              { message: pesanTransisiDitolak(currentOrder.status, newStatus) },
              { status: 409 }
          );
      }

      // `updateData` dulu bertipe `any` dan menyebar nilai body apa adanya:
      // apa pun yang dikirim klien — angka, objek, teks sepanjang apa pun —
      // ikut ditulis. Dua di antaranya (`refundProof`, `installationProof`)
      // adalah URL gambar yang kemudian dirender di dashboard pelanggan sebagai
      // bukti transfer dan bukti pemasangan, jadi isinya bukan hal sepele.
      //
      // Tipenya kini mengikuti `Prisma.BookingUpdateInput`, sehingga kolom
      // salah ketik tertangkap `tsc` alih-alih baru ketahuan sebagai "Gagal
      // Update" saat dipakai.
      const updateData: Prisma.BookingUpdateInput = {
          status: newStatus,
      };

      const teksOpsional = (nilai: unknown, batas: number): string | null => {
          if (typeof nilai !== 'string') return null;
          const rapi = nilai.trim();
          return rapi === "" ? null : rapi.slice(0, batas);
      };

      const alasan = teksOpsional(reason, 1000);
      if (alasan) updateData.cancelReason = alasan;

      // Kedua kolom bukti hanya menerima URL http/https. Tanpa pemeriksaan ini,
      // teks apa pun bisa masuk ke atribut `src` gambar di dashboard pelanggan
      // — termasuk skema `javascript:` dan `data:`.
      const urlBukti = (nilai: unknown): string | null => {
          const teks = teksOpsional(nilai, 2000);
          if (!teks) return null;
          try {
              const url = new URL(teks);
              return url.protocol === 'http:' || url.protocol === 'https:' ? teks : null;
          } catch {
              return null;
          }
      };

      const buktiRefund = urlBukti(refundProof);
      if (buktiRefund) updateData.refundProof = buktiRefund;

      const buktiPasang = urlBukti(installationProof);
      if (buktiPasang) updateData.installationProof = buktiPasang;

      // Hanya boolean asli yang diterima; string "false" dari form akan
      // terbaca sebagai `true` kalau dibiarkan lewat.
      if (typeof isLocked === 'boolean') updateData.isLocked = isLocked;

      if (newStatus === 'REFUNDED' && !currentOrder.refundedAt) {
          updateData.refundedAt = new Date();
      }

      // Dua timestamp di bawah ada di skema tapi TIDAK PERNAH diisi kode mana
      // pun. Akibatnya timeline pesanan milik pelanggan
      // (`dashboard/order/[id]/page.tsx`, yang membaca `!!productionStartedAt`
      // dan `!!installedAt`) menampilkan langkah "Cetak" dan "Pasang" permanen
      // abu-abu — walaupun admin sudah menekan tombolnya dan statusnya sudah
      // berubah. Diisi saat status pertama kali mencapai tahap itu; `findFirst`
      // di bawah menjaga agar penekanan tombol kedua tidak menggeser waktunya.
      if (newStatus === BookingStatus.IN_PRODUCTION && !currentOrder.productionStartedAt) {
          updateData.productionStartedAt = new Date();
      }
      if (newStatus === BookingStatus.INSTALLATION && !currentOrder.installedAt) {
          updateData.installedAt = new Date();
      }

      // 2. Update Database & SEKALIGUS AMBIL DATA USER DAN BILLBOARD (Untuk Email)
      // Ini adalah perbaikan utamanya (include user, include billboard)
      //
      // `status` ikut disyaratkan pada `where` agar dua admin yang menekan
      // tombol bersamaan tidak sama-sama lolos pemeriksaan transisi di atas
      // lalu menimpa satu sama lain. `updateMany` dipakai karena `update()`
      // hanya menerima kolom unik pada `where`.
      const { count } = await prisma.booking.updateMany({
          where: { id: orderId, status: currentOrder.status },
          data: updateData,
      });

      if (count === 0) {
          return NextResponse.json(
              { message: "Status pesanan sudah berubah oleh proses lain. Muat ulang halaman lalu coba lagi." },
              { status: 409 }
          );
      }

      const updatedOrder = await prisma.booking.findUniqueOrThrow({
          where: { id: orderId },
          include: { 
              user: true, 
              billboard: true // Penting buat template email
          }
      });

      // 3. LOGIC KIRIM EMAIL NOTIFIKASI
      // Pastikan User & Emailnya Ada
      if (updatedOrder && updatedOrder.user && updatedOrder.user.email) {
        
        let subject = "", title = "", message = "";
        
        // Skenario A: Order Aktif (billboard sudah terpasang dan tayang)
        //
        // Email ini dulu berbunyi "Pembayaran Berhasil! Order Aktif." dan
        // mengklaim "pembayaran Anda telah kami terima" — dua klaim yang tidak
        // dijamin benar di titik ini. ACTIVE hanya dicapai dari INSTALLATION
        // (pemasangan selesai) atau dari REVIEW_REFUND (pengajuan refund
        // ditolak); tidak satu pun berarti ada uang baru masuk. Pada pesanan
        // DP, pelanggan yang baru membayar 60% menerima surat yang menyatakan
        // pembayarannya beres — lalu tidak pernah melunasi sisanya.
        //
        // Sekarang isinya menyebut apa yang benar-benar terjadi (billboard
        // tayang), dan sisa tagihan disebut apa adanya bila memang masih ada.
        if (newStatus === 'ACTIVE') {
            const dp = updatedOrder.dpAmount;
            const masihAdaSisa = !nol(dp) && lebihKecil(dp, updatedOrder.totalPrice);
            const sisaTagihan = kurang(updatedOrder.totalPrice, dp);

            subject = `📢 Billboard Anda Sudah Tayang - Order #${updatedOrder.id.slice(-6).toUpperCase()}`;
            title = "Billboard Anda Sudah Tayang!";
            message =
                `Halo ${updatedOrder.user.name}, billboard "${updatedOrder.billboard.title}" sudah terpasang ` +
                `dan berstatus AKTIF. Foto bukti pemasangan dapat dilihat di dashboard Anda.` +
                (masihAdaSisa
                    ? `<br/><br/>Catatan tagihan: Anda membayar DP sebesar ${rupiah(dp)} dari total ` +
                      `${rupiah(updatedOrder.totalPrice)}. Sisa <b>${rupiah(sisaTagihan)}</b> masih perlu dilunasi — ` +
                      `tim kami akan menghubungi Anda untuk prosesnya.`
                    : "");
        }
        // Skenario B: Refund Selesai
        else if (newStatus === 'REFUNDED') {
            subject = "💰 Dana Refund Dikembalikan";
            title = "Pengembalian Dana Selesai";
            message = `Halo ${updatedOrder.user.name}, Admin telah mentransfer pengembalian dana ke rekening Anda. Silakan cek bukti transfer di dashboard website.`;
        }

        // Kirim Email jika Subject terisi
        if (subject) {
            console.log("📨 Mengirim notifikasi update ke:", updatedOrder.user.email);
            
            await sendEmail({
                to: updatedOrder.user.email,
                subject: subject,
                title: title,
                message: message,
                orderDetail: {
                    id: updatedOrder.id,
                    // Sekarang data ini pasti ada karena kita sudah 'include' di atas
                    billboardTitle: updatedOrder.billboard.title,
                    billboardAddress: updatedOrder.billboard.address,
                    duration: updatedOrder.duration,
                    total: keAngka(updatedOrder.totalPrice),
                    status: newStatus
                }
            });
        }
      } else {
          console.warn("⚠️ Data User/Email tidak ditemukan saat update order.");
      }

      return NextResponse.json({ message: "Update Sukses" });
  } catch (error) {
      console.error("Update Error:", error);
      return NextResponse.json({ message: "Gagal Update" }, { status: 500 });
  }
}