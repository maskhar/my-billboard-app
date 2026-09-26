-- CLAIM SESI PEMBAYARAN
--
-- MASALAH YANG DIPERBAIKI
-- -----------------------
-- Membuat sesi pembayaran adalah panggilan HTTP ke gerbang pembayaran, dan
-- panggilan HTTP tidak bisa ikut ke dalam transaksi database. Dua permintaan
-- yang tiba bersamaan untuk satu tagihan — pembeli menekan tombol dua kali,
-- atau membuka dua tab — sama-sama melihat baris Payment tanpa sesi, lalu
-- sama-sama meminta sesi baru. Yang kedua menimpa yang pertama: sesi pertama
-- menjadi yatim, dan webhook yang datang darinya tidak bisa dicocokkan.
--
-- Tiga kolom di bawah adalah claim berumur pendek atas SATU upaya pembuatan
-- sesi. Hanya pemegang `sesiClaimToken` yang boleh menyimpan hasil panggilan
-- provider, jadi upaya yang kalah tidak pernah menimpa apa pun.
--
-- APA YANG COLUMN INI TIDAK JANJIKAN
-- ----------------------------------
-- Ini bukan exactly-once. `POST /sessions` di gerbang pembayaran tidak
-- mendukung idempotency key, jadi bila hasil panggilan tidak diketahui
-- (batas waktu, koneksi putus) tidak ada cara bertanya "apakah sesi tadi
-- jadi dibuat?" — tidak ada endpoint pencarian sesi berdasarkan reference.
--
-- Yang membuat keadaan itu aman bukan kolom ini, melainkan urutan penyimpanan:
-- kunci SDK hanya dikembalikan ke browser SETELAH id sesi tersimpan. Sesi yatim
-- karena itu tidak pernah bisa dibayar siapa pun, karena kuncinya tidak pernah
-- sampai ke browser mana pun. Ia dibiarkan kedaluwarsa sendiri. Claim yang
-- hasilnya tidak diketahui juga sengaja TIDAK dilepas lebih awal — dibiarkan
-- habis oleh waktu, supaya upaya berikutnya tidak berlomba dengan panggilan
-- yang mungkin masih berjalan.
--
-- CATATAN PENGUNCIAN
-- ------------------
-- Tiga kolom nullable tanpa nilai bawaan, jadi PostgreSQL hanya mengubah
-- katalog tanpa menulis ulang tabel. Pembuatan indeks memakai kunci tulis
-- singkat pada tabel yang masih kecil. Aman dijalankan kapan saja.

ALTER TABLE "Payment" ADD COLUMN "sesiClaimToken" TEXT;
ALTER TABLE "Payment" ADD COLUMN "sesiClaimedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "sesiClaimExpiresAt" TIMESTAMP(3);

-- Pencarian "tagihan yang claim-nya sudah habis" harus tetap murah ketika
-- beberapa proses melayani permintaan pembayaran bersamaan.
CREATE INDEX "Payment_status_sesiClaimExpiresAt_idx"
  ON "Payment"("status", "sesiClaimExpiresAt");
