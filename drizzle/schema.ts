import { pgTable, pgSchema, foreignKey, unique, pgPolicy, uuid, text, numeric, timestamp, boolean, date, index, uniqueIndex, check, bigserial, integer, jsonb, bigint, primaryKey, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


const auth = pgSchema("auth");

export const usersInAuth = auth.table("users", {
	id: uuid("id").notNull(),
});

export const users = usersInAuth;



export const staple_ingredients = pgTable("staple_ingredients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	category: text(),
	quantity: numeric().notNull(),
	unit: text().notNull(),
	group_id: uuid().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	created_by: uuid(),
}, (table) => [
	foreignKey({
			columns: [table.created_by],
			foreignColumns: [users.id],
			name: "staple_ingredients_created_by_fkey"
		}),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "staple_ingredients_group_id_fkey"
		}).onDelete("cascade"),
	unique("staple_ingredients_group_id_name_key").on(table.name, table.group_id),
	pgPolicy("Members can view staple ingredients", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_group_member(group_id) OR is_group_owner(group_id))` }),
	pgPolicy("Members can create staple ingredients", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Members can update staple ingredients", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Members can delete staple ingredients", { as: "permissive", for: "delete", to: ["authenticated"] }),
]);

export const groups = pgTable("groups", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	owner_id: uuid().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.owner_id],
			foreignColumns: [users.id],
			name: "groups_owner_id_fkey"
		}),
	pgPolicy("Members can view groups", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((owner_id = auth.uid()) OR is_group_member(id))` }),
	pgPolicy("Owners can create groups", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Owners can update groups", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Owners can delete groups", { as: "permissive", for: "delete", to: ["authenticated"] }),
]);

export const ingredients = pgTable("ingredients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("ingredients_name_key").on(table.name),
	pgPolicy("Anyone can view ingredients", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Users can create ingredients", { as: "permissive", for: "insert", to: ["public"] }),
]);

export const meals = pgTable("meals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	category: text(),
	group_id: uuid(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	created_by: uuid(),
	weeknight_friendly: boolean().default(false).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.created_by],
			foreignColumns: [users.id],
			name: "meals_created_by_fkey"
		}),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "meals_group_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Members can view meals", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_group_member(group_id) OR is_group_owner(group_id))` }),
	pgPolicy("Members can create meals", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Members can update meals", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Members can delete meals", { as: "permissive", for: "delete", to: ["authenticated"] }),
]);

export const meal_calendar = pgTable("meal_calendar", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	meal_id: uuid(),
	group_id: uuid(),
	date: date().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "meal_calendar_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.meal_id],
			foreignColumns: [meals.id],
			name: "meal_calendar_meal_id_fkey"
		}).onDelete("cascade"),
	unique("meal_calendar_group_id_date_key").on(table.group_id, table.date),
	pgPolicy("Members can view meal calendar entries", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_group_member(group_id) OR is_group_owner(group_id))` }),
	pgPolicy("Members can create meal calendar entries", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Members can update meal calendar entries", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Members can delete meal calendar entries", { as: "permissive", for: "delete", to: ["authenticated"] }),
]);

export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	email: text().notNull(),
	first_name: text(),
	last_name: text(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "profiles_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Enable delete for users based on id", { as: "permissive", for: "delete", to: ["public"], using: sql`(auth.uid() = id)` }),
	pgPolicy("Enable insert for authenticated users", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Enable update for users based on id", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Profiles are viewable by everyone", { as: "permissive", for: "select", to: ["public"] }),
]);

