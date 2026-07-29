import 'dotenv/config'

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, type QueryResultRow } from 'pg'

type MigrationState = 'pending' | 'applied'

type ColumnDefinition = readonly [
  name: string,
  dataType: string,
  notNull: boolean,
  defaultExpression: string | null,
]

interface LedgerEntry {
  tag: string
  createdAt: string
  hash: string
}

interface LedgerRow extends QueryResultRow {
  hash: string
  created_at: string
}

interface RelationShape {
  key: string
  name: string
  kind: 'r' | 'i'
  persistence: 'p'
  rowSecurity: boolean
  forceRowSecurity: boolean
  owner: string
  acl: string | null
}

interface RelationRow extends QueryResultRow {
  name: string
  kind: string
  persistence: string
  row_security: boolean
  force_row_security: boolean
  owner: string
  acl: string | null
}

interface ColumnShape {
  key: string
  table: string
  position: number
  name: string
  dataType: string
  notNull: boolean
  defaultExpression: string | null
  identity: string
  generated: string
}

interface ColumnRow extends QueryResultRow {
  table_name: string
  position: number
  column_name: string
  data_type: string
  not_null: boolean
  default_expression: string | null
  identity: string
  generated: string
}

interface ConstraintShape {
  key: string
  table: string
  name: string
  type: 'p' | 'u' | 'c' | 'f'
  columns: string[]
  referencedTable: string | null
  referencedColumns: string[]
  onUpdate: string | null
  onDelete: string | null
  matchType: string | null
  definition: string
  deferrable: boolean
  deferred: boolean
  validated: boolean
  noInherit: boolean
}

interface ConstraintRow extends QueryResultRow {
  table_name: string
  constraint_name: string
  constraint_type: string
  columns: string[]
  referenced_schema: string | null
  referenced_table: string | null
  referenced_columns: string[]
  on_update: string | null
  on_delete: string | null
  match_type: string | null
  definition: string
  deferrable: boolean
  deferred: boolean
  validated: boolean
  no_inherit: boolean
}

interface IndexShape {
  key: string
  table: string
  name: string
  method: 'btree'
  unique: boolean
  primary: boolean
  exclusion: boolean
  immediate: boolean
  clustered: boolean
  valid: boolean
  checkXmin: boolean
  ready: boolean
  live: boolean
  replicaIdentity: boolean
  keyColumns: string[]
  keyOptions: number[]
  opclasses: string[]
  keyAttributeCount: number
  attributeCount: number
  predicate: string | null
  defaultTablespace: boolean
  storageOptions: string[] | null
}

interface IndexRow extends QueryResultRow {
  table_name: string
  index_name: string
  method: string
  is_unique: boolean
  is_primary: boolean
  is_exclusion: boolean
  is_immediate: boolean
  is_clustered: boolean
  is_valid: boolean
  check_xmin: boolean
  is_ready: boolean
  is_live: boolean
  is_replica_identity: boolean
  key_columns: string[]
  key_options: number[]
  opclasses: string[]
  key_attribute_count: number
  attribute_count: number
  predicate: string | null
  default_tablespace: boolean
  storage_options: string[] | null
}

interface FunctionShape {
  key: string
  schema: string
  name: string
  identityArguments: string
  resultType: string
  language: string
  kind: string
  volatility: string
  parallel: string
  securityDefiner: boolean
  leakproof: boolean
  strict: boolean
  returnsSet: boolean
  configuration: string[] | null
  source: string
  owner: string
  acl: string | null
}

interface FunctionRow extends QueryResultRow {
  schema_name: string
  function_name: string
  identity_arguments: string
  result_type: string
  language: string
  function_kind: string
  volatility: string
  parallel: string
  security_definer: boolean
  leakproof: boolean
  strict: boolean
  returns_set: boolean
  configuration: string[] | null
  source: string
  owner: string
  acl: string | null
}

interface TriggerShape {
  key: string
  table: string
  name: string
  enabled: string
  type: number
  functionSchema: string
  functionName: string
  functionArguments: string
  argumentCount: number
  arguments: string
  attributeNumbers: string
  whenExpression: string | null
}

interface TriggerRow extends QueryResultRow {
  table_name: string
  trigger_name: string
  enabled: string
  trigger_type: number
  function_schema: string
  function_name: string
  function_arguments: string
  argument_count: number
  arguments: string
  attribute_numbers: string
  when_expression: string | null
}

interface PolicyShape {
  key: string
  table: string
  name: string
  command: string
  permissive: boolean
  roles: string[]
  usingExpression: string | null
  checkExpression: string | null
}

interface PolicyRow extends QueryResultRow {
  table_name: string
  policy_name: string
  command: string
  permissive: boolean
  roles: string[]
  using_expression: string | null
  check_expression: string | null
}

interface DefaultAclShape {
  key: string
  owner: string
  schema: string | null
  objectType: string
  acl: string
}

interface DefaultAclRow extends QueryResultRow {
  owner: string
  schema_name: string | null
  object_type: string
  acl: string
}

interface IdentityRow extends QueryResultRow {
  database_name: string
  user_name: string
}

interface DatabaseIdentity {
  database: string
  user: string
  hostPortSha256: string
}

interface CatalogSnapshot {
  relations: RelationShape[]
  columns: ColumnShape[]
  constraints: ConstraintShape[]
  indexes: IndexShape[]
  functions: FunctionShape[]
  triggers: TriggerShape[]
  policies: PolicyShape[]
  defaultAcls: DefaultAclShape[]
}

interface ConnectionDetails {
  connectionString: string
  hostPortSha256: string
}

class VerificationFailure extends Error {}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const migrationsDirectory = resolve(repositoryRoot, 'src/db/migrations')
const journalPath = resolve(migrationsDirectory, 'meta/_journal.json')
const postgresIdentifierByteLimit = 63

const migrationTags = [
  '0000_illegal_sunset_bain',
  '0001_share_tokens',
  '0002_friendly_gorgon',
  '0003_concerned_robin_chapel',
  '0004_moaning_abomination',
  '0005_gigantic_firebrand',
] as const

const targetMigration = migrationTags.at(-1)

if (!targetMigration) {
  throw new VerificationFailure('STOP: the expected migration list is empty')
}

