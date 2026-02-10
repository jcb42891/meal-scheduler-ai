ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS email_delivery_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS email_delivery_provider text;

ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS email_delivery_external_id text;

ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS email_delivery_error text;

ALTER TABLE public.group_invitations
  ADD COLUMN IF NOT EXISTS email_delivery_attempted_at timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'group_invitations_email_delivery_status_check'
      AND conrelid = 'public.group_invitations'::regclass
  ) THEN
    ALTER TABLE public.group_invitations
      ADD CONSTRAINT group_invitations_email_delivery_status_check
      CHECK (email_delivery_status IN ('pending', 'sent', 'failed'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS group_invitations_email_delivery_status_idx
  ON public.group_invitations (email_delivery_status, created_at DESC);

UPDATE public.group_invitations
SET email_delivery_status = 'sent'
WHERE status = 'accepted'
  AND email_delivery_status = 'pending';

