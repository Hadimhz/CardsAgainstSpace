import { ChangeEvent, useMemo, useState } from 'react';
import { Uuid } from 'spacetimedb';
import { DbConnection } from '../module_bindings';

type ImportedPrompt = {
  id: number;
  picks: number;
};

type ImportedPack = {
  name: string;
  white_cards: number[];
  black_cards: ImportedPrompt[];
};

type AdminPanelProps = {
  conn: DbConnection | null;
  onClose: () => void;
};

const U32_MAX = 4_294_967_295;
const U8_MAX = 255;

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseU32(value: unknown): number | null {
  const numeric = parseFiniteNumber(value);
  if (numeric == null) return null;
  const n = Math.trunc(numeric);
  if (n < 0 || n > U32_MAX) return null;
  return n;
}

function parseBlanks(value: unknown): number | null {
  const numeric = parseFiniteNumber(value);
  if (numeric == null) return null;
  const n = Math.trunc(numeric);
  if (n < 1 || n > U8_MAX) return null;
  return n;
}

function parsePrompt(prompt: unknown): ImportedPrompt | null {
  if (typeof prompt === 'number' || typeof prompt === 'string') {
    const id = parseU32(prompt);
    if (id == null) return null;
    return { id, picks: 1 };
  }

  if (!prompt || typeof prompt !== 'object') return null;

  const row = prompt as Record<string, unknown>;
  const id = parseU32(row.id);
  const picks = parseBlanks(row.picks ?? row.pick);
  if (id == null || picks == null) return null;

  return { id, picks };
}

function normalizePack(value: unknown): ImportedPack | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (typeof row.name !== 'string' || !Array.isArray(row.white_cards) || !Array.isArray(row.black_cards)) {
    return null;
  }

  const white_cards = row.white_cards.map(parseU32).filter((n): n is number => n != null);
  const black_cards = row.black_cards.map(parsePrompt).filter((p): p is ImportedPrompt => p != null);

  return {
    name: row.name.trim() || 'Unnamed Pack',
    white_cards,
    black_cards,
  };
}