const faqTableNames = [
  'my_world_faq_editor_sessions',
  'my_world_faq_heads',
  'my_world_faq_revisions',
] as const

const expectedColumns = [
  ...tableColumns('my_world_faq_editor_sessions', [
    ['token_digest', 'text', true, null],
    ['audit_id', 'uuid', true, 'gen_random_uuid()'],
    ['display_name', 'text', true, null],
    ['credential_fingerprint', 'text', true, null],
    ['created_at', 'timestamp with time zone', true, 'now()'],
    ['last_seen_at', 'timestamp with time zone', true, 'now()'],
    ['absolute_expires_at', 'timestamp with time zone', true, null],
    ['revoked_at', 'timestamp with time zone', false, null],
    ['mutation_window_started_at', 'timestamp with time zone', true, 'now()'],
    ['mutation_count', 'integer', true, '0'],
  ]),
  ...tableColumns('my_world_faq_heads', [
    ['page_key', 'text', true, null],
    ['current_revision_id', 'uuid', true, null],
    ['current_version', 'integer', true, null],
    ['current_digest', 'text', true, null],
    ['updated_at', 'timestamp with time zone', true, 'now()'],
  ]),
  ...tableColumns('my_world_faq_revisions', [
    ['id', 'uuid', true, 'gen_random_uuid()'],
    ['page_key', 'text', true, null],
    ['version', 'integer', true, null],
    ['document', 'jsonb', true, null],
    ['schema_version', 'integer', true, null],
    ['structure_version', 'integer', true, null],
    ['canonical_digest', 'text', true, null],
    ['attribution_kind', 'text', true, null],
    ['saved_by_name', 'text', false, null],
    ['created_at', 'timestamp with time zone', true, 'now()'],
    ['restored_from_revision_id', 'uuid', false, null],
    ['attempt_id', 'uuid', true, null],
    ['request_fingerprint', 'text', true, null],
  ]),
]

const expectedConstraints: ConstraintShape[] = [
  primaryKey('my_world_faq_editor_sessions', 'my_world_faq_editor_sessions_pkey', ['token_digest']),
  uniqueConstraint('my_world_faq_editor_sessions', 'my_world_faq_editor_sessions_audit_id_uq', [
    'audit_id',
  ]),
  checkConstraint(
    'my_world_faq_editor_sessions',
    'my_world_faq_editor_sessions_token_digest_check',
    "token_digest ~ '^[0-9a-f]{64}$'::text",
  ),
  checkConstraint(
    'my_world_faq_editor_sessions',
    'my_world_faq_editor_sessions_credential_fingerprint_check',
    "credential_fingerprint ~ '^[0-9a-f]{64}$'::text",
  ),
  checkConstraint(
    'my_world_faq_editor_sessions',
    'my_world_faq_editor_sessions_display_name_check',
    'length(btrim(display_name)) >= 1 AND length(btrim(display_name)) <= 80',
  ),
  checkConstraint(
    'my_world_faq_editor_sessions',
    'my_world_faq_editor_sessions_time_order_check',
    `absolute_expires_at > created_at
      AND last_seen_at >= created_at
      AND mutation_window_started_at >= created_at`,
  ),
  checkConstraint(
    'my_world_faq_editor_sessions',
    'my_world_faq_editor_sessions_mutation_count_check',
    'mutation_count >= 0 AND mutation_count <= 10',
  ),
  primaryKey('my_world_faq_heads', 'my_world_faq_heads_pkey', ['page_key']),
  checkConstraint(
    'my_world_faq_heads',
    'my_world_faq_heads_page_key_check',
    "page_key = 'my-world-faq'::text",
  ),
  checkConstraint('my_world_faq_heads', 'my_world_faq_heads_version_check', 'current_version > 0'),
  checkConstraint(
    'my_world_faq_heads',
    'my_world_faq_heads_digest_check',
    "current_digest ~ '^[0-9a-f]{64}$'::text",
  ),
  foreignKeyConstraint({
    table: 'my_world_faq_heads',
    name: 'my_world_faq_heads_revision_fk',
    columns: ['page_key', 'current_revision_id', 'current_version', 'current_digest'],
    referencedTable: 'public.my_world_faq_revisions',
    referencedColumns: ['page_key', 'id', 'version', 'canonical_digest'],
    onDelete: 'r',
  }),
  primaryKey('my_world_faq_revisions', 'my_world_faq_revisions_pkey', ['id']),
  uniqueConstraint('my_world_faq_revisions', 'my_world_faq_revisions_page_version_uq', [
    'page_key',
    'version',
  ]),
  uniqueConstraint('my_world_faq_revisions', 'my_world_faq_revisions_page_attempt_uq', [
    'page_key',
    'attempt_id',
  ]),
  uniqueConstraint('my_world_faq_revisions', 'my_world_faq_revisions_head_pointer_uq', [
    'page_key',
    'id',
    'version',
    'canonical_digest',
  ]),
  checkConstraint(
    'my_world_faq_revisions',
    'my_world_faq_revisions_page_key_check',
    "page_key = 'my-world-faq'::text",
  ),
  checkConstraint('my_world_faq_revisions', 'my_world_faq_revisions_version_check', 'version > 0'),
  checkConstraint(
    'my_world_faq_revisions',
    'my_world_faq_revisions_schema_version_check',
    'schema_version > 0',
  ),
  checkConstraint(
    'my_world_faq_revisions',
    'my_world_faq_revisions_structure_version_check',
    'structure_version > 0',
  ),
  checkConstraint(
    'my_world_faq_revisions',
    'my_world_faq_revisions_document_object_check',
    "jsonb_typeof(document) = 'object'::text",
  ),
  checkConstraint(
    'my_world_faq_revisions',
    'my_world_faq_revisions_digest_check',
    "canonical_digest ~ '^[0-9a-f]{64}$'::text",
  ),
  checkConstraint(
    'my_world_faq_revisions',
    'my_world_faq_revisions_fingerprint_check',
    "request_fingerprint ~ '^[0-9a-f]{64}$'::text",
  ),
  checkConstraint(
    'my_world_faq_revisions',
    'my_world_faq_revisions_attribution_check',
    `attribution_kind = 'system-import'::text AND saved_by_name IS NULL
      OR attribution_kind = 'self-declared'::text
        AND saved_by_name IS NOT NULL
        AND length(btrim(saved_by_name)) >= 1
        AND length(btrim(saved_by_name)) <= 80`,
  ),
  foreignKeyConstraint({
    table: 'my_world_faq_revisions',
    name: 'my_world_faq_revisions_restored_from_revision_id_my_world_faq_revisions_id_fk',
    columns: ['restored_from_revision_id'],
    referencedTable: 'public.my_world_faq_revisions',
    referencedColumns: ['id'],
    onDelete: 'r',
  }),
]

