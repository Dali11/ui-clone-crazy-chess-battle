/**
 * Shared, module-scoped priority state for the app-wide active-event
 * watchers (ActiveTournamentWatcher, ActiveBattleWatcher,
 * ActiveGameRedirect). All three mount in the AppShell and poll their
 * own APIs; without coordination they would fight over router.push and
 * the player would ping-pong between destinations.
 *
 * Owner rule (2026-09-26): a live tournament a player is registered in
 * has TOP priority — the player must be at their tournament game, or on
 * the tournament page between rounds, no matter where else they try to
 * go. Battles yield to tournaments; free/any games yield to both.
 */

let tournamentActive = false;
let battleActive = false;

export function setActiveTournament(active: boolean) {
  tournamentActive = active;
}

export function setActiveBattle(active: boolean) {
  battleActive = active;
}

export function tournamentHasPriority(): boolean {
  return tournamentActive;
}

export function battleHasPriority(): boolean {
  return tournamentActive || battleActive;
}
