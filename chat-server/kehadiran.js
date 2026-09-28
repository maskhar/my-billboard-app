// chat-server/kehadiran.js
//
// Kehadiran tamu yang BENAR-BENAR diukur dari koneksi socket.
//
// KENAPA PERLU
// ------------
// Kolom `ChatSession.isOnline` sudah ada sejak awal dan nilainya bawaan `true`.
// Yang tidak pernah ada adalah pengukurnya. Sebelum ini ia hanya ditulis di dua
// tempat, dan tidak satu pun berhubungan dengan kehadiran:
//
//   - `api/admin/chat/close/route.ts` menulis `false` saat PETUGAS menutup
//     percakapan — padahal tamunya bisa saja masih menatap widget-nya.
//   - `api/admin/chat/send/route.ts` menulis `true` dengan komentar "anggap user
//     online lagi". "Anggap" adalah kata yang tepat: itu dugaan, bukan
//     pengukuran.
//
// Akibatnya tamu yang menutup tab-nya pukul sembilan pagi tetap tercatat
// `isOnline: true` selamanya. Petugas melihat tanda hijau, menyangka orangnya
// sedang menunggu, lalu menulis jawaban panjang untuk kursi yang sudah kosong —
// dan tidak mengirim email yang seharusnya ia kirim.
//
// Satu-satunya proses yang tahu tamu masih terhubung adalah chat-server ini,
// karena ia yang memegang socket-nya. Karena itu pengukurnya di sini, dan
// hasilnya dituliskan ke database supaya proses Next.js — yang tidak punya
// socket apa pun — bisa membacanya.
//
// TENGGANG SEBELUM DINYATAKAN PERGI
// ---------------------------------
// Socket.IO memutus lalu menyambung ulang sendiri: saat transport naik dari
// polling ke websocket, saat sinyal ponsel berkedip, saat laptop bangun dari
// tidur. Menulis `false` pada setiap `disconnect` berarti kolomnya berkedip
// beberapa kali per menit untuk tamu yang sama sekali tidak beranjak, dan setiap
// kedipan adalah satu penulisan database plus satu siaran ke petugas. Tamu
// dinyatakan pergi hanya bila ia tidak kembali dalam tenggang di bawah.
//
// ========================= BATASAN PENTING =========================
// Hitungan socket disimpan di memori proses, sama seperti `rate-limit.js`. Bila
// chat-server dijalankan di lebih dari satu instance, tamu yang socket-nya ada
// di instance A akan dinyatakan pergi oleh instance B saat socket-nya di B
// terputus — karena B tidak tahu A masih memegangnya. Untuk produksi
// multi-instance, hitungannya perlu dipindah ke penyimpanan bersama (Redis)
// dengan increment atomik, persis seperti catatan di `rate-limit.js`.
// ===================================================================

/** Lama tamu boleh hilang sebelum dinyatakan pergi. */
const TENGGANG_OFFLINE_MS = 15 * 1000;

/**
 * Room yang diikuti setiap socket petugas.
 *
 * Perubahan kehadiran disiarkan ke sini, bukan hanya ke room percakapannya.
 * Petugas hanya ikut room percakapan yang sedang ia buka, jadi tanpa room ini
 * titik hijau pada 49 baris lain di daftar akan membeku pada keadaan saat
 * halaman dimuat — dan keterangan yang membeku adalah persis cacat yang sedang
 * dibereskan, hanya lebih pelan.
 */
const ROOM_PETUGAS = 'staf:kehadiran';

/**
 * Membuat pelacak kehadiran.
 *
 * Seluruh ketergantungannya disuntikkan supaya bisa diuji tanpa database dan
 * tanpa menunggu waktu nyata berjalan.
 *
 * @param {object} opsi
 * @param {object} opsi.prisma            Klien Prisma (hanya `chatSession` yang dipakai).
 * @param {(ubah: {sessionId: string, isOnline: boolean}) => void} [opsi.onUbah]
 *        Dipanggil HANYA bila nilainya benar-benar berubah di database.
 * @param {number} [opsi.tenggangOfflineMs]
 * @param {(fn: Function, ms: number) => any} [opsi.jadwalkan]
 * @param {(timer: any) => void} [opsi.batalkan]
 * @param {(pesan: string, galat: unknown) => void} [opsi.catatGalat]
 */
