import { useEffect, useState } from 'react';
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
  const [showAddPacks, setShowAddPacks] = useState(false);
  const [selectedNewPacks, setSelectedNewPacks] = useState<string[]>([]);
  const [packSearch, setPackSearch] = useState('');
  const [maxRoundsInput, setMaxRoundsInput] = useState(String(game.maxRounds));

  useEffect(() => {
    setMaxRoundsInput(String(game.maxRounds));
  }, [game.maxRounds]);

  const players = [...gamePlayers].sort((a, b) => a.seat - b.seat);
  const packRows = gamePacks
    .map(gp => packs.find(pack => pack.packId.toString() === gp.packId.toString()))
    .filter((pack): pack is Packs => !!pack);

  const gamePackIds = new Set(gamePacks.map(gp => gp.packId.toString()));
  const availablePacks = [...packs]
    .filter(p => !gamePackIds.has(p.packId.toString()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(p => !packSearch || p.name.toLowerCase().includes(packSearch.toLowerCase()));

  const isOwner = game.owner.toHexString() === myIdentity.toHexString();
  const canStart = players.length >= 2 && packRows.length > 0;

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    } else {
      const el = document.createElement('textarea');
      el.value = text;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
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

  const handleRemovePack = async (packId: Packs['packId']) => {
    if (!conn) return;
    await conn.reducers.removePackFromGame({ gameId: game.gameId, packId });
  };

  const handleAddPacks = async () => {
    if (!conn || selectedNewPacks.length === 0) return;
    const { Uuid } = await import('spacetimedb');
    await (conn.reducers as any).addPacksToGame({
      gameId: game.gameId,
      packIds: selectedNewPacks.map(id => Uuid.parse(id)),
    });
    setSelectedNewPacks([]);
    setShowAddPacks(false);
    setPackSearch('');
  };

  const handleKickPlayer = async (player: Identity) => {
    if (!conn) return;
    await conn.reducers.kickPlayer({ gameId: game.gameId, player });
  };

  const handleMaxRoundsBlur = async () => {
    if (!conn) return;
    const parsed = parseInt(maxRoundsInput, 10);
    const value = isNaN(parsed) ? 0 : Math.max(0, Math.min(65535, parsed));
    setMaxRoundsInput(String(value));
    if (value !== game.maxRounds) {
      await conn.reducers.setMaxRounds({ gameId: game.gameId, maxRounds: value });
    }
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
              const isMe = player.player.toHexString() === myIdentity.toHexString();
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
                    <div className="flex items-center gap-3 text-right">
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{playerScore?.points ?? 0} pts</p>
                        {isPlayerOwner ? (
                          <p className="text-[11px] uppercase tracking-widest text-amber-300">Owner</p>
                        ) : null}
                      </div>
                      {isOwner && !isMe && (
                        <button
                          type="button"
                          className="rounded-lg border border-red-700/60 bg-red-950/40 px-2 py-1 text-xs text-red-300 hover:bg-red-900/50"
                          onClick={() => { void handleKickPlayer(player.player); }}
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 h-0.5 rounded-full bg-gradient-to-r from-indigo-500/35 to-transparent" />
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            className="mt-5 rounded-xl border border-red-700/80 bg-red-950/40 px-4 py-3 text-red-100 hover:bg-red-900/50"
            onClick={() => { void handleLeaveGame(); }}
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
                  className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/80"
                  onClick={() => copyToClipboard(game.gameId.toString())}
                >
                  Copy Code
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 hover:bg-slate-700/80"
                  onClick={() => copyToClipboard(`${window.location.origin}?game=${game.gameId.toString()}`)}
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
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
                  {packRows.map(pack => (
                    <li
                      key={pack.packId.toString()}
                      className="flex items-center justify-between rounded-md bg-slate-800/70 px-2 py-1.5 text-sm text-slate-200"
                    >
                      <span>{pack.name}</span>
                      {isOwner && (
                        <button
                          type="button"
                          className="ml-2 flex-none text-slate-500 hover:text-red-300"
                          onClick={() => { void handleRemovePack(pack.packId); }}
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {isOwner && (
                <>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700/60"
                    onClick={() => { setShowAddPacks(v => !v); setSelectedNewPacks([]); setPackSearch(''); }}
                  >
                    {showAddPacks ? 'Cancel' : '+ Add Packs'}
                  </button>

                  {showAddPacks && (
                    <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900/70 p-2">
                      <input
                        type="text"
                        value={packSearch}
                        onChange={e => setPackSearch(e.target.value)}
                        placeholder="Search packs..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white outline-none focus:border-indigo-400"
                      />
                      {availablePacks.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-400 px-1">
                          {packSearch ? 'No packs match.' : 'All packs already added.'}
                        </p>
                      ) : (
                        <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                          {availablePacks.map(pack => {
                            const id = pack.packId.toString();
                            const checked = selectedNewPacks.includes(id);
                            return (
                              <label
                                key={id}
                                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${
                                  checked
                                    ? 'border-indigo-500 bg-indigo-900/30 text-indigo-100'
                                    : 'border-slate-700 text-slate-200 hover:border-slate-500'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelectedNewPacks(prev =>
                                      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                                    )
                                  }
                                />
                                {pack.name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {selectedNewPacks.length > 0 && (
                        <button
                          type="button"
                          className="mt-2 w-full rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-400"
                          onClick={() => { void handleAddPacks(); }}
                        >
                          Add {selectedNewPacks.length} pack{selectedNewPacks.length === 1 ? '' : 's'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {isOwner ? (
              <div className="flex items-center justify-between rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2">
                <span className="text-sm text-slate-200">Max rounds <span className="text-slate-500">(0 = unlimited)</span></span>
                <input
                  type="number"
                  min={0}
                  max={65535}
                  value={maxRoundsInput}
                  onChange={e => setMaxRoundsInput(e.target.value)}
                  onBlur={() => { void handleMaxRoundsBlur(); }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  className="w-20 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-right text-sm text-white outline-none focus:border-indigo-400"
                />
              </div>
            ) : (
              <p className="rounded-lg border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-sm text-slate-200">
                Max rounds: <strong>{game.maxRounds === 0 ? 'Unlimited' : game.maxRounds}</strong>
              </p>
            )}
          </div>

          {isOwner ? (
            <div className="mt-5">
              <button
                type="button"
                disabled={!canStart || !conn}
                title={!canStart ? 'Need at least 2 players and 1 pack to start' : 'Start game'}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-3 font-semibold text-white transition hover:from-indigo-400 hover:to-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => { void handleStartGame(); }}
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
