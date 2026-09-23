-- CEGAH DUA BOOKING PADA BILLBOARD YANG SAMA DI RENTANG TANGGAL YANG SAMA
-- (task 3.8 / 2.4)
--
-- Sebelum ini tidak ada apa pun yang mencegahnya: tidak ada constraint, tidak
-- ada query tumpang-tindih, tidak ada transaksi. Kode hanya memeriksa
-- `billboard.status !== 'Available'` — padahal tidak ada satu baris kode pun
-- yang pernah menulis 'Booked', jadi gerbang itu permanen terbuka. Dua
-- pembeli bisa menyewa titik yang sama untuk bulan yang sama, keduanya
-- membayar, dan baru ketahuan saat tim pemasangan datang.
--
-- Pemeriksaan di kode aplikasi saja tidak cukup. Dua permintaan yang tiba
-- pada saat yang sama sama-sama membaca "belum ada yang memesan" sebelum
-- salah satunya sempat menulis — celah balapan (race) yang justru paling
-- mungkin terjadi pada titik populer. Hanya database yang bisa menutupnya,
-- karena hanya database yang melihat kedua penulisan itu sekaligus.
--
-- `btree_gist` diperlukan karena constraint ini menggabungkan pembandingan
-- persis (`billboardId` =) dengan pembandingan rentang (`&&`); GiST bawaan
-- tidak menangani tipe teks/skalar tanpa ekstensi ini.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Batasnya `'[)'`: awal termasuk, akhir tidak. Sewa yang berakhir 1 Maret dan
-- sewa yang dimulai 1 Maret TIDAK dianggap bentrok — hari itu milik penyewa
-- berikutnya. Tanpa ini, setiap pergantian penyewa yang mulus akan ditolak.
--
-- Hanya status yang benar-benar menahan inventori yang diperhitungkan.
-- Pesanan yang dibatalkan atau sudah direfund tidak boleh mengunci tanggal;
-- kalau ikut dihitung, satu pembatalan akan memblokir titik itu selamanya.
ALTER TABLE "Booking"
  ADD CONSTRAINT "booking_tanpa_tumpang_tindih"
  EXCLUDE USING gist (
    "billboardId" WITH =,
    daterange("startDate"::date, "endDate"::date, '[)') WITH &&
  )
  WHERE (
    "status" IN (
      'PENDING_PAYMENT',
      'PAID_CONFIRMED',
      'DESIGN_RECEIVED',
      'IN_PRODUCTION',
      'INSTALLATION',
      'ACTIVE'
    )
  );
