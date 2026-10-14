# Open-source provenance

Source: https://github.com/TypeThe0ry/CardRoomPro
Revision: 64753e936e4200c58eca7992ce1e9d4bb8184ec8 (retrieved 2026-10-01).
License: MIT; copyright notice retained in CardRoomPro-LICENSE.txt.

- landlord-validator.js: core-validator.js, CJS to ESM; undefined-length guard.
- guandan-validator.js: pure classifier portion of guandan-game.js, ESM exports; promoted level ranks, joker wildcard constraints, strict full-house remainder checks.
- mahjong-validator.js: standard winning decomposition from mahjong-game.js, ESM export. Nanjing tile set, scoring and rooms are a separate adapter.

No upstream authentication, MySQL, JWT, UI, art or room server copied. Existing adventure-camp transport is reused.

Additional corrections: ordinary non-level 2 ranks below 3; strongest valid wildcard straight and full-house interpretation; removed a fallback that incorrectly let a wildcard form a joker pair. Regression fixtures and 80 full seeded rounds in tests/chess.test.mjs.
