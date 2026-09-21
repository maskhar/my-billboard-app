import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  try {
    console.log("📂 Memulai proses upload desain...");

    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ message: "Login required" }, { status: 401 });
    }

    // Ambil Data dengan aman
    const formData = await req.formData().catch(() => null);
    if(!formData) {
        return NextResponse.json({ message: "Form data corrupt/kosong" }, { status: 400 });
    }

    const file = formData.get("file") as File;
    const orderId = formData.get("orderId") as string;

    if (!file || !orderId) {
        return NextResponse.json({ message: "File atau Order ID tidak ditemukan" }, { status: 400 });
    }
    
    // Validasi Ukuran (10 MB)
    if (file.size > 10 * 1024 * 1024) {
        return NextResponse.json({ message: "File terlalu besar (Max 10MB)" }, { status: 400 });
    }

    // Validasi Tipe (Lebih Luwes)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
        return NextResponse.json({ message: "Format harus Gambar (JPG/PNG) atau PDF." }, { status: 400 });
    }

    // --- PROSES SIMPAN KE DISK ---
    
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Tentukan Lokasi Folder (Gunakan Absolute Path agar tidak salah)
    const uploadDir = path.join(process.cwd(), "public/uploads/designs");
    
    // 1. Buat folder jika belum ada (Recursive = Aman)
    try {
        await mkdir(uploadDir, { recursive: true });
    } catch (err) {
        console.error("Gagal buat folder:", err);
    }

    // 2. Buat nama file aman (timestamp agar tidak cache)
    const ext = file.name.split('.').pop() || "png";
    const filename = `DESIGN-${orderId}-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);

    // 3. Tulis File
    await writeFile(filePath, buffer);
    console.log(`✅ Desain tersimpan di: ${filePath}`);

    // Kembalikan URL publik
    const publicUrl = `/uploads/designs/${filename}`;
    return NextResponse.json({ url: publicUrl, message: "Sukses Upload!" });

  } catch (error: any) {
      console.error("🔥 Server Upload Error:", error);
      return NextResponse.json({ message: `Gagal Server: ${error.message}` }, { status: 500 });
  }
}