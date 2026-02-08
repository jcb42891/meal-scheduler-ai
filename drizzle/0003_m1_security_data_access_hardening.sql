CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(lower(auth.jwt() ->> 'email'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm
    WHERE gm.group_id = target_group_id
      AND gm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(target_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = target_group_id
      AND g.owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_group_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.normalize_group_invitation_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    NEW.email := lower(trim(NEW.email));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_group_invitation_email_trigger ON public.group_invitations;
CREATE TRIGGER normalize_group_invitation_email_trigger
BEFORE INSERT OR UPDATE OF email ON public.group_invitations
FOR EACH ROW
EXECUTE FUNCTION public.normalize_group_invitation_email();

CREATE OR REPLACE FUNCTION public.enforce_group_member_owner_role()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'owner' AND NOT EXISTS (
    SELECT 1
    FROM public.groups g
    WHERE g.id = NEW.group_id
      AND g.owner_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'group_members owner role must match groups.owner_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_group_member_owner_role_trigger ON public.group_members;
CREATE TRIGGER enforce_group_member_owner_role_trigger
BEFORE INSERT OR UPDATE OF group_id, user_id, role ON public.group_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_group_member_owner_role();

UPDATE public.group_invitations
SET email = lower(trim(email))
WHERE email IS NOT NULL
  AND email <> lower(trim(email));

UPDATE public.group_invitations
SET expires_at = COALESCE(expires_at, created_at + interval '7 days')
WHERE status = 'pending';

UPDATE public.group_invitations
SET status = 'expired'
WHERE status = 'pending'
  AND (
    group_id IS NULL
    OR invited_by IS NULL
    OR (expires_at IS NOT NULL AND expires_at <= now())
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_invitations_status_check'
      AND conrelid = 'public.group_invitations'::regclass
  ) THEN
    ALTER TABLE public.group_invitations
      ADD CONSTRAINT group_invitations_status_check
      CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'revoked'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_invitations_pending_validity_check'
      AND conrelid = 'public.group_invitations'::regclass
  ) THEN
    ALTER TABLE public.group_invitations
      ADD CONSTRAINT group_invitations_pending_validity_check
      CHECK (
        status <> 'pending'
        OR (
          group_id IS NOT NULL
          AND invited_by IS NOT NULL
          AND expires_at IS NOT NULL
        )
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_invitations_expires_after_created_check'
      AND conrelid = 'public.group_invitations'::regclass
  ) THEN
    ALTER TABLE public.group_invitations
      ADD CONSTRAINT group_invitations_expires_after_created_check
      CHECK (expires_at IS NULL OR expires_at > created_at);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_members_role_check'
      AND conrelid = 'public.group_members'::regclass
  ) THEN
    ALTER TABLE public.group_members
      ADD CONSTRAINT group_members_role_check
      CHECK (role IN ('owner', 'member'));
  END IF;
END
$$;

ALTER TABLE public.group_invitations
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE public.group_invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days');

CREATE UNIQUE INDEX IF NOT EXISTS group_invitations_pending_email_unique_idx
  ON public.group_invitations (group_id, lower(email))
  WHERE status = 'pending';

DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.groups;
DROP POLICY IF EXISTS "Group owners can delete their groups" ON public.groups;
DROP POLICY IF EXISTS "Users can view their groups" ON public.groups;
DROP POLICY IF EXISTS "Members can view groups" ON public.groups;
DROP POLICY IF EXISTS "Owners can create groups" ON public.groups;
DROP POLICY IF EXISTS "Owners can update groups" ON public.groups;
DROP POLICY IF EXISTS "Owners can delete groups" ON public.groups;

CREATE POLICY "Members can view groups"
ON public.groups
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (owner_id = auth.uid() OR public.is_group_member(id));

CREATE POLICY "Owners can create groups"
ON public.groups
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update groups"
ON public.groups
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete groups"
ON public.groups
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Group owners can manage members" ON public.group_members;
DROP POLICY IF EXISTS "Users can join groups via invitation" ON public.group_members;
DROP POLICY IF EXISTS "Users can manage their own membership" ON public.group_members;
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can join groups as owner or invited member" ON public.group_members;
DROP POLICY IF EXISTS "Members can leave groups and owners can remove members" ON public.group_members;

CREATE POLICY "Members can view group members"
ON public.group_members
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id));

