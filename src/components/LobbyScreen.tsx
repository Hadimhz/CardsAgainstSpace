import { Identity } from 'spacetimedb';
import { DbConnection } from '../module_bindings';
import { GamePacks, GamePlayers, Games, Packs, Scores } from '../module_bindings/types';

type LobbyScreenProps = {
  game: Games;
  gamePlayers: readonly GamePlayers[];
  gamePacks: readonly GamePacks[];
  packs: readonly Packs[];
  scores: readonly Scores[];
  myIdentity: Identity;
  conn: DbConnection | null;
};

function LobbyScreen({
  game,
  gamePlayers,
  gamePacks,
  packs,
  scores,
  myIdentity,
  conn,
}: LobbyScreenProps) {
  const players = [...gamePlayers].sort((a, b) => a.seat - b.seat);
  const packRows = gamePacks
    .map(gp => packs.find(pack => pack.packId.toString() === gp.packId.toString()))
    .filter((pack): pack is Packs => !!pack);

  const isOwner = game.owner.toHexString() === myIdentity.toHexString();
  const canStart = players.length >= 2 && packRows.length > 0;

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(game.gameId.toString());
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}?game=${game.gameId.toString()}`);
  };

  const handleLeaveGame = async () => {
    if (!conn) return;
    if (isOwner) {
      const confirmed = window.confirm('Cancel this game for all players?');
      if (!confirmed) return;
    }
    await conn.reducers.leaveGame({ gameId: game.gameId });
  };

  const handleStartGame = async () => {
    if (!conn || !canStart || !isOwner) return;
    await conn.reducers.startGame({ gameId: game.gameId });
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-[1.1fr_1fr]">
        <section className="game-surface rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="game-title text-2xl text-white">Crew Lobby</h2>
            <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
              {players.length} players
            </span>
          </div>

          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {players.map(player => {
              const isPlayerOwner = player.player.toHexString() === game.owner.toHexString();
              const playerScore = scores.find(
                score =>
                  score.gameId.toString() === game.gameId.toString() &&
                  score.player.toHexString() === player.player.toHexString()
              );
              return (
                <li
                  key={player.id.toString()}
                  className="rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-300/20 bg-indigo-500/20 font-bold text-indigo-100">
                        {player.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-100">{player.displayName}</p>
                        <p className="text-xs text-slate-400">Seat {player.seat + 1}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-200">{playerScore?.points ?? 0} pts</p>
                      {isPlayerOwner ? (
                        <p className="text-[11px] uppercase tracking-widest text-amber-300">Owner</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 h-0.5 rounded-full bg-gradient-to-r from-indigo-500/35 to-transparent" />
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="mt-5 rounded-xl border border-red-700/80 bg-red-950/40 px-4 py-2 text-red-100 hover:bg-red-900/50"
            onClick={() => {
              void handleLeaveGame();
            }}
          >
            {isOwner ? 'Cancel Game' : 'Leave Game'}
          </button>
        </section>

        <section className="game-surface rounded-3xl p-5">
          <h2 className="game-title text-2xl text-white">Mission Setup</h2>

          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Game code</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-200">{game.gameId.toString()}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700/80"
                  onClick={() => {
                    void handleCopyCode();
                  }}
                >
                  Copy Code
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-700/80"
                  onClick={() => {
                    void handleCopyLink();
                  }}
                >
                  Copy Link
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Selected packs</p>
              {packRows.length === 0 ? (
                <p className="mt-2 text-sm text-amber-300">No packs added yet.</p>
              ) : (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1 text-sm text-slate-200">
                  {packRows.map(pack => (
                    <li key={pack.packId.toString()} className="rounded-md bg-slate-800/70 px-2 py-1">
                      {pack.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
              Max rounds: <strong>{game.maxRounds === 0 ? 'Unlimited' : game.maxRounds}</strong>
            </p>
          </div>

          {isOwner ? (
            <div className="mt-5">
              <button
                type="button"
                disabled={!canStart || !conn}
                title={
                  !canStart
                    ? 'Need at least 2 players and 1 pack to start'
                    : 'Start game'
                }
                className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-3 font-semibold text-white transition hover:from-indigo-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  void handleStartGame();
                }}
              >
                Start Game
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default LobbyScreen;
