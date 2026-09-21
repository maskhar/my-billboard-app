import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) return new Response('Missing URL', { status: 400 });

  try {
    const response = await fetch(targetUrl, {
        headers: {
            // Pura-pura jadi browser biasa agar tidak diblokir
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });

    if (!response.ok) return new Response('Failed to load', { status: 500 });

    let html = await response.text();

    // === JURUS SAKTI: INJECT BASE TAG ===
    // Ini memberi tahu browser: "Semua gambar/script di halaman ini,
    // tolong ambil dari alamat asli, bukan dari localhost"
    const origin = new URL(targetUrl).origin;
    const baseTag = `<base href="${origin}/">`;

    // Selipkan <base> tepat setelah <head>
    html = html.replace('<head>', `<head>${baseTag}`);

    return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (error) {
    return new Response('Proxy Error', { status: 500 });
  }
}