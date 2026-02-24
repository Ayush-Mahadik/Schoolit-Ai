/**
 * Cloud Storage Availability — SchoolIT AI
 * ==========================================
 * SECURITY: All Supabase credentials are now server-side only.
 * No database URLs or API keys are exposed to the browser.
 *
 * Cloud operations go through /api/conversations (server-side route)
 * which validates the user session and uses SUPABASE_SERVICE_ROLE_KEY.
 *
 * This module only exports a simple availability check.
 * The actual Supabase client lives exclusively in /api/conversations/route.ts.
 */

/**
 * Check if cloud sync is available.
 * Always returns true — the server-side API handles auth and availability.
 * ConversationHistory further gates on user session before calling cloud functions.
 */
export function isCloudEnabled(): boolean {
  return true;
}
