import { OverwriteType, Routes } from "discord-api-types/v10";
import type {
  APIAttachment,
  APIGuild,
  APIGuildChannel,
  APIGuildMember,
  APIMessage,
  APIMessageSnapshot,
  APIOverwrite,
  APIPartialGuild,
  APIUser,
  ChannelType,
  RESTGetAPIChannelThreadsArchivedPublicResult,
  RESTGetAPIGuildThreadsResult,
} from "discord-api-types/v10";
import { Array, Effect, Function, Option, Schema } from "effect";

import { callDiscord } from "./client.server";
import type { DiscordRequestError } from "./client.server";

const DATA_FIRST_ARITY = 2;

const PAGE_SIZE = 100;
const NOT_FOUND = 404;
const FORBIDDEN = 403;

const PermissionOverwrite = Schema.Struct({
  id: Schema.String,
  type: Schema.Enum(OverwriteType),
  allow: Schema.String,
  deny: Schema.String,
}) satisfies Schema.Codec<unknown, Pick<APIOverwrite, "id" | "type" | "allow" | "deny">>;

const Guild = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.optional(Schema.NullOr(Schema.String)),
  owner_id: Schema.String,
  system_channel_id: Schema.optional(Schema.NullOr(Schema.String)),
  roles: Schema.Array(Schema.Struct({ id: Schema.String, permissions: Schema.String })),
}) satisfies Schema.Codec<
  unknown,
  Pick<APIGuild, "id" | "name" | "icon" | "owner_id" | "system_channel_id" | "roles">
>;

const PartialGuild = Schema.Struct({ id: Schema.String }) satisfies Schema.Codec<
  unknown,
  Pick<APIPartialGuild, "id">
>;

const User = Schema.Struct({ id: Schema.String }) satisfies Schema.Codec<
  unknown,
  Pick<APIUser, "id">
>;

const Channel = Schema.Struct({
  id: Schema.String,
  type: Schema.Finite,
  name: Schema.optional(Schema.String),
  parent_id: Schema.optional(Schema.NullOr(Schema.String)),
  position: Schema.optional(Schema.Finite),
  permission_overwrites: Schema.optional(Schema.Array(PermissionOverwrite)),
  thread_metadata: Schema.optional(Schema.Struct({ archive_timestamp: Schema.String })),
}) satisfies Schema.Codec<
  unknown,
  Pick<
    APIGuildChannel<ChannelType>,
    "id" | "type" | "name" | "parent_id" | "position" | "permission_overwrites" | "thread_metadata"
  >
>;

const ThreadList = Schema.Struct({ threads: Schema.Array(Channel) }) satisfies Schema.Codec<
  unknown,
  Pick<RESTGetAPIGuildThreadsResult, "threads">
>;

const ArchivedThreadList = Schema.Struct({
  threads: Schema.Array(Channel),
  has_more: Schema.Boolean,
}) satisfies Schema.Codec<
  unknown,
  Pick<RESTGetAPIChannelThreadsArchivedPublicResult, "threads" | "has_more">
>;

const Attachment = Schema.Struct({
  filename: Schema.String,
  url: Schema.String,
  size: Schema.Finite,
  content_type: Schema.optional(Schema.String),
}) satisfies Schema.Codec<
  unknown,
  Pick<APIAttachment, "filename" | "url" | "size" | "content_type">
>;

const Author = Schema.Struct({
  id: Schema.String,
  username: Schema.String,
  global_name: Schema.optional(Schema.NullOr(Schema.String)),
}) satisfies Schema.Codec<unknown, Pick<APIUser, "id" | "username" | "global_name">>;

const MessageSnapshot = Schema.Struct({
  message: Schema.Struct({
    content: Schema.String,
    attachments: Schema.Array(Attachment),
  }),
}) satisfies Schema.Codec<unknown, Pick<APIMessageSnapshot, "message">>;

const Message = Schema.Struct({
  id: Schema.String,
  type: Schema.Finite,
  content: Schema.String,
  timestamp: Schema.DateTimeUtcFromString,
  edited_timestamp: Schema.NullOr(Schema.DateTimeUtcFromString),
  author: Author,
  attachments: Schema.Array(Attachment),
  message_snapshots: Schema.optional(Schema.Array(MessageSnapshot)),
}) satisfies Schema.Codec<
  unknown,
  Pick<
    APIMessage,
    | "id"
    | "type"
    | "content"
    | "timestamp"
    | "edited_timestamp"
    | "author"
    | "attachments"
    | "message_snapshots"
  >
>;

const Member = Schema.Struct({ roles: Schema.Array(Schema.String) }) satisfies Schema.Codec<
  unknown,
  Pick<APIGuildMember, "roles">
>;

type DiscordGuild = typeof Guild.Type;
type DiscordChannel = typeof Channel.Type;
type DiscordMessage = typeof Message.Type;
type DiscordMember = typeof Member.Type;

const listBotGuilds = callDiscord(Schema.Array(PartialGuild))({
  method: "GET",
  route: Routes.userGuilds(),
});

const getBotUserId: Effect.Effect<string, DiscordRequestError> = callDiscord(User)({
  method: "GET",
  route: Routes.user(),
}).pipe(Effect.map(({ id }) => id));

