/**
 * Routes that render a live/computer game board. On these routes the
 * desktop chrome (persistent left sidebar) gets out of the way so the
 * board can use the full viewport width — chess.com-style two-column
 * layout (board + side panel) instead of three columns (nav + board +
 * panel). Shared between AppNav (hides the sidebar) and AppShell (drops
 * the matching left padding) so the two never drift out of sync.
 */
export function isGameRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/game/") ||
    pathname.startsWith("/draughts/game/") ||
    pathname.startsWith("/play/computer")
  );
}