export const group_invitations = pgTable("group_invitations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	group_id: uuid(),
	email: text().notNull(),
	invited_by: uuid(),
	status: text().default('pending').notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	expires_at: timestamp({ withTimezone: true, mode: 'string' }).default(sql`(now() + '7 days'::interval)`),
	email_delivery_status: text().default('pending').notNull(),
	email_delivery_provider: text(),
	email_delivery_external_id: text(),
	email_delivery_error: text(),
	email_delivery_attempted_at: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
	index("group_invitations_email_delivery_status_idx").using("btree", table.email_delivery_status.asc().nullsLast().op("timestamptz_ops"), table.created_at.desc().nullsFirst().op("text_ops")),
	uniqueIndex("group_invitations_pending_email_unique_idx").using("btree", sql`group_id`, sql`lower(email)`).where(sql`(status = 'pending'::text)`),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "group_invitations_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.invited_by],
			foreignColumns: [users.id],
			name: "group_invitations_invited_by_fkey"
		}),
	pgPolicy("Members can view invitations", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((invited_by = auth.uid()) OR is_group_member(group_id) OR is_group_owner(group_id) OR ((lower(email) = current_user_email()) AND (status = 'pending'::text) AND ((expires_at IS NULL) OR (expires_at > now()))))` }),
	pgPolicy("Members can create invitations", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Invitees can respond to pending invitations", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Inviters and owners can manage invitation status", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Inviters and owners can delete invitations", { as: "permissive", for: "delete", to: ["authenticated"] }),
	check("group_invitations_email_delivery_status_check", sql`email_delivery_status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])`),
	check("group_invitations_expires_after_created_check", sql`(expires_at IS NULL) OR (expires_at > created_at)`),
	check("group_invitations_pending_validity_check", sql`(status <> 'pending'::text) OR ((group_id IS NOT NULL) AND (invited_by IS NOT NULL) AND (expires_at IS NOT NULL))`),
	check("group_invitations_status_check", sql`status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text, 'revoked'::text])`),
]);

export const import_usage_events = pgTable("import_usage_events", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	request_id: uuid().notNull(),
	event_type: text().notNull(),
	source_type: text().notNull(),
	user_id: uuid(),
	group_id: uuid(),
	status_code: integer(),
	error_code: text(),
	error_message: text(),
	provider: text(),
	model: text(),
	cost_credits: integer().default(0).notNull(),
	cost_input_tokens: integer(),
	cost_output_tokens: integer(),
	cost_total_tokens: integer(),
	cost_usd: numeric({ precision: 12, scale:  6 }),
	latency_ms: integer(),
	input_bytes: integer(),
	output_ingredients_count: integer(),
	warnings_count: integer(),
	confidence: numeric({ precision: 4, scale:  3 }),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("import_usage_events_created_at_idx").using("btree", table.created_at.desc().nullsFirst().op("timestamptz_ops")),
	index("import_usage_events_group_created_at_idx").using("btree", table.group_id.asc().nullsLast().op("timestamptz_ops"), table.created_at.desc().nullsFirst().op("uuid_ops")),
	index("import_usage_events_request_id_idx").using("btree", table.request_id.asc().nullsLast().op("uuid_ops")),
	index("import_usage_events_source_type_created_at_idx").using("btree", table.source_type.asc().nullsLast().op("timestamptz_ops"), table.created_at.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "import_usage_events_group_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "import_usage_events_user_id_fkey"
		}).onDelete("set null"),
	check("import_usage_events_confidence_check", sql`(confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))`),
	check("import_usage_events_cost_credits_check", sql`cost_credits >= 0`),
	check("import_usage_events_cost_input_tokens_check", sql`(cost_input_tokens IS NULL) OR (cost_input_tokens >= 0)`),
	check("import_usage_events_cost_output_tokens_check", sql`(cost_output_tokens IS NULL) OR (cost_output_tokens >= 0)`),
	check("import_usage_events_cost_total_tokens_check", sql`(cost_total_tokens IS NULL) OR (cost_total_tokens >= 0)`),
	check("import_usage_events_cost_usd_check", sql`(cost_usd IS NULL) OR (cost_usd >= (0)::numeric)`),
	check("import_usage_events_event_type_check", sql`event_type = ANY (ARRAY['attempt'::text, 'success'::text, 'failure'::text])`),
	check("import_usage_events_input_bytes_check", sql`(input_bytes IS NULL) OR (input_bytes >= 0)`),
	check("import_usage_events_latency_ms_check", sql`(latency_ms IS NULL) OR (latency_ms >= 0)`),
	check("import_usage_events_output_ingredients_count_check", sql`(output_ingredients_count IS NULL) OR (output_ingredients_count >= 0)`),
	check("import_usage_events_source_type_check", sql`source_type = ANY (ARRAY['image'::text, 'url'::text, 'text'::text])`),
	check("import_usage_events_warnings_count_check", sql`(warnings_count IS NULL) OR (warnings_count >= 0)`),
]);

export const import_credit_accounts = pgTable("import_credit_accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scope_type: text().notNull(),
	user_id: uuid(),
	group_id: uuid(),
	plan_tier: text().default('free').notNull(),
	monthly_credits: integer().default(40).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("import_credit_accounts_group_id_unique_idx").using("btree", table.group_id.asc().nullsLast().op("uuid_ops")),
	index("import_credit_accounts_plan_tier_idx").using("btree", table.plan_tier.asc().nullsLast().op("text_ops")),
	uniqueIndex("import_credit_accounts_user_id_unique_idx").using("btree", table.user_id.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "import_credit_accounts_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "import_credit_accounts_user_id_fkey"
		}).onDelete("cascade"),
	check("import_credit_accounts_monthly_credits_check", sql`monthly_credits >= 0`),
	check("import_credit_accounts_scope_target_check", sql`((scope_type = 'user'::text) AND (user_id IS NOT NULL) AND (group_id IS NULL)) OR ((scope_type = 'group'::text) AND (group_id IS NOT NULL) AND (user_id IS NULL))`),
	check("import_credit_accounts_scope_type_check", sql`scope_type = ANY (ARRAY['user'::text, 'group'::text])`),
]);

export const import_credit_ledger = pgTable("import_credit_ledger", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	account_id: uuid().notNull(),
	period_start: date().notNull(),
	entry_type: text().notNull(),
	credits_delta: integer().notNull(),
	source_type: text(),
	request_id: uuid(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	usage_event_id: bigint({ mode: "number" }),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("import_credit_ledger_account_period_idx").using("btree", table.account_id.asc().nullsLast().op("date_ops"), table.period_start.asc().nullsLast().op("uuid_ops"), table.created_at.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("import_credit_ledger_monthly_allocation_unique_idx").using("btree", table.account_id.asc().nullsLast().op("uuid_ops"), table.period_start.asc().nullsLast().op("date_ops")).where(sql`(entry_type = 'monthly_allocation'::text)`),
	index("import_credit_ledger_request_id_idx").using("btree", table.request_id.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("import_credit_ledger_usage_event_unique_idx").using("btree", table.usage_event_id.asc().nullsLast().op("int8_ops")).where(sql`((usage_event_id IS NOT NULL) AND (entry_type = 'usage'::text))`),
	foreignKey({
			columns: [table.account_id],
			foreignColumns: [import_credit_accounts.id],
			name: "import_credit_ledger_account_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.usage_event_id],
			foreignColumns: [import_usage_events.id],
			name: "import_credit_ledger_usage_event_id_fkey"
		}).onDelete("set null"),
	check("import_credit_ledger_entry_type_check", sql`entry_type = ANY (ARRAY['monthly_allocation'::text, 'usage'::text, 'manual_adjustment'::text, 'refund'::text])`),
	check("import_credit_ledger_monthly_allocation_delta_check", sql`(entry_type <> 'monthly_allocation'::text) OR (credits_delta >= 0)`),
	check("import_credit_ledger_source_type_check", sql`(source_type IS NULL) OR (source_type = ANY (ARRAY['image'::text, 'url'::text, 'text'::text]))`),
	check("import_credit_ledger_usage_delta_check", sql`(entry_type <> 'usage'::text) OR (credits_delta <= 0)`),
]);

export const plans = pgTable("plans", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	stripe_price_id: text(),
	monthly_credits: integer().notNull(),
	active: boolean().default(true).notNull(),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("plans_code_key").on(table.code),
	unique("plans_stripe_price_id_key").on(table.stripe_price_id),
	pgPolicy("Authenticated can view active plans", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(active = true)` }),
	check("plans_monthly_credits_check", sql`monthly_credits >= 0`),
]);

