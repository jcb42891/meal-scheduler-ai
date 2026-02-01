CREATE TABLE "staple_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"quantity" numeric NOT NULL,
	"unit" text NOT NULL,
	"group_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid
);

ALTER TABLE "staple_ingredients" ADD CONSTRAINT "staple_ingredients_group_id_name_key" UNIQUE ("group_id","name");

ALTER TABLE "staple_ingredients" ADD CONSTRAINT "staple_ingredients_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade;
ALTER TABLE "staple_ingredients" ADD CONSTRAINT "staple_ingredients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");

ALTER TABLE "staple_ingredients" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view staple ingredients in their groups" ON "staple_ingredients" AS PERMISSIVE FOR SELECT TO "public" USING (EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = staple_ingredients.group_id) AND (group_members.user_id = auth.uid()))));

CREATE POLICY "Users can create staple ingredients in their groups" ON "staple_ingredients" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = staple_ingredients.group_id) AND (group_members.user_id = auth.uid()))));

CREATE POLICY "Users can update staple ingredients in their groups" ON "staple_ingredients" AS PERMISSIVE FOR UPDATE TO "public" USING (EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = staple_ingredients.group_id) AND (group_members.user_id = auth.uid()))));

CREATE POLICY "Users can delete staple ingredients in their groups" ON "staple_ingredients" AS PERMISSIVE FOR DELETE TO "public" USING (EXISTS ( SELECT 1
   FROM group_members
  WHERE ((group_members.group_id = staple_ingredients.group_id) AND (group_members.user_id = auth.uid()))));
