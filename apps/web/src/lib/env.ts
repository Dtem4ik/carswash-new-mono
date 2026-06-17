/**
 * Public environment access. NEXT_PUBLIC_* vars are statically inlined by Next,
 * so they must be referenced literally (not via dynamic keys). These getters
 * throw a clear error at call time if a var is missing — never at module load,
 * so the build does not require them.
 */

export function supabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return value;
}

export function supabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value)
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
  return value;
}

export function apiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}