export const subscriptions = pgTable("subscriptions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	group_id: uuid().notNull(),
	plan_id: uuid(),
	provider: text().default('stripe').notNull(),
	provider_customer_id: text(),
	provider_subscription_id: text(),
	status: text().default('inactive').notNull(),
	current_period_start: timestamp({ withTimezone: true, mode: 'string' }),
	current_period_end: timestamp({ withTimezone: true, mode: 'string' }),
	cancel_at_period_end: boolean().default(false).notNull(),
	grace_until: timestamp({ withTimezone: true, mode: 'string' }),
	last_webhook_event_id: text(),
	last_webhook_received_at: timestamp({ withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("subscriptions_group_id_provider_unique_idx").using("btree", table.group_id.asc().nullsLast().op("text_ops"), table.provider.asc().nullsLast().op("uuid_ops")),
	index("subscriptions_group_id_status_idx").using("btree", table.group_id.asc().nullsLast().op("uuid_ops"), table.status.asc().nullsLast().op("text_ops")),
	uniqueIndex("subscriptions_provider_subscription_id_unique_idx").using("btree", table.provider_subscription_id.asc().nullsLast().op("text_ops")).where(sql`(provider_subscription_id IS NOT NULL)`),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "subscriptions_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.plan_id],
			foreignColumns: [plans.id],
			name: "subscriptions_plan_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Group members can view subscriptions", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_group_owner(group_id) OR is_group_member(group_id))` }),
	check("subscriptions_status_check", sql`status = ANY (ARRAY['inactive'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text, 'unpaid'::text, 'paused'::text])`),
]);

export const entitlements = pgTable("entitlements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	scope_type: text().notNull(),
	user_id: uuid(),
	group_id: uuid(),
	feature_key: text().notNull(),
	status: text().default('active').notNull(),
	source: text().default('manual').notNull(),
	unlimited: boolean().default(false).notNull(),
	monthly_credits_override: integer(),
	plan_id: uuid(),
	subscription_id: uuid(),
	valid_from: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	valid_to: timestamp({ withTimezone: true, mode: 'string' }),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("entitlements_group_feature_idx").using("btree", table.group_id.asc().nullsLast().op("text_ops"), table.feature_key.asc().nullsLast().op("uuid_ops")).where(sql`(group_id IS NOT NULL)`),
	index("entitlements_scope_feature_status_idx").using("btree", table.scope_type.asc().nullsLast().op("text_ops"), table.feature_key.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("entitlements_user_feature_idx").using("btree", table.user_id.asc().nullsLast().op("text_ops"), table.feature_key.asc().nullsLast().op("text_ops")).where(sql`(user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "entitlements_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.plan_id],
			foreignColumns: [plans.id],
			name: "entitlements_plan_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.subscription_id],
			foreignColumns: [subscriptions.id],
			name: "entitlements_subscription_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "entitlements_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can view relevant entitlements", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(((scope_type = 'user'::text) AND (user_id = auth.uid())) OR ((scope_type = 'group'::text) AND (is_group_owner(group_id) OR is_group_member(group_id))))` }),
	check("entitlements_monthly_credits_override_check", sql`(monthly_credits_override IS NULL) OR (monthly_credits_override >= 0)`),
	check("entitlements_scope_target_check", sql`((scope_type = 'user'::text) AND (user_id IS NOT NULL) AND (group_id IS NULL)) OR ((scope_type = 'group'::text) AND (group_id IS NOT NULL) AND (user_id IS NULL))`),
	check("entitlements_scope_type_check", sql`scope_type = ANY (ARRAY['user'::text, 'group'::text])`),
	check("entitlements_status_check", sql`status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text])`),
	check("entitlements_valid_window_check", sql`(valid_to IS NULL) OR (valid_to > valid_from)`),
]);

export const credit_purchases = pgTable("credit_purchases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	group_id: uuid().notNull(),
	user_id: uuid(),
	provider: text().default('stripe').notNull(),
	provider_payment_intent_id: text(),
	provider_invoice_id: text(),
	credits: integer().notNull(),
	amount_cents: integer().notNull(),
	currency: text().default('usd').notNull(),
	status: text().default('pending').notNull(),
	metadata: jsonb().default({}).notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("credit_purchases_group_created_at_idx").using("btree", table.group_id.asc().nullsLast().op("timestamptz_ops"), table.created_at.desc().nullsFirst().op("timestamptz_ops")),
	uniqueIndex("credit_purchases_provider_payment_intent_unique_idx").using("btree", table.provider_payment_intent_id.asc().nullsLast().op("text_ops")).where(sql`(provider_payment_intent_id IS NOT NULL)`),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "credit_purchases_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "credit_purchases_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("Users can view relevant credit purchases", { as: "permissive", for: "select", to: ["authenticated"], using: sql`((user_id = auth.uid()) OR is_group_owner(group_id) OR is_group_member(group_id))` }),
	check("credit_purchases_amount_cents_check", sql`amount_cents >= 0`),
	check("credit_purchases_credits_check", sql`credits > 0`),
	check("credit_purchases_status_check", sql`status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text])`),
]);

