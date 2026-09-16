import type { Metadata } from "next";
import CommandCentreClient from "./commandcentre-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * /commandcentre — Admin Command Centre (Phase 1).
 *
 * Auth + admin gate is inherited from the (admin) route-group layout,
 * which redirects non-admins before this page ever renders. Purely
 * additive: the legacy /admin panel is untouched.
 */
export default function CommandCentrePage() {
  return <CommandCentreClient />;
}
