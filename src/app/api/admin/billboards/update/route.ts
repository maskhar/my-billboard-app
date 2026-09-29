// src/app/api/admin/billboards/update/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idDariBody } from "@/lib/id-dari-body";
import { keDecimal, lebihBesar } from "@/lib/money";
import { pisahkanOpsi } from "@/lib/opsi-billboard";
import { susunSpecs } from "@/lib/spesifikasi-billboard";
import { koordinat, teksBillboard } from "@/lib/bidang-billboard";
import {
  BillboardStatus,
  PublishStatus,
  daftarNilai,
  sahBillboardStatus,
  sahPublishStatus,
} from "@/lib/enum-guard";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || !['ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) {
      return NextResponse.json({ message: "Akses Ditolak" }, { status: 401 });
  }

  try {
      const body = await req.json();

      // KEDUA NILAI DI BAWAH MASUK KE `findFirst`, dan `where` milik `findFirst`
      // menerima FILTER pada setiap field — termasuk yang bersarang di bawah
      // `NOT`. Tanpa pemeriksaan tipe, `{"slug":{"not":""}}` cocok dengan
      // billboard mana pun yang ada, dan gerbang di bawah menolak SETIAP
      // penyimpanan dengan "Slug sudah dipakai billboard lain" — billboard yang
      // sah pun tidak bisa lagi disunting siapa pun.
      const id = idDariBody(body.id);
      if (id === null) {
          return NextResponse.json({ message: "ID billboard tidak valid." }, { status: 400 });
      }

      const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
      if (slug === '') {
          return NextResponse.json({ message: "Link URL (Slug) wajib diisi." }, { status: 400 });
      }

      // Cek Unik Slug (Kecuali diri sendiri)
      const existingSlug = await prisma.billboard.findFirst({
          where: {
              slug,
              NOT: { id }
          }
      });
      if (existingSlug) {
          return NextResponse.json({ message: "Link URL (Slug) sudah dipakai billboard lain!" }, { status: 400 });
      }

      // Ambil Data Lama (Untuk History)
      const oldData = await prisma.billboard.findUnique({ where: { id } });
      if (!oldData) return NextResponse.json({ message: "Data hilang" }, { status: 404 });

      // --- LOGIC PACKING DATA BARU ---
      //
      // Satu fungsi bersama dengan `create/route.ts`, bukan rumus kembar. Blok
      // ini dulu diberi judul "SAMA SEPERTI CREATE" — dan itu justru
      // masalahnya: sepakat hanya selama ada yang mengingat memperbarui
      // keduanya. Tiga dari enam barisnya juga meneruskan nilai body apa adanya
      // ke jsonb; lihat `src/lib/spesifikasi-billboard.ts`.
      //
      // TANPA `JSON.stringify`: keempat kolom tujuan bertipe jsonb. Membungkusnya
      // tidak akan ditolak compiler (tipe `InputJsonValue` memuat `string`) tapi
      // menyimpan teks JSON di dalam jsonb — ganda-encode, dan pembacanya
      // melihat teks alih-alih array.
      const packedSpecs = susunSpecs(body, 'billboards/update');

      // Satu fungsi bersama dengan `create/route.ts`, bukan rumus kembar: opsi
      // yang datang tanpa field `included` dulu di sini dihitung sebagai
      // EXCLUDE, sementara di create ia tidak masuk daftar mana pun — satu
      // billboard bisa berubah daftar fasilitasnya hanya karena disimpan lewat
      // jalur yang berbeda. Nama fasilitasnya juga dipastikan berupa teks di
      // sana; lihat catatan di `src/lib/opsi-billboard.ts`.
      const { includes: includesList, excludes: excludesList } = pisahkanOpsi(
        body.adminOptions,
        'billboards/update'
      );

      // Bentuk galeri dipastikan sebelum masuk database — setiap elemen nantinya
      // dirender sebagai `src` gambar di halaman publik. Lihat catatan yang sama
      // di `create/route.ts`.
      const galeri: string[] = Array.isArray(body.gallery)
          ? body.gallery.filter((u: unknown): u is string => typeof u === 'string' && u.trim() !== "")
          : [];

      // PERIKSA NILAI DARI FORM SEBELUM MASUK TRANSAKSI
      //
      // Ini bukan soal kerapian pesan error saja. Kalau nilai asing baru
      // ditolak di dalam `$transaction` di bawah, `billboardHistory.create`
      // ikut batal — jadi riwayat perubahan pun tidak tercatat, dan admin
      // hanya melihat "Gagal Update".
      //
      // `Number(body.price)` mengubah "" menjadi 0 (harga hilang diam-diam)
      // dan "12jt" menjadi NaN (ditolak kolom Decimal).
      const harga = keDecimal(body.price);
      if (!lebihBesar(harga, 0)) {
          return NextResponse.json(
              { message: "Harga sewa harus diisi dengan angka lebih dari 0" },
              { status: 400 }
          );
      }

      if (!sahBillboardStatus(body.status)) {
          return NextResponse.json(
              { message: `Status tidak dikenal. Pilihan: ${daftarNilai(BillboardStatus)}` },
              { status: 400 }
          );
      }

      if (!sahPublishStatus(body.publishStatus)) {
          return NextResponse.json(
              { message: `Status publikasi tidak dikenal. Pilihan: ${daftarNilai(PublishStatus)}` },
              { status: 400 }
          );
      }

      // KOORDINAT: DIPERIKSA, TIDAK DIBERI NILAI BAKU
      //
      // Baris ini dulu `lat: Number(body.lat)` — tanpa pemeriksaan berhingga dan
      // tanpa fallback, sementara `create/route.ts` punya `|| -7.9`. Menyimpang
      // di jalur yang justru lebih berbahaya: `{"lat":"utara"}` maupun `lat`
      // yang tidak dikirim menghasilkan `NaN`, kolom Float menolaknya, dan
      // karena penulisannya DI DALAM `$transaction` di bawah,
      // `billboardHistory.create` ikut batal — jadi jejak auditnya pun hilang.
      //
      // Di sini ia 400, BUKAN nilai baku seperti di create. Perbedaannya
      // disengaja: create menempatkan billboard baru yang koordinatnya belum
      // diisi di pusat Malang, sedangkan update yang koordinatnya hilang berarti
      // MEMINDAHKAN billboard yang sudah terpasang ke titik itu. Menyimpan
      // -7.9/112.6 diam-diam di jalur ini berarti billboard yang sudah benar
      // berpindah lokasi tanpa ada yang meminta.
      const lat = koordinat(body.lat);
      const lng = koordinat(body.lng);
      if (lat === null || lng === null) {
          return NextResponse.json(
              { message: "Koordinat (Latitude/Longitude) harus berupa angka." },
              { status: 400 }
          );
      }

      // KOLOM TEKS
      //
      // Sebelumnya `body.sku`, `body.address`, `body.type`, `body.mainImage`,
      // dan `body.title` diteruskan apa adanya. Nilai bukan teks ditolak Prisma
      // di lapisan paling dalam, jadi jawabannya 500 "Gagal Update" tanpa
      // menyebut bidang mana — dan seperti koordinat di atas, ia membatalkan
      // riwayat perubahan sekaligus.
      //
      // Keduanya wajib karena kolomnya non-null dan ini penyuntingan billboard
      // yang sudah ada: tidak ada nilai baku yang benar untuk menggantikan judul
      // atau alamat yang sudah tersimpan.
      const title = teksBillboard(body.title);
      if (title === null) {
          return NextResponse.json({ message: "Judul billboard wajib diisi." }, { status: 400 });
      }

      const address = teksBillboard(body.address);
      if (address === null) {
          return NextResponse.json({ message: "Alamat billboard wajib diisi." }, { status: 400 });
      }

      const sku = teksBillboard(body.sku) ?? "NO-SKU";
      const type = teksBillboard(body.type) ?? "Baliho";
      const mainImage = teksBillboard(body.mainImage) ?? "";
      // Kolomnya opsional: billboard tanpa tautan trafik itu hal biasa, dan
      // `null` di sini artinya "kosongkan", bukan "tidak sah".
      const smartsucoUrl = teksBillboard(body.smartsucoUrl);

      // TRANSAKSI DATABASE (Simpan History -> Update Data)
      await prisma.$transaction([
          // 1. Simpan History
          prisma.billboardHistory.create({
              data: {
                  billboardId: id,
                  title: oldData.title,
                  price: oldData.price,
                  status: oldData.status,
                  changedById: session.user.id,
                  // Simpan snapshot data lama.
                  //
                  // `snapshot` memang masih bertipe String, jadi `JSON.stringify`
                  // di sini BENAR — bukan sisa yang terlewat. Tapi perhatikan
                  // akibatnya: sejak keempat kolom JSON menjadi jsonb, isi
                  // snapshot berbeda tergantung tanggalnya. Baris lama memuat
                  // `gallery` sebagai teks (`"[\"a.jpg\"]"`), baris baru sebagai
                  // array sungguhan (`["a.jpg"]`). Rollback di
                  // `api/admin/billboards/rollback` hanya menyalin `title`,
                  // `price`, dan `status`, jadi perbedaan ini tidak
                  // memengaruhinya — tapi kode apa pun yang nanti membaca
                  // `gallery` dari snapshot harus menyiapkan kedua bentuk itu.
                  snapshot: JSON.stringify({ ...oldData })
              }
          }),
          
          // 2. Update Data
          prisma.billboard.update({
              where: { id },
              data: {
                  title,
                  slug,
                  sku,
                  address,
                  type,
                  price: harga,
                  lat,
                  lng,
                  mainImage,
                  status: body.status,
                  publishStatus: body.publishStatus,
                  
                  // Keempat kolom di bawah bertipe jsonb — array masuk apa
                  // adanya, tanpa `JSON.stringify` (lihat catatan di atas).
                  specs: packedSpecs,
                  includes: includesList,
                  excludes: excludesList,
                  gallery: galeri,
                  smartsucoUrl,

                  updatedById: session.user.id
              }
          })
      ]);

      return NextResponse.json({ message: "Update Sukses!" });

  } catch (error) {
      console.error(error);
      return NextResponse.json({ message: "Gagal Update" }, { status: 500 });
  }
}