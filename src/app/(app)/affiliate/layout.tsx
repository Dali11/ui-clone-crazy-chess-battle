import type { Metadata } from "next";
import AffiliateNav from "./_components/affiliate-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto pb-10 pt-4 sm:pt-6 animate-fade-in space-y-4 sm:space-y-6">
      <AffiliateNav />
      {children}
    </div>
  );
}