CREATE POLICY "Users can join groups as owner or invited member"
ON public.group_members
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    (role = 'owner' AND public.is_group_owner(group_id))
    OR (
      role = 'member'
      AND EXISTS (
        SELECT 1
        FROM public.group_invitations gi
        WHERE gi.group_id = group_members.group_id
          AND lower(gi.email) = public.current_user_email()
          AND gi.status = 'pending'
          AND (gi.expires_at IS NULL OR gi.expires_at > now())
      )
    )
  )
);

CREATE POLICY "Members can leave groups and owners can remove members"
ON public.group_members
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  (auth.uid() = user_id AND role <> 'owner')
  OR (public.is_group_owner(group_id) AND role <> 'owner')
);

DROP POLICY IF EXISTS "Anyone can view their own invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Group members can create invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Users can accept their own invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Members can view invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Members can create invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Invitees can respond to pending invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Inviters and owners can manage invitation status" ON public.group_invitations;
DROP POLICY IF EXISTS "Inviters and owners can delete invitations" ON public.group_invitations;

CREATE POLICY "Members can view invitations"
ON public.group_invitations
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  invited_by = auth.uid()
  OR public.is_group_member(group_id)
  OR public.is_group_owner(group_id)
  OR (
    lower(email) = public.current_user_email()
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  )
);

CREATE POLICY "Members can create invitations"
ON public.group_invitations
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_group_member(group_id) OR public.is_group_owner(group_id))
  AND invited_by = auth.uid()
  AND status = 'pending'
  AND (expires_at IS NULL OR expires_at > now())
);

CREATE POLICY "Invitees can respond to pending invitations"
ON public.group_invitations
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  lower(email) = public.current_user_email()
  AND status = 'pending'
  AND (expires_at IS NULL OR expires_at > now())
)
WITH CHECK (
  lower(email) = public.current_user_email()
  AND status IN ('accepted', 'declined')
);

CREATE POLICY "Inviters and owners can manage invitation status"
ON public.group_invitations
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (invited_by = auth.uid() OR public.is_group_owner(group_id))
WITH CHECK (
  (invited_by = auth.uid() OR public.is_group_owner(group_id))
  AND status IN ('pending', 'revoked', 'expired')
);

CREATE POLICY "Inviters and owners can delete invitations"
ON public.group_invitations
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (invited_by = auth.uid() OR public.is_group_owner(group_id));

DROP POLICY IF EXISTS "Users can create meals in their groups" ON public.meals;
DROP POLICY IF EXISTS "Users can delete meals in their groups" ON public.meals;
DROP POLICY IF EXISTS "Users can update meals in their groups" ON public.meals;
DROP POLICY IF EXISTS "Users can view meals in their groups" ON public.meals;
DROP POLICY IF EXISTS "Members can view meals" ON public.meals;
DROP POLICY IF EXISTS "Members can create meals" ON public.meals;
DROP POLICY IF EXISTS "Members can update meals" ON public.meals;
DROP POLICY IF EXISTS "Members can delete meals" ON public.meals;

CREATE POLICY "Members can view meals"
ON public.meals
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id));

CREATE POLICY "Members can create meals"
ON public.meals
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_group_member(group_id) OR public.is_group_owner(group_id))
  AND created_by = auth.uid()
);

CREATE POLICY "Members can update meals"
ON public.meals
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id))
WITH CHECK (public.is_group_member(group_id) OR public.is_group_owner(group_id));

CREATE POLICY "Members can delete meals"
ON public.meals
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id));

DROP POLICY IF EXISTS "Users can view meal_calendar entries for their groups" ON public.meal_calendar;
DROP POLICY IF EXISTS "Users can manage meal_calendar entries for their groups" ON public.meal_calendar;
DROP POLICY IF EXISTS "Members can view meal calendar entries" ON public.meal_calendar;
DROP POLICY IF EXISTS "Members can create meal calendar entries" ON public.meal_calendar;
DROP POLICY IF EXISTS "Members can update meal calendar entries" ON public.meal_calendar;
DROP POLICY IF EXISTS "Members can delete meal calendar entries" ON public.meal_calendar;

