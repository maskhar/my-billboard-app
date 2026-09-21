import { NextRequest, NextResponse } from 'next/server';

// WARNING: This proxy is unauthenticated.
// It simply forwards requests to the backend to avoid CORS issues.
// Do not use this in production without adding a proper authentication layer.

async function handler(req: NextRequest) {
  try {
    // 1. Construct the target backend URL by parsing the request URL
    const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:4001';
    
    // Ekstrak path dari URL request
    const url = new URL(req.url);
    const apiPath = url.pathname.replace('/api/proxy/', ''); // Hapus prefix proxy
    
    // Tambahkan query string jika ada
    const targetUrl = `${backendUrl}/api/${apiPath}${url.search}`;
    
    // 2. Forward the request to the backend
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : null,
      // @ts-ignore
      duplex: 'half',
    });

    // 3. Return the response from the backend
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

  } catch (error) {
    console.error('API proxy error:', error);
    if (error instanceof Error && 'cause' in error) {
        const cause: any = error.cause;
        if (cause.code === 'ECONNREFUSED') {
            return new NextResponse(JSON.stringify({ error: 'API proxy failed', message: 'Could not connect to backend service.' }), { status: 502 });
        }
    }
    return new NextResponse(JSON.stringify({ error: 'API proxy failed' }), { status: 502 });
  }
}

// Export handlers for all common HTTP methods
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
export const HEAD = handler;