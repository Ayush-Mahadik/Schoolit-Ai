/**
 * Health Check API Route
 */

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    version: "2.1.0",
    services: {
      ai: !!process.env.GITHUB_TOKEN,
      charts: true,
      web_search: true,
    },
  });
}