const leaveGuild = (guildId: string): Effect.Effect<void, DiscordRequestError> =>
  Effect.asVoid(
    callDiscord(Schema.Unknown)({ method: "DELETE", route: Routes.userGuild(guildId) }),
  );

const getGuild = (guildId: string): Effect.Effect<DiscordGuild, DiscordRequestError> =>
  callDiscord(Guild)({ method: "GET", route: Routes.guild(guildId) });

const listGuildChannels = (
  guildId: string,
): Effect.Effect<readonly DiscordChannel[], DiscordRequestError> =>
  callDiscord(Schema.Array(Channel))({ method: "GET", route: Routes.guildChannels(guildId) });

const listActiveThreads = (
  guildId: string,
): Effect.Effect<readonly DiscordChannel[], DiscordRequestError> =>
  callDiscord(ThreadList)({ method: "GET", route: Routes.guildActiveThreads(guildId) }).pipe(
    Effect.map(({ threads }) => threads),
  );

const listArchivedThreadsBefore = (
  channelId: string,
  before: Option.Option<string>,
): Effect.Effect<readonly DiscordChannel[], DiscordRequestError> => {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (Option.isSome(before)) {
    query.set("before", before.value);
  }
  return callDiscord(ArchivedThreadList)({
    method: "GET",
    route: `${Routes.channelThreads(channelId, "public")}?${query.toString()}`,
  }).pipe(
    Effect.flatMap(({ threads, has_more }) => {
      const next = Array.last(threads).pipe(
        Option.flatMap(({ thread_metadata }) => Option.fromUndefinedOr(thread_metadata)),
        Option.map(({ archive_timestamp }) => archive_timestamp),
        Option.filter(() => has_more),
      );
      return Option.match(next, {
        onNone: () => Effect.succeed(threads),
        onSome: (cursor) =>
          listArchivedThreadsBefore(channelId, Option.some(cursor)).pipe(
            Effect.map((older) => [...threads, ...older]),
          ),
      });
    }),
  );
};

const listArchivedThreads = (
  channelId: string,
): Effect.Effect<readonly DiscordChannel[], DiscordRequestError> =>
  listArchivedThreadsBefore(channelId, Option.none());

type MessagePage =
  | Readonly<{ direction: "latest" }>
  | Readonly<{ direction: "after" | "before"; cursor: string }>;

const listMessagesDataFirst = (
  channelId: string,
  page: MessagePage,
): Effect.Effect<readonly DiscordMessage[], DiscordRequestError> => {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (page.direction !== "latest") {
    query.set(page.direction, page.cursor);
  }
  return callDiscord(Schema.Array(Message))({
    method: "GET",
    route: `${Routes.channelMessages(channelId)}?${query.toString()}`,
  });
};

const listMessages: {
  (
    page: MessagePage,
  ): (channelId: string) => Effect.Effect<readonly DiscordMessage[], DiscordRequestError>;
  (
    channelId: string,
    page: MessagePage,
  ): Effect.Effect<readonly DiscordMessage[], DiscordRequestError>;
} = Function.dual(DATA_FIRST_ARITY, listMessagesDataFirst);

const findDiscord = <Body extends Schema.Top>(
  schema: Body,
  route: string,
): Effect.Effect<Option.Option<Body["Type"]>, DiscordRequestError, Body["DecodingServices"]> =>
  callDiscord(schema)({ method: "GET", route }).pipe(
    Effect.asSome,
    Effect.catchIf(
      (error) => Option.contains(error.status, NOT_FOUND),
      () => Effect.succeedNone,
    ),
  );

const findMemberDataFirst = (
  guildId: string,
  userId: string,
): Effect.Effect<Option.Option<DiscordMember>, DiscordRequestError> =>
  findDiscord(Member, Routes.guildMember(guildId, userId));

const findMember: {
  (
    userId: string,
  ): (guildId: string) => Effect.Effect<Option.Option<DiscordMember>, DiscordRequestError>;
  (
    guildId: string,
    userId: string,
  ): Effect.Effect<Option.Option<DiscordMember>, DiscordRequestError>;
} = Function.dual(DATA_FIRST_ARITY, findMemberDataFirst);

const findMessageDataFirst = (
  channelId: string,
  messageId: string,
): Effect.Effect<Option.Option<DiscordMessage>, DiscordRequestError> =>
  findDiscord(Message, Routes.channelMessage(channelId, messageId));

const findMessage: {
  (
    messageId: string,
  ): (channelId: string) => Effect.Effect<Option.Option<DiscordMessage>, DiscordRequestError>;
  (
    channelId: string,
    messageId: string,
  ): Effect.Effect<Option.Option<DiscordMessage>, DiscordRequestError>;
} = Function.dual(DATA_FIRST_ARITY, findMessageDataFirst);

export {
  FORBIDDEN,
  findMember,
  findMessage,
  getBotUserId,
  getGuild,
  leaveGuild,
  listActiveThreads,
  listArchivedThreads,
  listBotGuilds,
  listGuildChannels,
  listMessages,
  NOT_FOUND,
  PAGE_SIZE,
};
export type { DiscordChannel, DiscordGuild, DiscordMember, DiscordMessage, MessagePage };
