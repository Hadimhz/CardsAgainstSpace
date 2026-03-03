import { useMemo, useState } from 'react';
import { Identity, Uuid } from 'spacetimedb';
import { DbConnection } from '../module_bindings';
import { GamePlayers, Games, Scores } from '../module_bindings/types';

type HandCardView = {
  answerId: Uuid;
  text: string;
};

type SubmitScreenProps = {
  game: Games;
  myIdentity: Identity;
  promptText: string;
  blanks: number;
  myHand: readonly HandCardView[];
  hasSubmitted: boolean;
  submittedCount: number;
  nonCzarCount: number;
  gamePlayers: readonly GamePlayers[];
  scores: readonly Scores[];
  conn: DbConnection | null;
};

function renderPrompt(text: string) {
  const parts = text.split('_');
  return parts.map((part, index) => (
    <span key={`${part}-${index}`}>
      {part}
      {index < parts.length - 1 ? <span className="px-1 font-semibold text-indigo-200">________</span> : null}
    </span>
  ));
}

function SubmitScreen({
  game,
  myIdentity,
  promptText,
  blanks,
  myHand,
  hasSubmitted,
  submittedCount,
  nonCzarCount,
  gamePlayers,
  scores,
  conn,
}: SubmitScreenProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const isCzar = game.czar.toHexString() === myIdentity.toHexString();

  const sortedHand = useMemo(
    () => [...myHand].sort((a, b) => a.text.localeCompare(b.text)),
    [myHand]
  );
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

  const toggleCard = (answerId: string) => {
    setSelected(prev => {
      if (prev.includes(answerId)) {
        return prev.filter(id => id !== answerId);
      }
      if (prev.length >= blanks) {
        return prev;
      }
      return [...prev, answerId];
    });
  };

  const submitSelection = async () => {
    if (!conn || selected.length !== blanks || selected.length === 0) return;

    const [id0, id1, id2] = selected;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const uuidStr = [...bytes]
      .map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0'))
      .join('');
    await conn.reducers.submitCards({
      gameId: game.gameId,
      submissionId: Uuid.parse(uuidStr),
      answerId0: Uuid.parse(id0),
      answerId1: id1 ? Uuid.parse(id1) : undefined,
      answerId2: id2 ? Uuid.parse(id2) : undefined,
    });
    setSelected([]);
  };

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="game-surface rounded-3xl p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-950/45 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Prompt</p>
                <span className="rounded-full border border-indigo-300/30 bg-indigo-500/20 px-3 py-1 text-xs text-indigo-100">
                  Pick {blanks} card{blanks === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-4 flex justify-center">
                <article className="cah-card cah-black-card cah-card-prompt">
                  <p className="cah-card-text text-sm">{renderPrompt(promptText)}</p>
                  <p className="cah-card-footer text-gray-300">Prompt Card</p>
                </article>
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

        {isCzar ? (
          <section className="game-surface rounded-3xl border-indigo-700/70 bg-indigo-950/20 p-6 text-center">
            <p className="game-title text-2xl text-indigo-100">You are the Card Czar</p>
            <p className="mt-2 text-slate-300">
              {submittedCount} / {nonCzarCount} players have submitted
            </p>
            <div className="mx-auto mt-4 h-2.5 w-64 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all"
                style={{ width: `${nonCzarCount === 0 ? 0 : (submittedCount / nonCzarCount) * 100}%` }}
              />
            </div>
          </section>
        ) : hasSubmitted ? (
          <section className="game-surface rounded-3xl p-6 text-center">
            <p className="game-title text-2xl text-slate-100">Waiting for others...</p>
            <p className="mt-2 text-slate-300">
              {submittedCount} / {nonCzarCount} submitted
            </p>
          </section>
        ) : (
          <section className="game-surface rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="game-title text-2xl text-white">Your Hand</h3>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Tap cards to select
              </p>
            </div>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6">
              {sortedHand.map(card => {
                const id = card.answerId.toString();
                const selectedCard = selected.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleCard(id)}
                    className={`cah-card cah-white-card cah-white-card-compact text-left ${
                      selectedCard
                        ? 'border-indigo-500 ring-2 ring-indigo-400'
                        : 'hover:-translate-y-1 hover:border-indigo-300'
                    }`}
                  >
                    <p className="cah-card-text font-medium">{card.text}</p>
                    <p className="cah-card-footer text-slate-500">{selectedCard ? 'Selected' : 'Response Card'}</p>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
              <p className="text-sm text-slate-300">
                Selected {selected.length}/{blanks}
              </p>
              <button
                type="button"
                disabled={selected.length !== blanks || !conn}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  void submitSelection();
                }}
              >
                Submit
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default SubmitScreen;
