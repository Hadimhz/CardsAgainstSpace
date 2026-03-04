// Polyfill for Promise.withResolvers — not available in older mobile browsers
if (typeof Promise.withResolvers === 'undefined') {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import App from './App';
import { DbConnection, ErrorContext } from './module_bindings';
import './index.css';

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? 'ws://localhost:3000';
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? 'react-ts';
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const WHITE_CDN =
	'https://i14l4xj2tv.ufs.sh/f/8u9oHbcik9SVgjhJR6bEar3mugBzZonG9OVFJCyD0decpx5P';
const BLACK_CDN =
	'https://i14l4xj2tv.ufs.sh/f/8u9oHbcik9SV8qGQ0pcik9SVDnmOIda0lsuJW3GL2FgU4wtf';

export type CardData = {
  white: Record<number, { text: string }>;
  black: Record<number, { text: string; pick: number }>;
};

function RootApp() {
  const [cardData, setCardData] = useState<CardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const subscribedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(WHITE_CDN).then(async res => {
        if (!res.ok) {
          throw new Error(`Failed to load white cards (${res.status})`);
        }
        return (await res.json()) as CardData['white'];
      }),
      fetch(BLACK_CDN).then(async res => {
        if (!res.ok) {
          throw new Error(`Failed to load black cards (${res.status})`);
        }
        return (await res.json()) as CardData['black'];
      }),
    ])
      .then(([white, black]) => {
        if (!cancelled) {
          setCardData({ white, black });
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const connectionBuilder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(HOST)
        .withDatabaseName(DB_NAME)
        .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
        .onConnect((conn: DbConnection, identity: Identity, token: string) => {
          localStorage.setItem(TOKEN_KEY, token);
          setIsDisconnected(false);
          if (!subscribedRef.current) {
            subscribedRef.current = true;
            setIsReady(false);
            conn
              .subscriptionBuilder()
              .onApplied(() => setIsReady(true))
              .subscribeToAllTables();
          } else {
            // Reconnect — existing subscription re-syncs automatically
            setIsReady(true);
          }
          console.log('Connected to SpacetimeDB with identity:', identity.toHexString());
        })
        .onDisconnect(() => {
          setIsDisconnected(true);
          setIsReady(false);
          console.log('Disconnected from SpacetimeDB');
        })
        .onConnectError((_ctx: ErrorContext, err: Error) => {
          console.error('Error connecting to SpacetimeDB:', err);
        }),
    []
  );

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-red-300">
        Failed to load card data: {loadError}
      </div>
    );
  }

  if (!cardData) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-xl border border-gray-700 bg-gray-900/80 px-6 py-4 text-gray-200">
          Loading card packs...
        </div>
      </div>
    );
  }

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App cardData={cardData} />
      {!isReady && !isDisconnected && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950">
          <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-6 py-4 text-slate-200">
            Connecting...
          </div>
        </div>
      )}
      {isDisconnected && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-red-700/60 bg-slate-900/95 p-8 text-center">
            <p className="text-xl font-semibold text-red-300">Connection Lost</p>
            <p className="mt-2 text-sm text-slate-400">Lost connection to the game server.</p>
            <button
              type="button"
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 py-3 font-semibold text-white"
              onClick={() => window.location.reload()}
            >
              Reconnect
            </button>
          </div>
        </div>
      )}
    </SpacetimeDBProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>
);
