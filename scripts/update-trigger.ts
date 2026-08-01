import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateTrigger() {
  console.log('Updating PostgreSQL trigger prevent_docket_unauthorized_update to allow tracking updates...');

  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION prevent_docket_unauthorized_update()
    RETURNS trigger AS $$
    BEGIN
      IF OLD.status = 'voided' THEN
        RAISE EXCEPTION 'IMMUTABLE RECORD: Voided dockets cannot be altered.';
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
        -- Issued Dockets: Protect core business & financial fields, but permit updating courier_partner and tracking_no
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
  `);

  console.log('✅ Trigger successfully updated in Neon Postgres!');
  await prisma.$disconnect();
}

updateTrigger().catch((e) => {
  console.error(e);
  process.exit(1);
});
