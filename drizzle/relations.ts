import { relations } from "drizzle-orm/relations";
import { usersInAuth, groups, profiles, meal_calendar, meals, group_invitations, group_members, ingredients, meal_ingredients } from "./schema";

export const groupsRelations = relations(groups, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [groups.owner_id],
		references: [usersInAuth.id]
	}),
	meal_calendars: many(meal_calendar),
	group_invitations: many(group_invitations),
	meals: many(meals),
	group_members: many(group_members),
}));

export const usersInAuthRelations = relations(usersInAuth, ({many}) => ({
	groups: many(groups),
	profiles: many(profiles),
	group_invitations: many(group_invitations),
	meals: many(meals),
}));

export const profilesRelations = relations(profiles, ({one, many}) => ({
	usersInAuth: one(usersInAuth, {
		fields: [profiles.id],
		references: [usersInAuth.id]
	}),
	group_members: many(group_members),
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

export const mealsRelations = relations(meals, ({one, many}) => ({
	meal_calendars: many(meal_calendar),
	usersInAuth: one(usersInAuth, {
		fields: [meals.created_by],
		references: [usersInAuth.id]
	}),
	group: one(groups, {
		fields: [meals.group_id],
		references: [groups.id]
	}),
	meal_ingredients: many(meal_ingredients),
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