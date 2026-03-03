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
  whiteLookup: Record<number, { text: string }>;
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
  whiteLookup,
  myIdentity,
  conn,
}: RoundEndScreenProps) {
  const winnerSubmission = submissions.find(submission => submission.isWinner);

  const winnerPlayer = winnerSubmission
    ? gamePlayers.find(
        player => player.player.toHexString() === winnerSubmission.player.toHexString()
      )
    : undefined;

  const winningCards = useMemo(() => {
    if (!winnerSubmission) return [] as string[];

    return submissionCards
      .filter(card => card.submissionId.toString() === winnerSubmission.submissionId.toString())
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map(card => {
        const answer = answerCards.find(a => a.answerId.toString() === card.answerId.toString());
        return answer ? whiteLookup[answer.cardRef]?.text ?? '???' : '???';
      });
  }, [winnerSubmission, submissionCards, answerCards, whiteLookup]);

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
      <div className="mx-auto w-full max-w-5xl space-y-5">
        <section className="game-surface rounded-3xl p-6 text-center">
          <h2 className="game-title text-4xl text-white">
            {winnerPlayer?.displayName ?? 'Unknown'} wins the round
          </h2>
            <div className="mt-4 space-y-3">
              <div className="flex justify-center">
                <article className="cah-card cah-black-card cah-card-wide w-full max-w-3xl">
                  <p className="cah-card-text text-base md:text-lg">{promptText}</p>
                  <p className="cah-card-footer text-gray-300">Winning Prompt</p>
                </article>
              </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {winningCards.map((card, idx) => (
                <article
                  key={`${card}-${idx}`}
                  className="cah-card cah-white-card cah-white-card-compact cah-card-sm"
                >
                  <p className="cah-card-text font-medium">{card}</p>
                  <p className="cah-card-footer text-slate-500">Winning Card {idx + 1}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="game-surface rounded-3xl p-5">
          <h3 className="game-title text-2xl text-white">Scoreboard</h3>
          <ul className="mt-3 space-y-2">
            {scoreboard.map((entry, idx) => (
              <li
                key={entry.player.id.toString()}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  idx === 0
                    ? 'border-indigo-400 bg-indigo-950/35 text-indigo-100'
                    : 'border-slate-700 bg-slate-900/70 text-slate-200'
                }`}
              >
                <span>{idx === 0 ? 'Leader - ' : ''}{entry.player.displayName}</span>
                <strong>{entry.points} pts</strong>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex justify-center">
          <button
            type="button"
            disabled={!canAdvance || !conn}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              void goNextRound();
            }}
          >
            Next Round
          </button>
        </div>
      </div>
    </main>
  );
}

export default RoundEndScreen;