function AdminPanel({ conn, onClose }: AdminPanelProps) {
  const [packs, setPacks] = useState<ImportedPack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentPack, setCurrentPack] = useState<string | null>(null);

  const progress = useMemo(() => (total === 0 ? 0 : done / total), [done, total]);

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setWarning(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const rawPacks = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object'
          ? Object.values(parsed as Record<string, unknown>)
          : [];

      const packList = rawPacks
        .map(normalizePack)
        .filter((pack): pack is ImportedPack => pack != null);

      if (packList.length === 0) {
        setError('No valid packs found in JSON file.');
        setPacks([]);
        return;
      }

      const rawBlackCount = packList.reduce((sum, pack) => sum + pack.black_cards.length, 0);
      const rawWhiteCount = packList.reduce((sum, pack) => sum + pack.white_cards.length, 0);

      if (rawPacks.length !== packList.length) {
        setWarning(
          `Loaded ${packList.length} pack(s). Some entries were skipped because they were not valid pack objects.`
        );
      } else if (rawBlackCount === 0 || rawWhiteCount === 0) {
        setWarning('Loaded packs, but some card rows were invalid and were skipped.');
      }

      setPacks(packList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse JSON');
      setPacks([]);
    }
  };

  const importAll = async () => {
    if (!conn || packs.length === 0) return;

    setIsImporting(true);
    setError(null);
    setWarning(null);

    const importPack = (conn.reducers as any).importPack as
      | ((args: {
          packId: Uuid;
          name: string;
          promptCards: { promptId: Uuid; cardRef: number; blanks: number }[];
          answerCards: { answerId: Uuid; cardRef: number }[];
        }) => Promise<unknown>)
      | undefined;
    const useBulkImport = typeof importPack === 'function';

    setTotal(packs.length);
    setDone(0);

    let completed = 0;

    try {
      for (const pack of packs) {
        setCurrentPack(pack.name);
        const packId = Uuid.parse(crypto.randomUUID());

        if (useBulkImport) {
          const promptCards = pack.black_cards.map(prompt => ({
            promptId: Uuid.parse(crypto.randomUUID()),
            cardRef: prompt.id,
            blanks: prompt.picks,
          }));
          const answerCards = pack.white_cards.map(answer => ({
            answerId: Uuid.parse(crypto.randomUUID()),
            cardRef: answer,
          }));

          try {
            await importPack({
              packId,
              name: pack.name,
              promptCards,
              answerCards,
            });
          } catch (err) {
            throw new Error(
              `importPack failed for "${pack.name}": ${err instanceof Error ? err.message : 'unknown error'}`
            );
          }
        } else {
          try {
            await conn.reducers.createPack({ packId, name: pack.name });
          } catch (err) {
            throw new Error(
              `createPack failed for "${pack.name}": ${err instanceof Error ? err.message : 'unknown error'}`
            );
          }

          for (let i = 0; i < pack.black_cards.length; i++) {
            const prompt = pack.black_cards[i];
            try {
              await conn.reducers.addPromptCard({
                promptId: Uuid.parse(crypto.randomUUID()),
                packId,
                cardRef: prompt.id,
                blanks: prompt.picks,
              });
            } catch (err) {
              throw new Error(
                `addPromptCard failed for "${pack.name}" (index ${i}): ${err instanceof Error ? err.message : 'unknown error'}`
              );
            }
          }

          for (let i = 0; i < pack.white_cards.length; i++) {
            const answerId = pack.white_cards[i];
            try {
              await conn.reducers.addAnswerCard({
                answerId: Uuid.parse(crypto.randomUUID()),
                packId,
                cardRef: answerId,
              });
            } catch (err) {
              throw new Error(
                `addAnswerCard failed for "${pack.name}" (index ${i}): ${err instanceof Error ? err.message : 'unknown error'}`
              );
            }
          }
        }

        completed += 1;
        setDone(completed);
      }
      setCurrentPack(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-4 py-8">
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Admin Panel</h2>
          <button
            type="button"
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-gray-300 hover:bg-gray-800"
            onClick={onClose}
            disabled={isImporting}
          >
            Close
          </button>
        </div>

        <p className="mt-3 text-sm text-gray-400">Import Packs.json to create packs and card references.</p>

        <input
          type="file"
          accept=".json,application/json"
          onChange={event => {
            void onFileSelected(event);
          }}
          className="mt-4 w-full rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-200"
          disabled={isImporting}
        />

        {packs.length > 0 ? (
          <div className="mt-5 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
            <h3 className="font-semibold text-gray-100">Preview ({packs.length} packs)</h3>
            <ul className="mt-3 max-h-52 space-y-2 overflow-y-auto text-sm text-gray-300">
              {packs.map((pack, index) => (
                <li key={`${pack.name}-${index}`} className="rounded-lg border border-gray-800 px-3 py-2">
                  <span className="font-medium text-gray-100">{pack.name}</span>
                  <span className="ml-2 text-gray-400">
                    {pack.black_cards.length} prompts, {pack.white_cards.length} answers
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {isImporting ? (
          <div className="mt-4 rounded-xl border border-indigo-700/50 bg-indigo-900/20 p-4">
            <p className="text-sm text-indigo-200">
              Importing {currentPack ? `"${currentPack}"` : 'packs'} ({done} / {total} pack
              {total === 1 ? '' : 's'})
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-800">
              <div className="h-full bg-indigo-500" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        ) : null}

        {warning ? <p className="mt-3 text-sm text-amber-300">{warning}</p> : null}
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!conn || packs.length === 0 || isImporting}
            onClick={() => {
              void importAll();
            }}
          >
            Import All
          </button>
        </div>
      </section>
    </div>
  );
}

export default AdminPanel;
