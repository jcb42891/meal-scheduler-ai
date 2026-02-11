CREATE OR REPLACE FUNCTION public.get_import_monthly_credit_balance(
  p_scope_type text,
  p_scope_id uuid,
  p_period_start date DEFAULT NULL,
  p_default_monthly_credits integer DEFAULT 40
)
RETURNS TABLE (
  account_id uuid,
  scope_type text,
  scope_id uuid,
  plan_tier text,
  period_start date,
  monthly_credits integer,
  used_credits integer,
  remaining_credits integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account public.import_credit_accounts;
  v_period_start date := date_trunc('month', COALESCE(p_period_start, CURRENT_DATE)::timestamp)::date;
  v_used_credits integer := 0;
  v_remaining_credits integer := 0;
BEGIN
  v_account := public.ensure_import_credit_account(
    p_scope_type => p_scope_type,
    p_scope_id => p_scope_id,
    p_default_monthly_credits => p_default_monthly_credits
  );

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
    COALESCE(SUM(CASE WHEN icl.entry_type = 'usage' THEN -icl.credits_delta ELSE 0 END), 0)::integer,
    COALESCE(SUM(icl.credits_delta), 0)::integer
  INTO v_used_credits, v_remaining_credits
  FROM public.import_credit_ledger AS icl
  WHERE icl.account_id = v_account.id
    AND icl.period_start = v_period_start;

  account_id := v_account.id;
  scope_type := v_account.scope_type;
  scope_id := COALESCE(v_account.group_id, v_account.user_id);
  plan_tier := v_account.plan_tier;
  period_start := v_period_start;
  monthly_credits := v_account.monthly_credits;
  used_credits := v_used_credits;
  remaining_credits := v_remaining_credits;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_group_import_credits(
  p_group_id uuid,
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
  v_balance_row RECORD;
  v_account public.import_credit_accounts;
  v_period_start date := date_trunc('month', CURRENT_DATE::timestamp)::date;
  v_used_before integer := 0;
  v_remaining_before integer := 0;
  v_used_after integer := 0;
  v_remaining_after integer := 0;
BEGIN
  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required.'
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

  v_account := public.ensure_import_credit_account(
    p_scope_type => 'group',
    p_scope_id => p_group_id,
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
