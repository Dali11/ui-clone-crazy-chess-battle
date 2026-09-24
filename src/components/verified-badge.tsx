/**
 * Verified badge — the filled-circle checkmark players earn by passing
 * KYC identity verification (profiles.identity_verified = true). Facebook
 * style, but in the app's brand violet so it sits natively in the UI.
 *
 * Displayed after a player's name, before the rating, on game pages.
 * Deliberately inert: pointer-events-none + no click handlers, so it can
 * never intercept a tap meant for the name button, the board, or a clock
 * during play. Purely a server-rendered static prop — zero runtime cost,
 * nothing that can re-render or interrupt gameplay.
 */
export default function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-ccb-primary shrink-0 select-none pointer-events-none ${className}`}
      role="img"
      aria-label="Verified player"
      title="Verified"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-[11px] h-[11px]"
        fill="none"
        stroke="white"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}
