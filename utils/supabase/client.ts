import { createBrowserClient } from "@supabase/ssr";
import { getBrowserSupabaseCookieOptions } from "./cookie-options";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = () => {
  const cookieOptions = getBrowserSupabaseCookieOptions();

  return createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
    {
      ...(cookieOptions ? { cookieOptions } : {}),
      auth: {
        experimental: { passkey: true },
      },
    },
  );
}
