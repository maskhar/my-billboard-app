-- TABEL PEMBAYARAN + BACKFILL RIWAYAT PEMBAYARAN YANG SUDAH ADA
--
-- MASALAH YANG DIPERBAIKI
-- -----------------------
-- Sampai sekarang "berapa uang yang sudah masuk untuk pesanan ini" tidak pernah
-- disimpan. Ia DITEBAK dari `dpAmount`: kalau kolom itu berisi angka, dianggap
-- yang masuk baru DP; kalau nol, dianggap sudah lunas. Tebakan itu benar hanya
-- selama satu pesanan dibayar tepat satu kali. Begitu pelunasan sisa DP ada,
-- pesanan yang sudah lunas penuh tetap terhitung baru menyetor DP — dan refund,
-- yang dihitung sebagai persentase dari uang masuk, membayar lebih sedikit
-- daripada yang benar-benar diterima.
--
-- KENAPA TABEL BARU, BUKAN KOLOM TAMBAHAN DI BOOKING
-- --------------------------------------------------
-- Karena jumlah pembayaran per pesanan tidak terbatas: `AdditionalCharge`
-- berada DI LUAR `totalPrice` dan admin boleh menambahkannya SETELAH pelunasan.
-- Satu kolom `paidAmount` akan terus ditimpa dan riwayatnya hilang.
--
-- CATATAN PENGUNCIAN
-- ------------------
-- Hanya membuat tabel, tipe, dan indeks, lalu satu INSERT. Tidak ada penulisan
-- ulang tabel yang sudah ada, jadi tidak ada penguncian berat. Aman dijalankan
-- kapan saja.

-- LANGKAH 1 — tipe enum.
CREATE TYPE "PaymentTujuan" AS ENUM ('DP', 'FULL', 'PELUNASAN', 'TAMBAHAN');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'VOIDED');

-- LANGKAH 2 — id pelanggan Xendit pada User.
--
-- `customer.reference_id` di Xendit harus unik. Mengirim pengenal yang sama
-- untuk pembayaran kedua seorang pengguna dijawab 409 DUPLICATE_ERROR, jadi
-- hasil pembuatan pertama disimpan dan dipakai ulang.
ALTER TABLE "User" ADD COLUMN "xenditCustomerId" TEXT;
CREATE UNIQUE INDEX "User_xenditCustomerId_key" ON "User"("xenditCustomerId");

-- LANGKAH 3 — tabel Payment.
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "tujuan" "PaymentTujuan" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "jumlah" DECIMAL(15,2) NOT NULL,
    "providerReferenceId" TEXT,
    "providerSessionId" TEXT,
    "providerPaymentId" TEXT,
    "providerCheckoutUrl" TEXT,
    "callbackPayload" JSONB,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- Dibuat internal sebelum memanggil Xendit. Jadi bila proses mati sesudah sesi
-- provider dibuat tapi sebelum ID sesinya tersimpan, webhook tetap bisa mencari
-- baris Payment melalui `reference_id` ini.
CREATE UNIQUE INDEX "Payment_providerReferenceId_key" ON "Payment"("providerReferenceId");
CREATE UNIQUE INDEX "Payment_providerSessionId_key" ON "Payment"("providerSessionId");
-- Satu Payment ID Xendit = satu transaksi uang nyata. Unik supaya webhook yang
-- diulang atau salah cocok tidak bisa mencatat pembayaran yang sama dua kali.
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE INDEX "Payment_bookingId_createdAt_idx" ON "Payment"("bookingId", "createdAt");
CREATE INDEX "Payment_status_expiresAt_idx" ON "Payment"("status", "expiresAt");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- LANGKAH 4 — satu tagihan menganggur per (pesanan, tujuan).
--
-- Ini menegakkan keputusan pemilik proyek: pelunasan dibayar SEKALI PENUH,
-- tidak dicicil. Tanpa indeks ini, pembeli yang menekan tombol "Bayar" dua kali
-- —atau menunggu tagihan pertama hampir kedaluwarsa lalu membuat yang baru—
-- meninggalkan dua tagihan PENDING hidup untuk hal yang sama. Bila keduanya
-- akhirnya dibayar, sistem menerima dua kali uang pelunasan dan harus
-- mengembalikan selisihnya secara manual.
--
-- `WHERE status = 'PENDING'` penting: pembatasan hanya berlaku pada tagihan yang
-- masih menganggur. Tagihan yang sudah PAID/EXPIRED/VOIDED boleh berjumlah
-- berapa pun — justru harus, karena tagihan yang kedaluwarsa lalu dibuat lagi
-- adalah alur yang normal.
--
-- Prisma tidak bisa menyatakan indeks unik bersyarat, jadi ditulis tangan di
-- sini. Sama seperti `booking_tanpa_tumpang_tindih`, `prisma migrate diff` akan
-- menganggapnya "perubahan yang belum ada di schema" — itu diharapkan; JANGAN
-- dihapus karena diff menyarankannya.
CREATE UNIQUE INDEX "payment_satu_tagihan_menganggur"
  ON "Payment"("bookingId", "tujuan")
  WHERE "status" = 'PENDING';

