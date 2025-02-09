# Project Overview
You are creating a meal / grocery list planner web app. You will be using NextJS 14, Shadcn UI, Lucide Icons, TailwindCSS, TypeScript, and Supabase.

Please note that when we say "add", "edit", "delete", etc. we are talking about saving the changes to the database!

# Core Functionalities
Here's the converted content in Markdown format:

# Project Overview

You are creating a meal / grocery list planner web app using NextJS 14, Shadcn UI, Lucid, TailwindCSS, TypeScript, and Supabase.

When we say "add", "edit", "delete", etc., it means persisting changes to the database.

## Core Functionalities

### User Authentication

#### Sign Up & Login

- Use Supabase Auth to handle user signups and logins.
- On successful authentication, redirect the user to the main Calendar page (or a dashboard).


#### Logout

- Provide a logout action that clears the user's session/token.


#### Reset Password

- Users can reset their password via an email-based flow provided by Supabase.


#### Update Profile

- Users should be able to update their profile info (e.g., name, avatar) stored in a separate profiles table.


### User Groups Management (Dedicated Page)

#### Groups Page

- Accessible from the main navigation (e.g., a link labeled "Groups" or "Households").
- Displays all groups the user belongs to (queried via a group_members table).


#### Create Group

- A "Create Group" button at the top of the Groups Page.
- Clicking opens a modal or form prompting the user to name the group.
- On submission:

- Insert a new row into the groups table (with owner_id = current user).
- Insert a row into group_members linking the user to the newly created group (role = "owner" or "admin").





#### Invite Members

- For each group listed, the user can open a "Manage" view/modal showing:

- Current members (name, email, role).
- A form to invite new members by email or user ID.
- If the user exists, add them to group_members.
- If the user does not exist, optionally trigger an invite flow (implementation detail).



- Only an owner/admin can invite members and manage roles.


#### Leave Group

- A user can leave a group if they are not the sole owner.
- Removing themselves from group_members means they no longer see or manage that group's data.


#### Delete Group

- Only the owner can delete the group.
- A confirmation modal should appear: "Are you sure you want to delete this group? All associated meals and calendars will be removed."
- If confirmed, remove the group from groups, cascading to all related data (meals, meal_calendar, etc.) via foreign keys.


#### Navigation to Calendar

- Each group listing can include a "View Calendar" or "Go to Calendar" button to jump directly to that group's calendar.
- The main Calendar page should filter or display data specifically for the selected group.


### Create and Edit Meals Page

#### Create a Meal

- Users can create meals within the context of a selected group.
- Meal fields:

- Name, Description, Category (e.g. chicken, beef, vegetarian).
- Ingredients:

- Allow users to add new ingredients or select existing ones from a dropdown (searchable by name).
- Each ingredient has a quantity and unit of measure.






- Persist the meal with a group_id so only that group's members can see/edit it.


#### List of Existing Meals

- Display all meals belonging to the user's current group.
- Each meal can be opened in a modal for editing.
- Provide a "Delete Meal" button with a confirmation step to avoid accidental deletion.


### Calendar View (Main Page)

#### Monthly Calendar UI

- Displays the current month by default.
- Each day shows the meal planned for that day (if any).
- Each day has:

- A button to add a meal (if empty).
- A button to delete the meal (if one is planned).





#### Meal Detail Modal

- Clicking on an existing meal opens a modal with:

- Name, Description, Ingredients (with quantities/units).





#### Calendar Navigation

- Buttons or arrows for previous/next month.
- Show the current date at the top of the page (e.g., "February 2025").


#### Multiple Groups

- If a user belongs to multiple groups, allow a way to select or switch between groups (e.g., a dropdown or separate route).


### Grocery List Generation

#### Select Date Range

- Users select a range of days in the calendar to gather required ingredients.


#### Generate Grocery List

- Summarize all ingredients from the selected meals.
- Calculate total quantities and display them grouped by ingredient.


#### Modal Display & Copy

- Display the compiled grocery list in a clean format.
- Include a "Copy to Clipboard" button to quickly copy the list.


## Additional Implementation Details

### Database & Authorization

#### Schema

- `groups`: Holds group/household data (id, name, owner_id).
- `group_members`: Links users to groups (group_id, user_id, role).
- `meals`, `meal_ingredients`, `ingredients`: Meals reference group_id so only group members can see them.
- `meal_calendar`: Assigns a meal to a date for a specific group.


#### Row-Level Security (RLS)

- Enable RLS on all tables referencing group_id.
- Only allow SELECT/INSERT/UPDATE/DELETE if the auth.uid() is in group_members for that group_id.
- This ensures no cross-group data leaks.


#### Multi-Group Calendars

- Users with multiple groups can switch group contexts on the Calendar page or in a dropdown.
- Always attach the correct group_id when creating/editing meals or calendar entries.


### Sample User Flow

1. **User Logs In**

1. Brought to the Calendar page. If they have multiple groups, default to their first group or show a group selection dropdown.



2. **User Navigates to "Groups" Page**

1. Sees a list of groups they belong to.
2. Can Create a new group, Manage existing groups, Invite members, etc.



3. **User Goes to "Meals" Page**

1. Sees all meals for the current group.
2. Creates or edits meals, specifying name, description, and ingredients.



4. **User Checks Calendar**

1. The selected group's meals appear on the calendar.
2. Users can assign meals to dates, view details, generate grocery lists.



5. **User Logs Out**

1. Session is cleared; they must log in again for access.
  




# Doc
You will be using the following tools:

Essential

Next.js (14+), React, TypeScript
Tailwind CSS (+ PostCSS, autoprefixer)
Shadcn UI (and its dependencies like Radix)
Supabase (via @supabase/supabase-js and possibly @supabase/auth-helpers-nextjs)
Lucid (if you’re using it for diagramming/design or if it’s a required UI library in your workflow)

Recommended

react-hook-form or Formik for forms
Zod or Yup for validation
date-fns or dayjs for date manipulation
ESLint + Prettier for code quality
An icons package (Lucide or Heroicons)

# Current File Structure
meal-scheduler/
├── .next/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── cursornotes/
│   └── instructions.md
├── lib/
│   └── utils.ts
├── node_modules/
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── .gitignore
├── components.json
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── postcss.config.mjs
├── README.md
├── tailwind.config.ts
└── tsconfig.json