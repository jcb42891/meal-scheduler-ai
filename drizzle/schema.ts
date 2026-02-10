import { pgTable, pgSchema, foreignKey, unique, pgPolicy, uuid, text, numeric, timestamp, boolean, date, index, uniqueIndex, check, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


const auth = pgSchema("auth");

export const usersInAuth = auth.table("users", {
	id: uuid("id").notNull(),
});


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
			foreignColumns: [usersInAuth.id],
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
			foreignColumns: [usersInAuth.id],
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
			foreignColumns: [usersInAuth.id],
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
			foreignColumns: [usersInAuth.id],
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
			foreignColumns: [usersInAuth.id],
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
