# Stripe setup for Magic Import billing

This project now supports Stripe checkout, portal, webhooks, and entitlement gating for Magic Import.

## 1) Create Stripe product + recurring price

1. In Stripe Dashboard, create a product named **Magic Import Pro**.
2. Create a recurring monthly price for that product.
3. Copy the price ID (looks like `price_...`).

## 2) Configure app environment variables

Set these on your app/server runtime:

- `STRIPE_SECRET_KEY`: Stripe secret key from your Stripe account.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the webhook endpoint.
- `STRIPE_MAGIC_IMPORT_PRICE_ID`: the monthly recurring price ID for Magic Import Pro.

Optional tuning:

- `STRIPE_MAGIC_IMPORT_MONTHLY_CREDITS` (default: `400`)
- `STRIPE_MAGIC_IMPORT_PRODUCT_NAME` (default: `Magic Import Pro`)
- `BILLING_GRACE_HOURS` (default: `72`)
- `BILLING_APP_ORIGIN` (force redirect origin for checkout/portal)
- `BILLING_APP_ORIGIN_ALLOW_DEV_OVERRIDE` (`true` to force origin override in localhost dev)

## 3) Stripe webhook endpoint

Use this endpoint in Stripe:

- `POST /api/billing/webhook`

Subscribe to events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## 4) Local webhook testing (Stripe CLI)

1. Install Stripe CLI and run `stripe login`.
2. Start local forwarding:
   - `stripe listen --forward-to http://localhost:3000/api/billing/webhook`
3. Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET` for local runtime.

## 5) Production webhook setup

1. In Stripe Dashboard, add endpoint:
   - `https://<your-domain>/api/billing/webhook`
2. Select the same event list as above.
3. Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET` in production.

## 6) No-pay test override for your user

For owner/internal testing without payment, add your user ID or email:

- `MAGIC_IMPORT_OVERRIDE_USER_IDS=<uuid1>,<uuid2>`
- `MAGIC_IMPORT_OVERRIDE_USER_EMAILS=<you@example.com>`

When your user matches, Magic Import still works and credits are not charged.
The import dialog will show that override is active.

## 7) End-to-end smoke test

1. Open Meals -> Magic Import.
2. Verify quota card loads and shows source credit costs.
3. If out of credits, verify upgrade/manage billing buttons appear for group members.
4. Start checkout, complete subscription in Stripe test mode.
5. Confirm webhook updates plan and credits, then re-open Magic Import.
6. Parse an import and confirm credits decrement (unless override is active).
