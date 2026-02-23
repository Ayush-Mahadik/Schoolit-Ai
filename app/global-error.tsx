"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ backgroundColor: "#000000", color: "#ffffff", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ textAlign: "center", maxWidth: "400px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.5rem",
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Something went wrong</h1>
            <p style={{ fontSize: "0.875rem", color: "#94a3b8", marginBottom: "1.5rem" }}>
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.625rem 1.5rem",
                backgroundColor: "#3b82f6",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 700,
                borderRadius: "0.5rem",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
