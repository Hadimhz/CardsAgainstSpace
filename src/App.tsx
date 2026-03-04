import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { DbConnection, tables } from './module_bindings';
import type { CardData } from './main';
import AdminPanel from './components/AdminPanel';
import CreateGameModal from './components/CreateGameModal';
import GameOverScreen from './components/GameOverScreen';
import HomeScreen from './components/HomeScreen';
import JoinGameModal from './components/JoinGameModal';
import LobbyScreen from './components/LobbyScreen';
import RevealScreen from './components/RevealScreen';
import SubmitScreen from './components/SubmitScreen';

type AppProps = {
  cardData: CardData;
};

type ModalState = 'none' | 'create' | 'join' | 'admin';

function App({ cardData }: AppProps) {
  const [modal, setModal] = useState<ModalState>('none');
  const handledJoinParam = useRef(false);

  const [games] = useTable(tables.games);
  const [gamePlayers] = useTable(tables.game_players);
  const [handCards] = useTable(tables.my_hand);
  const [submissions] = useTable(tables.submissions);
  const [submissionCards] = useTable(tables.submission_cards);
  const [rounds] = useTable(tables.rounds);
  const [scores] = useTable(tables.scores);
  const [packs] = useTable(tables.packs);
  const [gamePacks] = useTable(tables.game_packs);
  const [promptCards] = useTable(tables.prompt_cards);
  const [answerCards] = useTable(tables.answer_cards);

  const connState = useSpacetimeDB();
  const conn = connState.getConnection() as DbConnection | null;
  const myIdentity = connState.identity;

  const myPlayerRow = useMemo(() => {
    if (!myIdentity) return undefined;
    return gamePlayers.find(player => player.player.toHexString() === myIdentity.toHexString());
  }, [gamePlayers, myIdentity]);

  const myGame = useMemo(() => {
    if (!myPlayerRow) return undefined;
    return games.find(game => game.gameId.toString() === myPlayerRow.gameId.toString());
  }, [games, myPlayerRow]);

  useEffect(() => {
    if (handledJoinParam.current) return;
    handledJoinParam.current = true;

    const code = new URLSearchParams(window.location.search).get('game');
    if (code && !myGame) {
      setModal('join');
    }
  }, [myGame]);

  const playersInGame = useMemo(() => {
    if (!myGame) return [];
    return gamePlayers.filter(player => player.gameId.toString() === myGame.gameId.toString());
  }, [gamePlayers, myGame]);

  const packsInGame = useMemo(() => {
    if (!myGame) return [];
    return gamePacks.filter(row => row.gameId.toString() === myGame.gameId.toString());
  }, [gamePacks, myGame]);

  const currentRound = useMemo(() => {
    if (!myGame) return undefined;
    return rounds.find(
      round => round.gameId.toString() === myGame.gameId.toString() && round.roundNo === myGame.roundNo
    );
  }, [myGame, rounds]);

  const promptCard = useMemo(() => {
    if (!currentRound) return undefined;
    return promptCards.find(card => card.promptId.toString() === currentRound.promptId.toString());
  }, [currentRound, promptCards]);

  const promptText = promptCard ? cardData.black[promptCard.cardRef]?.text ?? '???' : '???';
  const promptBlanks = promptCard?.blanks ?? 1;

  const roundSubmissions = useMemo(() => {
    if (!myGame) return [];
    return submissions.filter(
      sub => sub.gameId.toString() === myGame.gameId.toString() && sub.roundNo === myGame.roundNo
    );
  }, [myGame, submissions]);

  const mySubmission = useMemo(() => {
    if (!myIdentity) return undefined;
    return roundSubmissions.find(
      sub => sub.player.toHexString() === myIdentity.toHexString()
    );
  }, [roundSubmissions, myIdentity]);

  const answerCardMap = useMemo(() => {
    const map = new Map<string, typeof answerCards[number]>();
    for (const card of answerCards) map.set(card.answerId.toString(), card);
    return map;
  }, [answerCards]);

  const packMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const pack of packs) map.set(pack.packId.toString(), pack.name);
    return map;
  }, [packs]);

  const promptPackName = useMemo(() => {
    if (!promptCard) return 'Prompt Card';
    return packMap.get(promptCard.packId.toString()) ?? 'Prompt Card';
  }, [promptCard, packMap]);

  const myHand = useMemo(() => {
    if (!myGame) return [];

    return handCards
      .filter(row => row.gameId.toString() === myGame.gameId.toString())
      .sort((a, b) => a.slot - b.slot)
      .map(row => {
        const answer = answerCardMap.get(row.answerId.toString());
        const text = answer ? cardData.white[answer.cardRef]?.text ?? '???' : '???';
        const packName = answer ? packMap.get(answer.packId.toString()) ?? 'Response Card' : 'Response Card';
        return {
          answerId: row.answerId,
          text,
          packName,
        };
      });
  }, [myGame, handCards, answerCardMap, packMap, cardData.white]);

  const nonCzarCount = useMemo(() => {
    if (!myGame) return 0;
    return playersInGame.filter(player => player.player.toHexString() !== myGame.czar.toHexString()).length;
  }, [playersInGame, myGame]);

  if (!myIdentity || !myGame) {
    return (
      <>
        <HomeScreen
          connected={connState.isActive}
          onCreateGame={() => setModal('create')}
          onJoinGame={() => setModal('join')}
          onOpenAdmin={() => setModal('admin')}
        />

        {modal === 'create' ? (
          <CreateGameModal packs={packs} conn={conn} onClose={() => setModal('none')} />
        ) : null}

        {modal === 'join' ? (
          <JoinGameModal conn={conn} onClose={() => setModal('none')} />
        ) : null}

        {modal === 'admin' ? (
          <AdminPanel conn={conn} cardData={cardData} onClose={() => setModal('none')} />
        ) : null}
      </>
    );
  }

  const isOwner = myGame.owner.toHexString() === myIdentity.toHexString();

  const cancelGame = async () => {
    if (!conn) return;
    const confirmed = window.confirm('Cancel this game for all players?');
    if (!confirmed) return;
    await conn.reducers.leaveGame({ gameId: myGame.gameId });
  };

  const backToLobby = async () => {
    if (!conn) return;
    const confirmed = window.confirm('Reset the game back to Lobby? Scores will be cleared.');
    if (!confirmed) return;
    await conn.reducers.returnToLobby({ gameId: myGame.gameId });
  };

  const renderWithHostCancel = (content: ReactNode) => {
    const showHostCancel = isOwner && myGame.phase !== 'Lobby' && myGame.phase !== 'GameOver';
    if (!showHostCancel) return content;

    return (
      <>
        {content}
        <div className="fixed right-4 top-4 z-50 flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-blue-700 bg-blue-950/70 px-3 py-2 text-sm font-semibold text-blue-200 shadow-xl backdrop-blur hover:bg-blue-900/80"
            onClick={() => { void backToLobby(); }}
          >
            Back to Lobby
          </button>
          <button
            type="button"
            className="rounded-lg border border-red-700 bg-red-950/70 px-3 py-2 text-sm font-semibold text-red-200 shadow-xl backdrop-blur hover:bg-red-900/80"
            onClick={() => { void cancelGame(); }}
          >
            Cancel Game
          </button>
        </div>
      </>
    );
  };

  if (myGame.phase === 'Lobby') {
    return (
      <LobbyScreen
        game={myGame}
        gamePlayers={playersInGame}
        gamePacks={packsInGame}
        packs={packs}
        scores={scores}
        myIdentity={myIdentity}
        conn={conn}
      />
    );
  }

  if (myGame.phase === 'Submit') {
    return renderWithHostCancel(
      <SubmitScreen
        game={myGame}
        myIdentity={myIdentity}
        promptText={promptText}
        promptPackName={promptPackName}
        blanks={promptBlanks}
        myHand={myHand}
        hasSubmitted={!!mySubmission}
        submittedCount={roundSubmissions.length}
        nonCzarCount={nonCzarCount}
        gamePlayers={playersInGame}
        scores={scores}
        conn={conn}
      />
    );
  }

  if (myGame.phase === 'Reveal') {
    return renderWithHostCancel(
      <RevealScreen
        game={myGame}
        myIdentity={myIdentity}
        promptText={promptText}
        promptPackName={promptPackName}
        whiteLookup={cardData.white}
        packMap={packMap}
        submissions={roundSubmissions}
        submissionCards={submissionCards}
        answerCards={answerCards}
        gamePlayers={playersInGame}
        scores={scores}
        conn={conn}
      />
    );
  }

  if (myGame.phase === 'RoundEnd') {
    const canAdvance =
      myGame.owner.toHexString() === myIdentity.toHexString() ||
      myGame.czar.toHexString() === myIdentity.toHexString();
    return renderWithHostCancel(
      <RevealScreen
        game={myGame}
        myIdentity={myIdentity}
        promptText={promptText}
        promptPackName={promptPackName}
        whiteLookup={cardData.white}
        packMap={packMap}
        submissions={roundSubmissions}
        submissionCards={submissionCards}
        answerCards={answerCards}
        gamePlayers={playersInGame}
        scores={scores}
        conn={conn}
        showNames
        canAdvance={canAdvance}
        onNextRound={async () => { await conn?.reducers.nextRound({ gameId: myGame.gameId }); }}
      />
    );
  }

  if (myGame.phase === 'GameOver') {
    return (
      <GameOverScreen
        game={myGame}
        gamePlayers={playersInGame}
        scores={scores}
        myIdentity={myIdentity}
        conn={conn}
        isOwner={isOwner}
        onBackToLobby={backToLobby}
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-gray-300">
      Unknown game phase: {myGame.phase}
    </main>
  );
}

export default App;
