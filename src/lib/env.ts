// src/lib/env.ts
//
// Pemeriksaan environment saat proses BOOT, bukan saat pembeli pertama membayar.
//
// Sebagian besar variabel di repo ini sudah gagal-tertutup di titik pakainya —
// `XENDIT_SECRET_KEY` melempar `KUNCI_BELUM_DIISI`, `XENDIT_CALLBACK_TOKEN`
// menolak semua webhook, `APP_ORIGIN` melempar lima kode galat berbeda,
// `CRON_SECRET` menolak semua sapuan, `SETTINGS_ENCRYPTION_KEY` menolak
// menyimpan. Itu semua benar dan tidak diubah di sini.
//
// Masalahnya BUKAN bahwa mereka tidak diperiksa. Masalahnya KAPAN: gerbang itu
// baru tertutup ketika seseorang sudah mencoba memakai jalurnya. Server yang
// salah konfigurasi tetap menyala, tetap menerima pesanan, dan baru memberi
// tahu siapa pun di detik pembeli pertama menekan "Bayar" — di halaman
// pembayaran, dengan pesan galat, setelah billboard-nya terkunci.
//
// SATU VARIABEL GAGAL-TERBUKA, DAN ITU YANG PALING BERBAHAYA
// ----------------------------------------------------------
// `NEXTAUTH_SECRET` tidak pernah melempar apa pun bila kosong. NextAuth v4
// menurunkan secret-nya sendiri (`core/lib/utils.js`, `createSecret`):
//
//     authOptions.secret ?? createHash("sha256")
//       .update(JSON.stringify({ ...url, ...authOptions })).digest("hex")
//
// `JSON.stringify` MEMBUANG semua fungsi, jadi yang tersisa di masukan hash itu
// hanya nilai yang bisa diserialkan: `session`, `pages`, dan metadata provider
// — semuanya publik dan ada di repo ini. Satu-satunya nilai rahasia yang bisa
// ikut adalah `clientSecret` Google; bila itu pun kosong, kunci penanda tangan
// seluruh sesi menjadi hash atas teks yang siapa pun bisa susun ulang dari
// sumber terbuka. Konsekuensinya bukan "sesi jadi rapuh", tapi: JWT dengan
// `role: 'SUPER_ADMIN'` bisa DIPALSUKAN, dan seluruh panel admin terbuka.
//
// Bahkan pada kasus yang lebih beruntung (Google client secret terisi), secret
// itu berubah setiap kali salah satu nilai config berubah — setiap deploy yang
// menyentuh `session.maxAge` atau daftar provider memutus semua sesi hidup, dan
// tidak ada satu baris log pun yang menjelaskan kenapa.
//
// KENAPA BOOT, BUKAN PER PERMINTAAN
// ----------------------------------
// Kesalahan konfigurasi adalah kesalahan penyebaran, dan tempat melaporkannya
// adalah log penyebaran — bukan layar pembeli. Berhenti di boot juga membuat
// platform apa pun yang memeriksa kesehatan proses (`next start` yang langsung
// keluar, healthcheck container, rollback otomatis) melihat kegagalannya
// sebagai kegagalan, bukan sebagai server sehat yang kebetulan tidak bisa
// menerima uang.
//
// NILAI RAHASIA TIDAK PERNAH DICETAK
// -----------------------------------
// Setiap pesan di bawah menyebut NAMA variabel, apa syaratnya, dan apa
// akibatnya bila salah. Tidak ada satu pun yang mencetak isinya, panjangnya,
// atau potongannya — log server terbaca lebih banyak orang daripada `.env`,
// dan potongan pun mempersempit ruang tebakan.

/** Satu temuan: nama variabelnya, dan kenapa itu penting. */
export type TemuanEnv = {
  nama: string;
  pesan: string;
};