const expectedIndexes: IndexShape[] = [
  indexShape({
    table: 'my_world_faq_editor_sessions',
    name: 'my_world_faq_editor_sessions_pkey',
    unique: true,
    primary: true,
    columns: ['token_digest'],
    opclasses: ['text_ops'],
  }),
  indexShape({
    table: 'my_world_faq_editor_sessions',
    name: 'my_world_faq_editor_sessions_audit_id_uq',
    unique: true,
    columns: ['audit_id'],
    opclasses: ['uuid_ops'],
  }),
  indexShape({
    table: 'my_world_faq_editor_sessions',
    name: 'idx_my_world_faq_editor_sessions_active_expiry',
    columns: ['absolute_expires_at', 'last_seen_at'],
    opclasses: ['timestamptz_ops', 'timestamptz_ops'],
    predicate: 'revoked_at IS NULL',
  }),
  indexShape({
    table: 'my_world_faq_editor_sessions',
    name: 'idx_my_world_faq_editor_sessions_revoked',
    columns: ['revoked_at'],
    opclasses: ['timestamptz_ops'],
    predicate: 'revoked_at IS NOT NULL',
  }),
  indexShape({
    table: 'my_world_faq_heads',
    name: 'my_world_faq_heads_pkey',
    unique: true,
    primary: true,
    columns: ['page_key'],
    opclasses: ['text_ops'],
  }),
  indexShape({
    table: 'my_world_faq_revisions',
    name: 'my_world_faq_revisions_pkey',
    unique: true,
    primary: true,
    columns: ['id'],
    opclasses: ['uuid_ops'],
  }),
  indexShape({
    table: 'my_world_faq_revisions',
    name: 'my_world_faq_revisions_page_version_uq',
    unique: true,
    columns: ['page_key', 'version'],
    opclasses: ['text_ops', 'int4_ops'],
  }),
  indexShape({
    table: 'my_world_faq_revisions',
    name: 'my_world_faq_revisions_page_attempt_uq',
    unique: true,
    columns: ['page_key', 'attempt_id'],
    opclasses: ['text_ops', 'uuid_ops'],
  }),
  indexShape({
    table: 'my_world_faq_revisions',
    name: 'my_world_faq_revisions_head_pointer_uq',
    unique: true,
    columns: ['page_key', 'id', 'version', 'canonical_digest'],
    opclasses: ['text_ops', 'uuid_ops', 'int4_ops', 'text_ops'],
  }),
  indexShape({
    table: 'my_world_faq_revisions',
    name: 'idx_my_world_faq_revisions_page_version',
    columns: ['page_key', 'version'],
    options: [0, 1],
    opclasses: ['text_ops', 'int4_ops'],
  }),
]

const expectedRelations: RelationShape[] = [
  ...faqTableNames.map((name) => ({
    key: `r:${name}`,
    name,
    kind: 'r' as const,
    persistence: 'p' as const,
    rowSecurity: false,
    forceRowSecurity: false,
    owner: '',
    acl: null,
  })),
  ...expectedIndexes.map((index) => ({
    key: `i:${index.name}`,
    name: index.name,
    kind: 'i' as const,
    persistence: 'p' as const,
    rowSecurity: false,
    forceRowSecurity: false,
    owner: '',
    acl: null,
  })),
]

const expectedFunctions: FunctionShape[] = [
  {
    key: 'public.reject_my_world_faq_revision_mutation()',
    schema: 'public',
    name: 'reject_my_world_faq_revision_mutation',
    identityArguments: '',
    resultType: 'trigger',
    language: 'plpgsql',
    kind: 'f',
    volatility: 'v',
    parallel: 'u',
    securityDefiner: false,
    leakproof: false,
    strict: false,
    returnsSet: false,
    configuration: null,
    source: normalizeRoutineBody(`
      BEGIN
        RAISE EXCEPTION 'my_world_faq_revisions is append-only'
          USING ERRCODE = '55000';
      END;
    `),
    owner: '',
    acl: null,
  },
]

const expectedTriggers: TriggerShape[] = [
  {
    key: 'my_world_faq_revisions.my_world_faq_revisions_append_only',
    table: 'my_world_faq_revisions',
    name: 'my_world_faq_revisions_append_only',
    enabled: 'O',
    type: 27,
    functionSchema: 'public',
    functionName: 'reject_my_world_faq_revision_mutation',
    functionArguments: '',
    argumentCount: 0,
    arguments: '',
    attributeNumbers: '',
    whenExpression: null,
  },
]

const expectedPolicies: PolicyShape[] = []
const expectedDefaultAcls: DefaultAclShape[] = []

function tableColumns(table: string, definitions: readonly ColumnDefinition[]): ColumnShape[] {
  return definitions.map(([name, dataType, notNull, defaultExpression], index) => ({
    key: `${table}.${index + 1}:${name}`,
    table,
    position: index + 1,
    name,
    dataType,
    notNull,
    defaultExpression: normalizeExpression(defaultExpression),
    identity: '',
    generated: '',
  }))
}

function baseConstraint(
  table: string,
  name: string,
  type: ConstraintShape['type'],
): ConstraintShape {
  const serverName = postgresIdentifier(name)
  return {
    key: `${table}.${serverName}`,
    table,
    name: serverName,
    type,
    columns: [],
    referencedTable: null,
    referencedColumns: [],
    onUpdate: null,
    onDelete: null,
    matchType: null,
    definition: '',
    deferrable: false,
    deferred: false,
    validated: true,
    // PostgreSQL marks primary, unique, and foreign-key constraints
    // non-inheritable in pg_constraint; CHECK constraints retain false.
    noInherit: type !== 'c',
  }
}

