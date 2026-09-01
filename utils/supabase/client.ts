import { createBrowserClient } from "@supabase/ssr";
import { waitForServerAuthSession } from "../../lib/browser-auth-readiness";
import { getBrowserSupabaseCookieOptions } from "./cookie-options";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function buildBrowserClient() {
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

type BrowserClient = ReturnType<typeof buildBrowserClient>;
type PasswordCredentials = Parameters<BrowserClient["auth"]["signInWithPassword"]>[0];

let browserClient: BrowserClient | null = null;

function installPasswordSessionReadinessBarrier(client: BrowserClient): BrowserClient {
  const signInWithPassword = client.auth.signInWithPassword.bind(client.auth);

  client.auth.signInWithPassword = async (credentials: PasswordCredentials) => {
    const result = await signInWithPassword(credentials);
    if (!result.error && result.data.session && typeof window !== "undefined") {
      let ready = await waitForServerAuthSession();
      if (!ready) {
        await client.auth.refreshSession();
        ready = await waitForServerAuthSession();
      }
      if (!ready) {
        console.warn("[auth] Browser session was created, but server readiness was not confirmed before redirect.");
      }
    }
    return result;
  };

  return client;
}

export const createClient = () => {
  if (typeof window !== "undefined" && browserClient) return browserClient;

  const client = buildBrowserClient();
  if (typeof window !== "undefined") {
    browserClient = installPasswordSessionReadinessBarrier(client);
    return browserClient;
  }

  return client;
};