export type HasilPeriksaEnv = {
  /** Wajib ada. Proses tidak boleh lanjut tanpa ini. */
  fatal: TemuanEnv[];
  /** Fitur yang mati tanpa ini, tapi tidak membahayakan yang sudah jalan. */
  peringatan: TemuanEnv[];
};

/**
 * Nilai yang dianggap "belum diisi".
 *
 * `''` dan `'   '` diperlakukan sama dengan tidak ada: baris `FOO=` di `.env`
 * menghasilkan string kosong, bukan `undefined`, sehingga pemeriksaan `!nilai`
 * saja sebenarnya sudah cukup — tapi `.trim()` juga menangkap nilai yang
 * tersalin bersama spasi di ujungnya, yang lolos `!nilai` dan lalu gagal di
 * tempat yang jauh dari sebabnya.
 */
function kosong(nilai: string | undefined): boolean {
  return !nilai || nilai.trim() === '';
}

/**
 * Periksa environment untuk satu mode.
 *
 * `produksi` dipisah dari `process.env.NODE_ENV` supaya fungsi ini bisa diuji
 * untuk kedua mode tanpa mengubah environment proses test.
 *
 * Fungsi ini MURNI: ia hanya membaca dan mengembalikan temuan. Yang memutuskan
 * berhenti atau lanjut adalah `pastikanEnvSiap()` di bawah — pemisahan ini
 * membuat seluruh aturan bisa diuji tanpa satu pun test yang berisiko
 * mematikan proses test-nya sendiri.
 */
