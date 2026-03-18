import { pgTable, text, integer, timestamp, pgEnum, serial, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { InferSelectModel } from "drizzle-orm/table";

export const userPlanEnum = pgEnum("user_plan", ["free", "premium"]);
export const userRoleEnum = pgEnum("user_role", ["anonymous", "logged"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  googleSubjectId: text("google_subject_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  plan: userPlanEnum("plan").default("free"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const device = pgTable("device", {
  id: text("id").primaryKey(),
  os: text("os").notNull(),
  appVersion: text("app_version"),
  hostname: text("hostname"),
  fingerprint: text("fingerprint"),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }).notNull(),
  deviceOs: text("device_os"),
  deviceHostname: text("device_hostname"),
  appVersion: text("app_version"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
  revoked: boolean("revoked").default(false),
  revokedAt: timestamp("revoked_at"),
  refreshTokenHash: text("refresh_token_hash"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
});

export const premiumCredits = pgTable("premium_credits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  deviceId: text("device_id"),
  totalCredits: integer("total_credits").default(0).notNull(),
  usedCredits: integer("used_credits").default(0).notNull(),
  lastRefillAt: timestamp("last_refill_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usageLog = pgTable("usage_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  deviceId: text("device_id"),
  modelUsed: text("model_used").notNull(),
  fallbackUsed: boolean("fallback_used").default(false),
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  role: text("role"),
  userRole: userRoleEnum("user_role").default("anonymous"),
  creditsCost: integer("credits_cost").default(0),
  isPremiumRequest: boolean("is_premium_request").default(false),
  contextWindowSize: integer("context_window_size").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailyUsage = pgTable(
  "daily_usage",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    deviceId: text("device_id"),
    dateKey: text("date_key").notNull(),
    requestCount: integer("request_count").default(0).notNull(),
    totalTokens: integer("total_tokens").default(0).notNull(),
    premiumCreditsUsed: integer("premium_credits_used").default(0).notNull(),
    lastMinuteRequestCount: integer("last_minute_request_count").default(0),
    lastMinuteResetAt: timestamp("last_minute_reset_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    userDateUnique: uniqueIndex("daily_usage_user_id_date_key_unique").on(table.userId, table.dateKey),
    deviceDateUnique: uniqueIndex("daily_usage_device_id_date_key_unique").on(table.deviceId, table.dateKey),
  }),
);

export type Device = InferSelectModel<typeof device>;
export type User = InferSelectModel<typeof user>;
export type Session = InferSelectModel<typeof session>;
export type PremiumCredits = InferSelectModel<typeof premiumCredits>;
export type UsageLog = InferSelectModel<typeof usageLog>;
export type DailyUsage = InferSelectModel<typeof dailyUsage>;