function primaryKey(table: string, name: string, columns: string[]): ConstraintShape {
  return {
    ...baseConstraint(table, name, 'p'),
    columns,
    definition: `PRIMARY KEY (${columns.join(', ')})`,
  }
}

function uniqueConstraint(table: string, name: string, columns: string[]): ConstraintShape {
  return {
    ...baseConstraint(table, name, 'u'),
    columns,
    definition: `UNIQUE (${columns.join(', ')})`,
  }
}

function checkConstraint(table: string, name: string, expression: string): ConstraintShape {
  return {
    ...baseConstraint(table, name, 'c'),
    definition: canonicalConstraintDefinition(`CHECK (${expression})`),
  }
}

function foreignKeyConstraint(input: {
  table: string
  name: string
  columns: string[]
  referencedTable: string
  referencedColumns: string[]
  onDelete: 'a' | 'r' | 'c' | 'n' | 'd'
}): ConstraintShape {
  const referencedTableName = input.referencedTable.split('.').at(-1)
  if (!referencedTableName) {
    throw new VerificationFailure(`STOP: invalid expected foreign-key target for ${input.name}`)
  }
  const deleteAction = {
    a: 'NO ACTION',
    r: 'RESTRICT',
    c: 'CASCADE',
    n: 'SET NULL',
    d: 'SET DEFAULT',
  }[input.onDelete]

  return {
    ...baseConstraint(input.table, input.name, 'f'),
    columns: input.columns,
    referencedTable: input.referencedTable,
    referencedColumns: input.referencedColumns,
    onUpdate: 'a',
    onDelete: input.onDelete,
    matchType: 's',
    definition: `FOREIGN KEY (${input.columns.join(', ')}) REFERENCES ${referencedTableName}(${input.referencedColumns.join(', ')}) ON DELETE ${deleteAction}`,
  }
}

function indexShape(input: {
  table: string
  name: string
  columns: string[]
  opclasses: string[]
  unique?: boolean
  primary?: boolean
  options?: number[]
  predicate?: string
}): IndexShape {
  const serverName = postgresIdentifier(input.name)
  return {
    key: `${input.table}.${serverName}`,
    table: input.table,
    name: serverName,
    method: 'btree',
    unique: input.unique ?? false,
    primary: input.primary ?? false,
    exclusion: false,
    immediate: true,
    clustered: false,
    valid: true,
    checkXmin: false,
    ready: true,
    live: true,
    replicaIdentity: false,
    keyColumns: input.columns,
    keyOptions: input.options ?? input.columns.map(() => 0),
    opclasses: input.opclasses,
    keyAttributeCount: input.columns.length,
    attributeCount: input.columns.length,
    predicate: normalizeExpression(input.predicate ?? null),
    defaultTablespace: true,
    storageOptions: null,
  }
}

