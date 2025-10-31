import { NextRequest, NextResponse } from 'next/server';
import { createSessionCookie } from '@/lib/firebase-admin';

// Ensure Node.js runtime for Firebase Admin
export const runtime = 'nodejs';
// Prevent static generation
export const dynamic = 'force-dynamic';

// Set session expiration to 5 days
const expiresIn = 60 * 60 * 24 * 5 * 1000;

// Helper to determine if we're in production
const isProduction = process.env.NODE_ENV === 'production';

function determineCookieDomain(hostHeader: string | null): string | undefined {
  if (!hostHeader) return undefined;
  const host = hostHeader.split(':')[0];
  // For localhost or IPs, omit domain so cookie is host-only
  if (host === 'localhost' || /^(\d+\.){3}\d+$/.test(host)) return undefined;
  const parts = host.split('.');
  if (parts.length >= 2) {
    const root = parts.slice(-2).join('.');
    return `.${root}`; // leading dot to allow subdomains
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    console.log('Session creation request received');

    // Parse JSON body (avoid brittle request.body checks)
    let body: any;
    try {
      body = await request.json();
    } catch (e) {
      console.error('Failed to parse JSON body');
      return new NextResponse(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400 }
      );
    }

    console.log('Request body keys:', Object.keys(body || {}));

    const { idToken } = body || {};

    if (!idToken || typeof idToken !== 'string') {
      console.error('Missing or invalid idToken');
      return new NextResponse(
        JSON.stringify({ error: 'Missing or invalid ID token' }),
        { status: 400 }
      );
    }

    console.log('ID token received, length:', idToken.length);
    console.log('Creating session cookie...');

    // Create a session cookie using Firebase Admin directly
    const sessionCookie = await createSessionCookie(idToken, expiresIn);

    if (!sessionCookie) {
      console.error('Failed to create session cookie - no cookie returned');
      return new NextResponse(
        JSON.stringify({ error: 'Failed to create session cookie' }),
        { status: 500 }
      );
    }

    console.log('Session cookie created successfully, length:', sessionCookie.length);

    const hostHeader = request.headers.get('host');
    // Use host-only cookies to avoid cross-subdomain/domain issues
    const cookieDomain = undefined;
    console.log('Resolved cookie domain:', '(host-only)');

    // Set cookie options
    const options = {
      name: 'session',
      value: sessionCookie,
      maxAge: expiresIn,
      httpOnly: true,
      secure: isProduction,
      path: '/',
      sameSite: 'lax' as const,
      // host-only cookie
      domain: cookieDomain,
    };

    console.log('Cookie options:', {
      name: options.name,
      maxAge: options.maxAge,
      httpOnly: options.httpOnly,
      secure: options.secure,
      path: options.path,
      sameSite: options.sameSite,
      domain: options.domain || '(none)'
    });

    // Return the session cookie
    const response = new NextResponse(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Set the cookie
    response.cookies.set(options as any);
    console.log('Session cookie set in response');

    return response;
  } catch (error: any) {
    console.error('Failed to create session:', error);
    console.error('Error stack:', error.stack);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);

    const errorMessage = error.message || 'Unknown error occurred';
    const errorCode = error.code || 'UNKNOWN_ERROR';

    return new NextResponse(
      JSON.stringify({
        error: 'Internal server error',
        details: errorMessage,
        code: errorCode,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
  }
} 