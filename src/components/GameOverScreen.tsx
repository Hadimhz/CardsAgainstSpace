import { useMemo } from 'react';
import { Identity } from 'spacetimedb';
import { DbConnection } from '../module_bindings';
import { GamePlayers, Games, Scores } from '../module_bindings/types';

type GameOverScreenProps = {
  game: Games;
  gamePlayers: readonly GamePlayers[];
  scores: readonly Scores[];
  myIdentity: Identity;
  conn: DbConnection | null;
};

function GameOverScreen({ game, gamePlayers, scores, myIdentity, conn }: GameOverScreenProps) {
  const leaderboard = useMemo(() => {
    return gamePlayers
      .map(player => {
        const score = scores.find(
          row =>
            row.gameId.toString() === game.gameId.toString() &&
            row.player.toHexString() === player.player.toHexString()
        );

        return {
          player,
          points: score?.points ?? 0,
        };
      })
      .sort((a, b) => b.points - a.points);
  }, [gamePlayers, scores, game.gameId]);

  const me = myIdentity.toHexString();

  const leaveGame = async () => {
    if (!conn) return;
    await conn.reducers.leaveGame({ gameId: game.gameId });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="game-surface w-full max-w-2xl rounded-3xl p-6">
        <h1 className="game-title text-center text-5xl text-white">Game Over</h1>
        <p className="mt-1 text-center text-sm uppercase tracking-[0.18em] text-slate-400">
          Final standings
        </p>

        <ul className="mt-6 space-y-2">
          {leaderboard.map((entry, index) => (
            <li
              key={entry.player.id.toString()}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                index === 0
                  ? 'border-amber-400 bg-amber-950/30 text-amber-100'
                  : 'border-slate-700 bg-slate-900/70 text-slate-200'
              }`}
            >
              <span>
                {index === 0 ? '🏆 ' : ''}
                {entry.player.displayName}
                {entry.player.player.toHexString() === me ? ' (You)' : ''}
              </span>
              <strong>{entry.points} pts</strong>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void leaveGame();
            }}
            disabled={!conn}
          >
            Back to Home
          </button>
        </div>
      </section>
    </main>
  );
}

export default GameOverScreen;
