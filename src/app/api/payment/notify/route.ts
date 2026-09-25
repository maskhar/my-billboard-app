// src/app/api/payment/notify/route.ts
import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import { keAngka, keDecimal, kurang, lebihKecil, nol, rupiah } from "@/lib/money";
import { BookingStatus } from "@prisma/client";
import { transisiSah } from "@/lib/transisi-status";

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ PENJAGA SEMENTARA — BUKAN VERIFIKASI YANG SEBENARNYA (task 2.3)          │
// └──────────────────────────────────────────────────────────────────────────┘
//
// Route ini menandai sebuah pesanan LUNAS (`status` + `paidAt`) lalu mengirim
// email "[LUNAS] Uang Masuk" ke admin. Sebelum penjaga di bawah ada, ia hanya
// menerima `{ orderId }` dan tidak pernah membuktikan bahwa pengirimnya
// benar-benar payment gateway: siapa pun di jaringan yang tahu (atau menebak)
// sebuah id pesanan bisa membuat sistem mencatat pembayaran yang tidak pernah
// terjadi, dan admin menerima email yang meyakinkan.
//
// Gerbang pembayaran belum ditentukan pemilik proyek, jadi bentuk akhir
// verifikasinya — HMAC atas body mentah — belum bisa ditulis: rumus tanda
// tangan, nama header, dan format payload berbeda untuk setiap gateway.
// Sebagai gantinya, untuk sementara dipasang TOKEN RAHASIA BERSAMA.
//
// ==================== KENAPA INI BELUM CUKUP ====================
// Token statis membuktikan pengirim tahu sebuah rahasia, TIDAK membuktikan
// bahwa isi pesannya utuh. Siapa pun yang pernah melihat satu permintaan sah
// (log proxy, log server, riwayat CI) bisa memutarnya ulang dengan isi yang
// diubah. HMAC atas byte mentah body menutup itu; token ini tidak.
//
// Karena itu penjaga ini WAJIB DIGANTI begitu gerbang dipilih:
//
//   1. Verifikasi signature — bandingkan HMAC atas body MENTAH dengan
//      `timingSafeEqual`. Body harus dibaca sebagai teks sebelum di-JSON.parse,
//      karena tanda tangan dihitung atas byte aslinya, bukan atas hasil
//      serialisasi ulang.
//   2. Cek status transaksi dari gateway (settlement / capture / pending /
//      deny / expire), bukan sekadar "ada notifikasi masuk".
//   3. Buang `PAYMENT_WEBHOOK_TOKEN` beserta seluruh blok komentar ini.
//
// Pemeriksaan nominal (2) dan idempotency (3) dari daftar lama SUDAH dipasang
// di bawah dan tetap berlaku setelah HMAC mendarat — jangan ikut dibuang.
// ================================================================
//
// VARIABEL ENVIRONMENT YANG DIBUTUHKAN (usulan nama — belum dibuat; isi
// sendiri di `.env`, JANGAN dicommit):
//
//   PAYMENT_WEBHOOK_TOKEN   token acak panjang (mis. 32 byte hex).
//                           Kosong / tidak diisi = route ini menolak semua
//                           permintaan. Itu disengaja: gagal tertutup, bukan
//                           gagal terbuka, supaya lupa mengisi env tidak
//                           diam-diam membuka kembali lubang aslinya.
//
// Token dikirim gateway pada header `X-Payment-Token`.

const NAMA_HEADER_TOKEN = "x-payment-token";

/**
 * Bandingkan dua rahasia tanpa membocorkan panjang kecocokan lewat waktu.
 *
 * `a === b` pada string berhenti di karakter pertama yang berbeda, jadi lama
 * pembandingannya menceritakan berapa banyak karakter awal yang sudah benar —
 * cukup untuk menebak token satu karakter demi satu karakter. `timingSafeEqual`
 * selalu memeriksa seluruh isi.
 */
