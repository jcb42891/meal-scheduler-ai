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
    jsonb_build_object('plan_tier', v_account.plan_tier, 'synced_at', v_now)
  )
  ON CONFLICT DO NOTHING;

  UPDATE public.import_credit_ledger AS icl
  SET
    credits_delta = CASE
      WHEN p_preserve_current_period_allocation THEN GREATEST(icl.credits_delta, v_account.monthly_credits)
      ELSE v_account.monthly_credits
    END,
    metadata = jsonb_build_object('plan_tier', v_account.plan_tier, 'synced_at', v_now)
  WHERE icl.account_id = v_account.id
    AND icl.period_start = v_period_start
    AND icl.entry_type = 'monthly_allocation';

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
