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
import RoundEndScreen from './components/RoundEndScreen';
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
  const [handCards] = useTable(tables.hand_cards);
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

  const myHand = useMemo(() => {
    if (!myGame || !myIdentity) return [];

    return handCards
      .filter(
        row =>
          row.gameId.toString() === myGame.gameId.toString() &&
          row.player.toHexString() === myIdentity.toHexString()
      )
      .sort((a, b) => a.slot - b.slot)
      .map(row => {
        const answer = answerCards.find(card => card.answerId.toString() === row.answerId.toString());
        const text = answer ? cardData.white[answer.cardRef]?.text ?? '???' : '???';
        return {
          answerId: row.answerId,
          text,
        };
      });
  }, [myGame, myIdentity, handCards, answerCards, cardData.white]);

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
          <AdminPanel conn={conn} onClose={() => setModal('none')} />
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

  const renderWithHostCancel = (content: ReactNode) => {
    const showHostCancel = isOwner && myGame.phase !== 'Lobby' && myGame.phase !== 'GameOver';
    if (!showHostCancel) return content;

    return (
      <>
        {content}
        <button
          type="button"
          className="fixed right-4 top-4 z-50 rounded-lg border border-red-700 bg-red-950/70 px-3 py-2 text-sm font-semibold text-red-200 shadow-xl backdrop-blur hover:bg-red-900/80"
          onClick={() => {
            void cancelGame();
          }}
        >
          Cancel Game
        </button>
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
        whiteLookup={cardData.white}
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
    return renderWithHostCancel(
      <RoundEndScreen
        game={myGame}
        gamePlayers={playersInGame}
        submissions={roundSubmissions}
        submissionCards={submissionCards}
        answerCards={answerCards}
        scores={scores}
        promptText={promptText}
        whiteLookup={cardData.white}
        myIdentity={myIdentity}
        conn={conn}
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
