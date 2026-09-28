// src/lib/tarif.ts
//
// Satu tempat untuk tarif yang ditagihkan: PPN, biaya administrasi, porsi DP,
// dan porsi refund.
//
// KENAPA TERPISAH DARI `money.ts` DAN `pembayaran.ts`
// --------------------------------------------------
// Keduanya mengimpor `@prisma/client`. Mengimpor modul itu ke Client Component
// menarik runtime Prisma ke bundel browser — cacat yang sudah dicatat di
// `src/lib/money.ts` dan di komentar tipe status `PengajuanClient.tsx`. Berkas
// ini sengaja NOL impor: hanya angka dan satu fungsi pembulatan, sehingga sisi
// server dan `CheckoutForm.tsx` bisa membaca tarif yang SAMA tanpa salah satu
// dari keduanya menyeberangi batas itu.
//
// KENAPA PERLU TERPUSAT
// ---------------------
// Tarifnya dulu hidup di dua tempat dengan nilai yang harus sama persis tanpa
// ada yang memeriksanya:
//
//   - `src/app/api/booking/create/route.ts`  → yang MENAGIH
//   - `src/components/CheckoutForm.tsx`      → yang DILIHAT pembeli
//
// dan porsi refund di dua tempat lagi:
//
//   - `src/app/api/booking/request-refund/route.ts`  → yang MEMBAYAR
//   - `src/app/dashboard/DashboardWrapper.tsx`       → yang DIJANJIKAN
//
// Satu angka diubah di satu berkas dan tidak di pasangannya bukan menghasilkan
// galat: pembeli melihat Rp 20.010.000 di layar checkout, menekan Bayar, lalu
// ditagih angka lain. Atau lebih buruk, ia disodori perkiraan refund 90% dan
// menerima 80% tanpa penjelasan. `tsc` tidak melaporkan apa pun pada keduanya.
//
// YANG MENGIKAT TETAP SERVER
// --------------------------
// Berkas ini hanya menyeragamkan ANGKANYA. Keputusan nominal tetap sepenuhnya
// di server: route `booking/create` menghitung dari `billboard.price` di
// database dan MENGABAIKAN setiap nominal yang dikirim browser. Pratinjau di
// `CheckoutForm` tidak pernah menjadi dasar penulisan apa pun.

/** Persentase PPN yang ditagihkan di atas harga sewa. */
export const PERSEN_PPN = 11;

/** Biaya administrasi tetap per pesanan, dalam rupiah. */
export const BIAYA_ADMIN = 50_000;

/** Porsi yang harus dibayar di muka bila pembeli memilih DP. */
export const PERSEN_DP = 60;

/**
 * Porsi uang masuk yang dikembalikan bila pesanan direfund.
 *
 * Dihitung atas UANG YANG SUDAH MASUK (`Payment` berstatus `PAID`), bukan atas
 * `totalPrice`. Pembeli yang baru menyetor DP 60% dan membatalkan menerima 90%
 * dari DP itu — bukan 90% dari seluruh tagihan, yang berarti mengirim uang yang
 * belum pernah ia setorkan.
 */
export const PERSEN_REFUND = 90;

/**
 * Ambil persentase dari sebuah nominal `number`, dibulatkan ke rupiah utuh.
 *
 * HANYA untuk pratinjau di browser. Nominal yang mengikat bertipe
 * `Prisma.Decimal` dan wajib lewat `persen()` di `src/lib/money.ts` — jangan
 * pakai fungsi ini pada nilai yang datang dari database atau yang akan
 * disimpan.
 *
 * `Math.round` membulatkan ke atas pada angka 5 untuk nilai positif, sama
 * dengan `Prisma.Decimal.ROUND_HALF_UP` yang dipakai sisi server. Tarif di sini
 * tidak pernah negatif, jadi perbedaan perlakuan keduanya atas bilangan negatif
 * tidak terjangkau.
 */
export function persenAngka(nilai: number, persentase: number): number {
  return Math.round((nilai * persentase) / 100);
}