export const meal_ingredients = pgTable("meal_ingredients", {
	meal_id: uuid().notNull(),
	ingredient_id: uuid().notNull(),
	quantity: numeric().notNull(),
	unit: text().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.ingredient_id],
			foreignColumns: [ingredients.id],
			name: "meal_ingredients_ingredient_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.meal_id],
			foreignColumns: [meals.id],
			name: "meal_ingredients_meal_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.meal_id, table.ingredient_id], name: "meal_ingredients_pkey"}),
	pgPolicy("Members can view meal ingredients", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM meals m
  WHERE ((m.id = meal_ingredients.meal_id) AND (is_group_member(m.group_id) OR is_group_owner(m.group_id)))))` }),
	pgPolicy("Members can create meal ingredients", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Members can update meal ingredients", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Members can delete meal ingredients", { as: "permissive", for: "delete", to: ["authenticated"] }),
]);

export const group_members = pgTable("group_members", {
	group_id: uuid().notNull(),
	user_id: uuid().notNull(),
	role: text().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "group_members_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.user_id],
			foreignColumns: [profiles.id],
			name: "group_members_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.group_id, table.user_id], name: "group_members_pkey"}),
	pgPolicy("Members can view group members", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(is_group_member(group_id) OR is_group_owner(group_id))` }),
	pgPolicy("Users can join groups as owner or invited member", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Members can leave groups and owners can remove members", { as: "permissive", for: "delete", to: ["authenticated"] }),
	check("group_members_role_check", sql`role = ANY (ARRAY['owner'::text, 'member'::text])`),
]);

