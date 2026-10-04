-- Let audited admin edits bypass the immutability check via a transaction-local
-- setting. Previously the app ran ALTER TABLE ... DISABLE TRIGGER, which takes an
-- exclusive lock on cargo_dockets and requires table-owner privileges.
CREATE OR REPLACE FUNCTION prevent_docket_unauthorized_update()
RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'voided' THEN
    RAISE EXCEPTION 'IMMUTABLE RECORD: Voided dockets cannot be altered.';
  END IF;

  -- Audited admin edits (PATCH /api/dockets/[id]) set this flag for their own
  -- transaction only, instead of disabling the trigger table-wide.
  IF current_setting('app.allow_docket_edit', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'voided' THEN
    IF (OLD.docket_no IS DISTINCT FROM NEW.docket_no) OR
       (OLD.created_by IS DISTINCT FROM NEW.created_by) OR
       (OLD.booking_date IS DISTINCT FROM NEW.booking_date) OR
       (OLD.from_city IS DISTINCT FROM NEW.from_city) OR
       (OLD.to_city IS DISTINCT FROM NEW.to_city) OR
       (OLD.consignor_name IS DISTINCT FROM NEW.consignor_name) OR
       (OLD.consignee_name IS DISTINCT FROM NEW.consignee_name) OR
       (OLD.grand_total IS DISTINCT FROM NEW.grand_total) THEN
      RAISE EXCEPTION 'UNAUTHORIZED ALTERATION: Only status and void audit fields can be updated when voiding a docket.';
    END IF;
  ELSE
    IF (OLD.docket_no IS DISTINCT FROM NEW.docket_no) OR
       (OLD.created_by IS DISTINCT FROM NEW.created_by) OR
       (OLD.booking_date IS DISTINCT FROM NEW.booking_date) OR
       (OLD.from_city IS DISTINCT FROM NEW.from_city) OR
       (OLD.to_city IS DISTINCT FROM NEW.to_city) OR
       (OLD.consignor_name IS DISTINCT FROM NEW.consignor_name) OR
       (OLD.consignee_name IS DISTINCT FROM NEW.consignee_name) OR
       (OLD.grand_total IS DISTINCT FROM NEW.grand_total) OR
       (OLD.freight_amount IS DISTINCT FROM NEW.freight_amount) OR
       (OLD.subtotal IS DISTINCT FROM NEW.subtotal) THEN
      RAISE EXCEPTION 'IMMUTABLE RECORD: Core financial and shipment fields cannot be edited. Only tracking details and status can be updated.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
