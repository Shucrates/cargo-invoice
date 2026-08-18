-- Backfill dockets whose subtotal/gst/grand_total were never persisted.
--
-- Totals are now computed server-side at write time and read back verbatim, so
-- every existing row must hold correct values rather than relying on the API to
-- recalculate them on read.
--
-- The immutability trigger rejects changes to subtotal/grand_total on issued
-- dockets, so it is suspended for the duration of this one-off correction.

ALTER TABLE "cargo_dockets" DISABLE TRIGGER "trg_prevent_docket_unauthorized_update";

WITH base AS (
  SELECT
    id,
    gst_percentage,
    gst_amount,
    CASE WHEN subtotal > 0 THEN subtotal ELSE
      COALESCE(freight_amount, 0) + COALESCE(risk_charge, 0) +
      COALESCE(handling_charge, 0) + COALESCE(docket_charge, 0) +
      COALESCE(pickup_delivery_charge, 0) + COALESCE(other_charge, 0)
    END AS eff_subtotal
  FROM "cargo_dockets"
),
calc AS (
  SELECT
    id,
    eff_subtotal,
    CASE WHEN gst_amount > 0 THEN gst_amount
         ELSE ROUND(eff_subtotal * gst_percentage / 100, 2) END AS eff_gst
  FROM base
)
UPDATE "cargo_dockets" d
SET
  subtotal    = c.eff_subtotal,
  gst_amount  = c.eff_gst,
  grand_total = c.eff_subtotal + c.eff_gst,
  updated_at  = NOW()
FROM calc c
WHERE d.id = c.id
  AND (
    d.subtotal    IS DISTINCT FROM c.eff_subtotal OR
    d.gst_amount  IS DISTINCT FROM c.eff_gst OR
    d.grand_total IS DISTINCT FROM c.eff_subtotal + c.eff_gst
  );

ALTER TABLE "cargo_dockets" ENABLE TRIGGER "trg_prevent_docket_unauthorized_update";