function tokenCocok(dikirim: string, diharapkan: string): boolean {
  const a = Buffer.from(dikirim, "utf8");
  const b = Buffer.from(diharapkan, "utf8");
  // timingSafeEqual melempar bila panjangnya berbeda. Panjang token memang
  // bukan rahasia, jadi keluar lebih awal di sini tidak membocorkan apa pun.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// API NOTIFIKASI PEMBAYARAN MASUK
export async function POST(req: Request) {
  // ---------------------------------------------------------------- penjaga
  const tokenServer = process.env.PAYMENT_WEBHOOK_TOKEN;

  if (!tokenServer) {
    console.error(
      "🚫 [NOTIFY] PAYMENT_WEBHOOK_TOKEN belum diisi — semua notifikasi " +
      "pembayaran ditolak. Isi variabel itu di environment sebelum " +
      "menghubungkan gateway."
    );
    return NextResponse.json(
      { message: "Payment webhook is not configured" },
      { status: 503 }
    );
  }

  const tokenClient = req.headers.get(NAMA_HEADER_TOKEN);

  if (!tokenClient || !tokenCocok(tokenClient, tokenServer)) {
    // Pesan ke pemanggil sengaja tidak menjelaskan apa yang kurang: pengirim
    // yang sah sudah tahu caranya, dan yang tidak sah tidak perlu dibantu.
    // Keterangan lengkapnya masuk ke log server saja.
    console.warn("🚫 [NOTIFY] Token webhook salah atau tidak disertakan. Permintaan ditolak.");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  // ------------------------------------------------------------ akhir penjaga

  try {
    const body = await req.json();
    const { orderId } = body;

    if (typeof orderId !== "string" || orderId.length === 0) {
      return NextResponse.json({ message: "orderId wajib diisi" }, { status: 400 });
    }

    console.log("💰 [NOTIFY] Menerima sinyal bayar untuk order:", orderId);

    // 1. Ambil Data
    const order = await prisma.booking.findUnique({
        where: { id: orderId },
        include: { user: true, billboard: true }
    });

    if (!order) {
        console.error("❌ Order tidak ditemukan!");
        return NextResponse.json({ message: "Order not found" }, { status: 404 });
    }

    // 2. IDEMPOTENCY — notifikasi ganda tidak boleh menggandakan apa pun.
    //
    // Gateway mengirim ulang notifikasi yang sama ketika tidak menerima balasan
    // 200 (jaringan putus, server lambat, deploy di tengah jalan). Tanpa
    // penjaga ini, setiap pengulangan menimpa `paidAt` dengan waktu baru dan
    // mengirim satu set email "uang masuk" lagi ke admin dan ke pembeli —
    // admin lalu melihat beberapa pemberitahuan untuk satu pembayaran dan bisa
    // memproses pesanan yang sama dua kali.
    //
    // Balasan tetap 200: bagi gateway, pesan ini SUDAH diterima. Membalas error
    // justru membuatnya mengulang lagi, tanpa henti.
    if (order.paidAt || order.status !== BookingStatus.PENDING_PAYMENT) {
        console.log(
          `↩️ [NOTIFY] Notifikasi diabaikan: order ${orderId} sudah berstatus ` +
          `${order.status}${order.paidAt ? ` dan tercatat dibayar ${order.paidAt.toISOString()}` : ""}.`
        );
        return NextResponse.json({ status: 'ok', duplicate: true });
    }

    // Pemeriksaan transisi tetap dijalankan walaupun syarat di atas sudah
    // mempersempitnya ke PENDING_PAYMENT — supaya bila suatu saat syarat itu
    // dilonggarkan, aturan perpindahan status tidak ikut hilang diam-diam.
    if (!transisiSah(order.status, BookingStatus.PAID_CONFIRMED)) {
        console.warn(`🚫 [NOTIFY] Order ${orderId} berstatus ${order.status}, tidak bisa ditandai lunas.`);
        return NextResponse.json({ status: 'ok', ignored: true });
    }

    // 3. CEK NOMINAL — tanpa ini, bayar Rp 1.000 bisa melunasi Rp 50.000.000.
    //
    // Nominal yang ditagihkan sekarang adalah `dpAmount` bila pembeli memilih
    // DP, dan `totalPrice` bila lunas. `dpAmount` bernilai 0 pada pesanan lunas
    // (diisi booking/create), jadi nol berarti "tidak ada skema DP", bukan
    // "tidak ada tagihan".
    //
    // Nama field nominal berbeda-beda antar gateway (`gross_amount`, `amount`,
    // `paid_amount`), jadi beberapa kemungkinan diterima di sini. Begitu
    // gatewaynya dipilih, sempitkan ke satu field saja — menerima banyak nama
    // berarti pengirim yang memilih nama mana yang dibaca.
    const nominalDibayar = keDecimal(
        body.gross_amount ?? body.amount ?? body.paid_amount ?? null
    );
    const nominalDitagih = nol(order.dpAmount) ? order.totalPrice : order.dpAmount;

    if (nol(nominalDibayar)) {
        // Notifikasi tanpa nominal tidak bisa diperiksa, jadi tidak boleh
        // dipercaya. Ini bukan pengulangan — 400 supaya terlihat di log gateway.
        console.error(`❌ [NOTIFY] Order ${orderId}: notifikasi tidak menyertakan nominal pembayaran.`);
        return NextResponse.json(
            { message: "Nominal pembayaran tidak disertakan" },
            { status: 400 }
        );
    }

    // Kurang bayar ditolak; lebih bayar diterima tapi dicatat, karena menahan
    // pesanan yang uangnya sudah masuk merugikan pembeli dan selisihnya urusan
    // admin, bukan urusan gerbang ini.
    if (lebihKecil(nominalDibayar, nominalDitagih)) {
        console.error(
          `❌ [NOTIFY] Order ${orderId}: nominal kurang. ` +
          `Dibayar ${rupiah(nominalDibayar)}, ditagih ${rupiah(nominalDitagih)}.`
        );
        return NextResponse.json(
            { message: "Nominal pembayaran tidak sesuai tagihan" },
            { status: 400 }
        );
    }

    // 4. Update Status & Catat Waktu Bayar
    //
    // Dulu baris ini langsung melompat ke 'IN_PRODUCTION' atau
    // 'DESIGN_RECEIVED' — artinya pesanan masuk antrean cetak begitu ada
    // sinyal bayar, tanpa seorang pun memeriksa uangnya benar-benar masuk.
    // Padahal email yang dikirim fungsi ini sendiri (beberapa baris di bawah)
    // berbunyi "MENUNGGU VERIFIKASI ADMIN", dan dashboard admin punya tombol
    // "Verifikasi" yang menunggu status 'PAID_CONFIRMED' — tombol yang tidak
    // pernah muncul karena status itu tidak pernah ditulis.
    //
    // Sekarang: bayar → PAID_CONFIRMED (menunggu admin) → admin klik
    // Verifikasi → IN_PRODUCTION / DESIGN_RECEIVED. Percabangan berdasarkan
    // designOption sudah ada di OrderActions.handleApprovePayment.
    //
    // `status` dan `paidAt` ikut disyaratkan pada `where`: bila dua notifikasi
    // tiba bersamaan, keduanya bisa sama-sama lolos pemeriksaan idempotency di
    // atas, dan hanya syarat di sini yang memastikan tepat satu yang menulis.
    const { count } = await prisma.booking.updateMany({
        where: {
            id: orderId,
            status: BookingStatus.PENDING_PAYMENT,
            paidAt: null,
        },
        data: {
            status: BookingStatus.PAID_CONFIRMED,
            paidAt: new Date() // <-- PENGISIAN TIMESTAMP KUNCI
        }
    });

    if (count === 0) {
        console.log(`↩️ [NOTIFY] Order ${orderId} sudah diproses notifikasi lain. Email tidak dikirim ulang.`);
        return NextResponse.json({ status: 'ok', duplicate: true });
    }

    console.log(`✅ Status Updated: PAID_CONFIRMED & Waktu bayar dicatat`);

    // Email baru dikirim SETELAH penulisan berhasil, dan hanya oleh permintaan
    // yang benar-benar menulis — di situlah penggandaan email dihentikan.

    // 5. LOGIKA KIRIM EMAIL (ADMIN FIRST)

    // PERHATIAN: Pastikan ADMIN_EMAIL ada isinya
    const adminEmail = process.env.ADMIN_EMAIL;

    // Pesanan DP belum lunas. Email lama selalu berbunyi "[LUNAS]" dan "sudah
    // membayar lunas", sehingga admin mengira sisa 40% sudah masuk dan tidak
    // pernah menagihnya.
    const bayarDp = !nol(order.dpAmount) && lebihKecil(order.dpAmount, order.totalPrice);
    const labelBayar = bayarDp ? "DP" : "LUNAS";
    const sisaTagihan = kurang(order.totalPrice, order.dpAmount);

    // Pengiriman email TIDAK di-`await` sebelum respons.
    //
    // Gateway pembayaran menunggu jawaban webhook ini dalam hitungan detik;
    // lewat dari itu ia menganggap notifikasinya gagal dan mengirim ulang.
    // Sebelumnya respons baru dikirim setelah dua koneksi SMTP selesai plus
    // jeda satu detik yang ditulis langsung di kode — saat server SMTP lambat,
    // totalnya mudah melewati ambang itu. Gateway lalu mengulang notifikasi,
    // dan tiap pengulangan membayar jeda dan SMTP yang sama lagi.
    //
    // Yang menentukan pembayaran diterima adalah penulisan database di atas,
    // dan itu sudah selesai. Email hanya pemberitahuan: kegagalannya tidak
    // boleh membuat gateway mengira pembayarannya gagal.
    const kirimNotifikasi = async () => {
    if (adminEmail) {
        const successAdmin = await sendEmail({
            to: adminEmail,
            subject: `[${labelBayar}] Uang Masuk: ${rupiah(nominalDibayar)}`,
            title: "Ada Pembayaran Masuk! 💰",
            message: bayarDp
                ? `User <b>${order.user.name}</b> membayar <b>DP</b> sebesar ${rupiah(nominalDibayar)} ` +
                  `dari total ${rupiah(order.totalPrice)}.<br/>` +
                  `Sisa <b>${rupiah(sisaTagihan)}</b> ditagihkan H-3 tayang.<br/>` +
                  `Segera cek dashboard dan Klik Terima.`
                : `User <b>${order.user.name}</b> sudah membayar lunas. Total: ${rupiah(nominalDibayar)}.<br/>` +
                  `Segera cek dashboard dan Klik Terima.`,
            orderDetail: {
                id: order.id,
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration,
                total: keAngka(nominalDibayar),
                status: "MENUNGGU VERIFIKASI ADMIN"
            }
        });

        if (!successAdmin) console.error("⚠️ Gagal kirim ke Admin!");
    } else {
        console.error("⚠️ ADMIN_EMAIL di file .env kosong/tidak terbaca!");
    }

    // Jeda 1 detik biar SMTP tidak ngambek (Rate Limit Prevention).
    // Kini jeda ini terjadi SETELAH respons dikirim, jadi ia tidak lagi
    // menahan jawaban ke gateway.
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 6. KIRIM EMAIL KE USER (CONFIRMATION)
    if (order.user.email) {
        await sendEmail({
            to: order.user.email,
            subject: bayarDp
                ? `DP Diterima! Order #${order.id.slice(-6).toUpperCase()}`
                : `Pembayaran Berhasil! Order #${order.id.slice(-6).toUpperCase()}`,
            title: bayarDp ? "DP Telah Diterima" : "Dana Telah Diterima",
            message: bayarDp
                ? `Terima kasih! DP sebesar ${rupiah(nominalDibayar)} sudah masuk ke sistem kami. ` +
                  `Sisa pembayaran <b>${rupiah(sisaTagihan)}</b> ` +
                  `dibayarkan H-3 sebelum tayang. Tim Admin akan memverifikasi dalam waktu singkat.`
                : `Terima kasih! Dana sebesar ${rupiah(nominalDibayar)} sudah masuk ke sistem kami. ` +
                  `Tim Admin akan memverifikasi dalam waktu singkat.`,
            orderDetail: {
                id: order.id,
                billboardTitle: order.billboard.title,
                billboardAddress: order.billboard.address,
                duration: order.duration,
                total: keAngka(nominalDibayar),
                status: "SEDANG DIVERIFIKASI"
            }
        });
        console.log("📨 Konfirmasi terkirim ke User:", order.user.email);
    }
    };

    // `void` dengan penangkap galat sendiri: tanpa `.catch()`, kegagalan di
    // dalam promise yang tidak di-`await` menjadi unhandled rejection yang bisa
    // menghentikan proses Node.
    //
    // CATATAN: pada platform serverless, proses bisa dibekukan segera setelah
    // respons dikirim, sehingga email belum sempat terkirim. Bila aplikasi ini
    // di-deploy ke Vercel/Lambda, ganti baris ini dengan `waitUntil()` dari
    // runtime yang bersangkutan, atau pindahkan pengiriman email ke antrean.
    void kirimNotifikasi().catch((error) => {
        console.error("⚠️ Gagal mengirim notifikasi pembayaran:", error);
    });

    return NextResponse.json({ status: 'ok' });

  } catch (error: any) {
    console.error("🔥 Server Error (Notify):", error.message);
    return NextResponse.json({ message: "Server Error" }, { status: 500 });
  }
}
