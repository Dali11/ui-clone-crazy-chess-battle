import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During build time, env vars might not be available
  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options as Record<string, unknown> | undefined)
        );
      },
    },
  });

  // Use getSession() instead of getUser() — reads from cookie locally,
  // no network round trip. getUser() makes a call to Supabase on every request.
  // The server components in the layout will call getUser() for the actual user data.
  let session = null;
  try {
    const result = await supabase.auth.getSession();
    session = result.data.session;
  } catch {
    return supabaseResponse;
  }
  const user = session?.user ?? null;

  // Redirect to signup if not authenticated and trying to access protected routes
  // Signup is the default auth flow; login remains available as a secondary option.
  const protectedRoutes = ["/dashboard", "/play", "/wallet", "/history", "/admin", "/challenge", "/battle-challenge", "/game"];
  const isProtected = protectedRoutes.some((route) =>
    request.nextUrl.pathname.startsWith(route)
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/signup";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect to dashboard if already logged in and on auth pages or homepage
  // But respect the redirect param if present
  const authOrHomeRoutes = ["/login", "/signup", "/", "/forgot-password", "/reset-password"];
  if (user && authOrHomeRoutes.includes(request.nextUrl.pathname)) {
    const redirect = request.nextUrl.searchParams.get("redirect");
    const url = request.nextUrl.clone();
    url.pathname = redirect || "/dashboard";
    url.searchParams.delete("redirect");
    return NextResponse.redirect(url);
  }

  // No-cache everywhere: this app is fully dynamic/live (scores, clocks, wallet
  // balances, games played, etc. must always reflect the latest DB state).
  // Static assets (_next/static, images) are already excluded by the matcher below.
  supabaseResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  supabaseResponse.headers.set("CDN-Cache-Control", "no-store");
  supabaseResponse.headers.set("Vercel-CDN-Cache-Control", "no-store");
  supabaseResponse.headers.set("Pragma", "no-cache");

  return supabaseResponse;
}
