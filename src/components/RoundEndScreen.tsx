import { useMemo } from 'react';
import { Identity } from 'spacetimedb';
import { DbConnection } from '../module_bindings';
import { AnswerCards, GamePlayers, Games, Scores, SubmissionCards, Submissions } from '../module_bindings/types';

type RoundEndScreenProps = {
  game: Games;
  gamePlayers: readonly GamePlayers[];
  submissions: readonly Submissions[];
  submissionCards: readonly SubmissionCards[];
  answerCards: readonly AnswerCards[];
  scores: readonly Scores[];
  promptText: string;
  promptPackName: string;
  whiteLookup: Record<number, { text: string }>;
  packMap: Map<string, string>;
  myIdentity: Identity;
  conn: DbConnection | null;
};

function RoundEndScreen({
  game,
  gamePlayers,
  submissions,
  submissionCards,
  answerCards,
  scores,
  promptText,
  promptPackName,
  whiteLookup,
  packMap,
  myIdentity,
  conn,
}: RoundEndScreenProps) {
  const winnerSubmission = submissions.find(s => s.isWinner);
  const winnerPlayer = winnerSubmission
    ? gamePlayers.find(p => p.player.toHexString() === winnerSubmission.player.toHexString())
    : undefined;

  const allSubmissions = useMemo(() => {
    return [...submissions]
      .sort((a, b) => a.revealOrder - b.revealOrder)
      .map(sub => {
        const player = gamePlayers.find(p => p.player.toHexString() === sub.player.toHexString());
        const cards = submissionCards
          .filter(c => c.submissionId.toString() === sub.submissionId.toString())
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .map(c => {
            const answer = answerCards.find(a => a.answerId.toString() === c.answerId.toString());
            const text = answer ? whiteLookup[answer.cardRef]?.text ?? '???' : '???';
            const packName = answer ? packMap.get(answer.packId.toString()) ?? 'Response Card' : 'Response Card';
            return { text, packName };
          });
        return {
          submissionId: sub.submissionId,
          playerName: player?.displayName ?? 'Unknown',
          isMe: sub.player.toHexString() === myIdentity.toHexString(),
          isWinner: sub.isWinner,
          cards,
        };
      });
  }, [submissions, submissionCards, answerCards, gamePlayers, whiteLookup, packMap, myIdentity]);

  const scoreMap = useMemo(() => {
    const gameIdStr = game.gameId.toString();
    const map = new Map<string, number>();
    for (const s of scores) {
      if (s.gameId.toString() === gameIdStr) map.set(s.player.toHexString(), s.points);
    }
    return map;
  }, [scores, game.gameId]);

  const scoreboard = useMemo(() => {
    return gamePlayers
      .map(player => ({ player, points: scoreMap.get(player.player.toHexString()) ?? 0 }))
      .sort((a, b) => b.points - a.points);
  }, [gamePlayers, scoreMap]);

  const canAdvance =
    game.owner.toHexString() === myIdentity.toHexString() ||
    game.czar.toHexString() === myIdentity.toHexString();

  const goNextRound = async () => {
    if (!conn || !canAdvance) return;
    await conn.reducers.nextRound({ gameId: game.gameId });
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="game-surface rounded-3xl p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Round over</p>
                <span className="rounded-full border border-yellow-400/40 bg-yellow-900/30 px-3 py-1 text-xs text-yellow-200">
                  {winnerPlayer?.displayName ?? 'Unknown'} wins!
                </span>
              </div>
              <div className="mt-4 flex justify-center">
                <article className="cah-card cah-black-card cah-card-prompt">
                  <p className="cah-card-text text-sm">{promptText}</p>
                  <p className="cah-card-footer text-gray-300">{promptPackName}</p>
                </article>
              </div>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={!canAdvance || !conn}
                  className="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => { void goNextRound(); }}
                >
                  Next Round
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="game-title text-xl text-white">Scores</h3>
                <span className="text-xs uppercase tracking-[0.14em] text-slate-400">
                  Round {game.roundNo}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {scoreboard.map((entry, idx) => {
                  const isMe = entry.player.player.toHexString() === myIdentity.toHexString();
                  const isCzarPlayer = entry.player.player.toHexString() === game.czar.toHexString();
                  return (
                    <li
                      key={entry.player.id.toString()}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                        idx === 0
                          ? 'border-indigo-400 bg-indigo-950/35 text-indigo-100'
                          : 'border-slate-700 bg-slate-900/70 text-slate-200'
                      }`}
                    >
                      <span className="truncate pr-2">
                        {entry.player.displayName}
                        {isMe ? ' (You)' : ''}
                        {isCzarPlayer ? ' - Czar' : ''}
                      </span>
                      <strong>{entry.points}</strong>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {allSubmissions.map(sub => (
            <div
              key={sub.submissionId.toString()}
              className={`game-surface rounded-2xl p-4 text-left transition ${
                sub.isWinner
                  ? 'ring-2 ring-yellow-400/50 border-yellow-500/40 bg-yellow-950/10'
                  : ''
              }`}
            >
              <p className={`text-xs uppercase tracking-[0.18em] ${
                sub.isWinner ? 'text-yellow-300' : 'text-slate-400'
              }`}>
                {sub.playerName}{sub.isMe ? ' (You)' : ''}{sub.isWinner ? ' — Winner' : ''}
              </p>
              <div className="mt-3 space-y-2">
                {sub.cards.map((card, i) => (
                  <article
                    key={`${sub.submissionId.toString()}-${i}`}
                    className={`cah-card cah-white-card cah-white-card-compact cah-card-sm ${
                      sub.isWinner ? 'border-yellow-300/60 shadow-yellow-900/30' : ''
                    }`}
                  >
                    <p className="cah-card-text font-medium">{card.text}</p>
                    <p className="cah-card-footer text-slate-500">{card.packName}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

export default RoundEndScreen;
