import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isPrivateUploadFilename, readPrivateUpload } from '@/lib/private-upload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Login required' }, { status: 401, headers: PRIVATE_HEADERS });
    }
    const { file } = await context.params;
    const upload = isPrivateUploadFilename(file) ? await readPrivateUpload(file, session.user) : null;
    if (!upload) {
      return NextResponse.json({ message: 'File tidak ditemukan' }, { status: 404, headers: PRIVATE_HEADERS });
    }
    return new Response(new Uint8Array(upload.buffer), {
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': upload.contentType,
        'Content-Length': String(upload.buffer.length),
        'Content-Disposition': `${upload.attachment ? 'attachment' : 'inline'}; filename="${file}"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ message: 'Gagal membaca file' }, { status: 500, headers: PRIVATE_HEADERS });
  }
}
