CREATE TABLE IF NOT EXISTS public.import_rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  window_started_at timestamp with time zone NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT import_rate_limits_pkey PRIMARY KEY (user_id, group_id),
  CONSTRAINT import_rate_limits_request_count_check CHECK (request_count >= 0)
);

CREATE INDEX IF NOT EXISTS import_rate_limits_updated_at_idx
  ON public.import_rate_limits (updated_at DESC);

ALTER TABLE public.import_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.import_usage_events (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL,
  event_type text NOT NULL,
  source_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  status_code integer,
  error_code text,
  error_message text,
  provider text,
  model text,
  cost_credits integer NOT NULL DEFAULT 0,
  cost_input_tokens integer,
  cost_output_tokens integer,
  cost_total_tokens integer,
  cost_usd numeric(12, 6),
  latency_ms integer,
  input_bytes integer,
  output_ingredients_count integer,
  warnings_count integer,
  confidence numeric(4, 3),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT import_usage_events_event_type_check CHECK (event_type IN ('attempt', 'success', 'failure')),
  CONSTRAINT import_usage_events_source_type_check CHECK (source_type IN ('image', 'url', 'text')),
  CONSTRAINT import_usage_events_cost_credits_check CHECK (cost_credits >= 0),
  CONSTRAINT import_usage_events_cost_input_tokens_check CHECK (cost_input_tokens IS NULL OR cost_input_tokens >= 0),
  CONSTRAINT import_usage_events_cost_output_tokens_check CHECK (cost_output_tokens IS NULL OR cost_output_tokens >= 0),
  CONSTRAINT import_usage_events_cost_total_tokens_check CHECK (cost_total_tokens IS NULL OR cost_total_tokens >= 0),
  CONSTRAINT import_usage_events_cost_usd_check CHECK (cost_usd IS NULL OR cost_usd >= 0),
  CONSTRAINT import_usage_events_latency_ms_check CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT import_usage_events_input_bytes_check CHECK (input_bytes IS NULL OR input_bytes >= 0),
  CONSTRAINT import_usage_events_output_ingredients_count_check CHECK (
    output_ingredients_count IS NULL OR output_ingredients_count >= 0
  ),
  CONSTRAINT import_usage_events_warnings_count_check CHECK (warnings_count IS NULL OR warnings_count >= 0),
  CONSTRAINT import_usage_events_confidence_check CHECK (
    confidence IS NULL OR (confidence >= 0 AND confidence <= 1)
  )
);

CREATE INDEX IF NOT EXISTS import_usage_events_request_id_idx
  ON public.import_usage_events (request_id);

CREATE INDEX IF NOT EXISTS import_usage_events_created_at_idx
  ON public.import_usage_events (created_at DESC);

