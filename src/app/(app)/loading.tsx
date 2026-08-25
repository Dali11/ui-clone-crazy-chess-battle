export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-10 h-10 rounded-xl overflow-hidden animate-pulse">
        <img src="/logo-badge.png" alt="Loading…" className="w-full h-full object-cover" />
      </div>
    </div>
  );
}
