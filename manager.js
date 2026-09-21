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
  console.log(` ${green}[2]${reset} Push Database (npx prisma db push)`);
  console.log(` ${green}[3]${reset} Buka Database GUI (Prisma Studio)`);
  console.log(` ${green}[4]${reset} Generate Client (Prisma Generate)`);
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
  
  if (['1', '2', '3', '4'].includes(choice)) {
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
  if (choice === '1') args = ['run', 'dev'];
  if (choice === '2') { command = 'npx'; args = ['prisma', 'db', 'push']; }
  if (choice === '3') { command = 'npx'; args = ['prisma', 'studio']; }
  if (choice === '4') { command = 'npx'; args = ['prisma', 'generate']; }

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
    console.log(cyan + "\n--------------------------------------------");
    console.log("🛑 Proses Berhenti.");
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