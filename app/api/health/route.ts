/**
 * Health Check API Route — PROLAI
 */

import { NextResponse } from "next/server";
import { SITE_VERSION } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    version: SITE_VERSION,
    timestamp: Date.now(),
  });
}
