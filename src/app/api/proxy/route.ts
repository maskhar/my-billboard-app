// src/app/api/proxy/route.ts
//
// Proksi halaman eksternal (laporan trafik dari TrafficReportModal) supaya
// bisa ditampilkan di iframe tanpa diblokir X-Frame-Options/CORS.
//
// Endpoint ini PUBLIK, jadi ?url= yang bebas adalah celah SSRF open proxy.
// Sekarang target wajib lolos allowlist host:
//   - hanya http/https
//   - hostname harus ada di allowlist (default smartsuco.com, bisa ditambah
//     lewat env PROXY_ALLOWED_HOSTS, dipisah koma, mendukung pola *.domain.com)
//   - IP literal (privat maupun publik), localhost, dan domain internal
//     selalu ditolak - termasuk 169.254.169.254 (metadata cloud),
//     127.0.0.1, 10.x/172.16.x/192.168.x, ::1, dsb.
//   - redirect divalidasi ulang per hop supaya tidak bisa dibelokkan ke
//     host di luar allowlist.
// Target di luar allowlist dibalas 400.

const DEFAULT_ALLOWED_HOSTS = ['smartsuco.com'];
const MAX_REDIRECTS = 3;

function readAllowedHosts(): string[] {
  const fromEnv = (process.env.PROXY_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase().replace(/^\*\./, ''))
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_ALLOWED_HOSTS, ...fromEnv]));
}

function isIpLiteral(host: string): boolean {
  // IPv6: URL parser memberi bracket, mis. [::1]
  if (host.includes(':') || host.startsWith('[')) return true;
  // IPv4 (termasuk bentuk desimal/hex yang sudah dinormalisasi URL parser)
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // bentuk aneh dianggap privat
  }
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 (localhost)
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local / metadata cloud)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 192 && b === 0) || // 192.0.0.0/24
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 (benchmark)
    a >= 224 // multicast & reserved
  );
}

function isHostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return false;

  // IP literal ditolak apa pun isinya: allowlist berbasis nama domain,
  // jadi IP (termasuk privat/loopback/link-local) tidak punya tempat di sini.
  if (isIpLiteral(host)) return false;

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  ) {
    return false;
  }

  return readAllowedHosts().some(
    (entry) => host === entry || host.endsWith(`.${entry}`)
  );
}

function validateTarget(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'URL tidak valid.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Hanya http/https yang diizinkan.' };
  }

  const host = url.hostname.toLowerCase();
  if (isIpLiteral(host)) {
    // Mencakup 169.254.169.254 (metadata cloud), 127.0.0.1, 10/172.16/192.168,
    // ::1, dsb. IP publik juga ditolak: allowlist hanya berisi nama domain.
    return isPrivateIpv4(host.replace(/[\[\]]/g, ''))
      ? { ok: false, reason: 'Target berupa IP privat/loopback/link-local (termasuk 169.254.169.254).' }
      : { ok: false, reason: 'IP literal ditolak; allowlist hanya menerima nama domain.' };
  }

  if (!isHostAllowed(host)) {
    return { ok: false, reason: 'Host target tidak ada di allowlist.' };
  }

  return { ok: true, url };
}

const browserHeaders = {
  // Pura-pura jadi browser biasa agar tidak diblokir
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) return new Response('Missing URL', { status: 400 });

  const first = validateTarget(targetUrl);
  if (!first.ok) {
    return new Response(`URL target ditolak: ${first.reason}`, { status: 400 });
  }

  try {
    let current = first.url;
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(current, {
        headers: browserHeaders,
        redirect: 'manual',
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;

      const location = response.headers.get('location');
      if (!location) {
        return new Response('Redirect tanpa lokasi tujuan.', { status: 502 });
      }

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return new Response('URL target tidak valid.', { status: 400 });
      }

      const check = validateTarget(next.toString());
      if (!check.ok) {
        return new Response(`Redirect ditolak: ${check.reason}`, { status: 400 });
      }
      current = check.url;

      if (hop === MAX_REDIRECTS) {
        return new Response('Terlalu banyak redirect.', { status: 502 });
      }
    }

    if (!response || !response.ok) {
      return new Response('Failed to load', { status: 500 });
    }

    let html = await response.text();

    // === JURUS SAKTI: INJECT BASE TAG ===
    // Ini memberi tahu browser: "Semua gambar/script di halaman ini,
    // tolong ambil dari alamat asli, bukan dari localhost"
    const origin = current.origin;
    const baseTag = `<base href="${origin}/">`;

    // Selipkan <base> tepat setelah <head>
    html = html.replace('<head>', `<head>${baseTag}`);

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    return new Response('Proxy Error', { status: 500 });
  }
}
