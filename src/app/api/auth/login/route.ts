import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST — log in with username OR email.
// The username → email mapping is resolved server-side and never sent
// to the client, so usernames can't be used to enumerate emails.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const identifier = String(body?.identifier ?? "").trim();
    const password = String(body?.password ?? "");

    if (!identifier || !password) {
      return NextResponse.json({ error: "Missing username or password" }, { status: 400 });
    }

    let email: string | null = identifier;
    let username: string | null = null;

    // Treat any identifier containing "@" as an email; otherwise resolve username.
    if (!identifier.includes("@")) {
      const admin = createAdminClient();
      const { data: candidates } = await admin
        .from("profiles")
        .select("email, username")
        .ilike("username", identifier)
        .limit(5);

      // Prefer an exact-case match when two usernames differ only by case.
      const match = candidates?.find((c: any) => c.username === identifier) ?? candidates?.[0] ?? null;
      email = match?.email ?? null;
      username = match?.username ?? null;
    }

    if (!email) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // Standard Supabase password grant (same as signInWithPassword).
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify({ email, password }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const data = await res.json();

    return NextResponse.json({
      session: { access_token: data.access_token, refresh_token: data.refresh_token },
      resolved_as: username ? "username" : "email",
    });
  } catch (err: any) {
    console.error("[auth/login] error:", err?.message);
    return NextResponse.json({ error: "Login failed — please try again" }, { status: 500 });
  }
}
