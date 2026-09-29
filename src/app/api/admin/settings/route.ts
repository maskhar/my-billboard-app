// src/app/api/admin/settings/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bacaBodyJson } from "@/lib/body-json";
import { dekripsi, enkripsi, enkripsiSiap } from "@/lib/rahasia";
import { ambilIdentitasSitus, namaUntukPrompt } from "@/lib/identitas-situs";
import { keE164 } from "@/lib/telepon";

// Menyamarkan API key: hanya 4 karakter terakhir yang ditampilkan.
// Nilai utuh tidak pernah meninggalkan server.
function maskApiKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

// Tanpa parameter: handler ini tidak membaca badan, query, maupun header
// permintaan sama sekali — identitas pemanggil datang dari `getServerSession`.
// `req: Request` yang dulu tertulis di sini membuat pembaca berikutnya mencari
// pemakaian yang tidak pernah ada.
export async function GET() {
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

  // `await req.json()` dulu dipanggil langsung di sini. Body yang bukan JSON
  // melempar tanpa penangkap: Next menjawabnya sebagai galat runtime, bukan
  // 400, dan jejaknya masuk log sebagai kerusakan server. Lihat
  // `src/lib/body-json.ts`.
  const hasilBody = await bacaBodyJson(req, 'admin/settings');
  if (!hasilBody.ok) return hasilBody.jawaban;
  const body = hasilBody.body;

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
          // Tanpa `?key=` di query string.
          //
          // Query string adalah bagian URL yang ikut tercatat di mana-mana:
          // access log Google, setiap proxy di jalur keluar, dan jejak `fetch`
          // di pemantau APM apa pun yang terpasang. Header tidak. Kunci yang
          // sama sudah dikirim lewat header di `chat-server/index.js`, dan dua
          // pemanggil Gemini yang berbeda cara melindungi kuncinya berarti yang
          // paling lemah yang menentukan.
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

          // Nama usaha dibaca dari pengaturan, bukan ditulis di kode.
          //
          // Sebelumnya di sini tertulis 'Utero Cloud' apa adanya — di berkas yang
          // TUGASNYA menyimpan nama usaha yang bisa diganti admin. Admin
          // mengganti namanya di kotak isian tepat di atas tombol ini, menekan
          // Tes AI, dan menerima slogan untuk perusahaan dengan nama lama.
          const { nama } = await ambilIdentitasSitus();
          const payload = {
            contents: [{
              parts: [{
                text: `Buatkan slogan singkat 5-8 kata yang punchy untuk jasa sewa Billboard '${namaUntukPrompt(nama)}'.`,
              }]
            }]
          };

          const aiResponse = await fetch(url, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': apiKey,
              },
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

      } catch (error) {
          // `catch (error: any)` lalu `error.message` dulu di sini adalah cacat,
          // bukan kelonggaran tipe: `throw` boleh melempar apa saja, dan
          // `fetch` yang gagal pada AbortError melempar objek tanpa `message`.
          // Membacanya lewat `any` berarti route ini bisa melempar
          // TypeError DI DALAM catch — galat 500 tanpa badan JSON, di jalur yang
          // justru dibuat untuk melaporkan galat.
          //
          // Isinya juga tidak lagi dikirim ke browser. Dulu kuncinya ada di
          // query string, jadi pesan galat `fetch` — yang memuat URL yang
          // diminta — membocorkannya ke tab Network siapa pun yang membuka
          // halaman pengaturan. Kunci itu sekarang di header dan tidak lagi ada
          // di URL, tapi pesan galat dari pihak ketiga tetap tidak dikirim
          // apa adanya: isinya tidak kita kendalikan, dan jalur inilah yang
          // paling sering dipakai untuk mengorek keadaan dalam server.
          // Keterangannya tetap ada, hanya di log server.
          console.error(
              '[admin/settings] Gagal menghubungi Gemini:',
              error instanceof Error ? error.message : error
          );
          return NextResponse.json(
              { message: "Koneksi ke layanan AI gagal. Periksa log server untuk keterangannya." },
              { status: 500 }
          );
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

  // Nomor WhatsApp punya tiga keadaan, bukan dua, dan itu bedanya dengan kedua
  // field di atas:
  //
  //   - field tidak dikirim sama sekali  -> jangan ubah
  //   - dikirim berisi teks              -> ganti, tapi hanya bila bentuknya sah
  //   - dikirim sebagai teks kosong      -> HAPUS nomornya
  //
  // Keadaan ketiga wajib ada dan tidak boleh ikut aturan "kosong berarti jangan
  // ubah": sales yang berhenti bekerja meninggalkan nomor pribadi di halaman
  // publik, dan admin harus punya cara membuangnya tanpa membuka database.
  // Untuk `siteName`/`siteDesc` aturan itu tidak berlaku — kolomnya non-null,
  // dan judul tab kosong bukan keadaan yang pernah dimaksudkan siapa pun.
  if (typeof body.waNumber === 'string') {
    const diketik = body.waNumber.trim();
    if (diketik === '') {
      data.waNumber = null;
    } else {
      // DITOLAK, bukan disimpan apa adanya, dan bukan pula "usaha terbaik".
      // Nomor yang bentuknya salah menjadi tombol yang mendarat di halaman
      // galat WhatsApp — pengunjung menyimpulkan nomornya benar dan
      // perusahaannya yang tidak menjawab. Admin yang salah ketik lebih baik
      // diberi tahu sekarang, di layar yang sama tempat ia mengetiknya.
      const e164 = keE164(diketik);
      if (!e164) {
        return NextResponse.json(
          {
            message:
              'Nomor WhatsApp tidak dikenali. Tulis dalam salah satu bentuk ini: ' +
              '0812xxxxxxx, 62812xxxxxxx, atau +62 812-xxxx-xxx. ' +
              'Kosongkan kolomnya bila ingin menghapus nomor yang tersimpan.',
          },
          { status: 400 }
        );
      }
      data.waNumber = e164;
    }
  }

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