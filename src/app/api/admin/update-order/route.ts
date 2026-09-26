import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { amankanHtml } from "@/lib/html";
import { judulSurat, sendEmail } from "@/lib/mail";
import { BookingStatus, daftarNilai, sahBookingStatus } from "@/lib/enum-guard";
import { pesanTransisiDitolak, transisiSah } from "@/lib/transisi-status";
import { keAngka, lebihBesar, rupiah } from "@/lib/money";
import { masihAdaSisa, sisaTagihan, uangMasuk } from "@/lib/pembayaran";
import { tutupTagihanMenganggur } from "@/lib/tutup-tagihan";
import { Prisma } from "@prisma/client";

/**
 * Kolom Payment yang cukup untuk menjawab "berapa uang yang sudah masuk".
 *
 * Kaitan ke gerbang pembayaran sengaja tidak diambil: tidak ada keputusan di
 * route ini yang membutuhkannya, dan baris ini ikut menyusun isi email.
 */
const PILIH_PEMBAYARAN = { tujuan: true, status: true, jumlah: true } as const;

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
      const teksOpsional = (nilai: unknown, batas: number): string | null => {
          if (typeof nilai !== 'string') return null;
          const rapi = nilai.trim();
          return rapi === "" ? null : rapi.slice(0, batas);
      };

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

      const alasan = teksOpsional(reason, 1000);
      const buktiRefund = urlBukti(refundProof);
      const buktiPasang = urlBukti(installationProof);

      // Pembacaan pesanan, pemeriksaan transisi, gerbang refund, dan penulisan
      // hidup dalam satu transaksi. Sebelumnya `payments` dan `status` dibaca di
      // luar transaksi: nominal yang divalidasi belum tentu nominal yang berlaku
      // saat baris ditulis.
      const hasil = await prisma.$transaction(async (tx) => {
          const currentOrder = await tx.booking.findUnique({
              where: { id: orderId },
              include: { payments: { select: PILIH_PEMBAYARAN } },
          });

          if (!currentOrder) return { keadaan: 'TIDAK_DITEMUKAN' } as const;

          // Enum hanya memastikan kata yang dikirim DIKENAL, bukan bahwa
          // perpindahannya masuk akal. Sebelum pemeriksaan ini ada, satu salah
          // klik bisa memindahkan pesanan `REFUNDED` kembali ke `ACTIVE`:
          // dananya sudah ditransfer keluar, tapi pesanannya hidup lagi,
          // tanggal billboard terkunci lagi, dan pelanggan menerima email
          // "Pembayaran Berhasil! Order Aktif." untuk pesanan yang baru saja
          // dikembalikan dananya. Peta lengkap beserta alasan tiap jalurnya ada
          // di src/lib/transisi-status.ts.
          if (!transisiSah(currentOrder.status, newStatus)) {
              return {
                  keadaan: 'TRANSISI_DITOLAK',
                  pesan: pesanTransisiDitolak(currentOrder.status, newStatus),
              } as const;
          }

          // `updateData` dulu bertipe `any` dan menyebar nilai body apa adanya:
          // apa pun yang dikirim klien — angka, objek, teks sepanjang apa pun —
          // ikut ditulis. Dua di antaranya (`refundProof`, `installationProof`)
          // adalah URL gambar yang kemudian dirender di dashboard pelanggan
          // sebagai bukti transfer dan bukti pemasangan, jadi isinya bukan hal
          // sepele.
          //
          // Tipenya kini mengikuti `Prisma.BookingUpdateInput`, sehingga kolom
          // salah ketik tertangkap `tsc` alih-alih baru ketahuan sebagai "Gagal
          // Update" saat dipakai.
          const updateData: Prisma.BookingUpdateInput = { status: newStatus };

          if (alasan) updateData.cancelReason = alasan;
          if (buktiRefund) updateData.refundProof = buktiRefund;
          if (buktiPasang) updateData.installationProof = buktiPasang;

          // Hanya boolean asli yang diterima; string "false" dari form akan
          // terbaca sebagai `true` kalau dibiarkan lewat.
          if (typeof isLocked === 'boolean') updateData.isLocked = isLocked;

          if (newStatus === BookingStatus.REFUNDED) {
              // `REFUNDED` berarti uang sudah keluar dari rekening perusahaan.
              // Sebelum gerbang ini ada, satu klik cukup untuk menyatakannya
              // tanpa bukti transfer apa pun, dengan nominal nol, atau dengan
              // nominal yang melebihi uang yang pernah benar-benar diterima —
              // dan angka itulah yang kemudian dipakai laporan sebagai
              // pengurang omzet.
              const bukti = buktiRefund ?? currentOrder.refundProof;
              if (!bukti) {
                  return {
                      keadaan: 'REFUND_TAK_LENGKAP',
                      pesan:
                          "Bukti transfer wajib dilampirkan sebelum pesanan ditandai REFUNDED. " +
                          "Unggah bukti berupa URL http/https lewat tombol Transfer.",
                  } as const;
              }

              const nominalRefund = currentOrder.refundAmount;
              if (nominalRefund === null || !lebihBesar(nominalRefund, 0)) {
                  return {
                      keadaan: 'REFUND_TAK_LENGKAP',
                      pesan:
                          "Nominal refund belum tercatat pada pesanan ini. Pelanggan harus " +
                          "mengirim data rekening lebih dulu agar nominalnya terhitung.",
                  } as const;
              }

              // Plafonnya uang pokok yang sudah masuk, bukan `totalPrice`:
              // pesanan yang baru membayar DP tidak boleh direfund sebesar
              // nilai kontraknya.
              const pokokMasuk = uangMasuk(currentOrder.payments);
              if (lebihBesar(nominalRefund, pokokMasuk)) {
                  return {
                      keadaan: 'REFUND_TAK_LENGKAP',
                      pesan:
                          `Nominal refund ${rupiah(nominalRefund)} melebihi uang yang pernah ` +
                          `diterima (${rupiah(pokokMasuk)}). Periksa kembali pembayaran pesanan ini.`,
                  } as const;
              }

              if (!currentOrder.refundedAt) updateData.refundedAt = new Date();
          }

          // Dua timestamp di bawah ada di skema tapi TIDAK PERNAH diisi kode
          // mana pun. Akibatnya timeline pesanan milik pelanggan
          // (`dashboard/order/[id]/page.tsx`, yang membaca
          // `!!productionStartedAt` dan `!!installedAt`) menampilkan langkah
          // "Cetak" dan "Pasang" permanen abu-abu — walaupun admin sudah
          // menekan tombolnya dan statusnya sudah berubah. Diisi saat status
          // pertama kali mencapai tahap itu; syarat `!currentOrder...` menjaga
          // agar penekanan tombol kedua tidak menggeser waktunya.
          if (newStatus === BookingStatus.IN_PRODUCTION && !currentOrder.productionStartedAt) {
              updateData.productionStartedAt = new Date();
          }
          if (newStatus === BookingStatus.INSTALLATION && !currentOrder.installedAt) {
              updateData.installedAt = new Date();
          }

          // `status` ikut disyaratkan pada `where` agar dua admin yang menekan
          // tombol bersamaan tidak sama-sama lolos pemeriksaan transisi di atas
          // lalu menimpa satu sama lain. `updateMany` dipakai karena `update()`
          // hanya menerima kolom unik pada `where`.
          const { count } = await tx.booking.updateMany({
              where: { id: orderId, status: currentOrder.status },
              data: updateData,
          });

          if (count === 0) return { keadaan: 'BERUBAH' } as const;

          // `REFUNDED` adalah status akhir: uang sudah keluar dari rekening
          // perusahaan dan `TRANSISI_SAH` tidak punya jalan keluar darinya.
          // Tagihan yang masih menganggur di pesanan seperti itu adalah tagihan
          // yang tidak akan pernah dibayar siapa pun — dan selama masih
          // `PENDING`, ia terbaca sebagai kewajiban yang menunggu dan menempati
          // pasangan `(bookingId, tujuan)` pada indeks unik bersyarat.
          //
          // Hanya `REFUNDED` yang ditutup di sini, bukan seluruh jalur refund:
          // `REVIEW_REFUND` masih bisa kembali ke `ACTIVE` bila admin menolak
          // pengajuannya, dan pesanan yang kembali aktif harus tetap punya
          // tagihan pelunasannya.
          if (newStatus === BookingStatus.REFUNDED) {
              await tutupTagihanMenganggur(tx, [orderId]);
          }

          const updatedOrder = await tx.booking.findUniqueOrThrow({
              where: { id: orderId },
              include: {
                  user: true,
                  billboard: true, // Penting buat template email
                  payments: { select: PILIH_PEMBAYARAN },
              },
          });

          return { keadaan: 'TERSIMPAN', updatedOrder } as const;
      });

      if (hasil.keadaan === 'TIDAK_DITEMUKAN') {
          return NextResponse.json({ message: "Pesanan tidak ditemukan" }, { status: 404 });
      }

      if (hasil.keadaan === 'TRANSISI_DITOLAK') {
          return NextResponse.json({ message: hasil.pesan }, { status: 409 });
      }

      if (hasil.keadaan === 'REFUND_TAK_LENGKAP') {
          return NextResponse.json({ message: hasil.pesan }, { status: 422 });
      }

      if (hasil.keadaan === 'BERUBAH') {
          return NextResponse.json(
              { message: "Status pesanan sudah berubah oleh proses lain. Muat ulang halaman lalu coba lagi." },
              { status: 409 }
          );
      }

      const { updatedOrder } = hasil;

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
        //
        // Sisa dihitung dari `Payment PAID`, bukan dari `dpAmount`. `dpAmount`
        // adalah rencana saat pesanan dibuat: pesanan DP yang sudah dilunasi
        // dulu tetap menerima email ini dengan tagihan sisa yang tidak ada.
        if (newStatus === 'ACTIVE') {
            const belumLunas = masihAdaSisa(updatedOrder.totalPrice, updatedOrder.payments);
            const sisa = sisaTagihan(updatedOrder.totalPrice, updatedOrder.payments);
            const sudahDibayar = uangMasuk(updatedOrder.payments);

            // Sisa hanya disebut di judul bila memang masih ada, dan disebut
            // apa adanya sebagai sisa tagihan. Nominal tanpa keterangan di
            // baris judul terbaca seperti tagihan baru.
            subject = judulSurat({
                topik: belumLunas
                    ? 'Billboard sudah tayang, sisa tagihan'
                    : 'Billboard sudah tayang',
                idPesanan: updatedOrder.id,
                nominal: belumLunas ? sisa : undefined,
            });
            title = "Billboard Anda Sudah Tayang!";
            message =
                // Nama akun dan judul billboard adalah teks bebas; surat ini
                // menyambung HTML, jadi keduanya diamankan dulu.
                `Halo ${amankanHtml(updatedOrder.user.name)}, billboard "${amankanHtml(updatedOrder.billboard.title)}" sudah terpasang ` +
                `dan berstatus AKTIF. Foto bukti pemasangan dapat dilihat di dashboard Anda.` +
                (belumLunas
                    ? `<br/><br/>Catatan tagihan: pembayaran yang sudah kami terima ${rupiah(sudahDibayar)} ` +
                      `dari total ${rupiah(updatedOrder.totalPrice)}. Sisa <b>${rupiah(sisa)}</b> masih perlu ` +
                      `dilunasi — tim kami akan menghubungi Anda untuk prosesnya.`
                    : "");
        }
        // Skenario B: Refund Selesai
        else if (newStatus === 'REFUNDED') {
            // Judul ini dulu berbunyi "💰 Dana Refund Dikembalikan" tanpa
            // menyebut pesanan mana pun. Pembeli dengan lebih dari satu pesanan
            // harus membuka suratnya untuk tahu yang mana — dan nominalnya pun
            // tidak ada di sana.
            subject = judulSurat({
                topik: 'Dana refund sudah ditransfer',
                idPesanan: updatedOrder.id,
                nominal: updatedOrder.refundAmount,
            });
            title = "Pengembalian Dana Selesai";
            message =
                `Halo ${amankanHtml(updatedOrder.user.name)}, pengembalian dana sebesar ` +
                `<b>${rupiah(updatedOrder.refundAmount)}</b> telah kami transfer ke rekening Anda. ` +
                `Bukti transfernya dapat dilihat di dashboard.`;
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