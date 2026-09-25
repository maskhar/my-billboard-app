-- SAMAKAN DAFTAR STATUS PENGUNCI TANGGAL ANTARA APLIKASI DAN DATABASE
--
-- Constraint sebelumnya (20260923100500) menyebut enam status. Sementara itu
-- `STATUS_MENGUNCI_TANGGAL` di `src/lib/transisi-status.ts` menurunkan
-- sembilan: semua status kecuali CANCELLED dan REFUNDED. Tiga status refund
-- yang belum tuntas — REVIEW_REFUND, WAITING_BANK, PROCESS_REFUND — karena itu
-- mengunci tanggal di aplikasi tapi TIDAK di database.
--
-- Akibatnya jaring pengaman ini bolong persis pada status yang paling lama
-- menggantung: selama pengajuan refund masih diproses, uang belum kembali dan
-- pesanan belum lepas, jadi tanggalnya memang belum boleh dijual ulang. Tapi
-- dua permintaan yang tiba bersamaan hanya dijaga oleh constraint ini — dan
-- constraint lama membiarkan keduanya masuk. Dua penyewa, satu titik, satu
-- rentang tanggal.
--
-- Constraint lama dihapus lalu dibuat ulang dengan daftar yang lengkap.
-- Daftar ini harus tetap sama persis dengan `STATUS_MENGUNCI_TANGGAL`; kalau
-- ada status baru ditambahkan ke `TRANSISI_SAH`, ia otomatis masuk daftar di
-- aplikasi dan harus ditambahkan ke sini juga secara manual.
--
-- CATATAN SEBELUM DIJALANKAN: kalau di database sudah terlanjur ada pesanan
-- berstatus refund yang tanggalnya tumpang tindih dengan pesanan aktif
-- (mungkin, karena constraint lama mengizinkannya), migrasi ini akan GAGAL
-- dan membatalkan dirinya sendiri. Itu perilaku yang benar: datanya memang
-- perlu dibereskan dulu. Untuk melihat baris yang bertabrakan sebelum
-- menjalankan migrasi:
--
--   SELECT a.id, b.id, a."billboardId", a.status, b.status
--   FROM "Booking" a JOIN "Booking" b
--     ON a."billboardId" = b."billboardId" AND a.id < b.id
--    AND daterange(a."startDate"::date, a."endDate"::date, '[)')
--     && daterange(b."startDate"::date, b."endDate"::date, '[)')
--   WHERE a.status NOT IN ('CANCELLED','REFUNDED')
--     AND b.status NOT IN ('CANCELLED','REFUNDED');

ALTER TABLE "Booking" DROP CONSTRAINT "booking_tanpa_tumpang_tindih";

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
      'ACTIVE',
      'REVIEW_REFUND',
      'WAITING_BANK',
      'PROCESS_REFUND'
    )
  );
