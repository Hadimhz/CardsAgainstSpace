import { schema, table, t } from "spacetimedb/server";

const packs = table(
  {
    public: true,
    indexes: [{ accessor: "packs_by_name", algorithm: "btree", columns: ["name"] }],
  },
  {
    pack_id: t.uuid().primaryKey(),
    name: t.string(),
    source_id: t.i32().optional(),
  }
);

const prompt_cards = table(
  {
    public: true,
    indexes: [{ accessor: "prompt_by_pack", algorithm: "btree", columns: ["pack_id"] }],
  },
  {
    prompt_id: t.uuid().primaryKey(),
    pack_id: t.uuid(),
    card_ref: t.u32(),
    blanks: t.u8(),
  }
);

const answer_cards = table(
  {
    public: true,
    indexes: [{ accessor: "answer_by_pack", algorithm: "btree", columns: ["pack_id"] }],
  },
  {
    answer_id: t.uuid().primaryKey(),
    pack_id: t.uuid(),
    card_ref: t.u32(),
  }
);

const games = table(
  {
    public: true,
    indexes: [
      { accessor: "games_by_owner", algorithm: "btree", columns: ["owner"] },
      { accessor: "games_by_phase", algorithm: "btree", columns: ["phase"] },
    ],
  },
  {
    game_id: t.uuid().primaryKey(),
    owner: t.identity(),
    phase: t.string(), // "Lobby" | "Submit" | "Reveal" | "RoundEnd" | "GameOver"
    round_no: t.u16(),
    max_rounds: t.u16(), // 0 = unlimited
    czar: t.identity(),
    deadline: t.timestamp(),
    created_at: t.timestamp(),
  }
);

const game_players = table(
  {
    public: true,
    indexes: [
      { accessor: "players_by_game", algorithm: "btree", columns: ["game_id"] },
      { accessor: "players_by_identity", algorithm: "btree", columns: ["player"] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    game_id: t.uuid(),
    player: t.identity(),
    display_name: t.string(),
    seat: t.u16(),
    joined_at: t.timestamp(),
  }
);

const game_packs = table(
  {
    public: true,
    indexes: [
      { accessor: "gamepacks_by_game", algorithm: "btree", columns: ["game_id"] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    game_id: t.uuid(),
    pack_id: t.uuid(),
    added_by: t.identity(),
    added_at: t.timestamp(),
  }
);

const game_prompt_deck = table(
  {
    public: true,
    indexes: [{ accessor: "promptdeck_by_game", algorithm: "btree", columns: ["game_id"] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    game_id: t.uuid(),
    order: t.u32(),
    prompt_id: t.uuid(),
    drawn: t.bool(),
  }
);

const game_answer_deck = table(
  {
    public: true,
    indexes: [{ accessor: "answerdeck_by_game", algorithm: "btree", columns: ["game_id"] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    game_id: t.uuid(),
    order: t.u32(),
    answer_id: t.uuid(),
    drawn: t.bool(),
  }
);

const hand_cards = table(
  {
    public: true,
    indexes: [
      { accessor: "hand_by_game", algorithm: "btree", columns: ["game_id"] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    game_id: t.uuid(),
    player: t.identity(),
    answer_id: t.uuid(),
    slot: t.u16(),
    dealt_at: t.timestamp(),
  }
);

const rounds = table(
  {
    public: true,
    indexes: [{ accessor: "rounds_by_game", algorithm: "btree", columns: ["game_id"] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    game_id: t.uuid(),
    round_no: t.u16(),
    prompt_id: t.uuid(),
    czar: t.identity(),
    started_at: t.timestamp(),
  }
);

const submissions = table(
  {
    public: true,
    indexes: [
      { accessor: "subs_by_game", algorithm: "btree", columns: ["game_id"] },
    ],
  },
  {
    submission_id: t.uuid().primaryKey(),
    game_id: t.uuid(),
    round_no: t.u16(),
    player: t.identity(),
    submitted_at: t.timestamp(),
    reveal_order: t.u16(),
    is_winner: t.bool(),
  }
);

const submission_cards = table(
  {
    public: true,
    indexes: [{ accessor: "subcards_by_submission", algorithm: "btree", columns: ["submission_id"] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    submission_id: t.uuid(),
    slot_index: t.u8(),
    answer_id: t.uuid(),
  }
);

const scores = table(
  {
    public: true,
    indexes: [{ accessor: "scores_by_game", algorithm: "btree", columns: ["game_id"] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    game_id: t.uuid(),
    player: t.identity(),
    points: t.u16(),
  }
);

const spacetimedb = schema({
  packs,
  prompt_cards,
  answer_cards,
  games,
  game_players,
  game_packs,
  game_prompt_deck,
  game_answer_deck,
  hand_cards,
  rounds,
  submissions,
  submission_cards,
  scores,
});

export default spacetimedb;
