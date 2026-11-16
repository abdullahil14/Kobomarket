# KoboMarket
Multi-vendor marketplace with wallets & escrow. Node/Express, MongoDB (users/products/carts/notifications) + PostgreSQL (money).
## Why two databases?
MongoDB fits flexible, read-heavy catalogue data. PostgreSQL gives ACID, row locks (`SELECT ... FOR UPDATE`), CHECK constraints and an append-only ledger for money - the DB itself refuses bad data. Money is integer kobo only, never float.
## Keeping them in sync (no distributed tx)
We use compensating sagas: e.g. register creates Mongo user, then PG wallet; if wallet fails we delete the Mongo user. Checkout commits PG escrow first, then decrements Mongo stock; if stock fails we refund escrow + cancel order in PG. Alternative considered: Outbox pattern (write event in same tx, worker retries) - more robust for crashes between steps, recommended as follow-up; saga was chosen for simplicity and explicit compensation in code.
## Run
`cp .env.example .env && docker-compose up --build` then `npm run migrate && npm run seed`
`npm run audit:ledger` prints PASS/FAIL. `npm test`
## Paystack
`PAYMENT_PROVIDER=mock` by default (same HMAC SHA512 webhook, duplicate-webhook idempotency, re-verify). Set `paystack` + real keys for test mode.
## API
See /api-docs. All endpoints from spec §7 implemented. Auth: access 15m, refresh 7d rotated, reuse revokes sessions.
