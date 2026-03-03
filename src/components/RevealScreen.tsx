import { useMemo } from 'react';
import { Identity } from 'spacetimedb';
import { DbConnection } from '../module_bindings';
import {
  AnswerCards,
  GamePlayers,
  Games,
  Scores,
  SubmissionCards,
  Submissions,
} from '../module_bindings/types';

type RevealScreenProps = {
  game: Games;
  myIdentity: Identity;
  promptText: string;
  whiteLookup: Record<number, { text: string }>;
  submissions: readonly Submissions[];
  submissionCards: readonly SubmissionCards[];
  answerCards: readonly AnswerCards[];
  gamePlayers: readonly GamePlayers[];
  scores: readonly Scores[];
  conn: DbConnection | null;
};

function RevealScreen({
  game,
  myIdentity,
  promptText,
  whiteLookup,
  submissions,
  submissionCards,
  answerCards,
  gamePlayers,
  scores,
  conn,
}: RevealScreenProps) {
  const isCzar = game.czar.toHexString() === myIdentity.toHexString();

  const submissionCardMap = useMemo(() => {
    const map = new Map<string, typeof submissionCards[number][]>();
    for (const card of submissionCards) {
      const key = card.submissionId.toString();
      const list = map.get(key) ?? [];
      list.push(card);
      map.set(key, list);
    }
    return map;
  }, [submissionCards]);

  const answerCardMap = useMemo(() => {
    const map = new Map<string, typeof answerCards[number]>();
    for (const card of answerCards) map.set(card.answerId.toString(), card);
    return map;
  }, [answerCards]);

  const entries = useMemo(() => {
    return [...submissions]
      .sort((a, b) => a.revealOrder - b.revealOrder)
      .map(submission => {
        const cards = (submissionCardMap.get(submission.submissionId.toString()) ?? [])
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .map(card => {
            const row = answerCardMap.get(card.answerId.toString());
            return row ? whiteLookup[row.cardRef]?.text ?? '???' : '???';
          });

        return {
          submissionId: submission.submissionId,
          cards,
        };
      });
  }, [submissions, submissionCardMap, answerCardMap, whiteLookup]);
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

  const pickWinner = async (submissionId: string) => {
    if (!conn || !isCzar) return;
    const sub = submissions.find(item => item.submissionId.toString() === submissionId);
    if (!sub) return;
    await conn.reducers.pickWinner({ gameId: game.gameId, submissionId: sub.submissionId });
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="game-surface rounded-3xl p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Reveal phase</p>
                <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs text-slate-200">
                  {entries.length} submission{entries.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-4 flex justify-center">
                <article className="cah-card cah-black-card cah-card-prompt">
                  <p className="cah-card-text text-sm">{promptText}</p>
                  <p className="cah-card-footer text-gray-300">Prompt Card</p>
                </article>
              </div>
              <p className="mt-2 text-sm text-slate-300">
                {isCzar ? 'Pick the best answer' : 'Card Czar is picking the winner...'}
              </p>
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
          {entries.map((entry, index) => (
            <button
              key={entry.submissionId.toString()}
              type="button"
              disabled={!isCzar || !conn}
              onClick={() => {
                void pickWinner(entry.submissionId.toString());
              }}
              className={`game-surface rounded-2xl p-4 text-left transition ${
                isCzar
                  ? 'hover:-translate-y-1 hover:border-indigo-400'
                  : 'cursor-default'
              }`}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Submission {index + 1}</p>
              <div className="mt-3 space-y-2">
                {entry.cards.map((text, i) => (
                  <article
                    key={`${entry.submissionId.toString()}-${i}`}
                    className="cah-card cah-white-card cah-white-card-compact cah-card-sm"
                  >
                    <p className="cah-card-text font-medium">{text}</p>
                    <p className="cah-card-footer text-slate-500">Response Card</p>
                  </article>
                ))}
              </div>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}

export default RevealScreen;
