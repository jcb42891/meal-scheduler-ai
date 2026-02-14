CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  stripe_price_id text UNIQUE,
  monthly_credits integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT plans_monthly_credits_check CHECK (monthly_credits >= 0)
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'inactive',
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  grace_until timestamp with time zone,
  last_webhook_event_id text,
  last_webhook_received_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_group_id_provider_unique_idx
  ON public.subscriptions (group_id, provider);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_id_unique_idx
  ON public.subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_group_id_status_idx
  ON public.subscriptions (group_id, status);

CREATE TABLE IF NOT EXISTS public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'manual',
  unlimited boolean NOT NULL DEFAULT false,
  monthly_credits_override integer,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  valid_from timestamp with time zone NOT NULL DEFAULT now(),
  valid_to timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT entitlements_scope_type_check CHECK (scope_type IN ('user', 'group')),
  CONSTRAINT entitlements_status_check CHECK (status IN ('active', 'inactive', 'expired')),
  CONSTRAINT entitlements_scope_target_check CHECK (
    (
      scope_type = 'user'
      AND user_id IS NOT NULL
      AND group_id IS NULL
    )
    OR (
      scope_type = 'group'
      AND group_id IS NOT NULL
      AND user_id IS NULL
    )
  ),
  CONSTRAINT entitlements_monthly_credits_override_check CHECK (
    monthly_credits_override IS NULL OR monthly_credits_override >= 0
  ),
  CONSTRAINT entitlements_valid_window_check CHECK (
    valid_to IS NULL OR valid_to > valid_from
  )
);

CREATE INDEX IF NOT EXISTS entitlements_scope_feature_status_idx
  ON public.entitlements (scope_type, feature_key, status);

CREATE INDEX IF NOT EXISTS entitlements_group_feature_idx
  ON public.entitlements (group_id, feature_key)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS entitlements_user_feature_idx
  ON public.entitlements (user_id, feature_key)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  provider_payment_intent_id text,
  provider_invoice_id text,
  credits integer NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT credit_purchases_credits_check CHECK (credits > 0),
  CONSTRAINT credit_purchases_amount_cents_check CHECK (amount_cents >= 0),
  CONSTRAINT credit_purchases_status_check CHECK (
    status IN ('pending', 'succeeded', 'failed', 'refunded')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_purchases_provider_payment_intent_unique_idx
  ON public.credit_purchases (provider_payment_intent_id)
  WHERE provider_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_purchases_group_created_at_idx
  ON public.credit_purchases (group_id, created_at DESC);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view active plans" ON public.plans;
CREATE POLICY "Authenticated can view active plans"
  ON public.plans
  FOR SELECT
  TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS "Group members can view subscriptions" ON public.subscriptions;
CREATE POLICY "Group members can view subscriptions"
  ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (
    public.is_group_owner(group_id) OR public.is_group_member(group_id)
  );

DROP POLICY IF EXISTS "Users can view relevant entitlements" ON public.entitlements;
CREATE POLICY "Users can view relevant entitlements"
  ON public.entitlements
  FOR SELECT
  TO authenticated
  USING (
    (
      scope_type = 'user'
      AND user_id = auth.uid()
    )
    OR (
      scope_type = 'group'
      AND (
        public.is_group_owner(group_id)
        OR public.is_group_member(group_id)
      )
    )
  );

DROP POLICY IF EXISTS "Users can view relevant credit purchases" ON public.credit_purchases;
CREATE POLICY "Users can view relevant credit purchases"
  ON public.credit_purchases
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_group_owner(group_id)
    OR public.is_group_member(group_id)
  );

CREATE OR REPLACE FUNCTION public.sync_group_import_account_for_plan(
  p_group_id uuid,
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
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_monthly_credits < 0 OR p_monthly_credits > 1000000 THEN
    RAISE EXCEPTION 'monthly_credits must be between 0 and 1000000.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.import_credit_accounts AS ica (
    scope_type,
    group_id,
    plan_tier,
    monthly_credits,
    created_at,
    updated_at
  )
  VALUES (
    'group',
    p_group_id,
    COALESCE(NULLIF(trim(p_plan_tier), ''), 'free'),
    p_monthly_credits,
    v_now,
    v_now
  )
  ON CONFLICT (group_id)
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

CREATE OR REPLACE FUNCTION public.get_group_magic_import_status(
  p_group_id uuid,
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
  v_user_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_now timestamp with time zone := now();
  v_balance RECORD;
  v_subscription RECORD;
  v_unlimited boolean := false;
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required.'
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

  IF NOT v_is_service_role AND v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_is_service_role AND NOT (
    public.is_group_member(p_group_id) OR public.is_group_owner(p_group_id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to this group.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.entitlements e
    WHERE e.feature_key = 'magic_import'
      AND e.status = 'active'
      AND e.unlimited = true
      AND e.valid_from <= v_now
      AND (e.valid_to IS NULL OR e.valid_to > v_now)
      AND (
        (e.scope_type = 'group' AND e.group_id = p_group_id)
        OR (
          e.scope_type = 'user'
          AND v_user_id IS NOT NULL
          AND e.user_id = v_user_id
        )
      )
  )
  INTO v_unlimited;

  SELECT *
  INTO v_balance
  FROM public.get_import_monthly_credit_balance(
    p_scope_type => 'group',
    p_scope_id => p_group_id,
    p_default_monthly_credits => p_default_monthly_credits
  )
  LIMIT 1;

  SELECT
    s.status,
    s.grace_until
  INTO v_subscription
  FROM public.subscriptions s
  WHERE s.group_id = p_group_id
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

INSERT INTO public.plans (
  code,
  name,
  stripe_price_id,
  monthly_credits,
  active,
  metadata,
  created_at,
  updated_at
)
VALUES
  (
    'free',
    'Free',
    NULL,
    40,
    true,
    '{"feature":"magic_import"}'::jsonb,
    now(),
    now()
  ),
  (
    'pro',
    'Pro',
    NULL,
    400,
    true,
    '{"feature":"magic_import"}'::jsonb,
    now(),
    now()
  )
ON CONFLICT (code)
DO UPDATE
SET
  name = EXCLUDED.name,
  monthly_credits = EXCLUDED.monthly_credits,
  active = EXCLUDED.active,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at;

REVOKE ALL ON FUNCTION public.sync_group_import_account_for_plan(uuid, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_group_magic_import_status(uuid, text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.sync_group_import_account_for_plan(uuid, text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_group_magic_import_status(uuid, text, integer, integer) TO authenticated, service_role;

REVOKE ALL ON TABLE public.plans FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.credit_purchases FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.plans TO authenticated, service_role;
GRANT SELECT ON public.subscriptions TO authenticated, service_role;
GRANT SELECT ON public.entitlements TO authenticated, service_role;
GRANT SELECT ON public.credit_purchases TO authenticated, service_role;

GRANT INSERT, UPDATE, DELETE ON public.plans TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.subscriptions TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.entitlements TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.credit_purchases TO service_role;
