// src/app/api/admin/settings/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  let setting = await prisma.systemSetting.findUnique({ where: { id: "default_config" } });
  if (!setting) {
      setting = await prisma.systemSetting.create({ data: { id: "default_config" } });
  }
  return NextResponse.json(setting);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.action === 'TEST_AI') {
      const apiKey = body.apiKey ? body.apiKey.trim() : "";
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
  await prisma.systemSetting.update({
      where: { id: "default_config" },
      data: {
          siteName: body.siteName,
          siteDesc: body.siteDesc,
          geminiApiKey: body.geminiApiKey,
          googleMapsApiKey: body.googleMapsApiKey
      }
  });

  return NextResponse.json({ message: "Pengaturan Disimpan" });
}