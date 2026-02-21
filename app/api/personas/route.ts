/**
 * Personas API Route
 * Returns the list of available teaching personas.
 */

import { NextResponse } from "next/server";
import { PERSONAS } from "@/lib/server/prompts";

export async function GET() {
  const personas = Object.values(PERSONAS).map((p) => ({
    id: p.id,
    name: p.name,
    icon: p.icon,
    description: p.description,
  }));

  return NextResponse.json({ personas });
}
