import { Schema } from "effect";

const INGEST_MAX_RETRIES = 5;

const IngestJobSchema = Schema.Struct({
  guildId: Schema.String,
  channelId: Schema.String,
  resumeBefore: Schema.optionalKey(Schema.String),
});

const WithdrawJobSchema = Schema.Struct({
  kind: Schema.Literal("withdraw"),
  guildId: Schema.String,
});

const MigrateJobSchema = Schema.Struct({ kind: Schema.Literal("migrate") });

const MessageIdsSchema = Schema.NonEmptyArray(Schema.String);

const RefreshJobSchema = Schema.Struct({
  kind: Schema.Literal("refresh"),
  guildId: Schema.String,
  channelId: Schema.String,
  messageIds: MessageIdsSchema,
});

const ForgetJobSchema = Schema.Struct({
  kind: Schema.Literal("forget"),
  guildId: Schema.String,
  channelId: Schema.String,
  messageIds: MessageIdsSchema,
});

const JoinJobSchema = Schema.Struct({
  kind: Schema.Literal("join"),
  guildId: Schema.String,
});

const SyncJobSchema = Schema.Struct({
  kind: Schema.Literal("sync"),
  guildId: Schema.String,
});

const GatewayJobSchema = Schema.Union([
  RefreshJobSchema,
  ForgetJobSchema,
  JoinJobSchema,
  SyncJobSchema,
]);

const QueueJobSchema = Schema.Union([WithdrawJobSchema, MigrateJobSchema, IngestJobSchema]);

type IngestJob = typeof IngestJobSchema.Type;

type GatewayJob = typeof GatewayJobSchema.Type;

type RefreshJob = typeof RefreshJobSchema.Type;

type ForgetJob = typeof ForgetJobSchema.Type;

type MessageJob = RefreshJob | ForgetJob;

type QueueJob = typeof QueueJobSchema.Type;

export { GatewayJobSchema, INGEST_MAX_RETRIES, QueueJobSchema };
export type { ForgetJob, GatewayJob, IngestJob, MessageJob, QueueJob, RefreshJob };
