type HomeScreenProps = {
  connected: boolean;
  onCreateGame: () => void;
  onJoinGame: () => void;
  onOpenAdmin: () => void;
};

function HomeScreen({ connected, onCreateGame, onJoinGame, onOpenAdmin }: HomeScreenProps) {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <section className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900/80 p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-white">Cards Against Space 🚀</h1>
          <p className="mt-3 text-sm text-gray-400">Multiplayer chaos in orbit</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            className="w-full rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white transition hover:bg-indigo-400"
            onClick={onCreateGame}
          >
            Create Game
          </button>
          <button
            type="button"
            className="w-full rounded-xl border border-gray-700 bg-gray-800/40 px-4 py-3 font-semibold text-gray-100 transition hover:border-gray-500 hover:bg-gray-800"
            onClick={onJoinGame}
          >
            Join Game
          </button>
        </div>

        <div className="mt-8 flex items-center justify-between text-sm text-gray-400">
          <span className="inline-flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`}
            />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          {isLocalhost && (
            <button
              type="button"
              className="text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
              onClick={onOpenAdmin}
            >
              Admin
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

export default HomeScreen;
