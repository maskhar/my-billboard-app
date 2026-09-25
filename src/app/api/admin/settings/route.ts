// src/app/api/admin/settings/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dekripsi, enkripsi, enkripsiSiap } from "@/lib/rahasia";

// Menyamarkan API key: hanya 4 karakter terakhir yang ditampilkan.
// Nilai utuh tidak pernah meninggalkan server.
function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

export async function GET(req: Request) {
  // Sebelumnya handler GET tidak punya gate sama sekali, sehingga Gemini API
  // key dan Google Maps API key terkirim utuh ke siapa pun yang memanggilnya.
  // Gate disamakan dengan handler POST di bawah.
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Pola lama "baca dulu, buat kalau kosong" punya celah balapan: dua admin
  // yang membuka halaman setelan pada saat yang sama sama-sama membaca
  // "belum ada", lalu keduanya mencoba membuat baris dengan id yang sama —
  // yang kedua gagal dengan pelanggaran kunci unik, dan halaman setelan
  // menolak terbuka. `upsert` menyerahkan keputusan itu ke database, yang
  // melihat kedua permintaan sekaligus.
  const setting = await prisma.systemSetting.upsert({
      where: { id: "default_config" },
      update: {},
      create: { id: "default_config" },
  });

  // Nilai API key tidak dikirim ke browser. Client hanya menerima penanda
  // "sudah diisi/belum" plus pratinjau ter-mask untuk ditampilkan.
  //
  // Nilai di kolom kini tersimpan terenkripsi (lihat `src/lib/rahasia.ts`),
  // jadi 4 karakter terakhir untuk pratinjau harus diambil dari nilai yang
  // sudah dibuka — kalau tidak, yang tampil adalah potongan ciphertext.
  const { geminiApiKey: geminiTersimpan, googleMapsApiKey: mapsTersimpan, ...aman } = setting;
  const geminiApiKey = dekripsi(geminiTersimpan);
  const googleMapsApiKey = dekripsi(mapsTersimpan);

  return NextResponse.json({
      ...aman,
      geminiApiKey: null,
      googleMapsApiKey: null,
      geminiApiKeySet: !!geminiApiKey,
      googleMapsApiKeySet: !!googleMapsApiKey,
      geminiApiKeyMasked: maskApiKey(geminiApiKey),
      googleMapsApiKeyMasked: maskApiKey(googleMapsApiKey),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.action === 'TEST_AI') {
      // Bila client tidak mengirim key (karena GET sudah tidak membocorkannya),
      // pakai key yang tersimpan di database.
      let apiKey = body.apiKey ? String(body.apiKey).trim() : "";
      if (!apiKey) {
          const tersimpan = await prisma.systemSetting.findUnique({
              where: { id: "default_config" },
              select: { geminiApiKey: true },
          });
          apiKey = dekripsi(tersimpan?.geminiApiKey)?.trim() || "";
      }
      if (!apiKey) return NextResponse.json({ message: "API Key kosong!" }, { status: 400 });

      // GUNAKAN MODEL TERBARU (Sesuai Log Akunmu)
      const MODEL_NAME = "gemini-2.0-flash";

      console.log(`🤖 Testing AI with model: ${MODEL_NAME}`);

      try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
          
          const payload = {
            contents: [{
              parts: [{ text: "Buatkan slogan singkat 5-8 kata yang punchy untuk jasa sewa Billboard 'Utero Cloud'." }]
            }]
          };

          const aiResponse = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          const aiData = await aiResponse.json();

          if (aiData.error) {
              return NextResponse.json({ 
                  message: `Gagal (${aiData.error.code}): ${aiData.error.message}`, 
              }, { status: 400 });
          }

          const resultText = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (!resultText) {
              return NextResponse.json({ message: "AI diam saja (Empty Response)." }, { status: 500 });
          }

          return NextResponse.json({ message: "Sukses", aiResult: resultText });

      } catch (error: any) {
          return NextResponse.json({ message: "Koneksi Gagal.", errorDetails: error.message }, { status: 500 });
      }
  }

  // Save Settings Normal
  //
  // API key hanya ditulis bila client benar-benar mengirim nilai baru.
  // Karena GET tidak lagi mengembalikan key utuh, field yang dibiarkan kosong
  // di form berarti "jangan ubah" — bukan "hapus key yang tersimpan".
  // `siteName` dan `siteDesc` dulu ditulis apa adanya dari body. Keduanya
  // kolom `String` yang tidak boleh null: kalau client mengirim angka, objek,
  // atau tidak mengirim apa-apa, Prisma menolak dengan galat yang jatuh ke 500
  // tanpa penjelasan. Keduanya juga tampil di judul halaman untuk semua
  // pengunjung, jadi teks sepanjang apa pun akan ikut dirender.
  const data: Record<string, string | null> = {};

  const bersihkanTeks = (nilai: unknown, batas: number): string | null => {
      if (typeof nilai !== 'string') return null;
      const rapi = nilai.trim();
      return rapi === "" ? null : rapi.slice(0, batas);
  };

  const siteName = bersihkanTeks(body.siteName, 100);
  const siteDesc = bersihkanTeks(body.siteDesc, 300);

  // Field yang tidak dikirim berarti "jangan ubah", sama seperti perlakuan
  // API key di bawah — bukan "kosongkan".
  if (siteName !== null) data.siteName = siteName;
  if (siteDesc !== null) data.siteDesc = siteDesc;

  const adaKeyBaru =
      (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim() !== "") ||
      (typeof body.googleMapsApiKey === 'string' && body.googleMapsApiKey.trim() !== "");

  // Menolak menyimpan, bukan menyimpan sebagai teks biasa. Menyimpan diam-diam
  // tanpa enkripsi adalah cara paling halus untuk membuat pemilik usaha
  // mengira kuncinya terlindungi padahal tidak.
  if (adaKeyBaru && !enkripsiSiap()) {
      return NextResponse.json(
          {
              message:
                  "API key tidak disimpan: SETTINGS_ENCRYPTION_KEY belum diatur di environment server. " +
                  "Buat dengan `openssl rand -hex 32`, masukkan ke .env, lalu jalankan ulang server.",
          },
          { status: 503 }
      );
  }

  if (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim() !== "") {
      data.geminiApiKey = enkripsi(body.geminiApiKey.trim());
  }

  if (typeof body.googleMapsApiKey === 'string' && body.googleMapsApiKey.trim() !== "") {
      data.googleMapsApiKey = enkripsi(body.googleMapsApiKey.trim());
  }

  // `update` dulu dipakai di sini, padahal GET di atas memakai `upsert` untuk
  // baris yang sama. Bedanya baru terasa di instalasi baru: selama baris
  // `default_config` belum pernah dibuat, `update` gagal dengan P2025 ("Record
  // to update not found") yang tidak ditangkap siapa pun — admin menempel API
  // key, menekan Simpan, dan hanya menerima 500 tanpa keterangan. Ia akan
  // mengira key-nya yang salah dan mencobanya berulang kali.
  //
  // `upsert` membuat baris itu bila belum ada, jadi urutan pemakaian halaman
  // tidak lagi menentukan berhasil atau tidaknya penyimpanan.
  try {
      await prisma.systemSetting.upsert({
          where: { id: "default_config" },
          update: data,
          create: { id: "default_config", ...data },
      });
  } catch (error) {
      console.error("Gagal menyimpan pengaturan sistem:", error);
      return NextResponse.json(
          { message: "Pengaturan gagal disimpan. Coba lagi beberapa saat." },
          { status: 500 }
      );
  }

  return NextResponse.json({ message: "Pengaturan Disimpan" });
}