export const import_rate_limits = pgTable("import_rate_limits", {
	user_id: uuid().notNull(),
	group_id: uuid().notNull(),
	window_started_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	request_count: integer().default(0).notNull(),
	updated_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("import_rate_limits_updated_at_idx").using("btree", table.updated_at.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
			columns: [table.group_id],
			foreignColumns: [groups.id],
			name: "import_rate_limits_group_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.user_id],
			foreignColumns: [users.id],
			name: "import_rate_limits_user_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.user_id, table.group_id], name: "import_rate_limits_pkey"}),
	check("import_rate_limits_request_count_check", sql`request_count >= 0`),
]);
export const import_usage_daily_report = pgView("import_usage_daily_report", {	usage_date: date(),
	source_type: text(),
	plan_tier: text(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	attempts: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	successes: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	failures: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	credits_charged: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	input_tokens: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	output_tokens: bigint({ mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	total_tokens: bigint({ mode: "number" }),
	estimated_cost_usd: numeric({ precision: 12, scale:  6 }),
}).as(sql`SELECT date_trunc('day'::text, iue.created_at)::date AS usage_date, iue.source_type, COALESCE(ica.plan_tier, 'unassigned'::text) AS plan_tier, count(*) FILTER (WHERE iue.event_type = 'attempt'::text) AS attempts, count(*) FILTER (WHERE iue.event_type = 'success'::text) AS successes, count(*) FILTER (WHERE iue.event_type = 'failure'::text) AS failures, COALESCE(sum(iue.cost_credits), 0::bigint) AS credits_charged, COALESCE(sum(iue.cost_input_tokens), 0::bigint) AS input_tokens, COALESCE(sum(iue.cost_output_tokens), 0::bigint) AS output_tokens, COALESCE(sum(iue.cost_total_tokens), 0::bigint) AS total_tokens, COALESCE(sum(iue.cost_usd), 0::numeric)::numeric(12,6) AS estimated_cost_usd FROM import_usage_events iue LEFT JOIN import_credit_accounts ica ON ica.scope_type = 'group'::text AND ica.group_id = iue.group_id GROUP BY (date_trunc('day'::text, iue.created_at)::date), iue.source_type, (COALESCE(ica.plan_tier, 'unassigned'::text))`);

export const import_usage_monthly_overage_report = pgView("import_usage_monthly_overage_report", {	period_start: date(),
	scope_type: text(),
	scope_id: uuid(),
	plan_tier: text(),
	included_credits: integer(),
	used_credits: integer(),
	overage_credits: integer(),
	remaining_credits: integer(),
}).as(sql`WITH monthly AS ( SELECT icl.period_start, ica.scope_type, COALESCE(ica.group_id, ica.user_id) AS scope_id, ica.plan_tier, COALESCE(sum( CASE WHEN icl.entry_type = 'monthly_allocation'::text THEN icl.credits_delta ELSE 0 END), 0::bigint)::integer AS included_credits, COALESCE(sum( CASE WHEN icl.entry_type = 'usage'::text THEN - icl.credits_delta ELSE 0 END), 0::bigint)::integer AS used_credits, COALESCE(sum(icl.credits_delta), 0::bigint)::integer AS remaining_credits FROM import_credit_ledger icl JOIN import_credit_accounts ica ON ica.id = icl.account_id GROUP BY icl.period_start, ica.scope_type, (COALESCE(ica.group_id, ica.user_id)), ica.plan_tier ) SELECT period_start, scope_type, scope_id, plan_tier, included_credits, used_credits, GREATEST(used_credits - included_credits, 0) AS overage_credits, remaining_credits FROM monthly`);
