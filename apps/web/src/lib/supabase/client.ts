"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Browser Supabase client (auth + realtime). Created lazily inside handlers. */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
