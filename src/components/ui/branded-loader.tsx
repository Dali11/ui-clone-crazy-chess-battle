import Image from "next/image";

interface BrandedLoaderProps {
  /** Height of the container. Use "screen" for full-page, "panel" for in-route. */
  variant?: "screen" | "panel";
}

/**
 * On-brand loading state: the CCB logo badge pulsing gently with three
 * bouncing dots below. The container has a fixed height so nothing shifts
 * layout while loading — the content simply fills the reserved space.
 */
export default function BrandedLoader({ variant = "panel" }: BrandedLoaderProps) {
  const minHeight = variant === "screen" ? "min-h-screen" : "min-h-[50vh]";

  return (
    <div className={`${minHeight} flex items-center justify-center px-4`}>
      <div className="text-center">
        <div className="relative inline-block mb-5">
          <div className="absolute inset-0 bg-ccb-primary/15 blur-2xl rounded-full" />
          <div className="relative animate-pulse">
            <Image
              src="/logo-badge.png"
              alt="Crazy Chess Battles"
              width={56}
              height={56}
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-full select-none"
              priority
            />
          </div>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-ccb-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-ccb-primary animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-ccb-primary animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
