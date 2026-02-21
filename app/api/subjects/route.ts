/**
 * Subjects API Route
 * Returns the list of available subjects.
 */

import { NextResponse } from "next/server";
import { VALID_SUBJECTS } from "@/lib/server/prompts";

export async function GET() {
  return NextResponse.json({ subjects: VALID_SUBJECTS });
}
