// src/lib/mail.ts
//
// Satu-satunya pintu keluar email. Isi surat disusun sebagai HTML, jadi ada
// dua kelas nilai yang masuk ke sini dan keduanya diperlakukan berbeda:
//
// - `title` dan seluruh isi `orderDetail` adalah TEKS. Modul ini yang
//   mengamankannya lewat `amankanHtml` — pemanggil tidak perlu (dan tidak
//   boleh) menyisipkan markup di sana.
// - `message` adalah HTML yang sudah jadi: pemanggil menulis `<b>` dan `<br/>`
//   di dalamnya. Karena itu PEMANGGIL yang wajib membungkus setiap nilai
//   pengguna (nama akun, alasan refund, keterangan biaya, nama bank) dengan
//   `amankanHtml` sebelum menyambungnya. Nilai dari `rupiah()` dan tanggal dari
//   `Intl` aman tanpa itu.
import nodemailer from 'nodemailer';
import { amankanHtml } from '@/lib/html';
import { rupiah, type NilaiUang } from '@/lib/money';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: true, // Ubah false jika pakai port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  logger: true, // Biarkan true biar kelihatan log-nya di terminal
  debug: true
});

/**
 * Ringkasan pesanan yang dicetak sebagai kartu di bawah isi surat.
 *
 * Dulu bertipe `any`, jadi TypeScript tidak pernah memprotes apa pun yang
 * dimasukkan ke sini. Ketika nominal Decimal dari database ikut terkirim,
 * `Intl.NumberFormat.format` menerimanya diam-diam dan mencetak "Rp NaN" —
 * di email tagihan yang sudah terlanjur sampai ke pelanggan. `total` sekarang
 * bertipe `NilaiUang` dan diformat lewat `rupiah()`, yang menerima Decimal,
 * number, maupun string.
 */
export type RingkasanPesananSurat = {
  id?: string | null;
  billboardTitle?: string | null;
  billboardAddress?: string | null;
  duration?: number | null;
  total?: NilaiUang;
  /** Ikut dibawa pemanggil untuk keterbacaan log; tidak dicetak di surat. */
  status?: string | null;
};

export type SuratKeluar = {
  /** Boleh kosong: surat tanpa penerima dibatalkan tanpa melempar. */
  to: string | null | undefined;
  subject: string;
  /** Teks polos. Diamankan di sini. */
  title: string;
  /** HTML yang sudah jadi. Nilai pengguna di dalamnya WAJIB sudah lewat `amankanHtml`. */
  message: string;
  orderDetail?: RingkasanPesananSurat;
};

