import { FormEvent, useMemo, useState } from 'react';
import { Uuid } from 'spacetimedb';
import { DbConnection } from '../module_bindings';
import { Packs } from '../module_bindings/types';

type CreateGameModalProps = {
  packs: readonly Packs[];
  conn: DbConnection | null;
  onClose: () => void;
};

function CreateGameModal({ packs, conn, onClose }: CreateGameModalProps) {
  const [displayName, setDisplayName] = useState('');
  const [maxRounds, setMaxRounds] = useState('10');
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const packList = useMemo(() => [...packs].sort((a, b) => a.name.localeCompare(b.name)), [packs]);
  const visiblePacks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return packList.filter(pack => {
      const id = pack.packId.toString();
      if (showSelectedOnly && !selectedPackIds.includes(id)) return false;
      if (!query) return true;
      return pack.name.toLowerCase().includes(query);
    });
  }, [packList, search, showSelectedOnly, selectedPackIds]);

  const togglePack = (packId: string) => {
    setSelectedPackIds(prev =>
      prev.includes(packId) ? prev.filter(id => id !== packId) : [...prev, packId]
    );
  };

  const selectAllVisible = () => {
    const visibleIds = visiblePacks.map(pack => pack.packId.toString());
    setSelectedPackIds(prev => {
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return [...next];
    });
  };

  const clearVisible = () => {
    const visibleIds = new Set(visiblePacks.map(pack => pack.packId.toString()));
    setSelectedPackIds(prev => prev.filter(id => !visibleIds.has(id)));
  };

  const selectAll = () => {
    setSelectedPackIds(packList.map(pack => pack.packId.toString()));
  };

  const clearAll = () => {
    setSelectedPackIds([]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conn || isSubmitting) return;

    const trimmedName = displayName.trim();
    if (!trimmedName || selectedPackIds.length === 0) {
      return;
    }

    const parsedMaxRounds = Number.parseInt(maxRounds, 10);
    const safeMaxRounds = Number.isFinite(parsedMaxRounds)
      ? Math.max(0, Math.min(65535, parsedMaxRounds))
      : 10;

    setIsSubmitting(true);
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const uuidStr = [...bytes]
        .map((b, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0'))
        .join('');
      const gameId = Uuid.parse(uuidStr);
      await conn.reducers.createGame({
        gameId,
        displayName: trimmedName,
        maxRounds: safeMaxRounds,
      });

      const selectedSet = new Set(selectedPackIds);
      const chosenPacks = packList.filter(pack => selectedSet.has(pack.packId.toString()));
      await Promise.all(
        chosenPacks.map(pack => conn.reducers.addPackToGame({ gameId, packId: pack.packId }))
      );

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4 sm:px-4 sm:py-6">
      <form
        className="flex h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-gray-800 bg-gray-900 p-4 shadow-2xl sm:p-6"
        onSubmit={handleSubmit}
      >
        <h2 className="text-2xl font-bold text-white">Create Game</h2>
        <div className="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr]">
          <section className="space-y-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-indigo-400"
                placeholder="Captain Chaos"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300">Max rounds (0 = unlimited)</label>
              <input
                type="number"
                min={0}
                max={65535}
                value={maxRounds}
                onChange={event => setMaxRounds(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-indigo-400"
              />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 text-sm text-gray-300">
              Selected packs: <span className="font-semibold text-white">{selectedPackIds.length}</span>
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-xl border border-gray-800 bg-gray-950 p-3">
            <p className="text-sm font-medium text-gray-300">Select packs</p>
            {packList.length === 0 ? (
              <div className="mt-2 rounded-lg border border-amber-600/50 bg-amber-900/20 p-3 text-sm text-amber-300">
                No card packs available. Use Admin to import cards first.
              </div>
            ) : (
              <>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    type="text"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
                    placeholder="Search packs..."
                  />
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      showSelectedOnly
                        ? 'border-indigo-400 bg-indigo-900/40 text-indigo-100'
                        : 'border-gray-700 bg-gray-900 text-gray-300'
                    }`}
                    onClick={() => setShowSelectedOnly(value => !value)}
                  >
                    Selected Only
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                  <span>
                    Showing {visiblePacks.length} / {packList.length} packs
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500"
                      onClick={selectAll}
                      disabled={packList.length === 0}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500"
                      onClick={clearAll}
                      disabled={selectedPackIds.length === 0}
                    >
                      Clear All
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500"
                      onClick={selectAllVisible}
                      disabled={visiblePacks.length === 0}
                    >
                      Select Visible
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 hover:border-gray-500"
                      onClick={clearVisible}
                      disabled={visiblePacks.length === 0}
                    >
                      Clear Visible
                    </button>
                  </div>
                </div>

                <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900/50 p-2">
                  {visiblePacks.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-gray-400">No packs match the current filter.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {visiblePacks.map(pack => {
                        const id = pack.packId.toString();
                        const selected = selectedPackIds.includes(id);
                        return (
                          <label
                            key={id}
                            className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2 py-2 text-sm ${
                              selected
                                ? 'border-indigo-500 bg-indigo-900/30 text-indigo-100'
                                : 'border-gray-800 text-gray-200 hover:border-gray-600 hover:bg-gray-800/70'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePack(id)}
                              className="mt-0.5"
                            />
                            <span>{pack.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            className="rounded-lg border border-gray-700 px-4 py-2 text-gray-300 hover:bg-gray-800"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!conn || !displayName.trim() || selectedPackIds.length === 0 || isSubmitting}
            className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Game'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateGameModal;
