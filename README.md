# my-billboard-app

Platform sewa billboard: katalog titik media, pemesanan bertanggal, pembayaran
lewat Xendit, dan panel admin untuk mengelola pesanan sampai papan terpasang.

Sebelum berkas ini ditulis, isinya adalah templat `create-next-app` apa adanya —
termasuk paragraf tentang keluarga font bawaan Vercel yang tidak dipakai repo ini dan tombol
deploy ke Vercel yang belum pernah jadi target deploy-nya. Yang paling merugikan
bukan basa-basinya, melainkan satu hal yang TIDAK disebutkan: aplikasi ini tidak
bisa dijalankan tanpa PostgreSQL dan tanpa sekitar selusin variabel
environment, dan templat itu menyuruh orang menjalankan `npm run dev` lalu
berharap. Yang dibaca pertama oleh orang berikutnya sebaiknya bukan kebohongan.

---

## Perlu apa dulu

| Syarat | Versi | Catatan |
| --- | --- | --- |
| Node.js | 20+ | Diuji di v24. Test runner memakai `node --test`, jadi Node lama tidak cukup. |
| PostgreSQL | 14+ | **Wajib**, bukan opsional. Lihat catatan di bawah. |
| npm | 10+ | Ikut Node. |

PostgreSQL tidak bisa diganti SQLite walaupun ada berkas `prisma/dev.db` di
folder kerja (ia tidak dilacak Git): schema-nya memakai kolom `jsonb`, indeks unik bersyarat
(`WHERE status = 'PENDING'`), dan sebuah constraint `GIST` dengan operator
rentang tanggal untuk mencegah dua pesanan menempati papan yang sama pada hari
yang sama. Tidak satu pun dari ketiganya ada di SQLite, dan yang ketiga adalah
satu-satunya yang menjaga penjualan ganda.

---

## Menjalankan pertama kali

```bash
npm install
```

```bash
cp .env.example .env
```

