// src/app/api/admin/billboards/update/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { keDecimal, lebihBesar } from "@/lib/money";
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

      // Cek Unik Slug (Kecuali diri sendiri)
      const existingSlug = await prisma.billboard.findFirst({
          where: {
              slug: body.slug,
              NOT: { id: body.id }
          }
      });
      if (existingSlug) {
          return NextResponse.json({ message: "Link URL (Slug) sudah dipakai billboard lain!" }, { status: 400 });
      }

      // Ambil Data Lama (Untuk History)
      const oldData = await prisma.billboard.findUnique({ where: { id: body.id } });
      if (!oldData) return NextResponse.json({ message: "Data hilang" }, { status: 404 });

      // --- LOGIC PACKING DATA BARU (SAMA SEPERTI CREATE) ---
      const packedSpecs = JSON.stringify([
        { label: "Ukuran", value: `${body.sizeH || 0}m x ${body.sizeW || 0}m` },
        { label: "Luas Area", value: `${(Number(body.sizeH) * Number(body.sizeW)).toFixed(1)} m²` },
        { label: "Layout / Orientasi", value: body.orientation || "-" },
        { label: "Tampilan", value: body.sides ? `${body.sides} Sisi` : "-" },
        { label: "Jenis Penerangan", value: body.lighting || "-" },
        { label: "Material", value: body.material || "-" },
      ]);

      const options = Array.isArray(body.adminOptions) ? body.adminOptions : [];
      const includesList = options.filter((o:any) => o.included).map((o:any) => o.name);
      const excludesList = options.filter((o:any) => !o.included).map((o:any) => o.name);
      const galleryJson = JSON.stringify(body.gallery || []);

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
                  billboardId: body.id,
                  title: oldData.title,
                  price: oldData.price,
                  status: oldData.status,
                  changedById: session.user.id,
                  // Simpan snapshot data lama
                  snapshot: JSON.stringify({ ...oldData }) 
              }
          }),
          
          // 2. Update Data
          prisma.billboard.update({
              where: { id: body.id },
              data: {
                  title: body.title,
                  slug: body.slug,
                  sku: body.sku,
                  address: body.address,
                  type: body.type,
                  price: harga,
                  lat: Number(body.lat),
                  lng: Number(body.lng),
                  mainImage: body.mainImage,
                  status: body.status,
                  publishStatus: body.publishStatus,
                  
                  // Update data JSON
                  specs: packedSpecs,
                  includes: JSON.stringify(includesList),
                  excludes: JSON.stringify(excludesList),
                  gallery: galleryJson,
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