CREATE INDEX IF NOT EXISTS import_usage_events_source_type_created_at_idx
  ON public.import_usage_events (source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS import_usage_events_group_created_at_idx
  ON public.import_usage_events (group_id, created_at DESC);

ALTER TABLE public.import_usage_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.import_credit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  plan_tier text NOT NULL DEFAULT 'free',
  monthly_credits integer NOT NULL DEFAULT 40,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT import_credit_accounts_scope_type_check CHECK (scope_type IN ('user', 'group')),
  CONSTRAINT import_credit_accounts_monthly_credits_check CHECK (monthly_credits >= 0),
  CONSTRAINT import_credit_accounts_scope_target_check CHECK (
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
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS import_credit_accounts_user_id_unique_idx
  ON public.import_credit_accounts (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS import_credit_accounts_group_id_unique_idx
  ON public.import_credit_accounts (group_id);

CREATE INDEX IF NOT EXISTS import_credit_accounts_plan_tier_idx
  ON public.import_credit_accounts (plan_tier);

ALTER TABLE public.import_credit_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.import_credit_ledger (
  id bigserial PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.import_credit_accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  entry_type text NOT NULL,
  credits_delta integer NOT NULL,
  source_type text,
  request_id uuid,
  usage_event_id bigint REFERENCES public.import_usage_events(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT import_credit_ledger_entry_type_check CHECK (
    entry_type IN ('monthly_allocation', 'usage', 'manual_adjustment', 'refund')
  ),
  CONSTRAINT import_credit_ledger_source_type_check CHECK (
    source_type IS NULL OR source_type IN ('image', 'url', 'text')
  ),
  CONSTRAINT import_credit_ledger_usage_delta_check CHECK (
    entry_type <> 'usage' OR credits_delta <= 0
  ),
  CONSTRAINT import_credit_ledger_monthly_allocation_delta_check CHECK (
    entry_type <> 'monthly_allocation' OR credits_delta >= 0
  )
);

CREATE INDEX IF NOT EXISTS import_credit_ledger_account_period_idx
  ON public.import_credit_ledger (account_id, period_start, created_at DESC);

CREATE INDEX IF NOT EXISTS import_credit_ledger_request_id_idx
  ON public.import_credit_ledger (request_id);

CREATE UNIQUE INDEX IF NOT EXISTS import_credit_ledger_monthly_allocation_unique_idx
  ON public.import_credit_ledger (account_id, period_start)
  WHERE entry_type = 'monthly_allocation';

CREATE UNIQUE INDEX IF NOT EXISTS import_credit_ledger_usage_event_unique_idx
  ON public.import_credit_ledger (usage_event_id)
  WHERE usage_event_id IS NOT NULL AND entry_type = 'usage';

ALTER TABLE public.import_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_recipe_import_rate_limit(
  p_group_id uuid,
  p_window_seconds integer DEFAULT 300,
  p_max_requests integer DEFAULT 8
)
RETURNS TABLE (
  allowed boolean,
  limit_count integer,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamp with time zone := now();
  v_window_interval interval;
  v_window_started_at timestamp with time zone;
  v_request_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.'
      USING ERRCODE = '42501';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_window_seconds <= 0 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'window_seconds must be between 1 and 86400.'
      USING ERRCODE = '22023';
  END IF;

  IF p_max_requests <= 0 OR p_max_requests > 1000 THEN
    RAISE EXCEPTION 'max_requests must be between 1 and 1000.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (
    public.is_group_member(p_group_id) OR public.is_group_owner(p_group_id)
  ) THEN
    RAISE EXCEPTION 'You do not have access to this group.'
      USING ERRCODE = '42501';
  END IF;

  v_window_interval := make_interval(secs => p_window_seconds);

  INSERT INTO public.import_rate_limits AS rl (
    user_id,
    group_id,
    window_started_at,
    request_count,
    updated_at
  )
  VALUES (
    v_user_id,
    p_group_id,
    v_now,
    1,
    v_now
  )
  ON CONFLICT (user_id, group_id)
  DO UPDATE
  SET
    window_started_at = CASE
      WHEN rl.window_started_at <= EXCLUDED.updated_at - v_window_interval THEN EXCLUDED.updated_at
      ELSE rl.window_started_at
    END,
    request_count = CASE
      WHEN rl.window_started_at <= EXCLUDED.updated_at - v_window_interval THEN 1
      ELSE rl.request_count + 1
    END,
    updated_at = EXCLUDED.updated_at
  RETURNING window_started_at, request_count
  INTO v_window_started_at, v_request_count;

  allowed := v_request_count <= p_max_requests;
  limit_count := p_max_requests;
  remaining := GREATEST(p_max_requests - LEAST(v_request_count, p_max_requests), 0);
  retry_after_seconds := GREATEST(
    1,
    CEIL(EXTRACT(epoch FROM ((v_window_started_at + v_window_interval) - v_now)))::integer
  );

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_import_credit_account(
  p_scope_type text,
  p_scope_id uuid,
  p_default_plan_tier text DEFAULT 'free',
  p_default_monthly_credits integer DEFAULT 40
)
RETURNS public.import_credit_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_service_role boolean := auth.role() = 'service_role';
  v_account public.import_credit_accounts;
BEGIN
  IF p_scope_type NOT IN ('user', 'group') THEN
    RAISE EXCEPTION 'scope_type must be user or group.'
      USING ERRCODE = '22023';
  END IF;

  IF p_scope_id IS NULL THEN
    RAISE EXCEPTION 'scope_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_default_monthly_credits < 0 OR p_default_monthly_credits > 100000 THEN
    RAISE EXCEPTION 'default_monthly_credits must be between 0 and 100000.'
      USING ERRCODE = '22023';
  END IF;

  IF p_scope_type = 'group' THEN
    IF NOT v_is_service_role AND NOT (
      public.is_group_member(p_scope_id) OR public.is_group_owner(p_scope_id)
    ) THEN
      RAISE EXCEPTION 'You do not have access to this group.'
        USING ERRCODE = '42501';
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
      p_scope_id,
      COALESCE(NULLIF(trim(p_default_plan_tier), ''), 'free'),
      p_default_monthly_credits,
      now(),
      now()
    )
    ON CONFLICT (group_id)
    DO UPDATE
    SET updated_at = EXCLUDED.updated_at
    RETURNING *
    INTO v_account;
  ELSE
    IF NOT v_is_service_role AND (
      v_user_id IS NULL OR v_user_id <> p_scope_id
    ) THEN
      RAISE EXCEPTION 'You can only access your own credit account.'
        USING ERRCODE = '42501';
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
      p_scope_id,
      COALESCE(NULLIF(trim(p_default_plan_tier), ''), 'free'),
      p_default_monthly_credits,
      now(),
      now()
    )
    ON CONFLICT (user_id)
    DO UPDATE
    SET updated_at = EXCLUDED.updated_at
    RETURNING *
    INTO v_account;
  END IF;

  RETURN v_account;
END;
$$;

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
    COALESCE(SUM(CASE WHEN entry_type = 'usage' THEN -credits_delta ELSE 0 END), 0)::integer,
    COALESCE(SUM(credits_delta), 0)::integer
  INTO v_used_credits, v_remaining_credits
  FROM public.import_credit_ledger
  WHERE account_id = v_account.id
    AND period_start = v_period_start;

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
    COALESCE(SUM(CASE WHEN entry_type = 'usage' THEN -credits_delta ELSE 0 END), 0)::integer AS used_credits,
    COALESCE(SUM(credits_delta), 0)::integer AS remaining_credits
  INTO v_balance_row
  FROM public.import_credit_ledger
  WHERE account_id = v_account.id
    AND period_start = v_period_start;

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
    COALESCE(SUM(CASE WHEN entry_type = 'usage' THEN -credits_delta ELSE 0 END), 0)::integer AS used_credits,
    COALESCE(SUM(credits_delta), 0)::integer AS remaining_credits
  INTO v_balance_row
  FROM public.import_credit_ledger
  WHERE account_id = v_account.id
    AND period_start = v_period_start;

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

CREATE OR REPLACE FUNCTION public.record_import_usage_event(
  p_request_id uuid,
  p_event_type text,
  p_source_type text,
  p_group_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_status_code integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_cost_credits integer DEFAULT 0,
  p_cost_input_tokens integer DEFAULT NULL,
  p_cost_output_tokens integer DEFAULT NULL,
  p_cost_total_tokens integer DEFAULT NULL,
  p_cost_usd numeric DEFAULT NULL,
  p_latency_ms integer DEFAULT NULL,
  p_input_bytes integer DEFAULT NULL,
  p_output_ingredients_count integer DEFAULT NULL,
  p_warnings_count integer DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid := COALESCE(p_user_id, v_auth_user_id);
  v_is_service_role boolean := auth.role() = 'service_role';
  v_event_id bigint;
  v_total_tokens integer := p_cost_total_tokens;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF p_event_type NOT IN ('attempt', 'success', 'failure') THEN
    RAISE EXCEPTION 'event_type must be attempt, success, or failure.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_type NOT IN ('image', 'url', 'text') THEN
    RAISE EXCEPTION 'source_type must be image, url, or text.'
      USING ERRCODE = '22023';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_service_role THEN
    IF v_auth_user_id IS NULL OR v_user_id <> v_auth_user_id THEN
      RAISE EXCEPTION 'You can only record usage for the authenticated user.'
        USING ERRCODE = '42501';
    END IF;

    IF NOT (public.is_group_member(p_group_id) OR public.is_group_owner(p_group_id)) THEN
      RAISE EXCEPTION 'You do not have access to this group.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_total_tokens IS NULL AND (
    p_cost_input_tokens IS NOT NULL OR p_cost_output_tokens IS NOT NULL
  ) THEN
    v_total_tokens := COALESCE(p_cost_input_tokens, 0) + COALESCE(p_cost_output_tokens, 0);
  END IF;

  INSERT INTO public.import_usage_events (
    request_id,
    event_type,
    source_type,
    user_id,
    group_id,
    status_code,
    error_code,
    error_message,
    provider,
    model,
    cost_credits,
    cost_input_tokens,
    cost_output_tokens,
    cost_total_tokens,
    cost_usd,
    latency_ms,
    input_bytes,
    output_ingredients_count,
    warnings_count,
    confidence,
    metadata
  )
  VALUES (
    p_request_id,
    p_event_type,
    p_source_type,
    v_user_id,
    p_group_id,
    p_status_code,
    NULLIF(trim(COALESCE(p_error_code, '')), ''),
    NULLIF(trim(COALESCE(p_error_message, '')), ''),
    NULLIF(trim(COALESCE(p_provider, '')), ''),
    NULLIF(trim(COALESCE(p_model, '')), ''),
    GREATEST(COALESCE(p_cost_credits, 0), 0),
    p_cost_input_tokens,
    p_cost_output_tokens,
    v_total_tokens,
    p_cost_usd,
    p_latency_ms,
    p_input_bytes,
    p_output_ingredients_count,
    p_warnings_count,
    p_confidence,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id
  INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE VIEW public.import_usage_daily_report AS
SELECT
  date_trunc('day', iue.created_at)::date AS usage_date,
  iue.source_type,
  COALESCE(ica.plan_tier, 'unassigned') AS plan_tier,
  COUNT(*) FILTER (WHERE iue.event_type = 'attempt')::bigint AS attempts,
  COUNT(*) FILTER (WHERE iue.event_type = 'success')::bigint AS successes,
  COUNT(*) FILTER (WHERE iue.event_type = 'failure')::bigint AS failures,
  COALESCE(SUM(iue.cost_credits), 0)::bigint AS credits_charged,
  COALESCE(SUM(iue.cost_input_tokens), 0)::bigint AS input_tokens,
  COALESCE(SUM(iue.cost_output_tokens), 0)::bigint AS output_tokens,
  COALESCE(SUM(iue.cost_total_tokens), 0)::bigint AS total_tokens,
  COALESCE(SUM(iue.cost_usd), 0)::numeric(12, 6) AS estimated_cost_usd
FROM public.import_usage_events iue
LEFT JOIN public.import_credit_accounts ica
  ON ica.scope_type = 'group'
  AND ica.group_id = iue.group_id
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW public.import_usage_monthly_overage_report AS
WITH monthly AS (
  SELECT
    icl.period_start,
    ica.scope_type,
    COALESCE(ica.group_id, ica.user_id) AS scope_id,
    ica.plan_tier,
    COALESCE(SUM(CASE WHEN icl.entry_type = 'monthly_allocation' THEN icl.credits_delta ELSE 0 END), 0)::integer AS included_credits,
    COALESCE(SUM(CASE WHEN icl.entry_type = 'usage' THEN -icl.credits_delta ELSE 0 END), 0)::integer AS used_credits,
    COALESCE(SUM(icl.credits_delta), 0)::integer AS remaining_credits
  FROM public.import_credit_ledger icl
  INNER JOIN public.import_credit_accounts ica
    ON ica.id = icl.account_id
  GROUP BY
    icl.period_start,
    ica.scope_type,
    COALESCE(ica.group_id, ica.user_id),
    ica.plan_tier
)
SELECT
  period_start,
  scope_type,
  scope_id,
  plan_tier,
  included_credits,
  used_credits,
  GREATEST(used_credits - included_credits, 0) AS overage_credits,
  remaining_credits
FROM monthly;

CREATE OR REPLACE FUNCTION public.admin_import_usage_daily(
  p_start_date date DEFAULT CURRENT_DATE - 30,
  p_end_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  usage_date date,
  source_type text,
  plan_tier text,
  attempts bigint,
  successes bigint,
  failures bigint,
  credits_charged bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  estimated_cost_usd numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.usage_date,
    r.source_type,
    r.plan_tier,
    r.attempts,
    r.successes,
    r.failures,
    r.credits_charged,
    r.input_tokens,
    r.output_tokens,
    r.total_tokens,
    r.estimated_cost_usd
  FROM public.import_usage_daily_report r
  WHERE r.usage_date BETWEEN LEAST(p_start_date, p_end_date) AND GREATEST(p_start_date, p_end_date)
  ORDER BY r.usage_date DESC, r.source_type, r.plan_tier;
$$;

CREATE OR REPLACE FUNCTION public.admin_import_usage_monthly_overage(
  p_start_period date DEFAULT date_trunc('month', (CURRENT_DATE - interval '5 months')::timestamp)::date,
  p_end_period date DEFAULT date_trunc('month', CURRENT_DATE::timestamp)::date
)
RETURNS TABLE (
  period_start date,
  scope_type text,
  scope_id uuid,
  plan_tier text,
  included_credits integer,
  used_credits integer,
  overage_credits integer,
  remaining_credits integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.period_start,
    r.scope_type,
    r.scope_id,
    r.plan_tier,
    r.included_credits,
    r.used_credits,
    r.overage_credits,
    r.remaining_credits
  FROM public.import_usage_monthly_overage_report r
  WHERE r.period_start BETWEEN
    date_trunc('month', LEAST(p_start_period, p_end_period)::timestamp)::date
    AND date_trunc('month', GREATEST(p_start_period, p_end_period)::timestamp)::date
  ORDER BY r.period_start DESC, r.scope_type, r.plan_tier;
$$;

REVOKE ALL ON FUNCTION public.consume_recipe_import_rate_limit(uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_import_credit_account(text, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_import_monthly_credit_balance(text, uuid, date, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_group_import_credits(uuid, text, integer, uuid, bigint, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_import_usage_event(uuid, text, text, uuid, uuid, integer, text, text, text, text, integer, integer, integer, integer, numeric, integer, integer, integer, integer, numeric, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_import_usage_daily(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_import_usage_monthly_overage(date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.consume_recipe_import_rate_limit(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_import_monthly_credit_balance(text, uuid, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_group_import_credits(uuid, text, integer, uuid, bigint, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_import_usage_event(uuid, text, text, uuid, uuid, integer, text, text, text, text, integer, integer, integer, integer, numeric, integer, integer, integer, integer, numeric, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_import_usage_daily(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_import_usage_monthly_overage(date, date) TO service_role;

REVOKE ALL ON TABLE public.import_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.import_usage_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.import_credit_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.import_credit_ledger FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.import_usage_daily_report FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.import_usage_monthly_overage_report FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.import_usage_daily_report TO service_role;
GRANT SELECT ON public.import_usage_monthly_overage_report TO service_role;
