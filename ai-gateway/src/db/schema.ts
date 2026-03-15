import { pgTable, text, integer, timestamp, pgEnum, serial, boolean } from "drizzle-orm/pg-core";
import { InferSelectModel } from "drizzle-orm/table";

export const userRoleEnum = pgEnum("user_role", ["anonymous", "logged"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const device = pgTable("device", {
  id: text("id").primaryKey(),

  os: text("os").notNull(),

  appVersion: text("app_version"),

  hostname: text("hostname"),

  fingerprint: text("fingerprint"), // Device Id unique to every machine

  // Link device to a user (when logged in)
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),

  // Refresh token for device authentication
  refreshToken: text("refresh_token"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at").defaultNow(),
});

// Premium credits tracking - separate from daily usage
export const premiumCredits = pgTable("premium_credits", {
  id: serial("id").primaryKey(),

  // Either device or user based
  deviceId: text("device_id").references(() => device.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),

  // Credit balance
  totalCredits: integer("total_credits").default(0).notNull(), // Total credits ever assigned
  usedCredits: integer("used_credits").default(0).notNull(), // Credits consumed
  
  // Last refill tracking
  lastRefillAt: timestamp("last_refill_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Detailed usage tracking for analytics
export const usageLog = pgTable("usage_log", {
  id: serial("id").primaryKey(),

  deviceId: text("device_id").references(() => device.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),

  // Model tracking
  modelUsed: text("model_used").notNull(),
  fallbackUsed: boolean("fallback_used").default(false),

  // Token usage
  promptTokens: integer("prompt_tokens").default(0).notNull(),
  completionTokens: integer("completion_tokens").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),

  // Request metadata
  role: text("role"), // GatewayRole: router, planner, executor, etc.
  userRole: userRoleEnum("user_role").default("anonymous"),

  // Credit tracking
  creditsCost: integer("credits_cost").default(0), // How many credits this request cost
  isPremiumRequest: boolean("is_premium_request").default(false),

  // Context window tracking
  contextWindowSize: integer("context_window_size").default(0),

  createdAt: timestamp("created_at").defaultNow(),
});

// Daily usage aggregation (for rate limiting)
export const dailyUsage = pgTable("daily_usage", {
  id: serial("id").primaryKey(),

  deviceId: text("device_id").references(() => device.id, { onDelete: "cascade" }).notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),

  // Date key for aggregation (YYYY-MM-DD format)
  dateKey: text("date_key").notNull(),

  // Daily counts
  requestCount: integer("request_count").default(0).notNull(),
  totalTokens: integer("total_tokens").default(0).notNull(),
  premiumCreditsUsed: integer("premium_credits_used").default(0).notNull(),

  // Per-minute tracking for rate limiting (rolling window)
  lastMinuteRequestCount: integer("last_minute_request_count").default(0),
  lastMinuteResetAt: timestamp("last_minute_reset_at").defaultNow(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Legacy usage table - keeping for backward compatibility
export const usage = pgTable("usage", {
  deviceId: text("device_id")
    .primaryKey()
    .references(() => device.id, { onDelete: "cascade" }),

  userId: text("user_id")
    .references(() => user.id, { onDelete: "set null" }),

  dailyCount: integer("daily_count").default(0),

  lastReset: timestamp("last_reset").notNull(),

  userRole: userRoleEnum("user_role").default("anonymous"),

  modalUsed: text("model_used"), // Track the model used for analytics and debugging

  // Track usage of the cheaper fallback model (optional, but good for analytics/abuse prevention)
  fallbackUsageCount: integer("fallback_usage_count").default(0),

  // Track tokens to help monitor context window limits and cost
  totalTokensUsed: integer("total_tokens_used").default(0),

  availablePremiumCredits: integer("available_premium_credits").default(0), // Track available premium credits for the user/device

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at").defaultNow(),
});


export type Device = InferSelectModel<typeof device>;
export type User = InferSelectModel<typeof user>;
export type Usage = InferSelectModel<typeof usage>;
export type PremiumCredits = InferSelectModel<typeof premiumCredits>;
export type UsageLog = InferSelectModel<typeof usageLog>;
export type DailyUsage = InferSelectModel<typeof dailyUsage>;