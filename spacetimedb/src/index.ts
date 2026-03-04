import spacetimedb, {
  hand_cards,
  game_players,
  game_packs,
  rounds,
  submissions,
  submission_cards,
  scores,
} from "./schema";
export { default } from "./schema";
import { t, SenderError } from "spacetimedb/server";

const ImportedPromptCard = t.object("ImportedPromptCard", {
  prompt_id: t.uuid(),
  card_ref: t.u32(),
  blanks: t.u8(),
});

const SyncBlanksEntry = t.object("SyncBlanksEntry", {
  prompt_id: t.uuid(),
  blanks: t.u8(),
});

const ImportedAnswerCard = t.object("ImportedAnswerCard", {
  answer_id: t.uuid(),
  card_ref: t.u32(),
});

const ImportedPackEntry = t.object("ImportedPackEntry", {
  pack_id: t.uuid(),
  name: t.string(),
  source_id: t.i32().optional(),
  prompt_cards: t.array(ImportedPromptCard),
  answer_cards: t.array(ImportedAnswerCard),
});

// ---------------------------------------------------------------------------
// Helpers — ctx typed as any so btree index access isn't checked by tsc
// ---------------------------------------------------------------------------

function lcgShuffle<T>(items: T[], seed: bigint): T[] {
  const arr = [...items];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    const j = Number(s % BigInt(i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function dealCardsToPlayer(ctx: any, game_id: any, player: any, targetCount: number): void {
  const allHand = [...ctx.db.hand_cards.hand_by_game.filter(game_id)];
  const playerHand = allHand.filter(
    (h: any) => h.player.toHexString() === player.toHexString()
  );
  const needed = targetCount - playerHand.length;
  if (needed <= 0) return;

  const deckRows = [...ctx.db.game_answer_deck.answerdeck_by_game.filter(game_id)];
  const undrawn = deckRows
    .filter((r: any) => !r.drawn)
    .sort((a: any, b: any) => a.order - b.order)
    .slice(0, needed);

  for (let i = 0; i < undrawn.length; i++) {
    const row = undrawn[i];
    ctx.db.game_answer_deck.id.update({ ...row, drawn: true });
    ctx.db.hand_cards.insert({
      id: 0n,
      game_id,
      player,
      answer_id: row.answer_id,
      slot: i,
      dealt_at: ctx.timestamp,
    });
  }
}

function awardPoint(ctx: any, game_id: any, player: any): void {
  const scoreRows = [...ctx.db.scores.scores_by_game.filter(game_id)];
  const existing = scoreRows.find(
    (s: any) => s.player.toHexString() === player.toHexString()
  );
  if (existing) {
    ctx.db.scores.id.update({ ...existing, points: existing.points + 1 });
  } else {
    ctx.db.scores.insert({ id: 0n, game_id, player, points: 1 });
  }
}

function drawNextPrompt(ctx: any, game_id: any): any | undefined {
  const deckRows = [...ctx.db.game_prompt_deck.promptdeck_by_game.filter(game_id)];
  const undrawn = deckRows
    .filter((r: any) => !r.drawn)
    .sort((a: any, b: any) => a.order - b.order);
  if (undrawn.length === 0) return undefined;
  const row = undrawn[0];
  ctx.db.game_prompt_deck.id.update({ ...row, drawn: true });
  return row.prompt_id;
}

function advanceToReveal(ctx: any, game_id: any, round_no: number): void {
  const allSubs = [...(ctx.db as any).submissions.subs_by_game.filter(game_id)].filter(
    (s: any) => s.round_no === round_no
  );
  const seed = ctx.timestamp.microsSinceUnixEpoch;
  const shuffled = lcgShuffle(allSubs, seed);
  for (let i = 0; i < shuffled.length; i++) {
    ctx.db.submissions.submission_id.update({ ...shuffled[i], reveal_order: i });
  }
  const game = ctx.db.games.game_id.find(game_id);
  if (!game) return;
  ctx.db.games.game_id.update({ ...game, phase: "Reveal" });
}

function deleteGameData(ctx: any, game_id: any): void {
  const db = ctx.db as any;

  const handRows = [...db.hand_cards.hand_by_game.filter(game_id)];
  for (const row of handRows) db.hand_cards.id.delete(row.id);

  const promptDeckRows = [...db.game_prompt_deck.promptdeck_by_game.filter(game_id)];
  for (const row of promptDeckRows) db.game_prompt_deck.id.delete(row.id);

  const answerDeckRows = [...db.game_answer_deck.answerdeck_by_game.filter(game_id)];
  for (const row of answerDeckRows) db.game_answer_deck.id.delete(row.id);

  const roundRows = [...db.rounds.rounds_by_game.filter(game_id)];
  for (const row of roundRows) db.rounds.id.delete(row.id);

  const submissionRows = [...db.submissions.subs_by_game.filter(game_id)];
  for (const sub of submissionRows) {
    const subCards = [...db.submission_cards.subcards_by_submission.filter(sub.submission_id)];
    for (const card of subCards) db.submission_cards.id.delete(card.id);
    db.submissions.submission_id.delete(sub.submission_id);
  }

  const scoreRows = [...db.scores.scores_by_game.filter(game_id)];
  for (const row of scoreRows) db.scores.id.delete(row.id);

  const packRows = [...db.game_packs.gamepacks_by_game.filter(game_id)];
  for (const row of packRows) db.game_packs.id.delete(row.id);

  const players = [...db.game_players.players_by_game.filter(game_id)];
  for (const row of players) db.game_players.id.delete(row.id);

  db.games.game_id.delete(game_id);
}

// ---------------------------------------------------------------------------
// Content management reducers
// ---------------------------------------------------------------------------

export const create_pack = spacetimedb.reducer(
  { pack_id: t.uuid(), name: t.string() },
  (ctx, { pack_id, name }) => {
    try {
      if (!name.trim()) throw new SenderError("name is required");
      const db = ctx.db as any;
      db.packs.insert({ pack_id, name });
    } catch (err) {
      if (err instanceof SenderError) throw err;
      throw new SenderError(
        `create_pack failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }
);

export const add_prompt_card = spacetimedb.reducer(
  { prompt_id: t.uuid(), pack_id: t.uuid(), card_ref: t.u32(), blanks: t.u8() },
  (ctx, { prompt_id, pack_id, card_ref, blanks }) => {
    try {
      const db = ctx.db as any;
      if (!db.packs.pack_id.find(pack_id)) throw new SenderError("pack not found");
      if (db.prompt_cards.prompt_id.find(prompt_id)) throw new SenderError("prompt card already exists");

      db.prompt_cards.insert({ prompt_id, pack_id, card_ref, blanks });
    } catch (err) {
      if (err instanceof SenderError) throw err;
      throw new SenderError(
        `add_prompt_card failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }
);

export const add_answer_card = spacetimedb.reducer(
  { answer_id: t.uuid(), pack_id: t.uuid(), card_ref: t.u32() },
  (ctx, { answer_id, pack_id, card_ref }) => {
    try {
      const db = ctx.db as any;
      if (!db.packs.pack_id.find(pack_id)) throw new SenderError("pack not found");
      if (db.answer_cards.answer_id.find(answer_id)) throw new SenderError("answer card already exists");

      db.answer_cards.insert({ answer_id, pack_id, card_ref });
    } catch (err) {
      if (err instanceof SenderError) throw err;
      throw new SenderError(
        `add_answer_card failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }
);

export const import_pack = spacetimedb.reducer(
  {
    pack_id: t.uuid(),
    name: t.string(),
    source_id: t.i32().optional(),
    prompt_cards: t.array(ImportedPromptCard),
    answer_cards: t.array(ImportedAnswerCard),
  },
  (ctx, { pack_id, name, source_id, prompt_cards, answer_cards }) => {
    try {
      if (!name.trim()) throw new SenderError("name is required");

      const db = ctx.db as any;
      db.packs.insert({ pack_id, name, source_id });

      for (const prompt of prompt_cards) {
        db.prompt_cards.insert({
          prompt_id: prompt.prompt_id,
          pack_id,
          card_ref: prompt.card_ref,
          blanks: prompt.blanks,
        });
      }

      for (const answer of answer_cards) {
        db.answer_cards.insert({
          answer_id: answer.answer_id,
          pack_id,
          card_ref: answer.card_ref,
        });
      }
    } catch (err) {
      if (err instanceof SenderError) throw err;
      throw new SenderError(
        `import_pack failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }
);

export const import_all_packs = spacetimedb.reducer(
  { packs: t.array(ImportedPackEntry) },
  (ctx, { packs }) => {
    const db = ctx.db as any;
    for (const pack of packs) {
      if (!pack.name.trim()) throw new SenderError("pack name is required");
      db.packs.insert({ pack_id: pack.pack_id, name: pack.name, source_id: pack.source_id });
      for (const prompt of pack.prompt_cards) {
        db.prompt_cards.insert({
          prompt_id: prompt.prompt_id,
          pack_id: pack.pack_id,
          card_ref: prompt.card_ref,
          blanks: prompt.blanks,
        });
      }
      for (const answer of pack.answer_cards) {
        db.answer_cards.insert({
          answer_id: answer.answer_id,
          pack_id: pack.pack_id,
          card_ref: answer.card_ref,
        });
      }
    }
  }
);

export const sync_prompt_blanks = spacetimedb.reducer(
  { entries: t.array(SyncBlanksEntry) },
  (ctx, { entries }) => {
    const db = ctx.db as any;
    for (const entry of entries) {
      const existing = db.prompt_cards.prompt_id.find(entry.prompt_id);
      if (!existing) continue;
      if (existing.blanks === entry.blanks) continue;
      db.prompt_cards.prompt_id.update({ ...existing, blanks: entry.blanks });
    }
  }
);

export const clear_all_game_data = spacetimedb.reducer((ctx) => {
  const db = ctx.db as any;
  const gameIds = [...db.games.iter()].map((g: any) => g.game_id);

  for (const gameId of gameIds) {
    deleteGameData(ctx, gameId);
  }
});

// ---------------------------------------------------------------------------
// Game setup reducers
// ---------------------------------------------------------------------------

export const create_game = spacetimedb.reducer(
  { game_id: t.uuid(), display_name: t.string(), max_rounds: t.u16() },
  (ctx, { game_id, display_name, max_rounds }) => {
    if (!display_name.trim()) throw new SenderError("display_name is required");
    const db = ctx.db as any;
    if (db.games.game_id.find(game_id)) throw new SenderError("game already exists");

    db.games.insert({
      game_id,
      owner: ctx.sender,
      phase: "Lobby",
      round_no: 0,
      max_rounds,
      czar: ctx.sender,
      deadline: ctx.timestamp,
      created_at: ctx.timestamp,
    });
    db.game_players.insert({
      id: 0n,
      game_id,
      player: ctx.sender,
      display_name,
      seat: 0,
      joined_at: ctx.timestamp,
    });
    db.scores.insert({ id: 0n, game_id, player: ctx.sender, points: 0 });
  }
);

export const join_game = spacetimedb.reducer(
  { game_id: t.uuid(), display_name: t.string() },
  (ctx, { game_id, display_name }) => {
    if (!display_name.trim()) throw new SenderError("display_name is required");
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.phase !== "Lobby") throw new SenderError("game is not in Lobby phase");

    const players = [...db.game_players.players_by_game.filter(game_id)];
    if (players.find((p: any) => p.player.toHexString() === ctx.sender.toHexString()))
      throw new SenderError("already joined this game");

    const maxSeat = players.reduce((max: number, p: any) => Math.max(max, p.seat), -1);
    db.game_players.insert({
      id: 0n,
      game_id,
      player: ctx.sender,
      display_name,
      seat: maxSeat + 1,
      joined_at: ctx.timestamp,
    });
    db.scores.insert({ id: 0n, game_id, player: ctx.sender, points: 0 });
  }
);

export const leave_game = spacetimedb.reducer(
  { game_id: t.uuid() },
  (ctx, { game_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");

    const players = [...db.game_players.players_by_game.filter(game_id)];
    const playerRow = players.find(
      (p: any) => p.player.toHexString() === ctx.sender.toHexString()
    );
    if (!playerRow) throw new SenderError("not in this game");

    const scoreRows = [...db.scores.scores_by_game.filter(game_id)];

    // Owner leaving at any phase cancels and tears down the entire game.
    if (game.owner.toHexString() === ctx.sender.toHexString()) {
      deleteGameData(ctx, game_id);
      return;
    }

    db.game_players.id.delete(playerRow.id);
    const scoreRow = scoreRows.find(
      (s: any) => s.player.toHexString() === ctx.sender.toHexString()
    );
    if (scoreRow) db.scores.id.delete(scoreRow.id);
  }
);

export const add_pack_to_game = spacetimedb.reducer(
  { game_id: t.uuid(), pack_id: t.uuid() },
  (ctx, { game_id, pack_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.owner.toHexString() !== ctx.sender.toHexString())
      throw new SenderError("only the owner can manage packs");
    if (game.phase !== "Lobby") throw new SenderError("game is not in Lobby phase");
    if (!db.packs.pack_id.find(pack_id)) throw new SenderError("pack not found");

    const existing = [...db.game_packs.gamepacks_by_game.filter(game_id)].find(
      (r: any) => r.pack_id.toString() === pack_id.toString()
    );
    if (existing) throw new SenderError("pack already added to this game");

    db.game_packs.insert({
      id: 0n,
      game_id,
      pack_id,
      added_by: ctx.sender,
      added_at: ctx.timestamp,
    });
  }
);

export const add_packs_to_game = spacetimedb.reducer(
  { game_id: t.uuid(), pack_ids: t.array(t.uuid()) },
  (ctx, { game_id, pack_ids }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.owner.toHexString() !== ctx.sender.toHexString())
      throw new SenderError("only the owner can manage packs");
    if (game.phase !== "Lobby") throw new SenderError("game is not in Lobby phase");

    const existing = new Set(
      [...db.game_packs.gamepacks_by_game.filter(game_id)].map((r: any) => r.pack_id.toString())
    );

    for (const pack_id of pack_ids) {
      if (!db.packs.pack_id.find(pack_id)) throw new SenderError(`pack not found: ${pack_id}`);
      if (existing.has(pack_id.toString())) continue;
      db.game_packs.insert({
        id: 0n,
        game_id,
        pack_id,
        added_by: ctx.sender,
        added_at: ctx.timestamp,
      });
      existing.add(pack_id.toString());
    }
  }
);

export const remove_pack_from_game = spacetimedb.reducer(
  { game_id: t.uuid(), pack_id: t.uuid() },
  (ctx, { game_id, pack_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.owner.toHexString() !== ctx.sender.toHexString())
      throw new SenderError("only the owner can manage packs");
    if (game.phase !== "Lobby") throw new SenderError("game is not in Lobby phase");

    const row = [...db.game_packs.gamepacks_by_game.filter(game_id)].find(
      (r: any) => r.pack_id.toString() === pack_id.toString()
    );
    if (!row) throw new SenderError("pack not in this game");
    db.game_packs.id.delete(row.id);
  }
);

export const start_game = spacetimedb.reducer(
  { game_id: t.uuid() },
  (ctx, { game_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.owner.toHexString() !== ctx.sender.toHexString())
      throw new SenderError("only the owner can start the game");
    if (game.phase !== "Lobby") throw new SenderError("game is not in Lobby phase");

    const players = [...db.game_players.players_by_game.filter(game_id)].sort(
      (a: any, b: any) => a.seat - b.seat
    );
    if (players.length < 2) throw new SenderError("need at least 2 players");

    const gamePacks = [...db.game_packs.gamepacks_by_game.filter(game_id)];
    if (gamePacks.length === 0) throw new SenderError("need at least one pack");

    const promptIds: any[] = [];
    const answerIds: any[] = [];
    for (const gp of gamePacks) {
      for (const c of db.prompt_cards.prompt_by_pack.filter(gp.pack_id)) {
        promptIds.push(c.prompt_id);
      }
      for (const c of db.answer_cards.answer_by_pack.filter(gp.pack_id)) {
        answerIds.push(c.answer_id);
      }
    }

    if (answerIds.length < players.length * 7) {
      throw new SenderError(
        `not enough answer cards (have ${answerIds.length}, need ${players.length * 7})`
      );
    }

    const seed = ctx.timestamp.microsSinceUnixEpoch;
    const shuffledPrompts = lcgShuffle(promptIds, seed);
    const shuffledAnswers = lcgShuffle(answerIds, seed + 1n);

    for (let i = 0; i < shuffledPrompts.length; i++) {
      db.game_prompt_deck.insert({
        id: 0n,
        game_id,
        order: i,
        prompt_id: shuffledPrompts[i],
        drawn: false,
      });
    }
    for (let i = 0; i < shuffledAnswers.length; i++) {
      db.game_answer_deck.insert({
        id: 0n,
        game_id,
        order: i,
        answer_id: shuffledAnswers[i],
        drawn: false,
      });
    }

    for (const p of players) {
      dealCardsToPlayer(ctx, game_id, p.player, 7);
    }

    const promptId = drawNextPrompt(ctx, game_id);
    if (!promptId) throw new SenderError("no prompt cards available");

    const firstCzar = players[0];
    db.rounds.insert({
      id: 0n,
      game_id,
      round_no: 1,
      prompt_id: promptId,
      czar: firstCzar.player,
      started_at: ctx.timestamp,
    });

    db.games.game_id.update({
      ...game,
      phase: "Submit",
      round_no: 1,
      czar: firstCzar.player,
      deadline: ctx.timestamp,
    });
  }
);

// ---------------------------------------------------------------------------
// Gameplay reducers
// ---------------------------------------------------------------------------

export const submit_cards = spacetimedb.reducer(
  {
    game_id: t.uuid(),
    submission_id: t.uuid(),
    answer_id_0: t.uuid(),
    answer_id_1: t.uuid().optional(),
    answer_id_2: t.uuid().optional(),
  },
  (ctx, { game_id, submission_id, answer_id_0, answer_id_1, answer_id_2 }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.phase !== "Submit") throw new SenderError("game is not in Submit phase");
    if (game.czar.toHexString() === ctx.sender.toHexString())
      throw new SenderError("the czar cannot submit cards");

    const alreadySubmitted = [...db.submissions.subs_by_game.filter(game_id)].find(
      (s: any) =>
        s.round_no === game.round_no &&
        s.player.toHexString() === ctx.sender.toHexString()
    );
    if (alreadySubmitted) throw new SenderError("already submitted for this round");

    const roundRows = [...db.rounds.rounds_by_game.filter(game_id)];
    const currentRound = roundRows.find((r: any) => r.round_no === game.round_no);
    if (!currentRound) throw new SenderError("round not found");

    const promptCard = db.prompt_cards.prompt_id.find(currentRound.prompt_id);
    if (!promptCard) throw new SenderError("prompt card not found");
    const blanks: number = promptCard.blanks;

    const answerIds: any[] = [answer_id_0];
    if (answer_id_1 != null) answerIds.push(answer_id_1);
    if (answer_id_2 != null) answerIds.push(answer_id_2);

    if (answerIds.length !== blanks) {
      throw new SenderError(`prompt requires ${blanks} card(s), got ${answerIds.length}`);
    }

    const handRows = [...db.hand_cards.hand_by_game.filter(game_id)].filter(
      (h: any) => h.player.toHexString() === ctx.sender.toHexString()
    );
    const handSet = new Set(handRows.map((h: any) => h.answer_id.toString()));
    for (const aid of answerIds) {
      if (!handSet.has(aid.toString()))
        throw new SenderError(`card ${aid} not in your hand`);
    }

    for (const aid of answerIds) {
      const handRow = handRows.find(
        (h: any) => h.answer_id.toString() === aid.toString()
      );
      if (handRow) db.hand_cards.id.delete(handRow.id);
    }

    db.submissions.insert({
      submission_id,
      game_id,
      round_no: game.round_no,
      player: ctx.sender,
      submitted_at: ctx.timestamp,
      reveal_order: 0,
      is_winner: false,
    });

    for (let i = 0; i < answerIds.length; i++) {
      db.submission_cards.insert({
        id: 0n,
        submission_id,
        slot_index: i,
        answer_id: answerIds[i],
      });
    }

    const players = [...db.game_players.players_by_game.filter(game_id)];
    const nonCzarCount = players.filter(
      (p: any) => p.player.toHexString() !== game.czar.toHexString()
    ).length;

    const roundSubs = [...db.submissions.subs_by_game.filter(game_id)].filter(
      (s: any) => s.round_no === game.round_no
    );
    if (roundSubs.length >= nonCzarCount) {
      advanceToReveal(ctx, game_id, game.round_no);
    }
  }
);

export const force_reveal = spacetimedb.reducer(
  { game_id: t.uuid() },
  (ctx, { game_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.phase !== "Submit") throw new SenderError("game is not in Submit phase");

    const players = [...db.game_players.players_by_game.filter(game_id)];
    if (!players.find((p: any) => p.player.toHexString() === ctx.sender.toHexString()))
      throw new SenderError("you are not in this game");

    if (ctx.timestamp.microsSinceUnixEpoch < game.deadline.microsSinceUnixEpoch)
      throw new SenderError("deadline has not passed yet");

    advanceToReveal(ctx, game_id, game.round_no);
  }
);

export const pick_winner = spacetimedb.reducer(
  { game_id: t.uuid(), submission_id: t.uuid() },
  (ctx, { game_id, submission_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.phase !== "Reveal") throw new SenderError("game is not in Reveal phase");
    if (game.czar.toHexString() !== ctx.sender.toHexString())
      throw new SenderError("only the czar can pick the winner");

    const sub = db.submissions.submission_id.find(submission_id);
    if (!sub) throw new SenderError("submission not found");
    if (sub.game_id.toString() !== game_id.toString())
      throw new SenderError("submission is not for this game");
    if (sub.round_no !== game.round_no)
      throw new SenderError("submission is not for this round");

    db.submissions.submission_id.update({ ...sub, is_winner: true });
    awardPoint(ctx, game_id, sub.player);
    db.games.game_id.update({ ...game, phase: "RoundEnd" });
  }
);

export const next_round = spacetimedb.reducer(
  { game_id: t.uuid() },
  (ctx, { game_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.phase !== "RoundEnd") throw new SenderError("game is not in RoundEnd phase");

    const isOwner = game.owner.toHexString() === ctx.sender.toHexString();
    const isCzar = game.czar.toHexString() === ctx.sender.toHexString();
    if (!isOwner && !isCzar)
      throw new SenderError("only the owner or czar can advance to the next round");

    if (game.max_rounds > 0 && game.round_no >= game.max_rounds) {
      db.games.game_id.update({ ...game, phase: "GameOver" });
      return;
    }

    const players = [...db.game_players.players_by_game.filter(game_id)].sort(
      (a: any, b: any) => a.seat - b.seat
    );

    const czarIdx = players.findIndex(
      (p: any) => p.player.toHexString() === game.czar.toHexString()
    );
    const nextCzarIdx = czarIdx === -1 ? 0 : (czarIdx + 1) % players.length;
    const nextCzar = players[nextCzarIdx];

    for (const p of players) {
      dealCardsToPlayer(ctx, game_id, p.player, 7);
    }

    const promptId = drawNextPrompt(ctx, game_id);
    if (!promptId) {
      db.games.game_id.update({ ...game, phase: "GameOver" });
      return;
    }

    const newRoundNo = game.round_no + 1;
    db.rounds.insert({
      id: 0n,
      game_id,
      round_no: newRoundNo,
      prompt_id: promptId,
      czar: nextCzar.player,
      started_at: ctx.timestamp,
    });

    db.games.game_id.update({
      ...game,
      phase: "Submit",
      round_no: newRoundNo,
      czar: nextCzar.player,
      deadline: ctx.timestamp,
    });
  }
);

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const my_hand = spacetimedb.view(
  { name: "my_hand", public: true },
  t.array(hand_cards.rowType),
  (ctx) => [...(ctx.db as any).hand_cards.hand_by_player.filter(ctx.sender)]
);


// ---------------------------------------------------------------------------
// Host utility reducers
// ---------------------------------------------------------------------------

export const return_to_lobby = spacetimedb.reducer(
  { game_id: t.uuid() },
  (ctx, { game_id }) => {
    const db = ctx.db as any;
    const game = db.games.game_id.find(game_id);
    if (!game) throw new SenderError("game not found");
    if (game.owner.toHexString() !== ctx.sender.toHexString())
      throw new SenderError("only the owner can return to lobby");

    // Clear hands
    const handRows = [...db.hand_cards.hand_by_game.filter(game_id)];
    for (const row of handRows) db.hand_cards.id.delete(row.id);

    // Clear decks
    const promptDeckRows = [...db.game_prompt_deck.promptdeck_by_game.filter(game_id)];
    for (const row of promptDeckRows) db.game_prompt_deck.id.delete(row.id);

    const answerDeckRows = [...db.game_answer_deck.answerdeck_by_game.filter(game_id)];
    for (const row of answerDeckRows) db.game_answer_deck.id.delete(row.id);

    // Clear rounds
    const roundRows = [...db.rounds.rounds_by_game.filter(game_id)];
    for (const row of roundRows) db.rounds.id.delete(row.id);

    // Clear submissions and their cards
    const submissionRows = [...db.submissions.subs_by_game.filter(game_id)];
    for (const sub of submissionRows) {
      const subCards = [...db.submission_cards.subcards_by_submission.filter(sub.submission_id)];
      for (const card of subCards) db.submission_cards.id.delete(card.id);
      db.submissions.submission_id.delete(sub.submission_id);
    }

    // Reset scores to 0 (keep rows, keep players)
    const scoreRows = [...db.scores.scores_by_game.filter(game_id)];
    for (const row of scoreRows) db.scores.id.update({ ...row, points: 0 });

    // Reset game to Lobby
    db.games.game_id.update({ ...game, phase: "Lobby", round_no: 0, czar: game.owner });
  }
);

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

spacetimedb.clientConnected((_ctx) => {
  // no-op
});

spacetimedb.clientDisconnected((_ctx) => {
  // no-op
});
