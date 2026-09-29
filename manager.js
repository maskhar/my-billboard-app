// scripts/manager.js
const { spawn } = require('child_process');
const readline = require('readline');

// --- KONFIGURASI WARNA ---
const cyan = '\x1b[36m';
const green = '\x1b[32m';
const yellow = '\x1b[33m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const dim = '\x1b[2m';

// Agar script Manager tidak ikut mati saat di-Ctrl+C
process.on('SIGINT', () => {
  // Biarkan kosong, kita handle logicnya di spawn child
});

// Setup pembaca keyboard
readline.emitKeypressEvents(process.stdin);

function showHeader() {
  console.clear();
  console.log(cyan + "===============================================");
  console.log("   🚀 UTERO CLOUD MANAGER (KEYPRESS EDITION)");
  console.log("===============================================" + reset);
  console.log(dim + "Tekan angka menu untuk memilih (Tanpa Enter)" + reset);
  console.log("");
  console.log(` ${green}[1]${reset} Jalankan Server (npm run dev)`);
  console.log(` ${green}[2]${reset} Terapkan Migrasi (npx prisma migrate deploy)`);
  console.log(` ${green}[3]${reset} Buka Database GUI (Prisma Studio)`);
  console.log(` ${green}[4]${reset} Generate Client (Prisma Generate)`);
  console.log(` ${green}[5]${reset} Status Migrasi (npx prisma migrate status)`);
  console.log(` ${red}[0]${reset} Keluar`);
  console.log("");
  process.stdout.write(yellow + "Menunggu input... " + reset);
}

// FUNGSI UTAMA MENU
function startMenu() {
  // 1. Tampilkan UI
  showHeader();

  // 2. Aktifkan Mode Raw (Baca tombol tanpa Enter)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  // 3. Pasang Pendengar Tombol
  process.stdin.once('keypress', handleKeypress);
}

function handleKeypress(str, key) {
  // Kalau user tekan Ctrl+C di menu, kita keluar
  if (key && key.ctrl && key.name === 'c') {
    exitApp();
    return;
  }

  // Cek Inputan
  const choice = key.name || key.sequence;
  
  if (['1', '2', '3', '4', '5'].includes(choice)) {
    // Jalankan perintah
    runTask(choice);
  } else if (choice === '0') {
    exitApp();
  } else {
    // Input salah, ulangi
    startMenu();
  }
}

function runTask(choice) {
  let command = 'npm';
  let args = [];

  // Mapping Perintah
  //
  // MENU [2] DULU MENJALANKAN `prisma db push`, DAN ITU BERBAHAYA DI REPO INI.
  //
  // `db push` tidak membaca `prisma/migrations/` sama sekali. Ia MEMBANDINGKAN
  // `schema.prisma` dengan keadaan database, lalu menulis perbedaannya
  // langsung. Masalahnya: dua penjaga terkeras di database ini TIDAK BISA
  // dinyatakan di `schema.prisma`, jadi dari sudut pandang pembanding itu
  // keduanya adalah "objek asing yang tidak ada di schema":
  //
  //   · `booking_tanpa_tumpang_tindih` — `EXCLUDE USING gist`, satu-satunya
  //     hal yang mencegah dua pesanan menyewa papan yang sama pada tanggal
  //     yang bertabrakan.
  //   · `payment_satu_tagihan_menganggur` — indeks unik bersyarat yang
  //     membatasi satu tagihan menganggur per (pesanan, tujuan), yaitu yang
  //     mencegah tagihan ganda.
  //
  // Komentar di berkas migrasinya sudah memperingatkan bahwa `migrate diff`
  // menyarankan membuang keduanya. `db push` mengikuti saran itu TANPA
  // membuat berkas migrasi, jadi tidak ada jejak apa pun tentang apa yang
  // hilang — dan cacatnya baru terlihat sebagai pesanan bertumpang tindih
  // atau pembayaran ganda, berhari-hari kemudian.
  //
  // Penggantinya `migrate deploy`: ia HANYA menjalankan berkas migrasi yang
  // belum dijalankan, apa adanya, tanpa pernah membandingkan schema. Berkas
  // migrasi di repo ini ditulis tangan justru supaya saran berbahaya itu tidak
  // pernah ikut.
  //
  // (Cacat ini bukan teori: migrasi `20260929090000_token_reset_sandi` sempat
  // ada di repo tanpa pernah diterapkan, sementara tiga berkas kode dan
  // halaman "Lupa sandi" sudah hidup di atas tabel yang belum ada. Menu yang
  // menawarkan `db push` alih-alih `migrate deploy` adalah sebabnya: ia tidak
  // pernah memberi tahu bahwa ada migrasi yang menunggu.)
  if (choice === '1') args = ['run', 'dev'];
  if (choice === '2') { command = 'npx'; args = ['prisma', 'migrate', 'deploy']; }
  if (choice === '3') { command = 'npx'; args = ['prisma', 'studio']; }
  if (choice === '4') { command = 'npx'; args = ['prisma', 'generate']; }
  // [5] hanya membaca: memberi tahu migrasi mana yang belum diterapkan tanpa
  // menyentuh apa pun. Ini yang dijalankan lebih dulu saat sesuatu terlihat
  // aneh, bukan [2].
  if (choice === '5') { command = 'npx'; args = ['prisma', 'migrate', 'status']; }

  // 1. Matikan Mode Raw (Supaya server/child process bisa terima input normal/Ctrl+C)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  
  console.clear();
  console.log(yellow + `\n>> MENJALANKAN PERINTAH [${choice}]...` + reset);
  console.log(dim + "(Tekan Ctrl+C untuk berhenti dan kembali ke menu)" + reset + "\n");

  // 2. Jalankan Proses Anak
  const child = spawn(command, args, {
    stdio: 'inherit', // Pinjam layar terminal
    shell: true       // Agar jalan di Windows
  });

  // 3. Saat Proses Selesai (Server mati atau Perintah kelar)
  child.on('close', (code) => {
    // `code` dulu diterima lalu tidak dipakai, dan itu bukan sekadar binding
    // menganggur: layarnya berbunyi "Proses Berhenti." baik saat server
    // dimatikan dengan Ctrl+C (code 0) maupun saat `next build` GAGAL (code 1).
    // Keduanya lalu langsung tertimpa menu utama setelah satu detik, jadi
    // kegagalan build terlihat persis sama dengan penghentian yang disengaja.
    const gagal = typeof code === 'number' && code !== 0;
    console.log(cyan + "\n--------------------------------------------");
    console.log(gagal ? `🛑 Proses Berhenti — GAGAL (exit code ${code}).` : "🛑 Proses Berhenti.");
    console.log("--------------------------------------------" + reset);
    
    // Trik Windows: Kadang ada sisa buffer "Terminate batch job?", kita kasih jeda.
    setTimeout(() => {
        // Balik ke Menu Utama
        startMenu(); 
    }, 1000);
  });
}

function exitApp() {
  console.log(red + "\n\n👋 Bye Bye!\n" + reset);
  process.exit(0);
}

// Mulai Aplikasi
startMenu();