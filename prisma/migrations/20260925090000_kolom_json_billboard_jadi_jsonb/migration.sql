-- Empat kolom JSON pada Billboard: TEXT -> JSONB
--
-- APA YANG DIUBAH
-- ---------------
-- `gallery`, `specs`, `includes`, `excludes` selama ini bertipe TEXT yang berisi
-- teks JSON. Setiap penulis memanggil `JSON.stringify`, setiap pembaca
-- `JSON.parse`. Akibatnya database TIDAK PERNAH bisa menolak isi yang rusak:
-- teks kosong, kutip yang hilang, atau format peninggalan tersimpan dengan
-- tenang dan baru meledak saat dibaca — di halaman produk publik, jauh dari
-- tempat kesalahannya dibuat.
--
-- KENAPA DITULIS TANGAN, BUKAN OLEH `prisma migrate dev`
-- ------------------------------------------------------
-- Untuk perubahan tipe yang tidak otomatis kompatibel, Prisma menghasilkan
-- `DROP COLUMN` lalu `ADD COLUMN`. Itu MENGHAPUS seluruh galeri dan
-- spesifikasi setiap billboard. Berkas ini memakai `ALTER ... TYPE ... USING`
-- sehingga isinya dialihkan, bukan dibuang.
--
-- PERIKSA DULU SEBELUM DIJALANKAN
-- -------------------------------
-- Perintah di bawah GAGAL bila ada baris yang isinya bukan JSON sah. Itu
-- perilaku yang diinginkan — lebih baik migrasi berhenti daripada diam-diam
-- mengosongkan data. Tiga query berikut memperlihatkan barisnya lebih dulu
-- (jalankan manual, tidak ikut dieksekusi):
--
--   -- PostgreSQL 16 ke atas:
--   SELECT id, title FROM "Billboard"
--   WHERE NOT pg_input_is_valid(NULLIF("gallery", ''), 'jsonb')
--      OR NOT pg_input_is_valid(NULLIF("specs", ''), 'jsonb')
--      OR NOT pg_input_is_valid(NULLIF("includes", ''), 'jsonb')
--      OR NOT pg_input_is_valid(NULLIF("excludes", ''), 'jsonb');
--
--   -- PostgreSQL di bawah 16 (tidak punya pg_input_is_valid): saring dengan
--   -- bentuk teksnya. Tidak seteliti pemeriksaan sungguhan, tapi menangkap
--   -- kasus yang nyata terjadi di sini — teks kosong dan nilai non-array.
--   SELECT id, title, "gallery", "specs", "includes", "excludes"
--   FROM "Billboard"
--   WHERE "gallery"  !~ '^\s*\[' OR "specs"    !~ '^\s*\['
--      OR "includes" !~ '^\s*\[' OR "excludes" !~ '^\s*\[';
--
--   -- Setelah migrasi berhasil, pastikan semuanya benar-benar array
--   -- (jsonb menerima `{}`, `"teks"`, `5`, `null` sebagai nilai sah):
--   SELECT id, title,
--          jsonb_typeof("gallery")  AS t_gallery,
--          jsonb_typeof("specs")    AS t_specs,
--          jsonb_typeof("includes") AS t_includes,
--          jsonb_typeof("excludes") AS t_excludes
--   FROM "Billboard"
--   WHERE jsonb_typeof("gallery")  <> 'array' OR jsonb_typeof("specs")    <> 'array'
--      OR jsonb_typeof("includes") <> 'array' OR jsonb_typeof("excludes") <> 'array';
--
-- CATATAN PENGUNCIAN
-- ------------------
-- `ALTER TABLE ... TYPE` menulis ulang seluruh tabel di bawah ACCESS EXCLUSIVE:
-- selama berjalan tidak ada yang bisa membaca maupun menulis "Billboard".
-- Tabelnya kecil (hitungan baris, bukan juta), jadi hanya sekejap — tapi
-- jalankan di luar jam sibuk.

-- LANGKAH 1 — normalkan teks kosong menjadi array kosong.
--
-- Kolomnya NOT NULL tanpa default sejak awal (lihat migrasi init), jadi baris
-- lama yang tidak pernah diisi menyimpan '' — dan '' BUKAN JSON yang sah, jadi
-- tanpa langkah ini seluruh migrasi gagal di langkah 2. `trim` ikut menangkap
-- isi yang hanya berupa spasi.
UPDATE "Billboard" SET "gallery"  = '[]' WHERE "gallery"  IS NULL OR btrim("gallery")  = '';
UPDATE "Billboard" SET "specs"    = '[]' WHERE "specs"    IS NULL OR btrim("specs")    = '';
UPDATE "Billboard" SET "includes" = '[]' WHERE "includes" IS NULL OR btrim("includes") = '';
UPDATE "Billboard" SET "excludes" = '[]' WHERE "excludes" IS NULL OR btrim("excludes") = '';

-- LANGKAH 2 — ubah tipenya, alihkan isinya.
--
-- `USING "kolom"::jsonb` memerintahkan PostgreSQL mengubah nilai yang SUDAH ADA,
-- bukan mengosongkannya. `jsonb` dipilih, bukan `json`: ia tersimpan sudah
-- terurai (dibaca tanpa parse ulang) dan bisa diindeks bila suatu saat isinya
-- perlu dicari. Urutan elemen array tetap terjaga — jsonb hanya mengurutkan
-- ulang KUNCI di dalam objek, sehingga urutan foto galeri dan urutan baris
-- spesifikasi tidak berubah.
ALTER TABLE "Billboard"
  ALTER COLUMN "gallery"  TYPE JSONB USING "gallery"::jsonb,
  ALTER COLUMN "specs"    TYPE JSONB USING "specs"::jsonb,
  ALTER COLUMN "includes" TYPE JSONB USING "includes"::jsonb,
  ALTER COLUMN "excludes" TYPE JSONB USING "excludes"::jsonb;

-- LANGKAH 3 — pasang default.
--
-- Dulu tidak ada default sama sekali, jadi setiap penulis wajib mengisi keempat
-- kolom ini atau `INSERT` ditolak. Dengan default '[]', baris baru yang tidak
-- menyebut salah satu kolom mendapat array kosong — bukan NULL, yang akan
-- memaksa setiap pembaca menangani keadaan kosong kedua.
ALTER TABLE "Billboard"
  ALTER COLUMN "gallery"  SET DEFAULT '[]',
  ALTER COLUMN "specs"    SET DEFAULT '[]',
  ALTER COLUMN "includes" SET DEFAULT '[]',
  ALTER COLUMN "excludes" SET DEFAULT '[]';
