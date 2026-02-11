import { relations } from "drizzle-orm/relations";
import { usersInAuth, staple_ingredients, groups, meals, meal_calendar, profiles, group_invitations, import_usage_events, import_credit_accounts, import_credit_ledger, ingredients, meal_ingredients, group_members, import_rate_limits } from "./schema";

export const staple_ingredientsRelations = relations(staple_ingredients, ({one}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [staple_ingredients.created_by],
		references: [usersInAuth.id]
	}),
	group: one(groups, {
		fields: [staple_ingredients.group_id],
		references: [groups.id]
	}),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	staple_ingredients: many(staple_ingredients),
	groups: many(groups),
	meals: many(meals),
	profiles: many(profiles),
	group_invitations: many(group_invitations),
	import_usage_events: many(import_usage_events),
	import_credit_accounts: many(import_credit_accounts),
	import_rate_limits: many(import_rate_limits),
}));

export const groupsRelations = relations(groups, ({one, many}) => ({
	staple_ingredients: many(staple_ingredients),
	usersInAuth: one(usersInAuth, {
		fields: [groups.owner_id],
		references: [usersInAuth.id]
	}),
	meals: many(meals),
	meal_calendars: many(meal_calendar),
	group_invitations: many(group_invitations),
	import_usage_events: many(import_usage_events),
	import_credit_accounts: many(import_credit_accounts),
	group_members: many(group_members),
	import_rate_limits: many(import_rate_limits),
}));

export const mealsRelations = relations(meals, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [meals.created_by],
		references: [usersInAuth.id]
	}),
	group: one(groups, {
		fields: [meals.group_id],
		references: [groups.id]
	}),
	meal_calendars: many(meal_calendar),
	meal_ingredients: many(meal_ingredients),
}));

export const meal_calendarRelations = relations(meal_calendar, ({one}) => ({
	group: one(groups, {
		fields: [meal_calendar.group_id],
		references: [groups.id]
	}),
	meal: one(meals, {
		fields: [meal_calendar.meal_id],
		references: [meals.id]
	}),
}));

export const profilesRelations = relations(profiles, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
	group_members: many(group_members),
}));

export const group_invitationsRelations = relations(group_invitations, ({one}) => ({
	group: one(groups, {
		fields: [group_invitations.group_id],
		references: [groups.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [group_invitations.invited_by],
		references: [usersInAuth.id]
	}),
}));

export const import_usage_eventsRelations = relations(import_usage_events, ({one, many}) => ({
	group: one(groups, {
		fields: [import_usage_events.group_id],
		references: [groups.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [import_usage_events.user_id],
		references: [usersInAuth.id]
	}),
	import_credit_ledgers: many(import_credit_ledger),
}));

export const import_credit_accountsRelations = relations(import_credit_accounts, ({one, many}) => ({
	group: one(groups, {
		fields: [import_credit_accounts.group_id],
		references: [groups.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [import_credit_accounts.user_id],
		references: [usersInAuth.id]
	}),
	import_credit_ledgers: many(import_credit_ledger),
}));

export const import_credit_ledgerRelations = relations(import_credit_ledger, ({one}) => ({
	import_credit_account: one(import_credit_accounts, {
		fields: [import_credit_ledger.account_id],
		references: [import_credit_accounts.id]
	}),
	import_usage_event: one(import_usage_events, {
		fields: [import_credit_ledger.usage_event_id],
		references: [import_usage_events.id]
	}),
}));

export const meal_ingredientsRelations = relations(meal_ingredients, ({one}) => ({
	ingredient: one(ingredients, {
		fields: [meal_ingredients.ingredient_id],
		references: [ingredients.id]
	}),
	meal: one(meals, {
		fields: [meal_ingredients.meal_id],
		references: [meals.id]
	}),
}));

export const ingredientsRelations = relations(ingredients, ({many}) => ({
	meal_ingredients: many(meal_ingredients),
}));

export const group_membersRelations = relations(group_members, ({one}) => ({
	group: one(groups, {
		fields: [group_members.group_id],
		references: [groups.id]
	}),
	profile: one(profiles, {
		fields: [group_members.user_id],
		references: [profiles.id]
	}),
}));

export const import_rate_limitsRelations = relations(import_rate_limits, ({one}) => ({
	group: one(groups, {
		fields: [import_rate_limits.group_id],
		references: [groups.id]
	}),
	usersInAuth: one(usersInAuth, {
		fields: [import_rate_limits.user_id],
		references: [usersInAuth.id]
	}),
}));