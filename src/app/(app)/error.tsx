"use client";

import { ErrorPage } from "@/components/error-page";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Nested error — the app layout (nav, sidebar) still renders around this.
  // Use min-h to fill only the content area, not full screen.
  return (
    <div className="min-h-[60vh]">
      <ErrorPage variant="error" error={error} reset={reset} />
    </div>
  );
}