export function periksaEnv(
  env: NodeJS.ProcessEnv = process.env,
  produksi: boolean = env.NODE_ENV === 'production'
): HasilPeriksaEnv {
  const fatal: TemuanEnv[] = [];
  const peringatan: TemuanEnv[] = [];

  // ---------------------------------------------------------------- database
  if (kosong(env.DATABASE_URL)) {
    fatal.push({
      nama: 'DATABASE_URL',
      pesan:
        'belum diisi. Tidak ada satu pun halaman atau route yang bisa bekerja ' +
        'tanpa database.',
    });
  }

  // ------------------------------------------------------------------- sesi
  //
  // Satu-satunya temuan yang fatal di SEMUA mode, termasuk pengembangan.
  //
  // Di mode pengembangan pun kekosongannya menyesatkan: sesi bekerja hari ini,
  // lalu putus besok karena satu nilai config bergeser, dan penyebabnya tidak
  // terlihat di mana pun. Lebih baik gagal sekali, keras, di baris pertama.
  if (kosong(env.NEXTAUTH_SECRET)) {
    fatal.push({
      nama: 'NEXTAUTH_SECRET',
      pesan:
        'belum diisi, dan ini TIDAK melempar galat sendiri. NextAuth v4 ' +
        'menurunkan kunci penanda tangan sesi dari hash config-nya, yang ' +
        'isinya nilai publik — JWT admin bisa dipalsukan, dan semua sesi ' +
        'putus tiap kali config berubah. Buat dengan: openssl rand -base64 32',
    });
  }

  // `NEXTAUTH_URL` menentukan tujuan callback OAuth. Bila salah, login Google
  // memantul ke host lain; bila kosong di produksi, NextAuth menebaknya dari
  // header permintaan — yang berarti penyerang ikut menentukannya.
  if (produksi && kosong(env.NEXTAUTH_URL)) {
    fatal.push({
      nama: 'NEXTAUTH_URL',
      pesan:
        'belum diisi. Tanpa ini NextAuth menebak alamat callback dari header ' +
        'permintaan, sehingga pengirim permintaan ikut menentukan ke mana ' +
        'kode OAuth dikirim.',
    });
  }

  // -------------------------------------------------------------- pembayaran
  //
  // Ketiganya sudah gagal-tertutup di `src/lib/xendit.ts`. Yang ditambahkan di
  // sini hanya WAKTUNYA: diberitahu saat boot, bukan saat pembeli pertama
  // sudah berada di halaman pembayaran.
  if (produksi) {
    if (kosong(env.XENDIT_SECRET_KEY)) {
      fatal.push({
        nama: 'XENDIT_SECRET_KEY',
        pesan:
          'belum diisi. Setiap pembuatan sesi pembayaran akan gagal — pembeli ' +
          'sampai ke halaman bayar lalu menemui galat.',
      });
    }

    // Ini bukan soal fitur mati, tapi soal uang yang masuk tanpa tercatat.
    // Webhook adalah SATU-SATUNYA yang menyatakan uang sudah diterima. Tanpa
    // tokennya semua webhook ditolak — Xendit menerima uangnya, pesanan tetap
    // `PENDING_PAYMENT`, dan tidak ada yang tahu selain laporan Xendit.
    if (kosong(env.XENDIT_CALLBACK_TOKEN)) {
      fatal.push({
        nama: 'XENDIT_CALLBACK_TOKEN',
        pesan:
          'belum diisi. Semua webhook ditolak (memang begitu seharusnya), ' +
          'tapi artinya uang yang sudah diterima Xendit tidak akan pernah ' +
          'tercatat sebagai Payment PAID di sini.',
      });
    }

    // Origin komponen pembayaran TIDAK BOLEH diturunkan dari permintaan —
    // alasannya panjang dan ada di `originAplikasi()` di `src/lib/xendit.ts`.
    // Karena itu ia harus datang dari environment, dan karena itu pula
    // kekosongannya harus terlihat sebelum ada permintaan pertama.
    if (kosong(env.APP_ORIGIN)) {
      fatal.push({
        nama: 'APP_ORIGIN',
        pesan:
          'belum diisi. Komponen pembayaran Xendit menolak dipasang tanpa ' +
          'origin yang ditetapkan server, dan origin ini sengaja tidak boleh ' +
          'diambil dari header permintaan.',
      });
    }
  }

  // ----------------------------------------------------- rahasia di database
  //
  // Bentuknya diperiksa di sini juga, bukan hanya keberadaannya: `ambilKunci()`
  // di `src/lib/rahasia.ts` menolak apa pun selain 64 heksadesimal, dan nilai
  // yang salah bentuk hanya terlihat saat admin mencoba menyimpan kunci API.
  const kunciSetelan = env.SETTINGS_ENCRYPTION_KEY;
  if (produksi) {
    if (kosong(kunciSetelan)) {
      fatal.push({
        nama: 'SETTINGS_ENCRYPTION_KEY',
        pesan:
          'belum diisi. Kunci API di tabel SystemSetting tidak bisa ' +
          'dienkripsi, dan halaman setelan akan menolak menyimpannya. ' +
          'Buat dengan: openssl rand -hex 32',
      });
    } else if (!/^[0-9a-fA-F]{64}$/.test(kunciSetelan!.trim())) {
      fatal.push({
        nama: 'SETTINGS_ENCRYPTION_KEY',
        pesan:
          'ada tapi bentuknya salah: wajib 64 karakter heksadesimal (32 ' +
          'byte). Buat dengan: openssl rand -hex 32',
      });
    }
  }

  // ------------------------------------------------------------------- surat
  //
  // Peringatan, bukan fatal: pesanan tetap tercatat benar tanpa email. Yang
  // hilang adalah pemberitahuannya — dan itu tidak boleh menahan server yang
  // sebetulnya bisa menerima uang.
  if (produksi) {
    for (const nama of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as const) {
      if (kosong(env[nama])) {
        peringatan.push({
          nama,
          pesan:
            'belum diisi. Email transaksional tidak terkirim; pesanan tetap ' +
            'tercatat tapi pembeli tidak mendapat konfirmasi.',
        });
      }
    }

    if (kosong(env.ADMIN_EMAIL)) {
      peringatan.push({
        nama: 'ADMIN_EMAIL',
        pesan:
          'belum diisi. Pesanan baru, pembatalan, dan permintaan refund tidak ' +
          'diberitahukan ke siapa pun.',
      });
    }

    // Penjadwal Vercel mengirim `Bearer <CRON_SECRET>`. Tanpa nilainya route
    // sapuan menolak semua permintaan — termasuk dari penjadwal yang sah —
    // sehingga pesanan kedaluwarsa hanya tersapu saat ada pembeli berikutnya
    // yang membuka billboard yang sama.
    if (kosong(env.CRON_SECRET)) {
      peringatan.push({
        nama: 'CRON_SECRET',
        pesan:
          'belum diisi. Route sapuan menolak semua permintaan, jadi pesanan ' +
          'kedaluwarsa hanya tersapu secara kebetulan oleh pembeli berikutnya.',
      });
    }

    // `NEXT_PUBLIC_*` dibaca saat BUILD, bukan saat proses jalan. Peringatan
    // di sini karena itu hanya berguna bila build dan start berada di proses
    // yang sama; `src/lib/alamat-chat.ts` sudah mencatat kasus yang tidak
    // ikut ter-build.
    if (kosong(env.NEXT_PUBLIC_CHAT_URL)) {
      peringatan.push({
        nama: 'NEXT_PUBLIC_CHAT_URL',
        pesan:
          'belum diisi saat build. Widget chat tidak membuka koneksi, dan ' +
          'operator tidak menerima pesan apa pun.',
      });
    }
  }

  return { fatal, peringatan };
}

