import { FormEvent, useEffect, useState } from 'react';
import { Uuid } from 'spacetimedb';
import { DbConnection } from '../module_bindings';

type JoinGameModalProps = {
  conn: DbConnection | null;
  onClose: () => void;
};

function JoinGameModal({ conn, onClose }: JoinGameModalProps) {
  const [gameCode, setGameCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('game') ?? '';
    setGameCode(code);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conn) return;
    setIsJoining(true);
    setError(null);

    try {
      const gameId = Uuid.parse(gameCode.trim());
      await conn.reducers.joinGame({
        gameId,
        displayName: displayName.trim(),
      });
      window.history.replaceState({}, '', window.location.pathname);
      // Don't close — App.tsx will unmount this modal once myGame is defined via subscription
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join game');
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <form
        className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
        onSubmit={handleSubmit}
      >
        <h2 className="text-2xl font-bold text-white">Join Game</h2>

        <label className="mt-5 block text-sm font-medium text-gray-300">Game code</label>
        <input
          type="text"
          value={gameCode}
          onChange={event => setGameCode(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 font-mono text-white outline-none focus:border-indigo-400"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          required
        />

        <label className="mt-4 block text-sm font-medium text-gray-300">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={event => setDisplayName(event.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white outline-none focus:border-indigo-400"
          placeholder="Captain Chaos"
          required
        />

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

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
            disabled={!conn || !displayName.trim() || !gameCode.trim() || isJoining}
            className="rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isJoining ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default JoinGameModal;
