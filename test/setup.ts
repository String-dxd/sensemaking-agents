// Load `.env` so DATABASE_URL-gated integration tests (test/db/*, the RLS
// suites, test/agents/memory.test.ts) actually see a connection string when
// the developer has one configured. Without this, `describe.skipIf(!process.env.DATABASE_URL)`
// was permanently true under vitest and 127 tests silently vanished — see
// plans/059. `dotenv/config` is a no-op when `.env` is absent.
import 'dotenv/config'
import '@testing-library/jest-dom/vitest'
