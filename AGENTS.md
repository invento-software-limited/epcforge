# EPCForge

EPC operations, BOQ and budget management on ERPNext.

Invento app, installed on `inv-demo.localhost`. Requires: `erpnext`.

## Layout

- `epcforge/epcforge/`: module and DocTypes
- `epcforge/report_kit.py`: report helpers
- `epcforge/fixtures/`: fixtures
- `docs/`: documentation

## Environment

- The bench runs in Docker: container `inv_demo_localhost-app`, bench at `/home/frappe/frappe-bench`. Run bench commands through it:
  `docker exec inv_demo_localhost-app bash -lc 'cd /home/frappe/frappe-bench && bench --site inv-demo.localhost <command>'`
- `apps/` is a bind mount, so code edits here reach running workers on `inv-demo.localhost` with no deploy step.
- `inv-demo.localhost` is the shared demo site and has `allow_tests` off. Any change to it needs the owner's approval.

## Rules

- Tests: no test site has this app installed yet. Don't run tests on `inv-demo.localhost`, because many tests delete data.
- Commit only when asked, and never push without asking.
- Secrets belong in site config, never in the repo.