function normalizeExpression(value: string | null): string | null {
  if (value === null) return null

  return value
    .replaceAll('"', '')
    .replace(/\bpublic\./g, '')
    .replace(/\bmy_world_faq_(?:editor_sessions|heads|revisions)\./g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

function canonicalConstraintDefinition(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function postgresIdentifier(value: string): string {
  if (Buffer.byteLength(value, 'utf8') <= postgresIdentifierByteLimit) return value

  let result = ''
  for (const character of value) {
    if (Buffer.byteLength(result + character, 'utf8') > postgresIdentifierByteLimit) break
    result += character
  }
  return result
}

function normalizeRoutineBody(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*([=;(),])\s*/g, '$1')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function loadExpectedLedger(): Promise<LedgerEntry[]> {
  let journal: unknown
  try {
    journal = JSON.parse(await readFile(journalPath, 'utf8')) as unknown
  } catch {
    throw new VerificationFailure('STOP: could not read the local Drizzle migration journal')
  }

  if (
    !isRecord(journal) ||
    journal.version !== '7' ||
    journal.dialect !== 'postgresql' ||
    !Array.isArray(journal.entries)
  ) {
    throw new VerificationFailure(
      'STOP: the local Drizzle migration journal has an unexpected shape',
    )
  }

  if (journal.entries.length !== migrationTags.length) {
    throw new VerificationFailure(
      `STOP: the local Drizzle journal must contain exactly migrations 0000-0005; found ${journal.entries.length} entries`,
    )
  }

  const sqlFiles = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const wantedSqlFiles = migrationTags.map((tag) => `${tag}.sql`).sort()

  if (JSON.stringify(sqlFiles) !== JSON.stringify(wantedSqlFiles)) {
    throw new VerificationFailure(
      'STOP: local SQL migrations must be exactly the six journaled files 0000-0005',
    )
  }

  const ledger: LedgerEntry[] = []

  for (const [index, expectedTag] of migrationTags.entries()) {
    const entry = journal.entries[index]
    if (
      !isRecord(entry) ||
      entry.idx !== index ||
      entry.version !== '7' ||
      entry.tag !== expectedTag ||
      entry.breakpoints !== true ||
      typeof entry.when !== 'number' ||
      !Number.isSafeInteger(entry.when)
    ) {
      throw new VerificationFailure(
        `STOP: local Drizzle journal entry ${index} does not exactly describe ${expectedTag}`,
      )
    }

    let sql: Buffer
    try {
      sql = await readFile(resolve(migrationsDirectory, `${expectedTag}.sql`))
    } catch {
      throw new VerificationFailure(`STOP: local migration ${expectedTag}.sql is missing`)
    }

    ledger.push({
      tag: expectedTag,
      createdAt: String(entry.when),
      hash: createHash('sha256').update(sql).digest('hex'),
    })
  }

  return ledger
}

function parseExpectedState(arguments_: string[]): MigrationState | undefined {
  if (arguments_.length === 0) return undefined

  if (arguments_.length === 1 && arguments_[0] === '--help') {
    console.log(`Usage: pnpm faq:verify-migration [--expect=pending|--expect=applied]

Reads DATABASE_URL_UNPOOLED only. With no --expect flag, either exact coherent
state is accepted. Use --expect=applied for postflight and no-op verification.`)
    process.exit(0)
  }

  const normalized =
    arguments_.length === 2 && arguments_[0] === '--expect'
      ? `--expect=${arguments_[1]}`
      : arguments_.length === 1
        ? arguments_[0]
        : undefined

  if (normalized === '--expect=pending') return 'pending'
  if (normalized === '--expect=applied') return 'applied'

  throw new VerificationFailure('STOP: expected only --expect=pending, --expect=applied, or --help')
}

function connectionDetails(): ConnectionDetails {
  const raw = process.env.DATABASE_URL_UNPOOLED?.trim()
  if (!raw) {
    throw new VerificationFailure(
      'STOP: DATABASE_URL_UNPOOLED is required; this verifier never falls back to DATABASE_URL',
    )
  }

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new VerificationFailure('STOP: DATABASE_URL_UNPOOLED is not a valid PostgreSQL URL')
  }

  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new VerificationFailure('STOP: DATABASE_URL_UNPOOLED is not a PostgreSQL URL')
  }
  if ([...url.searchParams.keys()].some((key) => key.toLowerCase() === 'options')) {
    throw new VerificationFailure(
      'STOP: DATABASE_URL_UNPOOLED must not contain a pre-existing options query parameter',
    )
  }

  const hostPort = `${url.hostname.toLowerCase()}:${url.port || '5432'}`
  return {
    connectionString: url.toString(),
    hostPortSha256: createHash('sha256')
      .update('postgres-host-port-v1\0')
      .update(hostPort)
      .digest('hex'),
  }
}

async function queryCatalog(client: Client): Promise<CatalogSnapshot> {
  const relationResult = await client.query<RelationRow>(
    `
      select
        relation.relname as name,
        relation.relkind::text as kind,
        relation.relpersistence::text as persistence,
        relation.relrowsecurity as row_security,
        relation.relforcerowsecurity as force_row_security,
        pg_catalog.pg_get_userbyid(relation.relowner) as owner,
        relation.relacl::text as acl
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and (
          relation.relname ~ '^my_world_faq_'
          or exists (
            select 1
            from pg_catalog.pg_index attached_index
            join pg_catalog.pg_class parent on parent.oid = attached_index.indrelid
            join pg_catalog.pg_namespace parent_namespace
              on parent_namespace.oid = parent.relnamespace
            where attached_index.indexrelid = relation.oid
              and parent_namespace.nspname = 'public'
              and parent.relname = any($1::text[])
          )
        )
      order by relation.relkind, relation.relname
    `,
    [faqTableNames],
  )

  const columnResult = await client.query<ColumnRow>(
    `
      select
        table_class.relname as table_name,
        attribute.attnum::integer as position,
        attribute.attname as column_name,
        pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
        attribute.attnotnull as not_null,
        pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid, true)
          as default_expression,
        attribute.attidentity::text as identity,
        attribute.attgenerated::text as generated
      from pg_catalog.pg_class table_class
      join pg_catalog.pg_namespace namespace on namespace.oid = table_class.relnamespace
      join pg_catalog.pg_attribute attribute on attribute.attrelid = table_class.oid
      left join pg_catalog.pg_attrdef default_value
        on default_value.adrelid = table_class.oid
       and default_value.adnum = attribute.attnum
      where namespace.nspname = 'public'
        and table_class.relname = any($1::text[])
        and table_class.relkind in ('r', 'p')
        and attribute.attnum > 0
        and not attribute.attisdropped
      order by table_class.relname, attribute.attnum
    `,
    [faqTableNames],
  )

  const constraintResult = await client.query<ConstraintRow>(
    `
      select
        table_class.relname as table_name,
        constraint_row.conname as constraint_name,
        constraint_row.contype::text as constraint_type,
        case
          when constraint_row.contype = 'c' then array[]::text[]
          else coalesce((
            select array_agg(attribute.attname::text order by key_column.ordinality)
            from unnest(constraint_row.conkey) with ordinality
              as key_column(attribute_number, ordinality)
            join pg_catalog.pg_attribute attribute
              on attribute.attrelid = constraint_row.conrelid
             and attribute.attnum = key_column.attribute_number
          ), array[]::text[])
        end as columns,
        referenced_namespace.nspname as referenced_schema,
        referenced_table.relname as referenced_table,
        case
          when constraint_row.contype <> 'f' then array[]::text[]
          else coalesce((
            select array_agg(attribute.attname::text order by key_column.ordinality)
            from unnest(constraint_row.confkey) with ordinality
              as key_column(attribute_number, ordinality)
            join pg_catalog.pg_attribute attribute
              on attribute.attrelid = constraint_row.confrelid
             and attribute.attnum = key_column.attribute_number
          ), array[]::text[])
        end as referenced_columns,
        case when constraint_row.contype = 'f'
          then constraint_row.confupdtype::text else null end as on_update,
        case when constraint_row.contype = 'f'
          then constraint_row.confdeltype::text else null end as on_delete,
        case when constraint_row.contype = 'f'
          then constraint_row.confmatchtype::text else null end as match_type,
        pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition,
        constraint_row.condeferrable as deferrable,
        constraint_row.condeferred as deferred,
        constraint_row.convalidated as validated,
        constraint_row.connoinherit as no_inherit
      from pg_catalog.pg_constraint constraint_row
      join pg_catalog.pg_class table_class on table_class.oid = constraint_row.conrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = table_class.relnamespace
      left join pg_catalog.pg_class referenced_table
        on referenced_table.oid = constraint_row.confrelid
      left join pg_catalog.pg_namespace referenced_namespace
        on referenced_namespace.oid = referenced_table.relnamespace
      where namespace.nspname = 'public'
        and (
          table_class.relname = any($1::text[])
          or constraint_row.conname ~ 'my_world_faq'
        )
      order by table_class.relname, constraint_row.conname
    `,
    [faqTableNames],
  )

  const indexResult = await client.query<IndexRow>(
    `
      select
        table_class.relname as table_name,
        index_class.relname as index_name,
        access_method.amname as method,
        index_row.indisunique as is_unique,
        index_row.indisprimary as is_primary,
        index_row.indisexclusion as is_exclusion,
        index_row.indimmediate as is_immediate,
        index_row.indisclustered as is_clustered,
        index_row.indisvalid as is_valid,
        index_row.indcheckxmin as check_xmin,
        index_row.indisready as is_ready,
        index_row.indislive as is_live,
        index_row.indisreplident as is_replica_identity,
        coalesce((
          select array_agg(
            case
              when key_column.attribute_number = 0
                then pg_catalog.pg_get_indexdef(
                  index_row.indexrelid,
                  key_column.ordinality::integer,
                  true
                )
              else attribute.attname::text
            end
            order by key_column.ordinality
          )
          from unnest(index_row.indkey::smallint[]) with ordinality
            as key_column(attribute_number, ordinality)
          left join pg_catalog.pg_attribute attribute
            on attribute.attrelid = index_row.indrelid
           and attribute.attnum = key_column.attribute_number
          where key_column.ordinality <= index_row.indnkeyatts
        ), array[]::text[]) as key_columns,
        coalesce((
          select array_agg(index_option.option_value::integer order by index_option.ordinality)
          from unnest(index_row.indoption::smallint[]) with ordinality
            as index_option(option_value, ordinality)
        ), array[]::integer[]) as key_options,
        coalesce((
          select array_agg(operator_class.opcname::text order by operator_key.ordinality)
          from unnest(index_row.indclass::oid[]) with ordinality
            as operator_key(operator_class_oid, ordinality)
          join pg_catalog.pg_opclass operator_class
            on operator_class.oid = operator_key.operator_class_oid
          where operator_key.ordinality <= index_row.indnkeyatts
        ), array[]::text[]) as opclasses,
        index_row.indnkeyatts::integer as key_attribute_count,
        index_row.indnatts::integer as attribute_count,
        pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid, true) as predicate,
        index_class.reltablespace = 0 as default_tablespace,
        index_class.reloptions as storage_options
      from pg_catalog.pg_index index_row
      join pg_catalog.pg_class index_class on index_class.oid = index_row.indexrelid
      join pg_catalog.pg_class table_class on table_class.oid = index_row.indrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = table_class.relnamespace
      join pg_catalog.pg_am access_method on access_method.oid = index_class.relam
      where namespace.nspname = 'public'
        and (
          table_class.relname = any($1::text[])
          or index_class.relname ~ '^my_world_faq_'
        )
      order by table_class.relname, index_class.relname
    `,
    [faqTableNames],
  )

  const functionResult = await client.query<FunctionRow>(`
    select
      namespace.nspname as schema_name,
      function_row.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid) as identity_arguments,
      pg_catalog.format_type(function_row.prorettype, null) as result_type,
      language.lanname as language,
      function_row.prokind::text as function_kind,
      function_row.provolatile::text as volatility,
      function_row.proparallel::text as parallel,
      function_row.prosecdef as security_definer,
      function_row.proleakproof as leakproof,
      function_row.proisstrict as strict,
      function_row.proretset as returns_set,
      function_row.proconfig as configuration,
      function_row.prosrc as source,
      pg_catalog.pg_get_userbyid(function_row.proowner) as owner,
      function_row.proacl::text as acl
    from pg_catalog.pg_proc function_row
    join pg_catalog.pg_namespace namespace on namespace.oid = function_row.pronamespace
    join pg_catalog.pg_language language on language.oid = function_row.prolang
    where namespace.nspname = 'public'
      and function_row.proname ~ 'my_world_faq'
    order by function_row.proname, identity_arguments
  `)

  const triggerResult = await client.query<TriggerRow>(
    `
      select
        table_class.relname as table_name,
        trigger_row.tgname as trigger_name,
        trigger_row.tgenabled::text as enabled,
        trigger_row.tgtype::integer as trigger_type,
        function_namespace.nspname as function_schema,
        function_row.proname as function_name,
        pg_catalog.pg_get_function_identity_arguments(function_row.oid) as function_arguments,
        trigger_row.tgnargs::integer as argument_count,
        encode(trigger_row.tgargs, 'escape') as arguments,
        trigger_row.tgattr::text as attribute_numbers,
        pg_catalog.pg_get_expr(trigger_row.tgqual, trigger_row.tgrelid, true)
          as when_expression
      from pg_catalog.pg_trigger trigger_row
      join pg_catalog.pg_class table_class on table_class.oid = trigger_row.tgrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = table_class.relnamespace
      join pg_catalog.pg_proc function_row on function_row.oid = trigger_row.tgfoid
      join pg_catalog.pg_namespace function_namespace
        on function_namespace.oid = function_row.pronamespace
      where namespace.nspname = 'public'
        and not trigger_row.tgisinternal
        and (
          table_class.relname = any($1::text[])
          or trigger_row.tgname ~ 'my_world_faq'
        )
      order by table_class.relname, trigger_row.tgname
    `,
    [faqTableNames],
  )

  const policyResult = await client.query<PolicyRow>(
    `
      select
        table_class.relname as table_name,
        policy_row.polname as policy_name,
        policy_row.polcmd::text as command,
        policy_row.polpermissive as permissive,
        coalesce((
          select array_agg(role_name.rolname::text order by role_name.rolname)
          from unnest(policy_row.polroles) as role_oid(oid)
          join pg_catalog.pg_roles role_name on role_name.oid = role_oid.oid
        ), array[]::text[]) as roles,
        pg_catalog.pg_get_expr(policy_row.polqual, policy_row.polrelid, true)
          as using_expression,
        pg_catalog.pg_get_expr(policy_row.polwithcheck, policy_row.polrelid, true)
          as check_expression
      from pg_catalog.pg_policy policy_row
      join pg_catalog.pg_class table_class on table_class.oid = policy_row.polrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = table_class.relnamespace
      where namespace.nspname = 'public'
        and (
          table_class.relname = any($1::text[])
          or policy_row.polname ~ 'my_world_faq'
        )
      order by table_class.relname, policy_row.polname
    `,
    [faqTableNames],
  )

  const defaultAclResult = await client.query<DefaultAclRow>(`
    select
      owner_role.rolname as owner,
      namespace.nspname as schema_name,
      default_acl.defaclobjtype::text as object_type,
      default_acl.defaclacl::text as acl
    from pg_catalog.pg_default_acl default_acl
    join pg_catalog.pg_roles owner_role on owner_role.oid = default_acl.defaclrole
    left join pg_catalog.pg_namespace namespace
      on namespace.oid = default_acl.defaclnamespace
    where owner_role.rolname = current_user
      and default_acl.defaclobjtype in ('r', 'f')
      and (
        default_acl.defaclnamespace = 0
        or namespace.nspname = 'public'
      )
    order by default_acl.defaclobjtype, namespace.nspname nulls first
  `)

  return {
    relations: relationResult.rows.map((row) => ({
      key: `${row.kind}:${row.name}`,
      name: row.name,
      kind: row.kind as RelationShape['kind'],
      persistence: row.persistence as RelationShape['persistence'],
      rowSecurity: row.row_security,
      forceRowSecurity: row.force_row_security,
      owner: row.owner,
      acl: row.acl,
    })),
    columns: columnResult.rows.map((row) => ({
      key: `${row.table_name}.${row.position}:${row.column_name}`,
      table: row.table_name,
      position: row.position,
      name: row.column_name,
      dataType: row.data_type,
      notNull: row.not_null,
      defaultExpression: normalizeExpression(row.default_expression),
      identity: row.identity,
      generated: row.generated,
    })),
    constraints: constraintResult.rows.map((row) => ({
      key: `${row.table_name}.${row.constraint_name}`,
      table: row.table_name,
      name: row.constraint_name,
      type: row.constraint_type as ConstraintShape['type'],
      columns: row.columns,
      referencedTable:
        row.referenced_schema && row.referenced_table
          ? `${row.referenced_schema}.${row.referenced_table}`
          : null,
      referencedColumns: row.referenced_columns,
      onUpdate: row.on_update,
      onDelete: row.on_delete,
      matchType: row.match_type,
      definition: canonicalConstraintDefinition(row.definition),
      deferrable: row.deferrable,
      deferred: row.deferred,
      validated: row.validated,
      noInherit: row.no_inherit,
    })),
    indexes: indexResult.rows.map((row) => ({
      key: `${row.table_name}.${row.index_name}`,
      table: row.table_name,
      name: row.index_name,
      method: row.method as IndexShape['method'],
      unique: row.is_unique,
      primary: row.is_primary,
      exclusion: row.is_exclusion,
      immediate: row.is_immediate,
      clustered: row.is_clustered,
      valid: row.is_valid,
      checkXmin: row.check_xmin,
      ready: row.is_ready,
      live: row.is_live,
      replicaIdentity: row.is_replica_identity,
      keyColumns: row.key_columns,
      keyOptions: row.key_options.map(Number),
      opclasses: row.opclasses,
      keyAttributeCount: row.key_attribute_count,
      attributeCount: row.attribute_count,
      predicate: normalizeExpression(row.predicate),
      defaultTablespace: row.default_tablespace,
      storageOptions: row.storage_options,
    })),
    functions: functionResult.rows.map((row) => ({
      key: `${row.schema_name}.${row.function_name}(${row.identity_arguments})`,
      schema: row.schema_name,
      name: row.function_name,
      identityArguments: row.identity_arguments,
      resultType: row.result_type,
      language: row.language,
      kind: row.function_kind,
      volatility: row.volatility,
      parallel: row.parallel,
      securityDefiner: row.security_definer,
      leakproof: row.leakproof,
      strict: row.strict,
      returnsSet: row.returns_set,
      configuration: row.configuration,
      source: normalizeRoutineBody(row.source),
      owner: row.owner,
      acl: row.acl,
    })),
    triggers: triggerResult.rows.map((row) => ({
      key: `${row.table_name}.${row.trigger_name}`,
      table: row.table_name,
      name: row.trigger_name,
      enabled: row.enabled,
      type: row.trigger_type,
      functionSchema: row.function_schema,
      functionName: row.function_name,
      functionArguments: row.function_arguments,
      argumentCount: row.argument_count,
      arguments: row.arguments,
      attributeNumbers: row.attribute_numbers,
      whenExpression: normalizeExpression(row.when_expression),
    })),
    policies: policyResult.rows.map((row) => ({
      key: `${row.table_name}.${row.policy_name}`,
      table: row.table_name,
      name: row.policy_name,
      command: row.command,
      permissive: row.permissive,
      roles: row.roles,
      usingExpression: normalizeExpression(row.using_expression),
      checkExpression: normalizeExpression(row.check_expression),
    })),
    defaultAcls: defaultAclResult.rows.map((row) => ({
      key: `${row.owner}.${row.schema_name ?? '<global>'}.${row.object_type}`,
      owner: row.owner,
      schema: row.schema_name,
      objectType: row.object_type,
      acl: row.acl,
    })),
  }
}

function ledgerMatches(actual: LedgerRow[], expected: LedgerEntry[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every(
      (row, index) =>
        row.created_at === expected[index]?.createdAt && row.hash === expected[index]?.hash,
    )
  )
}

function catalogIsEmpty(snapshot: CatalogSnapshot): boolean {
  return Object.values(snapshot).every((objects) => objects.length === 0)
}

function exactDifference<T extends { key: string }>(
  label: string,
  actual: T[],
  expected: T[],
): string | null {
  const actualByKey = new Map(actual.map((item) => [item.key, item]))
  const expectedByKey = new Map(expected.map((item) => [item.key, item]))
  const missing = [...expectedByKey.keys()].filter((key) => !actualByKey.has(key)).sort()
  const extra = [...actualByKey.keys()].filter((key) => !expectedByKey.has(key)).sort()
  const changed = [...expectedByKey.keys()]
    .flatMap((key) => {
      const actualItem = actualByKey.get(key)
      const expectedItem = expectedByKey.get(key)
      if (
        actualItem === undefined ||
        expectedItem === undefined ||
        JSON.stringify(actualItem) === JSON.stringify(expectedItem)
      ) {
        return []
      }

      const fields = Object.keys(expectedItem).filter(
        (field) =>
          JSON.stringify(Reflect.get(actualItem, field)) !==
          JSON.stringify(Reflect.get(expectedItem, field)),
      )
      return [`${key} [${fields.join(', ')}]`]
    })
    .sort()

  if (missing.length === 0 && extra.length === 0 && changed.length === 0) return null

  const parts = [
    missing.length > 0 ? `missing ${missing.join(', ')}` : null,
    extra.length > 0 ? `extra ${extra.join(', ')}` : null,
    changed.length > 0 ? `changed ${changed.join(', ')}` : null,
  ].filter((part): part is string => part !== null)

  return `${label}: ${parts.join('; ')}`
}

function catalogDifferences(snapshot: CatalogSnapshot, currentUser: string): string[] {
  const ownedRelations = expectedRelations.map((relation) => ({
    ...relation,
    owner: currentUser,
  }))
  const ownedFunctions = expectedFunctions.map((functionShape) => ({
    ...functionShape,
    owner: currentUser,
  }))

  return [
    exactDifference('relations', snapshot.relations, ownedRelations),
    exactDifference('columns', snapshot.columns, expectedColumns),
    exactDifference('constraints', snapshot.constraints, expectedConstraints),
    exactDifference('indexes', snapshot.indexes, expectedIndexes),
    exactDifference('functions', snapshot.functions, ownedFunctions),
    exactDifference('triggers', snapshot.triggers, expectedTriggers),
    exactDifference('policies', snapshot.policies, expectedPolicies),
    exactDifference('default ACLs', snapshot.defaultAcls, expectedDefaultAcls),
  ].filter((difference): difference is string => difference !== null)
}

function ledgerMismatchSummary(actual: LedgerRow[], expected: LedgerEntry[]): string {
  const mismatchedPositions = Array.from(
    { length: Math.max(actual.length, expected.length) },
    (_, index) => index,
  )
    .filter(
      (index) =>
        actual[index]?.created_at !== expected[index]?.createdAt ||
        actual[index]?.hash !== expected[index]?.hash,
    )
    .map((index) => expected[index]?.tag ?? `extra-row-${index + 1}`)

  return `rows=${actual.length}; mismatched=${mismatchedPositions.join(', ') || 'none'}`
}

async function inspectDatabase(expectedLedger: LedgerEntry[]): Promise<{
  state: MigrationState
  ledger: LedgerRow[]
  catalog: CatalogSnapshot
  identity: DatabaseIdentity
}> {
  const details = connectionDetails()
  const client = new Client({
    connectionString: details.connectionString,
    application_name: 'sensemaking-faq-migration-0005-verifier',
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
  })

  let connected = false
  let inTransaction = false

  try {
    await client.connect()
    connected = true
    await client.query('begin transaction isolation level repeatable read read only')
    inTransaction = true
    await client.query("set local lock_timeout = '5s'")
    await client.query("set local statement_timeout = '15s'")

    const identityRows = (
      await client.query<IdentityRow>(`
        select
          current_database() as database_name,
          current_user as user_name
      `)
    ).rows
    const identityRow = identityRows[0]
    if (
      identityRows.length !== 1 ||
      !identityRow ||
      !identityRow.database_name ||
      !identityRow.user_name
    ) {
      throw new VerificationFailure('STOP: could not establish a safe database identity')
    }
    const identity: DatabaseIdentity = {
      database: identityRow.database_name,
      user: identityRow.user_name,
      hostPortSha256: details.hostPortSha256,
    }

    const ledger = (
      await client.query<LedgerRow>(`
        select hash, created_at::text
        from drizzle.__drizzle_migrations
        order by created_at, id
      `)
    ).rows
    const catalog = await queryCatalog(client)

    await client.query('rollback')
    inTransaction = false

    const pendingLedger = expectedLedger.slice(0, -1)
    const pending = ledgerMatches(ledger, pendingLedger) && catalogIsEmpty(catalog)
    const differences = catalogDifferences(catalog, identity.user)
    const applied = ledgerMatches(ledger, expectedLedger) && differences.length === 0

    if (!pending && !applied) {
      const ledgerSummary = ledgerMismatchSummary(ledger, expectedLedger)
      const catalogSummary =
        differences.length > 0
          ? differences.join(' | ')
          : catalogIsEmpty(catalog)
            ? 'all FAQ objects are absent'
            : 'FAQ objects do not form an allowed state'
      throw new VerificationFailure(
        `STOP: migration 0005 is neither exact-pending nor exact-applied. Ledger ${ledgerSummary}. Catalog ${catalogSummary}.`,
      )
    }

    return { state: applied ? 'applied' : 'pending', ledger, catalog, identity }
  } finally {
    if (connected && inTransaction) {
      try {
        await client.query('rollback')
      } catch {
        // Preserve the original failure; connection cleanup below is best effort.
      }
    }
    if (connected) {
      await client.end().catch(() => undefined)
    }
  }
}

async function main(): Promise<void> {
  const expectedState = parseExpectedState(process.argv.slice(2))
  const expectedLedger = await loadExpectedLedger()
  const result = await inspectDatabase(expectedLedger)

  if (expectedState && result.state !== expectedState) {
    throw new VerificationFailure(
      `STOP: expected migration 0005 state ${expectedState}, found coherent state ${result.state}`,
    )
  }

  const appliedObjectCounts =
    result.state === 'applied'
      ? {
          tables: faqTableNames.length,
          constraints: result.catalog.constraints.length,
          indexes: result.catalog.indexes.length,
          functions: result.catalog.functions.length,
          triggers: result.catalog.triggers.length,
          policies: result.catalog.policies.length,
          defaultAcls: result.catalog.defaultAcls.length,
        }
      : 0

  console.log(
    JSON.stringify(
      {
        migration: targetMigration,
        state: result.state,
        databaseIdentity: result.identity,
        ledger: expectedLedger.slice(0, result.ledger.length).map((entry) => ({
          tag: entry.tag,
          createdAt: 'match',
          sha256: 'match',
        })),
        faqObjects: appliedObjectCounts,
      },
      null,
      2,
    ),
  )
}

main().catch((error: unknown) => {
  if (error instanceof VerificationFailure) {
    console.error(error.message)
  } else {
    const code =
      isRecord(error) && typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)
        ? ` (PostgreSQL code ${error.code})`
        : ''
    console.error(
      `STOP: migration verification could not complete${code}; database error details were withheld`,
    )
  }
  process.exitCode = 1
})
