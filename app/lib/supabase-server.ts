import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client that reads/writes auth cookies.
 * Use in API routes (route.ts) to authenticate the user.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — silently ignore
          }
        },
      },
    }
  );
}

/**
 * Returns the authenticated user, or throws a 401 Response.
 */
export async function requireUser() {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) {
    throw Response.json({ error: "Non authentifié" }, { status: 401 });
  }
  return { user: data.user, sb };
}