const generateTemplate = (title: string, message: string, orderDetail?: RingkasanPesananSurat) => {
    // Template HTML Invoice Full (Dikembalikan seperti semula)
    //
    // `id` dipakai dua kali dengan aturan yang berbeda: sebagai teks di dalam
    // sel tabel (cukup `amankanHtml`) dan sebagai segmen URL di `href`
    // (`encodeURIComponent` dulu supaya karakter seperti `/` atau `?` tidak
    // mengubah tujuan tautannya, baru `amankanHtml` karena berada di atribut).
    const idPesanan = orderDetail?.id ?? null;
    const nomorPesanan = idPesanan ? idPesanan.slice(-8).toUpperCase() : 'NEW';
    const tautanInvoice = idPesanan
        ? `${process.env.NEXTAUTH_URL ?? ''}/invoice/${encodeURIComponent(idPesanan)}`
        : null;

    return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 680px; margin: 0 auto; border: 1px solid #eaeaea; border-radius: 12px; overflow: hidden; background-color: #fcfcfc;">
        <div style="background-color: #ffffff; padding: 30px; text-align: center; border-bottom: 1px solid #eaeaea;">
            <h2 style="color: #1a1a1a; margin: 0; letter-spacing: -1px; font-size: 24px;">UTERO <span style="color: #CE181E;">CLOUD</span></h2>
            <p style="color: #666; margin: 5px 0 0 0; font-size: 12px; letter-spacing: 1px;">PREMIUM OUTDOOR MEDIA</p>
        </div>

        <div style="padding: 40px 30px;">
            <h3 style="color: #CE181E; margin-top: 0;">${amankanHtml(title)}</h3>
            <p style="font-size: 15px; line-height: 1.6; color: #444;">${message}</p>

            ${orderDetail ? `
            <div style="background-color: #fff; padding: 25px; border-radius: 12px; margin-top: 25px; border: 1px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding-bottom: 15px; border-bottom: 1px dashed #ddd; font-size: 13px; color: #888;">Order ID</td>
                        <td style="padding-bottom: 15px; border-bottom: 1px dashed #ddd; font-size: 13px; font-weight: bold; text-align: right; color: #111;">#${amankanHtml(nomorPesanan)}</td>
                    </tr>
                    <tr>
                        <td colspan="2" style="padding-top: 15px; font-size: 16px; font-weight: bold; color: #000; padding-bottom: 5px;">${amankanHtml(orderDetail.billboardTitle || 'Produk Sewa')}</td>
                    </tr>
                    <tr>
                        <td colspan="2" style="font-size: 13px; color: #666; padding-bottom: 15px; border-bottom: 1px dashed #ddd;">${amankanHtml(orderDetail.billboardAddress || '')}</td>
                    </tr>
                    <tr>
                        <td style="padding: 15px 0 5px; font-size: 13px; color: #888;">Durasi</td>
                        <td style="padding: 15px 0 5px; font-weight: bold; text-align: right;">${amankanHtml(orderDetail.duration || 1)} Bulan</td>
                    </tr>
                    <tr>
                        <td style="padding-top: 15px; border-top: 2px solid #333; font-size: 16px; font-weight: bold; color: #333;">Total</td>
                        <td style="padding-top: 15px; border-top: 2px solid #333; font-size: 20px; font-weight: bold; text-align: right; color: #CE181E;">
                             ${amankanHtml(rupiah(orderDetail.total))}
                        </td>
                    </tr>
                </table>
            </div>

            ${tautanInvoice ? `
            <div style="text-align: center; margin-top: 30px;">
                <a href="${amankanHtml(tautanInvoice)}" style="background-color: #111; color: #fff; padding: 12px 25px; border-radius: 50px; text-decoration: none; font-size: 14px; font-weight: bold;">Lihat Invoice di Web &rarr;</a>
            </div>
            ` : ''}
            ` : ''}

            <p style="font-size: 12px; color: #aaa; margin-top: 40px; text-align: center; border-top: 1px solid #eee; padding-top: 20px;">
                &copy; 2025 Utero Indonesia
            </p>
        </div>
    </div>
    `;
};

/**
 * Kirim satu surat. Mengembalikan `true` bila SMTP menerimanya, `false` bila
 * penerimanya kosong atau SMTP menolak — TIDAK PERNAH melempar.
 *
 * Itu disengaja: hampir semua pemanggil mengirim surat SESUDAH uang atau status
 * tercatat di database, dan surat yang gagal tidak boleh mengubah respons
 * "berhasil" atas penulisan yang sudah commit. Pemanggil yang perlu tahu
 * hasilnya membaca nilai baliknya.
 */
export const sendEmail = async ({ to, subject, title, message, orderDetail }: SuratKeluar): Promise<boolean> => {
    // [SAFETY] Cek apakah penerimanya ada? Kalau tidak ada, STOP.
    if (!to) {
        console.warn("⚠️ Email batal dikirim: Penerima (to) tidak didefinisikan.");
        return false;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.MAIL_FROM,
            to: to,
            subject: subject,
            html: generateTemplate(title, message, orderDetail)
        });
        console.log("✅ Email Terkirim ke:", to, "| ID:", info.messageId);
        return true;
    } catch (error) {
        // Jangan mencatat objek galat mentah: galat nodemailer membawa jawaban
        // server SMTP dan perintah yang gagal, dan log adalah tempat rahasia
        // paling sering bocor tanpa ada yang menyadarinya.
        const kategori = error instanceof Error ? error.name.slice(0, 80) : 'galat-tidak-dikenal';
        console.error(`🔥 Gagal Kirim Email ke ${to}: ${kategori}`);
        return false;
    }
};
