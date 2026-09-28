-- Token reset sandi — tabel di belakang alur "Lupa sandi".
--
-- Seluruh migrasi ini HANYA MENAMBAH: satu tabel, tiga indeks, satu foreign key.
-- Tidak ada satu pun `DROP` atau `ALTER` atas objek yang sudah ada, jadi tidak
-- ada data lama yang bisa tersentuh.
--
-- Peringatan yang berlaku untuk repo ini dan harus tetap dibaca sebelum
-- menjalankan migrasi APA PUN di sini: `prisma migrate diff` tidak mengenali
-- `EXCLUDE USING gist` (`booking_tanpa_tumpang_tindih`) maupun indeks unik
-- bersyarat `payment_satu_tagihan_menganggur`, dan akan menyarankan
-- membuangnya. Keduanya adalah penjaga terakhir terhadap tanggal sewa yang
-- tumpang tindih dan tagihan ganda. Berkas ini ditulis tangan justru supaya
-- saran itu tidak pernah ikut.

-- CreateTable
--
-- `tokenHash`, bukan `token`. Yang tersimpan adalah SHA-256 atas token mentah;
-- token mentahnya hanya pernah ada di memori proses saat dibuat dan di tautan
-- yang dikirim ke kotak masuk pemiliknya. Database yang bocor karena itu tidak
-- memberi penyerang satu pun tautan reset yang masih bisa ditukar.
--
-- Bukan dua kolom di `User`: kolom di `User` ikut terkirim ke mana pun baris
-- `User` pergi, dan baris itu pergi ke banyak tempat lewat
-- `include: { user: true }`. Itu persis cacat `otpCode`/`otpExpires` yang sudah
-- dibuang dari `User` (task 3.27). Penjelasan lengkapnya ada di
-- `prisma/schema.prisma` pada model ini.
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "asalIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Unik, karena penukaran token mencari SATU baris lewat nilai ini. Tanpa unik,
-- dua baris bisa memuat hash yang sama dan tidak ada cara menentukan mana yang
-- ditukar.
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
-- Dipakai saat memeriksa apakah akun ini sudah punya permintaan aktif, dan saat
-- membatalkan seluruh token lama setelah satu berhasil ditukar.
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
-- Penyapu token kedaluwarsa menyaring dengan kolom ini.
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
-- `CASCADE`, bukan `RESTRICT`: baris ini bukan bukti uang seperti `Payment`, ia
-- kredensial sementara. Akun yang dihapus tidak boleh meninggalkan tiket masuk
-- yang masih bisa ditukar.
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