function buatPelacakKehadiran({
  prisma,
  onUbah = () => {},
  tenggangOfflineMs = TENGGANG_OFFLINE_MS,
  jadwalkan = setTimeout,
  batalkan = clearTimeout,
  catatGalat = (pesan, galat) => console.error(pesan, galat),
}) {
  /** sessionId -> jumlah socket tamu yang sedang terbuka. */
  const jumlahSocket = new Map();
  /** sessionId -> timer "nyatakan pergi" yang sedang menunggu. */
  const timerPergi = new Map();

  function batalkanTimer(sessionId) {
    const timer = timerPergi.get(sessionId);
    if (timer !== undefined) {
      batalkan(timer);
      timerPergi.delete(sessionId);
    }
  }

  /**
   * Menuliskan nilai baru, dan memberi tahu pemanggil hanya bila barisnya
   * memang berubah.
   *
   * `updateMany`, bukan `update`: sesi yang barisnya sudah dihapus membuat
   * `update` melempar P2025, dan itu akan menjatuhkan penanganan `disconnect`
   * karena sebuah percakapan lama dibersihkan. Syarat `isOnline: !isOnline`
   * membuat penulisan berulang dengan nilai yang sama tidak menyentuh database
   * sama sekali — dan `count` menjadi jawaban apakah ada yang berubah.
   */
  async function tulis(sessionId, isOnline) {
    try {
      const hasil = await prisma.chatSession.updateMany({
        where: { id: sessionId, isOnline: !isOnline },
        data: { isOnline },
      });
      if (hasil.count > 0) onUbah({ sessionId, isOnline });
    } catch (galat) {
      // Kehadiran adalah hiasan yang berguna, bukan syarat percakapan bisa
      // berjalan. Database yang sedang bermasalah tidak boleh mematikan chat.
      catatGalat('[kehadiran] Gagal menulis status kehadiran:', galat);
    }
  }

  /** Satu socket tamu untuk `sessionId` baru terbuka. */
  function tandaiHadir(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return;

    batalkanTimer(sessionId);
    const sebelumnya = jumlahSocket.get(sessionId) || 0;
    jumlahSocket.set(sessionId, sebelumnya + 1);

    // Hanya socket pertama yang menandakan kedatangan. Tamu yang membuka dua
    // tab tidak perlu dua penulisan.
    if (sebelumnya === 0) void tulis(sessionId, true);
  }

  /** Satu socket tamu untuk `sessionId` tertutup. */
  function tandaiPergi(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') return;

    const sebelumnya = jumlahSocket.get(sessionId) || 0;
    if (sebelumnya <= 1) {
      jumlahSocket.delete(sessionId);
    } else {
      jumlahSocket.set(sessionId, sebelumnya - 1);
      return; // Masih ada tab lain yang terbuka.
    }

    // Belum dinyatakan pergi: beri kesempatan menyambung ulang lebih dulu.
    batalkanTimer(sessionId);
    timerPergi.set(
      sessionId,
      jadwalkan(() => {
        timerPergi.delete(sessionId);
        // Diperiksa ulang: `tandaiHadir` bisa terjadi setelah timer dijadwalkan
        // namun sebelum ia berjalan, dan penjadwal yang dipakai test memanggil
        // timer secara manual.
        if ((jumlahSocket.get(sessionId) || 0) > 0) return;
        void tulis(sessionId, false);
      }, tenggangOfflineMs)
    );
  }

  /**
   * Membersihkan kehadiran yang tertinggal dari proses sebelumnya.
   *
   * Tanpa ini, satu restart — atau satu crash — meninggalkan setiap sesi yang
   * saat itu terhubung bertanda `true` selamanya, karena `disconnect`-nya tidak
   * pernah sampai ke kode mana pun. Dipanggil sekali saat server naik: pada
   * saat itu, secara definisi, belum ada satu pun socket yang terhubung.
   */
  async function setelUlangKehadiran() {
    try {
      const hasil = await prisma.chatSession.updateMany({
        where: { isOnline: true },
        data: { isOnline: false },
      });
      return hasil.count;
    } catch (galat) {
      catatGalat('[kehadiran] Gagal menyetel ulang status kehadiran:', galat);
      return 0;
    }
  }

  /** Untuk test dan penutupan bersih: buang semua timer yang menunggu. */
  function hentikanSemua() {
    for (const sessionId of [...timerPergi.keys()]) batalkanTimer(sessionId);
    jumlahSocket.clear();
  }

  /** Untuk test: berapa socket yang sedang dihitung untuk sesi ini. */
  function jumlahSocketAktif(sessionId) {
    return jumlahSocket.get(sessionId) || 0;
  }

  return {
    tandaiHadir,
    tandaiPergi,
    setelUlangKehadiran,
    hentikanSemua,
    jumlahSocketAktif,
  };
}

module.exports = { buatPelacakKehadiran, TENGGANG_OFFLINE_MS, ROOM_PETUGAS };
