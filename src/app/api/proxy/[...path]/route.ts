import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { buildNextAuthCookieHeader } from '@/lib/nextauth-cookie';

type RouteContext = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:4001';
  const destination = new URL(
    `/api/${path.map((segment) => encodeURIComponent(segment)).join('/')}${req.nextUrl.search}`,
    backendUrl,
  );
  const cookieHeader = buildNextAuthCookieHeader(await cookies());

  try {
    const response = await fetch(destination, {
      method: req.method,
      headers: {
        ...(req.headers.get('content-type')
          ? { 'Content-Type': req.headers.get('content-type') as string }
          : {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      ...(req.method === 'GET' || req.method === 'HEAD'
        ? {}
        : { body: await req.arrayBuffer() }),
      cache: 'no-store',
    });

    const headers = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);

    return new NextResponse(req.method === 'HEAD' ? null : response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error('[api/proxy] Backend request failed:', error);
    return NextResponse.json({ message: 'Backend tidak dapat dihubungi.' }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const HEAD = forward;