/**
 * Supabase Storage — server-side only.
 *
 * ARCHITECTURE.md §7: "Secrets never in chat or client. Supabase keys ...
 * live in server-side .env only. The anon key is never shipped to any
 * browser -- the browser never talks to Supabase directly." This client
 * uses the SERVICE key and must never be imported by anything in
 * resources/js or pos/src.
 *
 * Three buckets, created once in the Supabase dashboard (Storage tab) or
 * via the SQL below -- there is no Prisma-managed equivalent for Storage
 * buckets, they are not part of schema.prisma:
 *
 *   product-images   public   -- product photos shown in the dashboard/till
 *   receipts         private  -- generated receipt PDFs/images (till or dashboard reprint)
 *   branding         public   -- white-label logos (tenants.branding jsonb references these)
 *
 * Create them with (run once against your Supabase project, e.g. via the
 * SQL editor or `supabase storage` CLI):
 *
 *   insert into storage.buckets (id, name, public) values
 *     ('product-images', 'product-images', true),
 *     ('receipts', 'receipts', false),
 *     ('branding', 'branding', true)
 *   on conflict (id) do nothing;
 *
 * Storage objects are subject to their own RLS-like policy system
 * (storage.objects has RLS enabled by default in every Supabase project).
 * Since all uploads here go through this server-side service-key client,
 * which bypasses storage policies entirely, no additional storage.objects
 * policies are required for the app to function -- but leaving the bucket
 * public/private flags above wrong would still let the anon key read a
 * private bucket directly, so keep `receipts` non-public.
 */
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export type StorageBucket = 'product-images' | 'receipts' | 'branding';

let client: ReturnType<typeof createClient> | null = null;

/**
 * Lazily constructed and nullable on purpose: Storage is an optional feature
 * (product photos, custom branding), not load-bearing for the core POS flow.
 * A tenant running without SUPABASE_URL/SUPABASE_SERVICE_KEY configured
 * should get a clear error on the one upload endpoint that needs it, not a
 * crash on server boot -- unlike APP_KEY (index.ts), which the whole
 * session layer depends on and correctly refuses to start without.
 */
function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error(
      'Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing). ' +
      'Set both in server/.env to enable image uploads.',
    );
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }, // server-side, no session to persist
    });
  }
  return client;
}

/**
 * Upload a file, tenant-namespaced by path prefix so two tenants can never
 * collide or overwrite each other's objects even though the bucket itself
 * is shared. Returns the storage path (store THIS in the DB — e.g.
 * products.image_path — not a URL, since public URLs are derived and
 * signed URLs expire).
 */
export async function uploadFile(
  bucket: StorageBucket,
  tenantId: string,
  file: Buffer,
  originalName: string,
  contentType: string,
): Promise<string> {
  const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
  const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await getClient()
    .storage.from(bucket)
    .upload(path, file, { contentType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

/** Public URL for a public-bucket object (product-images, branding). */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
  const { data } = getClient().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Time-limited signed URL for a private-bucket object (receipts). Default
 * 1 hour — long enough to view/print a reprint request, short enough that a
 * leaked link doesn't stay valid indefinitely.
 */
export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await getClient()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);

  if (error) throw new Error(`Failed to sign URL: ${error.message}`);
  return data.signedUrl;
}

export async function deleteFile(bucket: StorageBucket, path: string): Promise<void> {
  const { error } = await getClient().storage.from(bucket).remove([path]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}

/** True when Storage is configured — routes can check this before offering upload UI affordances. */
export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
}