-- LANGKAH 5 — BACKFILL.
--
-- Pemilik proyek memilih backfill di migrasi, bukan cabang cadangan di kode.
-- Alasannya: sebuah cabang "kalau tidak ada baris Payment, hitung dari
-- dpAmount" akan hidup selamanya, dan selamanya pula menyimpan aturan lama yang
-- salah. Setelah baris di bawah masuk, hanya ada SATU cara menghitung uang
-- masuk, untuk pesanan lama maupun baru.
--
-- SIAPA YANG DAPAT BARIS
-- Pesanan yang uangnya memang sudah diterima:
--   - `paidAt` terisi, ATAU
--   - statusnya sudah melewati PENDING_PAYMENT (mis. diubah admin secara
--     manual tanpa lewat webhook, sehingga `paidAt` kosong).
-- Syarat kedua sengaja TIDAK mengecualikan CANCELLED, karena sebelum perbaikan
-- pada commit ac0bc58 pesanan yang sudah dibayar BISA dibatalkan langsung —
-- baris seperti itu tetap pernah menerima uang, dan mengabaikannya akan membuat
-- uang tersebut hilang dari catatan. Yang dikecualikan hanya kombinasi yang
-- pasti belum pernah dibayar: PENDING_PAYMENT dan CANCELLED tanpa `paidAt`.
--
-- NOMINAL DAN TUJUAN
-- Menyalin aturan lama APA ADANYA — `dpAmount` bila ia berisi angka yang lebih
-- kecil dari `totalPrice`, selain itu `totalPrice`. Ini disengaja: menyalin
-- aturan lama berarti angka refund pesanan lama tetap sama persis seperti
-- sebelum migrasi ini. Memakai aturan baru justru akan MENGUBAH nominal refund
-- pesanan yang sudah berjalan.
--
-- `id` dibuat dari id pesanan dengan awalan `backfill_`, bukan cuid acak: satu
-- baris per pesanan, jadi nilainya pasti unik, dan barisnya tetap bisa dikenali
-- sebagai hasil backfill bertahun-tahun kemudian.
INSERT INTO "Payment" (
    "id", "bookingId", "tujuan", "status", "jumlah", "paidAt", "createdAt", "updatedAt"
)
SELECT
    'backfill_' || b."id",
    b."id",
    CASE
      WHEN b."dpAmount" IS NOT NULL
       AND b."dpAmount" > 0
       AND b."dpAmount" < b."totalPrice"
      THEN 'DP'::"PaymentTujuan"
      ELSE 'FULL'::"PaymentTujuan"
    END,
    'PAID'::"PaymentStatus",
    CASE
      WHEN b."dpAmount" IS NOT NULL
       AND b."dpAmount" > 0
       AND b."dpAmount" < b."totalPrice"
      THEN b."dpAmount"
      ELSE b."totalPrice"
    END,
    -- `paidAt` pada Payment tidak boleh kosong untuk baris berstatus PAID —
    -- kalau kosong, laporan mana pun yang mengurutkan berdasarkan waktu bayar
    -- akan melewatkannya. Untuk pesanan yang statusnya sudah maju tapi `paidAt`
    -- pesanannya kosong, dipakai waktu perubahan terakhir sebagai perkiraan
    -- terbaik yang tersedia.
    COALESCE(b."paidAt", b."updatedAt", b."createdAt"),
    COALESCE(b."paidAt", b."createdAt"),
    NOW()
FROM "Booking" b
WHERE b."paidAt" IS NOT NULL
   OR b."status" NOT IN ('PENDING_PAYMENT', 'CANCELLED');

-- PEMERIKSAAN SESUDAH MIGRASI (jalankan manual; tidak ikut dieksekusi)
--
--   -- Setiap pesanan yang pernah dibayar harus punya tepat satu baris backfill:
--   SELECT b."id", b."status", b."paidAt", COUNT(p."id") AS jumlah_payment
--   FROM "Booking" b LEFT JOIN "Payment" p ON p."bookingId" = b."id"
--   GROUP BY b."id", b."status", b."paidAt"
--   HAVING COUNT(p."id") <> 1
--      AND (b."paidAt" IS NOT NULL
--           OR b."status" NOT IN ('PENDING_PAYMENT', 'CANCELLED'));
--
--   -- Uang masuk hasil hitungan baru tidak boleh melebihi total tagihan:
--   SELECT b."id", b."totalPrice", SUM(p."jumlah") AS uang_masuk
--   FROM "Booking" b JOIN "Payment" p ON p."bookingId" = b."id"
--   WHERE p."status" = 'PAID' AND p."tujuan" <> 'TAMBAHAN'
--   GROUP BY b."id", b."totalPrice"
--   HAVING SUM(p."jumlah") > b."totalPrice";
