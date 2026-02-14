ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.subscriptions AS s
SET user_id = g.owner_id
FROM public.groups AS g
WHERE s.group_id = g.id
  AND s.user_id IS NULL;

DELETE FROM public.subscriptions
WHERE user_id IS NULL;

WITH ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.user_id, s.provider
      ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST, s.id DESC
    ) AS rn
  FROM public.subscriptions AS s
  WHERE s.user_id IS NOT NULL
)
DELETE FROM public.subscriptions AS s
USING ranked AS r
WHERE s.id = r.id
  AND r.rn > 1;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_group_id_fkey;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;

ALTER TABLE public.subscriptions
  ALTER COLUMN user_id SET NOT NULL;

DROP INDEX IF EXISTS public.subscriptions_group_id_provider_unique_idx;
DROP INDEX IF EXISTS public.subscriptions_group_id_status_idx;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_provider_unique_idx
  ON public.subscriptions (user_id, provider);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_status_idx
  ON public.subscriptions (user_id, status);

DROP POLICY IF EXISTS "Group members can view subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.subscriptions
  DROP COLUMN IF EXISTS group_id;

DROP FUNCTION IF EXISTS public.sync_group_import_account_for_plan(uuid, text, integer, boolean);
DROP FUNCTION IF EXISTS public.get_group_magic_import_status(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.consume_group_import_credits(uuid, text, integer, uuid, bigint, integer);

CREATE OR REPLACE FUNCTION public.sync_user_import_account_for_plan(
  p_user_id uuid,
  p_plan_tier text,
  p_monthly_credits integer,
  p_preserve_current_period_allocation boolean DEFAULT true
)
RETURNS TABLE (
  account_id uuid,
  plan_tier text,
  monthly_credits integer,
  period_start date,
  period_credits integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamp with time zone := now();
  v_period_start date := date_trunc('month', CURRENT_DATE::timestamp)::date;
  v_account public.import_credit_accounts;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_monthly_credits < 0 OR p_monthly_credits > 1000000 THEN
    RAISE EXCEPTION 'monthly_credits must be between 0 and 1000000.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.import_credit_accounts AS ica (
    scope_type,
    user_id,
    plan_tier,
    monthly_credits,
    created_at,
    updated_at
  )
  VALUES (
    'user',
    p_user_id,
    COALESCE(NULLIF(trim(p_plan_tier), ''), 'free'),
    p_monthly_credits,
    v_now,
    v_now
  )
  ON CONFLICT (user_id)
  DO UPDATE
  SET
    plan_tier = EXCLUDED.plan_tier,
    monthly_credits = EXCLUDED.monthly_credits,
    updated_at = EXCLUDED.updated_at
  RETURNING *
  INTO v_account;

  INSERT INTO public.import_credit_ledger AS icl (
    account_id,
    period_start,
    entry_type,
    credits_delta,
    metadata
  )
  VALUES (
    v_account.id,
    v_period_start,
    'monthly_allocation',
    v_account.monthly_credits,
    jsonb_build_object('plan_tier', v_account.plan_tier, 'synced_at', v_now)
  )
  ON CONFLICT (account_id, period_start)
  WHERE (entry_type = 'monthly_allocation')
  DO UPDATE
  SET
    credits_delta = CASE
      WHEN p_preserve_current_period_allocation THEN GREATEST(icl.credits_delta, EXCLUDED.credits_delta)
      ELSE EXCLUDED.credits_delta
    END,
    metadata = EXCLUDED.metadata;

  SELECT l.credits_delta
  INTO period_credits
  FROM public.import_credit_ledger AS l
  WHERE l.account_id = v_account.id
    AND l.period_start = v_period_start
    AND l.entry_type = 'monthly_allocation'
  LIMIT 1;

  account_id := v_account.id;
  plan_tier := v_account.plan_tier;
  monthly_credits := v_account.monthly_credits;
  period_start := v_period_start;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_magic_import_status(
  p_user_id uuid,
  p_source_type text,
  p_required_credits integer DEFAULT 1,
  p_default_monthly_credits integer DEFAULT 40
)
RETURNS TABLE (
  allowed boolean,
  reason_code text,
  plan_tier text,
  period_start date,
  monthly_credits integer,
  used_credits integer,
  remaining_credits integer,
  required_credits integer,
  is_unlimited boolean,
  has_active_subscription boolean,
  grace_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_now timestamp with time zone := now();
  v_balance RECORD;
  v_subscription RECORD;
  v_unlimited boolean := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_type NOT IN ('image', 'url', 'text') THEN
    RAISE EXCEPTION 'source_type must be image, url, or text.'
      USING ERRCODE = '22023';
  END IF;

  IF p_required_credits <= 0 OR p_required_credits > 1000 THEN
    RAISE EXCEPTION 'required_credits must be between 1 and 1000.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_service_role AND (
    v_auth_user_id IS NULL OR v_auth_user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'You can only access your own import entitlement status.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.entitlements AS e
    WHERE e.feature_key = 'magic_import'
      AND e.status = 'active'
      AND e.unlimited = true
      AND e.valid_from <= v_now
      AND (e.valid_to IS NULL OR e.valid_to > v_now)
      AND e.scope_type = 'user'
      AND e.user_id = p_user_id
  )
  INTO v_unlimited;

  SELECT *
  INTO v_balance
  FROM public.get_import_monthly_credit_balance(
    p_scope_type => 'user',
    p_scope_id => p_user_id,
    p_default_monthly_credits => p_default_monthly_credits
  )
  LIMIT 1;

  SELECT
    s.status,
    s.grace_until
  INTO v_subscription
  FROM public.subscriptions AS s
  WHERE s.user_id = p_user_id
  ORDER BY s.updated_at DESC
  LIMIT 1;

  grace_active := COALESCE(v_subscription.grace_until > v_now, false);
  has_active_subscription := COALESCE(v_subscription.status IN ('trialing', 'active'), false) OR grace_active;

  required_credits := p_required_credits;
  plan_tier := COALESCE(v_balance.plan_tier, 'free');
  period_start := v_balance.period_start;
  monthly_credits := COALESCE(v_balance.monthly_credits, p_default_monthly_credits);
  used_credits := COALESCE(v_balance.used_credits, 0);
  remaining_credits := COALESCE(v_balance.remaining_credits, 0);
  is_unlimited := v_unlimited;
  allowed := v_unlimited OR remaining_credits >= required_credits;
  reason_code := CASE WHEN allowed THEN NULL ELSE 'quota_exceeded' END;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_user_import_credits(
  p_user_id uuid,
  p_source_type text,
  p_credits integer DEFAULT 1,
  p_request_id uuid DEFAULT NULL,
  p_usage_event_id bigint DEFAULT NULL,
  p_default_monthly_credits integer DEFAULT 40
)
RETURNS TABLE (
  allowed boolean,
  required_credits integer,
  period_start date,
  plan_tier text,
  monthly_credits integer,
  used_credits integer,
  remaining_credits integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_balance_row RECORD;
  v_account public.import_credit_accounts;
  v_period_start date := date_trunc('month', CURRENT_DATE::timestamp)::date;
  v_used_before integer := 0;
  v_remaining_before integer := 0;
  v_used_after integer := 0;
  v_remaining_after integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_type NOT IN ('image', 'url', 'text') THEN
    RAISE EXCEPTION 'source_type must be image, url, or text.'
      USING ERRCODE = '22023';
  END IF;

  IF p_credits <= 0 OR p_credits > 1000 THEN
    RAISE EXCEPTION 'credits must be between 1 and 1000.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_service_role AND (
    v_auth_user_id IS NULL OR v_auth_user_id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'You can only consume credits for your own account.'
      USING ERRCODE = '42501';
  END IF;

  v_account := public.ensure_import_credit_account(
    p_scope_type => 'user',
    p_scope_id => p_user_id,
    p_default_monthly_credits => p_default_monthly_credits
  );

  SELECT *
  INTO v_account
  FROM public.import_credit_accounts
  WHERE id = v_account.id
  FOR UPDATE;

  INSERT INTO public.import_credit_ledger (
    account_id,
    period_start,
    entry_type,
    credits_delta,
    metadata
  )
  VALUES (
    v_account.id,
    v_period_start,
    'monthly_allocation',
    v_account.monthly_credits,
    jsonb_build_object('plan_tier', v_account.plan_tier)
  )
  ON CONFLICT DO NOTHING;

  SELECT
    COALESCE(SUM(CASE WHEN icl.entry_type = 'usage' THEN -icl.credits_delta ELSE 0 END), 0)::integer AS used_credits,
    COALESCE(SUM(icl.credits_delta), 0)::integer AS remaining_credits
  INTO v_balance_row
  FROM public.import_credit_ledger AS icl
  WHERE icl.account_id = v_account.id
    AND icl.period_start = v_period_start;

  v_used_before := COALESCE(v_balance_row.used_credits, 0);
  v_remaining_before := COALESCE(v_balance_row.remaining_credits, 0);

  IF v_remaining_before < p_credits THEN
    allowed := false;
    required_credits := p_credits;
    period_start := v_period_start;
    plan_tier := v_account.plan_tier;
    monthly_credits := v_account.monthly_credits;
    used_credits := v_used_before;
    remaining_credits := v_remaining_before;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.import_credit_ledger (
    account_id,
    period_start,
    entry_type,
    credits_delta,
    source_type,
    request_id,
    usage_event_id,
    metadata
  )
  VALUES (
    v_account.id,
    v_period_start,
    'usage',
    -p_credits,
    p_source_type,
    p_request_id,
    p_usage_event_id,
    jsonb_build_object('source_type', p_source_type)
  );

  SELECT
    COALESCE(SUM(CASE WHEN icl.entry_type = 'usage' THEN -icl.credits_delta ELSE 0 END), 0)::integer AS used_credits,
    COALESCE(SUM(icl.credits_delta), 0)::integer AS remaining_credits
  INTO v_balance_row
  FROM public.import_credit_ledger AS icl
  WHERE icl.account_id = v_account.id
    AND icl.period_start = v_period_start;

  v_used_after := COALESCE(v_balance_row.used_credits, 0);
  v_remaining_after := COALESCE(v_balance_row.remaining_credits, 0);

  allowed := true;
  required_credits := p_credits;
  period_start := v_period_start;
  plan_tier := v_account.plan_tier;
  monthly_credits := v_account.monthly_credits;
  used_credits := v_used_after;
  remaining_credits := v_remaining_after;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_user_import_account_for_plan(uuid, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_magic_import_status(uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_user_import_credits(uuid, text, integer, uuid, bigint, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_user_import_account_for_plan(uuid, text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_magic_import_status(uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_user_import_credits(uuid, text, integer, uuid, bigint, integer) TO authenticated, service_role;
