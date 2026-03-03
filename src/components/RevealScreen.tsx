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
  promptPackName: string;
  whiteLookup: Record<number, { text: string }>;
  packMap: Map<string, string>;
  submissions: readonly Submissions[];
  submissionCards: readonly SubmissionCards[];
  answerCards: readonly AnswerCards[];
  gamePlayers: readonly GamePlayers[];
  scores: readonly Scores[];
  conn: DbConnection | null;
  // round-end mode
  showNames?: boolean;
  canAdvance?: boolean;
  onNextRound?: () => void;
};

function RevealScreen({
  game,
  myIdentity,
  promptText,
  promptPackName,
  whiteLookup,
  packMap,
  submissions,
  submissionCards,
  answerCards,
  gamePlayers,
  scores,
  conn,
  showNames = false,
  canAdvance = false,
  onNextRound,
}: RevealScreenProps) {
  const isCzar = game.czar.toHexString() === myIdentity.toHexString();
  const isRoundEnd = !!onNextRound;

  const playerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of gamePlayers) map.set(p.player.toHexString(), p.displayName);
    return map;
  }, [gamePlayers]);

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
      .map((submission, index) => {
        const cards = (submissionCardMap.get(submission.submissionId.toString()) ?? [])
          .sort((a, b) => a.slotIndex - b.slotIndex)
          .map(card => {
            const row = answerCardMap.get(card.answerId.toString());
            const text = row ? whiteLookup[row.cardRef]?.text ?? '???' : '???';
            const packName = row ? packMap.get(row.packId.toString()) ?? 'Response Card' : 'Response Card';
            return { text, packName };
          });

        const playerHex = submission.player.toHexString();
        return {
          submissionId: submission.submissionId,
          index,
          cards,
          isWinner: submission.isWinner,
          playerName: playerNameMap.get(playerHex) ?? 'Unknown',
          isMe: playerHex === myIdentity.toHexString(),
        };
      });
  }, [submissions, submissionCardMap, answerCardMap, whiteLookup, packMap, playerNameMap, myIdentity]);

  const winnerName = useMemo(() => {
    const winner = submissions.find(s => s.isWinner);
    if (!winner) return null;
    return playerNameMap.get(winner.player.toHexString()) ?? 'Unknown';
  }, [submissions, playerNameMap]);

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
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {isRoundEnd ? 'Round over' : 'Reveal phase'}
                </p>
                {isRoundEnd ? (
                  <span className="rounded-full border border-yellow-400/40 bg-yellow-900/30 px-3 py-1 text-xs text-yellow-200">
                    {winnerName} wins!
                  </span>
                ) : (
                  <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1 text-xs text-slate-200">
                    {entries.length} submission{entries.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="mt-4 flex justify-center">
                <article className="cah-card cah-black-card cah-card-prompt">
                  <p className="cah-card-text text-sm">{promptText}</p>
                  <p className="cah-card-footer text-gray-300">{promptPackName}</p>
                </article>
              </div>
              {isRoundEnd ? (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    disabled={!canAdvance || !conn}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onNextRound?.()}
                  >
                    Next Round
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-300">
                  {isCzar ? 'Pick the best answer' : 'Card Czar is picking the winner...'}
                </p>
              )}
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
          {entries.map(entry => (
            <button
              key={entry.submissionId.toString()}
              type="button"
              disabled={isRoundEnd || !isCzar || !conn}
              onClick={() => {
                if (!isRoundEnd) void pickWinner(entry.submissionId.toString());
              }}
              className={`game-surface rounded-2xl p-4 text-left transition ${
                isRoundEnd
                  ? entry.isWinner
                    ? 'cursor-default cah-glow-gold'
                    : 'cursor-default'
                  : isCzar
                    ? 'hover:-translate-y-1 hover:border-indigo-400'
                    : 'cursor-default'
              }`}
            >
              <p className={`text-xs uppercase tracking-[0.18em] ${
                entry.isWinner && isRoundEnd ? 'text-yellow-300' : 'text-slate-400'
              }`}>
                {showNames
                  ? `${entry.playerName}${entry.isMe ? ' (You)' : ''}${entry.isWinner ? ' — Winner' : ''}`
                  : `Submission ${entry.index + 1}`}
              </p>
              <div className="mt-3 space-y-2">
                {entry.cards.map((card, i) => (
                  <article
                    key={`${entry.submissionId.toString()}-${i}`}
                    className={`cah-card cah-white-card cah-white-card-compact cah-card-sm ${
                      entry.isWinner && isRoundEnd ? 'cah-glow-gold' : ''
                    }`}
                  >
                    <p className="cah-card-text font-medium">{card.text}</p>
                    <p className="cah-card-footer text-slate-500">{card.packName}</p>
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
