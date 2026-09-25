import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mail";
import { DesignOption, daftarNilai, sahDesignOption } from "@/lib/enum-guard";
import { addMonths, isBefore, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";
import { jumlah, kali, keAngka, keDecimal, kurang, persen, rupiah } from "@/lib/money";
import { adalahBentrokTanggal } from "@/lib/db-error";
import {
  STATUS_MENGUNCI_TANGGAL,
  hitungTenggatPembayaran,
  sapuPesananKedaluwarsa,
} from "@/lib/transisi-status";

// ============================================================================
// TARIF — satu-satunya tempat angka ini ditetapkan untuk sisi server.
//
// Sebelumnya tarif hanya hidup di `CheckoutForm.tsx`, yaitu di BROWSER PEMBELI.
// Route ini menerima `totalPrice` dan `dpAmount` jadi dari sana dan menyimpannya
// apa adanya. Siapa pun yang bisa menjalankan `curl` dapat memesan billboard
// Rp 300.000.000 seharga Rp 1 — dan invoice, email, serta dashboard admin akan
// dengan patuh menampilkan Rp 1, karena tidak ada satu pun angka pembanding
// yang disimpan.
//
// Sekarang seluruh nominal dihitung di sini dari `billboard.price` yang dibaca
// langsung dari database. Nilai uang yang dikirim browser DIABAIKAN SEPENUHNYA
// — tidak dibaca, tidak dibandingkan, tidak dipakai sebagai cadangan.
// ============================================================================

/** Persentase PPN yang ditagihkan di atas harga sewa. */
const PERSEN_PPN = 11;

/** Biaya administrasi tetap per pesanan, dalam rupiah. */
const BIAYA_ADMIN = 50_000;

/** Porsi yang harus dibayar di muka bila pembeli memilih DP. */
const PERSEN_DP = 60;

/** Durasi sewa yang masih dianggap wajar, dalam bulan. */
const DURASI_MIN = 1;
const DURASI_MAX = 24;

/**
 * Bulatkan ke rupiah utuh.
 *
 * Rupiah tidak dipakai sampai sen, tapi PPN 11% dan DP 60% hampir selalu
 * menghasilkan pecahan. Dulu pecahan itu mengalir mentah ke dua tempat
 * sekaligus: ke layar (dibulatkan oleh `toLocaleString`, jadi terlihat rapi)
 * dan ke database (disimpan apa adanya sampai 2 desimal). Dua angka itu lalu
 * berbeda — pembeli melihat Rp 20.010.000 sementara tagihan yang tercatat
 * Rp 20.009.999,99, dan selisihnya muncul lagi saat refund dihitung.
 *
 * Dibulatkan sekali di sini, ke atas pada angka 5, sama dengan perlakuan
 * `persen()` di money.ts.
 */
function bulatkanRupiah(nilai: Prisma.Decimal): Prisma.Decimal {
  return keDecimal(nilai).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

/** Penanda bahwa tanggal yang diminta bentrok — dibedakan dari error lain. */
class TanggalBentrok extends Error {
  constructor(public readonly mulai: Date, public readonly selesai: Date) {
    super("Tanggal bentrok");
    this.name = "TanggalBentrok";
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ message: "Sesi Habis." }, { status: 401 });
    }

    // Blokir Admin Booking
    if (session.user.role === 'ADMIN' || session.user.role === 'SUPER_ADMIN') {
        return NextResponse.json({ message: "Admin dilarang membuat pesanan." }, { status: 403 });
    }

    const body = await req.json();

    // `totalPrice` dan `dpAmount` SENGAJA tidak diambil dari body. Bila suatu
    // saat ada yang menambahkannya kembali ke sini, harganya kembali ditentukan
    // browser — lihat catatan tarif di atas.
    const { billboardId, duration, paymentType, designOption, startDateString } = body;

    // Kolom `designOption` bertipe enum (`upload` / `service`, huruf kecil —
    // lihat catatan di schema.prisma). Nilai ini datang mentah dari browser
    // dan langsung masuk ke `booking.create` di bawah; nilai asing membatalkan
    // seluruh pemesanan dengan pesan "Error Server" yang tidak menjelaskan
    // apa pun kepada pembeli.
    if (!sahDesignOption(designOption)) {
        return NextResponse.json(
            { message: `Pilihan desain tidak dikenal. Pilihan: ${daftarNilai(DesignOption)}` },
            { status: 400 }
        );
    }

    if (typeof billboardId !== 'string' || billboardId.length === 0) {
        return NextResponse.json({ message: "Billboard tidak dipilih." }, { status: 400 });
    }

    // Durasi dipakai untuk dua hal yang sama-sama mengikat: mengalikan harga
    // sewa dan menggeser tanggal selesai. Nilai pecahan, negatif, atau teks
    // menghasilkan tagihan negatif dan rentang tanggal terbalik — dan rentang
    // terbalik membuat pemeriksaan tumpang-tindih di bawah tidak pernah cocok,
    // jadi tanggal yang sudah terjual bisa dijual ulang.
    const durasi = Number(duration);
    if (!Number.isInteger(durasi) || durasi < DURASI_MIN || durasi > DURASI_MAX) {
        return NextResponse.json(
            { message: `Durasi sewa harus bilangan bulat ${DURASI_MIN}–${DURASI_MAX} bulan.` },
            { status: 400 }
        );
    }

    // Tanggal mulai juga datang mentah dari browser. `new Date("halo")`
    // menghasilkan Invalid Date, yang lolos sampai ke Prisma dan menggagalkan
    // pemesanan dengan pesan yang tidak menjelaskan apa pun.
    const startDate = startOfDay(new Date(startDateString));
    if (Number.isNaN(startDate.getTime())) {
        return NextResponse.json({ message: "Tanggal mulai tayang tidak valid." }, { status: 400 });
    }
    if (isBefore(startDate, startOfDay(new Date()))) {
        return NextResponse.json(
            { message: "Tanggal mulai tayang tidak boleh di masa lalu." },
            { status: 400 }
        );
    }

    // `endDate.setMonth(bulan + durasi)` dulu dipakai di sini. JavaScript tidak
    // memendekkan tanggal saat bulan tujuan lebih pendek: 31 Januari + 1 bulan
    // menjadi 31 Februari, yang otomatis meluber menjadi 3 Maret. Pembeli
    // membayar 1 bulan tapi tercatat menyewa 31 hari lewat — dan tanggal luberan
    // itu ikut mengunci pesanan berikutnya. `addMonths` menjepitnya ke hari
    // terakhir bulan tujuan (28/29 Februari).
    const endDate = addMonths(startDate, durasi);

    // 1. Ambil Data Billboard — sumber harga yang mengikat, sekaligus untuk
    //    nama & alamat di email.
    const targetBillboard = await prisma.billboard.findUnique({
        where: { id: billboardId }
    });

    // Gerbang `status !== 'Available'` dipertahankan karena admin memang bisa
    // menutup satu billboard secara manual lewat dashboard. Tapi gerbang ini
    // TIDAK melindungi dari pemesanan ganda: tidak ada kode yang pernah menulis
    // 'Booked', jadi ia selalu terbuka. Penjaga yang sebenarnya adalah
    // pemeriksaan tumpang-tindih tanggal di dalam transaksi di bawah.
    if (!targetBillboard || targetBillboard.status !== 'Available') {
         return NextResponse.json({ message: "Billboard tidak tersedia." }, { status: 400 });
    }

    // ------------------------------------------------------------------
    // 2. HITUNG TAGIHAN — seluruhnya di server, dari harga di database.
    //
    // `unitPrice` adalah salinan harga billboard PADA SAAT pesanan dibuat.
    // Tanpa salinan itu, satu-satunya cara merekonstruksi rincian invoice lama
    // adalah membagi `totalPrice` dengan harga billboard yang berlaku SEKARANG
    // — jadi setiap kali harga sebuah billboard dinaikkan, seluruh laporan
    // historisnya ikut bergeser dan angka tahun lalu berubah sendiri.
    // ------------------------------------------------------------------
    const unitPrice = keDecimal(targetBillboard.price);
    const basePrice = bulatkanRupiah(kali(unitPrice, durasi));
    const taxAmount = bulatkanRupiah(persen(basePrice, PERSEN_PPN));
    const adminFee = keDecimal(BIAYA_ADMIN);
    const totalPrice = bulatkanRupiah(jumlah(basePrice, taxAmount, adminFee));

    // `paymentType` hanya boleh memilih SKEMA bayar, bukan NOMINAL-nya.
    const bayarDp = paymentType === 'dp';
    const dpAmount = bayarDp
        ? bulatkanRupiah(persen(totalPrice, PERSEN_DP))
        : keDecimal(0);

    // Nominal yang benar-benar ditagihkan sekarang. Dulu email selalu memuat
    // `totalPrice` walaupun pembeli memilih DP — lihat catatan di bagian email.
    const tagihanSekarang = bayarDp ? dpAmount : totalPrice;

    // ------------------------------------------------------------------
    // 3. Sapu pesanan yang tenggat bayarnya sudah lewat, lalu simpan.
    //
    // Penyapuan dijalankan lebih dulu supaya tanggal yang dikunci pesanan
    // hangus tidak ikut menolak pembeli ini. Kegagalannya tidak menggagalkan
    // pemesanan (lihat sapuPesananKedaluwarsa).
    // ------------------------------------------------------------------
    await sapuPesananKedaluwarsa(billboardId);

    let newBooking;
    try {
        newBooking = await prisma.$transaction(async (tx) => {
            // PEMERIKSAAN TUMPANG-TINDIH TANGGAL.
            //
            // Dua rentang bertabrakan bila yang satu mulai sebelum yang lain
            // selesai DAN selesai setelah yang lain mulai. Perbandingannya
            // sengaja `<` dan `>`, bukan `<=`/`>=`: pesanan yang berakhir
            // tepat pada hari pesanan berikutnya dimulai TIDAK bertabrakan,
            // karena `endDate` adalah batas eksklusif (hasil addMonths dari
            // startDate).
            //
            // Status yang dihitung "masih hidup" ada di STATUS_MENGUNCI_TANGGAL
            // — semuanya kecuali CANCELLED dan REFUNDED.
            const bentrok = await tx.booking.findFirst({
                where: {
                    billboardId,
                    status: { in: [...STATUS_MENGUNCI_TANGGAL] },
                    startDate: { lt: endDate },
                    endDate: { gt: startDate },
                },
                select: { startDate: true, endDate: true },
            });

            if (bentrok) {
                throw new TanggalBentrok(bentrok.startDate, bentrok.endDate);
            }

            // Transaksi ini memakai tingkat isolasi bawaan PostgreSQL (read
            // committed), jadi dua permintaan yang tiba pada detik yang sama
            // bisa sama-sama lolos pemeriksaan di atas sebelum salah satunya
            // menyimpan. Yang menutup celah itu adalah constraint
            // `EXCLUDE USING gist` bernama `booking_tanpa_tumpang_tindih` di
            // tingkat database: ia menolak penulisan kedua, dan penolakan itu
            // ditangkap di bawah lalu diterjemahkan menjadi jawaban 409 yang
            // sama dengan `TanggalBentrok`.
            return tx.booking.create({
                data: {
                    userId: session.user.id,
                    billboardId,
                    startDate,
                    endDate,
                    duration: durasi,

                    // Rincian tagihan, semuanya hasil hitungan server.
                    unitPrice,
                    basePrice,
                    taxAmount,
                    adminFee,
                    totalPrice,
                    dpAmount,

                    status: "PENDING_PAYMENT",

                    // Tenggat bayar dicatat sebagai FAKTA di database, bukan
                    // sekadar hitung mundur di browser. Tanpa kolom ini tidak
                    // ada cara menghanguskan pesanan yang ditinggalkan, dan
                    // tanggalnya terkunci selamanya.
                    expiresAt: hitungTenggatPembayaran(),

                    designOption,
                }
            });
        });
    } catch (error) {
        // Dua jalan menuju jawaban yang sama.
        //
        // `TanggalBentrok` dilempar pemeriksaan di atas — kasus biasa, dan satu-
        // satunya yang tahu tanggal mana yang bentrok.
        //
        // `adalahBentrokTanggal` menangkap penolakan constraint database. Itu
        // kasus balapan: dua permintaan lolos pemeriksaan bersamaan, database
        // menolak yang kedua. Sebelumnya galat itu dilempar ulang dan jatuh ke
        // penanganan 500 umum, sehingga pembeli membaca "Error Server" —
        // padahal penyebabnya persis sama dan pesan yang benar sudah ditulis di
        // sini. Justru pada kasus yang paling mungkin terjadi di titik populer,
        // pesan yang tepat tidak pernah sampai.
        if (error instanceof TanggalBentrok || adalahBentrokTanggal(error)) {
            return NextResponse.json(
                {
                    message:
                        "Tanggal yang Anda pilih sudah dipesan orang lain. " +
                        "Silakan pilih tanggal mulai atau durasi yang berbeda.",
                },
                { status: 409 }
            );
        }
        throw error;
    }

    const labelTagihan = bayarDp ? `DP ${PERSEN_DP}%` : "Lunas";

    // 4. KIRIM EMAIL KE USER
    //
    // Dulu email ini selalu memuat `totalPrice` dan berjudul seolah tagihan
    // penuh, walaupun pembeli memilih DP. Pembeli yang menurut sistem hanya
    // perlu membayar 60% menerima tagihan 100% — lalu membayar salah nominal,
    // atau mengurungkan pemesanannya.
    if (session.user.email) {
        await sendEmail({
            to: session.user.email,
            subject: bayarDp
                ? `Tagihan DP ${PERSEN_DP}% Order #${newBooking.id.slice(-6).toUpperCase()} — ${rupiah(dpAmount)}`
                : `Tagihan Lunas Order #${newBooking.id.slice(-6).toUpperCase()} — ${rupiah(totalPrice)}`,
            title: bayarDp ? "Pesanan Diterima — Menunggu DP" : "Pesanan Diterima — Menunggu Pelunasan",
            message: bayarDp
                ? `Halo ${session.user.name}, pesanan Anda telah kami terima.<br/><br/>` +
                  `Total nilai pesanan: <b>${rupiah(totalPrice)}</b><br/>` +
                  `Yang perlu dibayar sekarang (DP ${PERSEN_DP}%): <b>${rupiah(dpAmount)}</b><br/>` +
                  `Sisa <b>${rupiah(kurang(totalPrice, dpAmount))}</b> dibayarkan H-3 sebelum tayang.`
                : `Halo ${session.user.name}, pesanan Anda telah kami terima.<br/><br/>` +
                  `Yang perlu dibayar sekarang (lunas): <b>${rupiah(totalPrice)}</b>`,
            orderDetail: {
                id: newBooking.id,
                billboardTitle: targetBillboard.title,
                billboardAddress: targetBillboard.address,
                duration: durasi,
                // Nominal yang benar-benar ditagihkan, bukan nilai pesanan.
                total: keAngka(tagihanSekarang),
                status: "PENDING_PAYMENT"
            }
        });
    }

    // 5. KIRIM EMAIL KE ADMIN (Jika ada di .env)
    const adminEmail = process.env.ADMIN_EMAIL;

    if (adminEmail) {
        await sendEmail({
            to: adminEmail,
            subject: `[ADMIN] Order Masuk (${labelTagihan}): ${targetBillboard.title}`,
            title: "Ada Cuan Masuk! 💰",
            message:
                `User ${session.user.name} baru saja membuat pesanan.<br/>` +
                `Nilai pesanan: <b>${rupiah(totalPrice)}</b> — skema bayar: <b>${labelTagihan}</b>` +
                (bayarDp ? `, ditagih sekarang <b>${rupiah(dpAmount)}</b>` : "") +
                `.<br/>Mohon cek dashboard.`,
            orderDetail: {
                id: newBooking.id,
                billboardTitle: targetBillboard.title,
                billboardAddress: targetBillboard.address,
                duration: durasi,
                total: keAngka(totalPrice),
                status: "PENDING VERIFICATION"
            }
        });
    }

    // Nominal dikembalikan sebagai angka biasa: objek Decimal tidak bisa
    // diubah menjadi JSON, dan respons ini dibaca komponen client.
    return NextResponse.json({
        message: "Sukses",
        orderId: newBooking.id,
        totalPrice: keAngka(totalPrice),
        dpAmount: keAngka(dpAmount),
        tagihanSekarang: keAngka(tagihanSekarang),
    });

  } catch (error: any) {
    console.error("🔥 Server Error:", error);
    return NextResponse.json({ message: "Error Server" }, { status: 500 });
  }
}
