// src/lib/tipe-billboard.ts
//
// Bentuk data billboard di SISI BROWSER.
//
// KENAPA TERPISAH DARI TIPE PRISMA
// --------------------------------
// Form admin adalah Client Component. Mengimpor tipe Prisma di sana menarik
// runtime `@prisma/client` ke bundle browser, dan `Billboard.price` bertipe
// `Prisma.Decimal` — sebuah objek yang tidak bisa menyeberang sebagai JSON.
// Jadi bentuknya dinyatakan ulang di sini, dengan `price` berupa angka biasa
// dan keempat kolom jsonb sebagai array yang sudah terurai.
//
// KENAPA BUKAN `any`
// ------------------
// State form ini dulu bertipe `any`, dan satu kolom hilang tanpa ada yang tahu:
// `status` dirender sebagai `<select value={form.status}>` padahal nilai awalnya
// tidak pernah ada di state. React memperlakukan `value={undefined}` sebagai
// input TAK TERKENDALI — select-nya menampilkan pilihan pertama ("Available")
// sementara state-nya tetap kosong, dan pilihan admin baru terkirim kalau ia
// sempat menyentuh select itu. Pada billboard baru nilainya lolos ke database
// hanya karena route create punya default; pada form EDIT, status yang sudah
// dimuat dari database ikut dikirim balik apa adanya, jadi cacatnya tidak
// terlihat. `any` yang menyembunyikan ini adalah alasan tipe di bawah ada.

/** Nilai `BillboardStatus` sebagai teks. Casing-nya sengaja begini — lihat schema. */
export type StatusBillboard = 'Available' | 'Booked';

/** Nilai `PublishStatus` sebagai teks. */
export type StatusPublikasi = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/**
 * Apakah `nilai` salah satu status ketersediaan yang dikenal?
 *
 * Ditulis di sini, bukan di `src/lib/enum-guard.ts`, karena pemakainya adalah
 * Client Component: guard di sana mengimpor objek enum dari `@prisma/client`,
 * dan itu menarik runtime Prisma ke bundle browser. Daftarnya tetap satu untuk
 * seluruh sisi client — dipakai `<select>` maupun pembaca jawaban API — supaya
 * tidak ada dua daftar yang bisa berbeda isi.
 */
export function sahStatusBillboard(nilai: unknown): nilai is StatusBillboard {
  return nilai === 'Available' || nilai === 'Booked';
}

/** Apakah `nilai` salah satu status publikasi yang dikenal? */
export function sahStatusPublikasi(nilai: unknown): nilai is StatusPublikasi {
  return nilai === 'DRAFT' || nilai === 'PUBLISHED' || nilai === 'ARCHIVED';
}

/** Satu baris spesifikasi teknis, sebagaimana tersimpan di kolom jsonb `specs`. */
export type BarisSpesifikasi = {
  label: string;
  value: string;
};

/**
 * Satu fasilitas beserta keputusan admin apakah ia termasuk harga.
 *
 * Inilah bentuk yang dikirim form; route `create`/`update` memisahkannya
 * menjadi `includes` dan `excludes` lewat `src/lib/opsi-billboard.ts`.
 */
export type OpsiFasilitas = {
  name: string;
  included: boolean;
};

/**
 * Isi state form billboard.
 *
 * Kolom ukuran (`sizeH`/`sizeW`) dan `sides` bertipe TEKS, bukan angka, dan itu
 * disengaja: ketiganya terikat ke `<input>`/`<select>`, dan sebuah input angka
 * yang dikosongkan admin memberi `''` — memaksanya `number` membuat nilainya
 * menjadi `NaN` yang lalu tersimpan sebagai `0`. Route-nya memang menerima teks
 * (`Number(body.sizeH)` di sisi server).
 */
export type FormBillboard = {
  title: string;
  slug: string;
  sku: string;
  address: string;
  type: string;
  /** Angka biasa, bukan Decimal: nominal di browser tidak pernah dihitung. */
  price: number;
  lat: number | string;
  lng: number | string;
  status: StatusBillboard;
  publishStatus: StatusPublikasi;
  mainImage: string;
  // `desc` SENGAJA TIDAK ADA. State form dulu memuatnya, tapi `model Billboard`
  // tidak punya kolom itu, tidak ada satu pun `<textarea name="desc">` di
  // layarnya, dan route create maupun update tidak pernah membaca `body.desc`.
  // Ia hanya ikut terkirim dan dibuang di server.
  sizeH: string;
  sizeW: string;
  orientation: string;
  sides: string;
  lighting: string;
  material: string;
  smartsucoUrl: string;
  gallery: string[];
  adminOptions: OpsiFasilitas[];
};

/**
 * Satu baris riwayat revisi yang ditampilkan panel audit.
 *
 * Hanya kolom yang benar-benar dirender. `snapshot` SENGAJA tidak ada: ia memuat
 * seluruh baris billboard lama sebagai teks JSON dan tidak pernah dibaca layar
 * ini — menyebutnya di tipe hanya mengundang orang membukanya di browser.
 */
export type BarisRiwayatBillboard = {
  id: string;
  title: string;
  /** Sudah berupa angka: `res.json()` mengubah Decimal menjadi teks/angka. */
  price: number | string;
  status: StatusBillboard;
  archivedAt: string;
  changedBy: { id: string; name: string | null } | null;
};

/**
 * Bentuk jawaban `GET /api/admin/billboards/detail`.
 *
 * Seluruh kolomnya opsional (`Partial`) karena route itu mengembalikan `null`
 * untuk id yang tidak ada, dan karena kolom jsonb-nya bisa berisi data lama
 * yang belum tentu berbentuk seperti yang diharapkan — itu sebabnya form
 * membacanya lewat `arrayDariJson`, bukan langsung.
 */
export type DetailBillboardDariApi = Partial<{
  id: string;
  title: string;
  slug: string;
  sku: string | null;
  address: string;
  type: string;
  price: number | string;
  lat: number;
  lng: number;
  status: StatusBillboard;
  publishStatus: StatusPublikasi;
  mainImage: string;
  smartsucoUrl: string | null;
  gallery: unknown;
  specs: unknown;
  includes: unknown;
  excludes: unknown;
  history: BarisRiwayatBillboard[];
}>;
