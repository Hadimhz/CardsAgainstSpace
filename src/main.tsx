import { StrictMode, useEffect, useMemo, useState } from 'react';
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
          conn
            .subscriptionBuilder()
            .onApplied(() => {
              console.log('Subscribed to all tables');
            })
            .subscribeToAllTables();
          console.log('Connected to SpacetimeDB with identity:', identity.toHexString());
        })
        .onDisconnect(() => {
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
    </SpacetimeDBProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>
);