CREATE POLICY "Members can view meal calendar entries"
ON public.meal_calendar
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id));

CREATE POLICY "Members can create meal calendar entries"
ON public.meal_calendar
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_group_member(group_id) OR public.is_group_owner(group_id))
  AND (
    meal_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.meals m
      WHERE m.id = meal_calendar.meal_id
        AND m.group_id = meal_calendar.group_id
    )
  )
);

CREATE POLICY "Members can update meal calendar entries"
ON public.meal_calendar
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id))
WITH CHECK (
  (public.is_group_member(group_id) OR public.is_group_owner(group_id))
  AND (
    meal_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.meals m
      WHERE m.id = meal_calendar.meal_id
        AND m.group_id = meal_calendar.group_id
    )
  )
);

CREATE POLICY "Members can delete meal calendar entries"
ON public.meal_calendar
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id));

DROP POLICY IF EXISTS "Users can create staple ingredients in their groups" ON public.staple_ingredients;
DROP POLICY IF EXISTS "Users can delete staple ingredients in their groups" ON public.staple_ingredients;
DROP POLICY IF EXISTS "Users can update staple ingredients in their groups" ON public.staple_ingredients;
DROP POLICY IF EXISTS "Users can view staple ingredients in their groups" ON public.staple_ingredients;
DROP POLICY IF EXISTS "Members can view staple ingredients" ON public.staple_ingredients;
DROP POLICY IF EXISTS "Members can create staple ingredients" ON public.staple_ingredients;
DROP POLICY IF EXISTS "Members can update staple ingredients" ON public.staple_ingredients;
DROP POLICY IF EXISTS "Members can delete staple ingredients" ON public.staple_ingredients;

CREATE POLICY "Members can view staple ingredients"
ON public.staple_ingredients
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id));

CREATE POLICY "Members can create staple ingredients"
ON public.staple_ingredients
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (public.is_group_member(group_id) OR public.is_group_owner(group_id))
  AND created_by = auth.uid()
);

CREATE POLICY "Members can update staple ingredients"
ON public.staple_ingredients
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id))
WITH CHECK (public.is_group_member(group_id) OR public.is_group_owner(group_id));

CREATE POLICY "Members can delete staple ingredients"
ON public.staple_ingredients
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (public.is_group_member(group_id) OR public.is_group_owner(group_id));

DROP POLICY IF EXISTS "Users can create meal ingredients" ON public.meal_ingredients;
DROP POLICY IF EXISTS "Users can delete meal_ingredients in their groups" ON public.meal_ingredients;
DROP POLICY IF EXISTS "Users can view meal ingredients" ON public.meal_ingredients;
DROP POLICY IF EXISTS "Members can view meal ingredients" ON public.meal_ingredients;
DROP POLICY IF EXISTS "Members can create meal ingredients" ON public.meal_ingredients;
DROP POLICY IF EXISTS "Members can update meal ingredients" ON public.meal_ingredients;
DROP POLICY IF EXISTS "Members can delete meal ingredients" ON public.meal_ingredients;

CREATE POLICY "Members can view meal ingredients"
ON public.meal_ingredients
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.meals m
    WHERE m.id = meal_ingredients.meal_id
      AND (public.is_group_member(m.group_id) OR public.is_group_owner(m.group_id))
  )
);

CREATE POLICY "Members can create meal ingredients"
ON public.meal_ingredients
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.meals m
    WHERE m.id = meal_ingredients.meal_id
      AND (public.is_group_member(m.group_id) OR public.is_group_owner(m.group_id))
  )
);

CREATE POLICY "Members can update meal ingredients"
ON public.meal_ingredients
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.meals m
    WHERE m.id = meal_ingredients.meal_id
      AND (public.is_group_member(m.group_id) OR public.is_group_owner(m.group_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.meals m
    WHERE m.id = meal_ingredients.meal_id
      AND (public.is_group_member(m.group_id) OR public.is_group_owner(m.group_id))
  )
);

CREATE POLICY "Members can delete meal ingredients"
ON public.meal_ingredients
AS PERMISSIVE
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.meals m
    WHERE m.id = meal_ingredients.meal_id
      AND (public.is_group_member(m.group_id) OR public.is_group_owner(m.group_id))
  )
);
