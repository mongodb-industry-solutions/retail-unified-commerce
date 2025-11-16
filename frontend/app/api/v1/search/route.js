import { NextResponse } from "next/server";

/**
 * Proxy route for backend search API
 * 
 * Flow:
 * 1. Browser → /api/v1/search (this Next.js route)
 * 2. Next.js → http://127.0.0.1:8000/api/v1/search (backend sidecar via loopback)
 * 3. Backend → Processes search → Returns results
 * 4. Next.js → Proxies response back to browser
 */
export async function POST(request) {
  try {
    // Get request body from browser
    const body = await request.json();
    
    // Backend URL - uses loopback when in Kanopy pod
    // Falls back to external URL for local development
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_ENDPOINT || 'http://localhost:8000';
    
    console.log('[API Proxy] Forwarding search request to backend:', backendUrl);
    console.log('[API Proxy] Request body:', body);
    
    // Forward request to backend sidecar
    const response = await fetch(`${backendUrl}/api/v1/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    // Check if backend responded successfully
    if (!response.ok) {
      console.error('[API Proxy] Backend error:', response.status, response.statusText);
      return NextResponse.json(
        { 
          error: 'Backend request failed',
          status: response.status,
          statusText: response.statusText
        },
        { status: response.status }
      );
    }
    
    // Get response data from backend
    const data = await response.json();
    
    console.log('[API Proxy] Backend response received:', {
      totalResults: data.total_results,
      productsCount: data.products?.length
    });
    
    // Return backend response to browser
    return NextResponse.json(data, { status: 200 });
    
  } catch (error) {
    console.error('[API Proxy] Error connecting to backend:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to connect to backend service',
        details: error.message,
        backendUrl: process.env.NEXT_PUBLIC_BACKEND_ENDPOINT
      },
      { status: 500 }
    );
  }
}

