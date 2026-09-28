-- Pengajuan titik dari pemilik lahan — tabel di belakang alur "Sewakan Tempat".
--
-- Seluruh migrasi ini HANYA MENAMBAH: satu tipe enum, satu tabel, dua indeks,
-- satu foreign key. Tidak ada satu pun `DROP` atau `ALTER` atas objek yang sudah
-- ada, jadi tidak ada data lama yang bisa tersentuh.
--
-- Peringatan yang berlaku untuk repo ini dan harus tetap dibaca sebelum
-- menjalankan migrasi APA PUN di sini: `prisma migrate diff` tidak mengenali
-- `EXCLUDE USING gist` (`booking_tanpa_tumpang_tindih`) maupun indeks unik
-- bersyarat `payment_satu_tagihan_menganggur`, dan akan menyarankan
-- membuangnya. Keduanya adalah penjaga terakhir terhadap tanggal sewa yang
-- tumpang tindih dan tagihan ganda. Berkas ini ditulis tangan justru supaya
-- saran itu tidak pernah ikut.

-- CreateEnum
CREATE TYPE "StatusPengajuanTitik" AS ENUM ('BARU', 'DIHUBUNGI', 'SELESAI', 'DITOLAK');

-- CreateTable
--
-- Bukan `Billboard`. Baris di sini adalah klaim dari orang asing yang belum
-- diperiksa siapa pun; `Billboard` adalah inventaris yang dijual dan muncul di
-- peta publik. Bila titiknya jadi, admin membuat `Billboard`-nya lewat form
-- inventaris, dan baris ini ditutup `SELESAI`.
--
-- Tidak ada kolom uang: nominal di aplikasi ini bertipe `Decimal(15,2)` dan
-- melewati `src/lib/money.ts`. Angka dari formulir publik yang belum
-- diverifikasi tidak boleh tersimpan sebagai uang.
--
-- Tidak ada kolom foto, walaupun foto lokasi jelas berguna: satu-satunya
-- penulis unggahan di aplikasi ini adalah `/api/upload`, dan route itu dijaga
-- sesi sementara pengaju di sini tidak punya akun. Kolomnya akan selalu `null`
-- sambil ikut terkirim ke mana pun barisnya pergi — cacat yang sama dengan
-- `otpCode` yang sudah dibuang dari `User`. Penjelasan lengkapnya ada di
-- `prisma/schema.prisma` pada model ini.
CREATE TABLE "PengajuanTitik" (
    "id" TEXT NOT NULL,
    "namaPemilik" TEXT NOT NULL,
    "nomorWa" TEXT NOT NULL,
    "email" TEXT,
    "alamat" TEXT NOT NULL,
    "kota" TEXT NOT NULL,
    "ukuran" TEXT,
    "catatan" TEXT,
    "status" "StatusPengajuanTitik" NOT NULL DEFAULT 'BARU',
    "catatanAdmin" TEXT,
    "ditanganiById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PengajuanTitik_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Satu-satunya daftar yang dibuka admin: saring status, urut terbaru dulu.
CREATE INDEX "PengajuanTitik_status_createdAt_idx" ON "PengajuanTitik"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PengajuanTitik_ditanganiById_idx" ON "PengajuanTitik"("ditanganiById");

-- AddForeignKey
-- `SET NULL`, bukan `CASCADE`: menghapus akun admin tidak boleh menghapus
-- pengajuan yang pernah ia tangani.
ALTER TABLE "PengajuanTitik" ADD CONSTRAINT "PengajuanTitik_ditanganiById_fkey" FOREIGN KEY ("ditanganiById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