Isi `.env` sebelum melanjutkan. `.env.example` menjelaskan setiap variabel satu
per satu, termasuk mana yang membuat server menolak boot bila kosong.
**Minimum untuk pengembangan** hanya dua: `DATABASE_URL` dan
`NEXTAUTH_SECRET`. Yang kedua tidak boleh dilewati — alasannya di bagian
[Keamanan](#keamanan) di bawah, dan konsekuensinya lebih buruk daripada
"sesi pengguna logout sendiri".

```bash
npx prisma migrate deploy
```

```bash
npx prisma generate
```

```bash
npm run dev
```

Buka <http://localhost:4000>. Porta 4000, bukan 3000 — `npm run dev` sudah
menyetelnya.

### Akun admin pertama

Belum ada admin setelah migrasi. Daftar akun biasa lewat `/register`, lalu
naikkan perannya:

```bash
npx ts-node prisma/set-admin.ts alamat@email.anda
```

Tanpa argumen, skrip itu memakai `ADMIN_EMAIL_TARGET` dari `.env`. Ia hanya
menyentuh kolom `role`; tidak ada bagian aplikasi yang membaca variabel itu.

### Data contoh

```bash
npx prisma db seed
```

Seed menolak berjalan di atas data yang sudah ada kecuali `SEED_IZINKAN_HAPUS`
bernilai tepat `ya` — pagar yang sengaja ada supaya perintah ini tidak pernah
menjadi cara tidak sengaja mengosongkan database yang dipakai.

---

## Perintah

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Server pengembangan di porta 4000 (Turbopack). |
| `npm run build` | Build produksi. |
| `npm start` | Menjalankan hasil build. |
| `npm run lint` | ESLint. `eslint` langsung, bukan `next lint`. |
| `npm run test:xendit` | Seluruh test suite. Lihat catatan di bawah. |
| `npm run menu` | Menu interaktif (server, `db push`, Prisma Studio, `generate`). |

Menu `[2]` menjalankan `prisma db push`, dan itu **bukan** pengganti
`migrate deploy`: alasannya di langkah 2 bagian [Deploy](#deploy). Ia berguna
untuk mencoba perubahan schema lokal, bukan untuk menyiapkan database yang
dipakai sungguhan.

Nama `test:xendit` sudah tidak menggambarkan isinya: berkasnya bertumbuh dari
test untuk `src/lib/xendit.ts` menjadi satu-satunya suite di repo ini, dan kini
menjaga pembayaran, transisi status, rate limit, kebocoran data ke Client
Component, header keamanan, sampai konfigurasi environment. Jalankan ia sebelum
setiap commit.

```bash
npm run test:xendit
```

Tidak perlu database untuk menjalankannya — Prisma dipalsukan lewat penukar
modul di dalam berkas test itu sendiri.

---

## Server chat

Chat admin–pembeli berjalan di proses terpisah (`socket.io`), bukan di dalam
Next:

```bash
cd chat-server && npm install && npm run dev
```

Ia membaca `.env` di `chat-server/` sendiri dan berbagi database yang sama.
Aplikasi utama menunjuk ke alamatnya lewat `NEXT_PUBLIC_CHAT_URL`. Di
pengembangan, variabel kosong jatuh ke alamat lokal bawaan; di produksi chat
justru tidak disambung sama sekali, dan itu disengaja — memaksa alamat lokal di
server produksi menghasilkan koneksi yang selalu gagal tanpa penjelasan.

Karena awalannya `NEXT_PUBLIC_`, nilainya ditanam **saat build**. Mengisinya di
server yang sudah berjalan tidak berpengaruh; build ulang yang berpengaruh.

---

## Susunan

```
src/
  app/            Route App Router. Grup `admin`, `dashboard`, `api`, dan halaman publik.
  components/     Komponen bersama.
  lib/            Seluruh aturan yang bukan tampilan. Lihat di bawah.
  middleware.ts   Gerbang pertama: menuntut token untuk /admin, /dashboard, /checkout, /invoice.
prisma/           Schema, migrasi, seed, skrip admin.
chat-server/      Server socket.io terpisah.
tests/            Satu suite, dijalankan `npm run test:xendit`.
docs/audit/       Laporan audit dan daftar perbaikan.
```

Beberapa berkas di `src/lib/` adalah pintu tunggal yang **tidak boleh dilewati**,
dan masing-masing menjelaskan alasannya di komentar kepala berkasnya:

- `money.ts` — seluruh nominal `Prisma.Decimal`. Tidak ada `+ - * / < >` pada
  uang di mana pun. Membandingkan Decimal dengan `>` membandingkan alamat objek.
- `pembayaran.ts` — satu-satunya pembaca ledger. `Payment` berstatus `PAID`
  adalah satu-satunya bukti uang masuk; `PENDING` bukan uang.
- `transisi-status.ts` — mesin status pesanan. Daftar transisi sahnya tidak
  diubah tanpa keputusan tersendiri.
- `xendit.ts` — satu-satunya pintu ke API Xendit. Ia juga pemilik
  `originAplikasi()`, yang menolak origin dari header permintaan.
- `rahasia.ts` — enkripsi kunci API yang disimpan admin di database.
- `env.ts` — dijalankan `src/instrumentation.ts` saat boot; lihat di bawah.

---

## Keamanan

Yang perlu diketahui sebelum menyentuh konfigurasi:

**`NEXTAUTH_SECRET` wajib diisi, termasuk di pengembangan.** NextAuth v4 tidak
menolak boot tanpanya — ia menyusun kunci penanda tangan sesi sendiri dari hash
konfigurasi yang ada. Konfigurasi itu seluruhnya publik dan ada di repo ini,
sehingga kunci sesi menjadi nilai yang bisa disusun ulang siapa pun, dan token
sesi ber-`role: 'SUPER_ADMIN'` bisa dipalsukan. Gagalnya terbuka, bukan
tertutup: tidak ada satu pun pesan galat yang muncul.

**Kredensial Xendit tidak pernah masuk Git.** `XENDIT_SECRET_KEY` dan
`XENDIT_CALLBACK_TOKEN` hidup di `.env` saja. Webhook menolak SELURUH permintaan
bila token callback-nya kosong — gagal tertutup, sengaja: webhook yang menerima
apa saja berarti siapa pun bisa menyatakan pesanan orang lain sudah dibayar.
Nilai kedua variabel itu tidak pernah ikut tercatat di log; `xendit.ts` menyaring
kuncinya dari pesan galat sebelum dicetak.

**Pemeriksaan environment saat boot.** `src/instrumentation.ts` menjalankan
`periksaEnv()` sekali per proses, sebelum permintaan pertama. Variabel wajib yang
kosong membuat server **menolak boot** dengan daftar nama variabelnya — bukan
nilainya. Tanpa ini, server yang salah setel tetap menerima pesanan dan baru
memberi tahu siapa pun saat pembeli pertama menekan "Bayar". Next sengaja
melewati hook ini pada fase `next build`, jadi mesin build tidak perlu `.env`
produksi.

**`robots.txt` bukan kontrol akses.** Ia melarang perangkakan pola alamat area
privat; yang menahan pembacaan adalah `middleware.ts` plus pemeriksaan
kepemilikan di tiap route handler.

Laporkan celah keamanan langsung ke pemilik repo, jangan lewat issue publik.

---

## Deploy

`vercel.json` ada, tetapi isinya HANYA satu entri cron — penjadwal yang memukul
`/api/cron/sweep` tiap jam untuk menghanguskan pesanan yang lewat tenggat
bayarnya. Route itu menolak seluruh permintaan bila `CRON_SECRET` kosong, jadi
penjadwalnya tidak berguna tanpa variabel itu terpasang. Tidak ada `Dockerfile`.

`.github/workflows/periksa.yml` menjalankan keempat gerbang — `tsc`, ESLint,
seluruh test suite, dan `npm run build` — pada setiap push dan setiap pull
request ke `master`. `npm run build` ikut bukan karena dianggap test, melainkan
karena satu kelas kegagalan di repo ini hanya muncul di sana: metadata route
tanpa `force-dynamic` menghentikan deploy, dan `tsc` maupun test tidak melihat
apa pun. CI tidak memakai database dan tidak menarik satu pun secret repo;
keempat gerbang diverifikasi lulus dengan nilai palsu.

Urutan minimum di server sendiri:

1. Siapkan PostgreSQL dan isi `.env` produksi lengkap. `NODE_ENV=production`
   membuat pemeriksaan boot menuntut `NEXTAUTH_URL`, `APP_ORIGIN`, kedua
   variabel Xendit, dan `SETTINGS_ENCRYPTION_KEY`.
2. `npx prisma migrate deploy` — **`migrate deploy`, bukan `db push`.**
   `db push` menyamakan schema tanpa menjalankan migrasi, sehingga constraint
   `GIST` pencegah tumpang-tindih dan indeks unik bersyarat milik `Payment`
   tidak pernah terbuat. Keduanya hanya ada di berkas migrasinya.
3. `npm run build`, lalu `npm start`.
4. Daftarkan alamat webhook Xendit ke `/api/xendit/webhook` dan simpan token
   callback-nya di `XENDIT_CALLBACK_TOKEN`.
5. Jalankan `chat-server` bila fitur chat dipakai.

`APP_ORIGIN` wajib `https://` dan wajib menjadi alamat yang sungguh dipakai
pembeli: ia yang menyusun alamat kembali dari Xendit. Ia sengaja terpisah dari
`NEXTAUTH_URL`.

---

## Lisensi

MIT. Lihat `package.json`.
