// src/lib/asal-permintaan.ts
//
// Alamat asal permintaan, untuk dipakai sebagai kunci pembatas laju.
//
// KENAPA INI SATU MODUL, BUKAN SATU FUNGSI DI TIAP ROUTE
// -----------------------------------------------------
// Aturannya punya satu sisi yang mudah salah dan mahal: apa yang dilakukan saat
// alamatnya TIDAK bisa ditentukan. Jawaban yang benar adalah `null` — dan
// pemanggilnya melewatkan batas per asal sama sekali. Jawaban yang kelihatan
// wajar, mengganti dengan nilai tetap seperti `"tanpa-ip"`, membuat SELURUH
// pengunjung berbagi satu penghitung: begitu batasnya tercapai, pintu tertutup
// bagi semua orang. Pembatas yang dipasang untuk menahan penyerang berubah
// menjadi cara mematikan layanan, dan yang memicunya cukup satu penyerang.
//
// Ditulis dua kali, salah satunya akan memilih sentinel.
//
// BATAS KEPERCAYAANNYA
// --------------------
// Kedua header di bawah datang dari jaringan. Bila aplikasi tidak berada di
// balik proxy yang MENIMPA `x-forwarded-for`, siapa pun bisa mengarangnya dan
// mendapat penghitung baru tiap permintaan. Karena itu batas per asal selalu
// lapisan tambahan, bukan satu-satunya: yang menahan penebakan satu akun adalah
// batas per akun, dan itu tidak bergantung pada nilai apa pun dari client.

/** Panjang maksimum yang dipakai sebagai kunci. */
const PANJANG_ASAL_MAKS = 64;

function bersihkan(nilai: string): string | null {
  const rapi = nilai.trim();
  if (rapi === '') return null;
  // Nilai panjang tidak ditolak, hanya dipotong: memotong tetap memberi
  // penghitung yang stabil per penyerang, sementara menolak akan membuat
  // permintaan itu lolos tanpa dibatasi sama sekali.
  return rapi.slice(0, PANJANG_ASAL_MAKS);
}

/**
 * Asal permintaan dari kumpulan header berbentuk objek biasa.
 *
 * Bentuk inilah yang diterima `authorize` milik NextAuth lewat `req.headers`.
 */
export function asalDariRecord(headers: Record<string, string> | undefined): string | null {
  const diteruskan = headers?.['x-forwarded-for'];
  if (typeof diteruskan === 'string') {
    // Rantai proxy menulis "client, proxy1, proxy2"; yang paling kiri adalah
    // client menurut konvensi.
    const pertama = diteruskan.split(',')[0];
    if (pertama !== undefined) {
      const hasil = bersihkan(pertama);
      if (hasil) return hasil;
    }
  }

  const nyata = headers?.['x-real-ip'];
  if (typeof nyata === 'string') return bersihkan(nyata);

  return null;
}

/**
 * Asal permintaan dari sebuah `Request` — bentuk yang diterima route handler.
 *
 * `Headers.get` sudah tidak peka huruf besar-kecil, jadi tidak perlu
 * menormalkan nama headernya.
 */
export function asalPermintaan(req: Request): string | null {
  const diteruskan = req.headers.get('x-forwarded-for');
  if (diteruskan !== null) {
    const pertama = diteruskan.split(',')[0];
    if (pertama !== undefined) {
      const hasil = bersihkan(pertama);
      if (hasil) return hasil;
    }
  }

  const nyata = req.headers.get('x-real-ip');
  if (nyata !== null) return bersihkan(nyata);

  return null;
}
