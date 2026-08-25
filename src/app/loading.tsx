export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-12 h-12 rounded-xl overflow-hidden animate-pulse">
        <img src="/logo-badge.png" alt="Crazy Chess Battles" className="w-full h-full object-cover" />
      </div>
    </div>
  );
}
