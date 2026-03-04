/**
 * PROLAI — Central Configuration
 * ================================
 * Single source of truth for site identity, URLs, and feature flags.
 * All branding lives here so rebranding is a one-file change.
 */

// ── Identity ──────────────────────────────────────────────────────────
export const SITE_NAME = "PROLAI";
export const SITE_TAGLINE = "Professional AI Learning Assistant";
export const SITE_DESCRIPTION =
  "AI-powered learning platform with multi-model intelligence, deep reasoning, and 20+ study tools.";
export const SITE_CREATOR = "Ayush Mahadik";
export const SITE_VERSION = "3.0.0";

// ── URLs ──────────────────────────────────────────────────────────────
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://schoolit-ai.vercel.app";

// ── Subscription Tiers ────────────────────────────────────────────────
export const TIERS = {
  free: {
    name: "Free",
    price: 0,
    currency: "INR",
    limits: {
      messagesPerDay: 25,
      toolsPerDay: 10,
      maxFileSize: 2 * 1024 * 1024, // 2MB
      maxHistoryDays: 7,
    },
    features: [
      "Basic AI chat",
      "Web search",
      "Flashcards & quizzes",
      "3 subjects",
    ],
  },
  pro: {
    name: "Pro",
    price: 49,
    currency: "INR",
    razorpayPlanId: process.env.RAZORPAY_PLAN_ID_PRO || "",
    limits: {
      messagesPerDay: 500,
      toolsPerDay: 100,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxHistoryDays: 90,
    },
    features: [
      "Unlimited AI chat",
      "All 9 subjects",
      "Deep reasoning mode",
      "Priority model access",
      "Cloud history sync",
      "Question paper generator",
      "Mock test simulator",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: -1, // Contact sales
    currency: "INR",
    limits: {
      messagesPerDay: Infinity,
      toolsPerDay: Infinity,
      maxFileSize: 25 * 1024 * 1024, // 25MB
      maxHistoryDays: 365,
    },
    features: [
      "Everything in Pro",
      "School-wide deployment",
      "Admin dashboard",
      "Custom LLM integration",
      "Usage analytics",
      "Priority support",
      "SLA guarantee",
    ],
  },
} as const;

export type TierName = keyof typeof TIERS;

// ── Security Constants ────────────────────────────────────────────────
export const CSRF_HEADER = "x-prolai-csrf";
export const REQUEST_SIGNATURE_HEADER = "x-prolai-sig";
export const MAX_REQUEST_BODY_SIZE = 5 * 1024 * 1024; // 5MB

// ── Rate Limits ───────────────────────────────────────────────────────
export const RATE_LIMITS = {
  free: { perMinute: 10, perDay: 25 },
  pro: { perMinute: 30, perDay: 500 },
  enterprise: { perMinute: 100, perDay: Infinity },
  admin: { perMinute: Infinity, perDay: Infinity },
} as const;
