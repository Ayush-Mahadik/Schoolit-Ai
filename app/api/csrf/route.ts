/**
 * PROLAI — CSRF Token Endpoint
 * =============================
 * GET /api/csrf → Returns a fresh CSRF token.
 * Client must include this token in the x-prolai-csrf header on POST requests.
 */

import { createCSRFEndpointHandler } from "@/lib/server/security";

export const dynamic = "force-dynamic";
export const GET = createCSRFEndpointHandler();
