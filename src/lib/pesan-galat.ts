// src/lib/pesan-galat.ts
//
// Membaca pesan dari sesuatu yang dilempar.
//
// KENAPA INI PERLU ADA
// --------------------
// Pola `catch (error: any)` lalu `alert(error.message)` tersebar di enam
// layar, dan ia bukan kelonggaran tipe — ia cacat. `throw` boleh melempar apa
// saja: string, `undefined`, objek biasa. `fetch` yang dibatalkan melempar
// objek tanpa `message`. Pada nilai seperti itu `error.message` melempar
// TypeError DI DALAM catch, jadi penanganan galatnya sendiri yang gagal:
// pengguna tidak melihat pesan apa pun, hanya tombol yang berhenti bekerja
// karena `finally` tidak pernah tercapai pada beberapa bentuk kegagalan.
//
// Komentar di `src/app/api/admin/settings/route.ts` sudah mencatat cacat yang
// sama di sisi server. Ini padanannya untuk sisi browser, ditulis satu kali.

/**
 * Pesan yang bisa ditampilkan dari nilai apa pun yang dilempar.
 *
 * `cadangan` dipakai bila yang dilempar tidak membawa pesan yang berarti.
 * Nilai non-`Error` TIDAK diubah menjadi teks lewat `String(...)`: objek biasa
 * menghasilkan `"[object Object]"`, dan itu lebih buruk daripada pesan
 * cadangan yang setidaknya menyebut apa yang gagal.
 */
export function pesanGalat(galat: unknown, cadangan: string): string {
  if (galat instanceof Error) {
    const pesan = galat.message.trim();
    return pesan === '' ? cadangan : pesan;
  }

  // String yang dilempar langsung (`throw 'gagal'`) masih dihormati: ia memang
  // sudah berupa pesan.
  if (typeof galat === 'string') {
    const pesan = galat.trim();
    return pesan === '' ? cadangan : pesan;
  }

  return cadangan;
}
