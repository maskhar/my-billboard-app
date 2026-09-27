// src/app/api/admin/billboards/update/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idDariBody } from "@/lib/id-dari-body";
import { keDecimal, lebihBesar } from "@/lib/money";
import { pisahkanOpsi } from "@/lib/opsi-billboard";
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

      // --- LOGIC PACKING DATA BARU (SAMA SEPERTI CREATE) ---
      //
      // TANPA `JSON.stringify`: keempat kolom tujuan bertipe jsonb. Membungkusnya
      // tidak akan ditolak compiler (tipe `InputJsonValue` memuat `string`) tapi
      // menyimpan teks JSON di dalam jsonb — ganda-encode, dan pembacanya
      // melihat teks alih-alih array.
      const packedSpecs = [
        { label: "Ukuran", value: `${body.sizeH || 0}m x ${body.sizeW || 0}m` },
        { label: "Luas Area", value: `${(Number(body.sizeH) * Number(body.sizeW)).toFixed(1)} m²` },
        { label: "Layout / Orientasi", value: body.orientation || "-" },
        { label: "Tampilan", value: body.sides ? `${body.sides} Sisi` : "-" },
        { label: "Jenis Penerangan", value: body.lighting || "-" },
        { label: "Material", value: body.material || "-" },
      ];

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
                  title: body.title,
                  slug,
                  sku: body.sku,
                  address: body.address,
                  type: body.type,
                  price: harga,
                  lat: Number(body.lat),
                  lng: Number(body.lng),
                  mainImage: body.mainImage,
                  status: body.status,
                  publishStatus: body.publishStatus,
                  
                  // Keempat kolom di bawah bertipe jsonb — array masuk apa
                  // adanya, tanpa `JSON.stringify` (lihat catatan di atas).
                  specs: packedSpecs,
                  includes: includesList,
                  excludes: excludesList,
                  gallery: galeri,
                  smartsucoUrl: body.smartsucoUrl,
                  
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