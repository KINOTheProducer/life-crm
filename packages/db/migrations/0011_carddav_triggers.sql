-- Editing a phone, address or date counts as editing the person, so CardDAV ETags and sync see it.
CREATE OR REPLACE FUNCTION touch_contact() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE contacts SET updated_at = now() WHERE id = OLD.contact_id;
    RETURN OLD;
  END IF;
  UPDATE contacts SET updated_at = now() WHERE id = NEW.contact_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER contact_methods_touch AFTER INSERT OR UPDATE OR DELETE ON contact_methods FOR EACH ROW EXECUTE FUNCTION touch_contact();
--> statement-breakpoint
CREATE TRIGGER addresses_touch AFTER INSERT OR UPDATE OR DELETE ON addresses FOR EACH ROW EXECUTE FUNCTION touch_contact();
--> statement-breakpoint
CREATE TRIGGER important_dates_touch AFTER INSERT OR UPDATE OR DELETE ON important_dates FOR EACH ROW EXECUTE FUNCTION touch_contact();
--> statement-breakpoint
-- Remember people deleted for good so synced phones drop them too. Only inside the
-- tenant's own session: when a whole tenant is deleted there's no one left to sync.
CREATE OR REPLACE FUNCTION tombstone_contact() RETURNS trigger AS $$
BEGIN
  IF NOT OLD.is_self AND OLD.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid THEN
    INSERT INTO contact_tombstones (tenant_id, dav_name) VALUES (OLD.tenant_id, coalesce(OLD.dav_name, OLD.id::text));
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER contacts_tombstone AFTER DELETE ON contacts FOR EACH ROW EXECUTE FUNCTION tombstone_contact();