/**
 * Susun laporan multi-baris dari hasil pemeriksaan.
 *
 * Dipisah dari pencetakannya supaya test bisa memeriksa ISI laporan tanpa
 * menangkap `console`.
 */
export function laporanEnv(hasil: HasilPeriksaEnv): string {
  const baris: string[] = [];

  if (hasil.fatal.length > 0) {
    baris.push(
      `[env] ${hasil.fatal.length} variabel environment WAJIB belum siap:`
    );
    for (const t of hasil.fatal) baris.push(`  - ${t.nama} ${t.pesan}`);
  }

  if (hasil.peringatan.length > 0) {
    baris.push(`[env] ${hasil.peringatan.length} variabel opsional belum siap:`);
    for (const t of hasil.peringatan) baris.push(`  - ${t.nama} ${t.pesan}`);
  }

  return baris.join('\n');
}

/**
 * Jalankan pemeriksaan dan hentikan proses bila ada yang fatal.
 *
 * MELEMPAR, bukan `process.exit()`. Alasannya: `instrumentation.ts` memanggil
 * ini di dalam `register()`, dan Next membungkus lemparan dari sana menjadi
 * kegagalan boot yang terbaca ("An error occurred while loading instrumentation
 * hook"). `process.exit()` di titik itu akan membunuh proses tanpa menyisakan
 * jejak yang jelas, dan membuat fungsi ini tidak bisa diuji sama sekali.
 *
 * Peringatan dicetak dan proses lanjut. Menahan server karena SMTP belum diisi
 * berarti menukar "pembeli tidak dapat email" dengan "situs mati" — pertukaran
 * yang salah arah.
 */
export function pastikanEnvSiap(
  env: NodeJS.ProcessEnv = process.env,
  produksi: boolean = env.NODE_ENV === 'production'
): void {
  const hasil = periksaEnv(env, produksi);
  const laporan = laporanEnv(hasil);

  if (hasil.fatal.length > 0) {
    // Dicetak DULU, baru dilempar. Pesan lemparan hanya memuat satu baris
    // ringkas; daftar lengkapnya perlu sampai ke log apa pun yang terjadi pada
    // lemparannya.
    console.error(laporan);
    throw new Error(
      `Konfigurasi environment belum siap: ` +
        hasil.fatal.map((t) => t.nama).join(', ') +
        `. Lihat log di atas dan .env.example.`
    );
  }

  if (laporan !== '') console.warn(laporan);
}
