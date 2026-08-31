export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <div className="relative inline-block mb-6">
          <div className="absolute inset-0 bg-ccb-primary/15 blur-2xl rounded-full" />
          <div className="relative text-5xl leading-none select-none animate-pulse">
            ♞
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
