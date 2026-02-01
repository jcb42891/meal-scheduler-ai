import { pgTable, foreignKey, pgPolicy, uuid, text, timestamp, unique, date, primaryKey, numeric } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



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
	pgPolicy("Authenticated users can create groups", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(auth.uid() = owner_id)`  }),
	pgPolicy("Group owners can delete their groups", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can view their groups", { as: "permissive", for: "select", to: ["public"] }),
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

export const ingredients = pgTable("ingredients", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("ingredients_name_key").on(table.name),
	pgPolicy("Anyone can view ingredients", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Users can create ingredients", { as: "permissive", for: "insert", to: ["public"] }),
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
	pgPolicy("Users can view meal_calendar entries for their groups", { as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = meal_calendar.group_id) AND (group_members.user_id = auth.uid()))))` }),
	pgPolicy("Users can manage meal_calendar entries for their groups", { as: "permissive", for: "all", to: ["public"] }),
]);

export const group_invitations = pgTable("group_invitations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	group_id: uuid(),
	email: text().notNull(),
	invited_by: uuid(),
	status: text().notNull(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	expires_at: timestamp({ withTimezone: true, mode: 'string' }),
}, (table) => [
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
	pgPolicy("Anyone can view their own invitations", { as: "permissive", for: "select", to: ["public"], using: sql`((email = (auth.jwt() ->> 'email'::text)) OR (invited_by = auth.uid()) OR (EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = group_invitations.group_id) AND (group_members.user_id = auth.uid())))))` }),
	pgPolicy("Group members can create invitations", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can accept their own invitations", { as: "permissive", for: "update", to: ["public"] }),
]);

export const meals = pgTable("meals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	category: text(),
	group_id: uuid(),
	created_at: timestamp({ withTimezone: true, mode: 'string' }).defaultNow(),
	created_by: uuid(),
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
	pgPolicy("Users can create meals in their groups", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = meals.group_id) AND (group_members.user_id = auth.uid()))))`  }),
	pgPolicy("Users can delete meals in their groups", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can update meals in their groups", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can view meals in their groups", { as: "permissive", for: "select", to: ["public"] }),
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
	primaryKey({ columns: [table.user_id, table.group_id], name: "group_members_pkey"}),
	pgPolicy("Anyone can view group members", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("Group owners can manage members", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can join groups via invitation", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Users can manage their own membership", { as: "permissive", for: "delete", to: ["public"] }),
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
	pgPolicy("Users can create meal ingredients", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`(EXISTS ( SELECT 1
   FROM (meals
     JOIN group_members ON ((meals.group_id = group_members.group_id)))
  WHERE ((meals.id = meal_ingredients.meal_id) AND (group_members.user_id = auth.uid()))))`  }),
	pgPolicy("Users can delete meal_ingredients in their groups", { as: "permissive", for: "delete", to: ["public"] }),
	pgPolicy("Users can view meal ingredients", { as: "permissive", for: "select", to: ["public"] }),
]);
