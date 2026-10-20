-- Every workspace keeps at least one owner, whatever the application does.
--
-- Better Auth checks the owner count before demoting or removing an owner, but without a
-- lock: two owners demoting each other at the same moment could both pass and leave the
-- workspace with none. This trigger is the guarantee.
--
-- - It runs at commit (DEFERRABLE INITIALLY DEFERRED), so a transaction may promote a new
--   owner and demote the old one in any order, and deleting a whole workspace (members
--   first, then the workspace, in one transaction) passes because the workspace is gone.
-- - It locks the workspace row before counting, so concurrent changes to the same
--   workspace's owners are checked one after another: the second sees the first's commit.
-- - SECURITY DEFINER (owned by evidence_owner, which RLS does not restrict) so the count
--   sees every membership, whichever role made the change.
CREATE FUNCTION public.ensure_workspace_has_owner() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM 1 FROM public.tenants WHERE id = OLD.tenant_id FOR UPDATE;
  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM public.memberships WHERE tenant_id = OLD.tenant_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'workspace % must keep at least one owner', OLD.tenant_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'memberships_workspace_has_owner';
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.ensure_workspace_has_owner() FROM PUBLIC;--> statement-breakpoint

-- Only changes that take an owner away can leave a workspace without one.
CREATE CONSTRAINT TRIGGER memberships_workspace_has_owner
  AFTER UPDATE OF role, tenant_id OR DELETE ON public.memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.role = 'owner')
  EXECUTE FUNCTION public.ensure_workspace_has_owner();
