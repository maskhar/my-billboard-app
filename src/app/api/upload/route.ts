import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ message: "Login dulu" }, { status: 401 });

  try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      const orderId = formData.get("orderId") as string; // Penting

      if (!file || !orderId) return NextResponse.json({ message: "Data tidak lengkap" }, { status: 400 });
      
      // Limit 10MB
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ message: "File terlalu besar (Max 10MB)" }, { status: 400 });

      // Validasi Extensi (Gambar / PDF)
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowed.includes(file.type)) return NextResponse.json({ message: "Format harus Gambar atau PDF" }, { status: 400 });

      // Buat Buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      
      // Nama File: DESIGN-{OrderId}.ext (Supaya file lama tertimpa jika upload ulang, hemat storage)
      const ext = file.name.split('.').pop();
      const filename = `DESIGN-${orderId}.${ext}`;
      
      // Simpan di public/uploads/designs
      const uploadDir = path.join(process.cwd(), "public/uploads/designs");
      await mkdir(uploadDir, { recursive: true });
      const filePath = path.join(uploadDir, filename);

      await writeFile(filePath, buffer);

      return NextResponse.json({ url: `/uploads/designs/${filename}` });

  } catch (error) {
      return NextResponse.json({ message: "Gagal Upload" }, { status: 500 });
  }
}