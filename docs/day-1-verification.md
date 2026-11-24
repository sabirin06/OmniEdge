# Day 1 verification

Date: 24 November 2026

## Coverage

| Feature | Verified behavior |
| --- | --- |
| F01 Tenant onboarding | Platform Admin created an organization and provisioned tenant users via API. Suspension blocks existing sessions and source-key ingestion. |
| F02 Asset inventory | Customer Admin registered an asset. Tenant isolation and forbidden analyst writes passed. |
| F03 Log sources | A source was linked to the asset, its key was returned once, and rotation issued a replacement. Cross-tenant asset links and use of another tenant's source key from a signed-in session were blocked. |
| F04 Simulated ingestion | One normal and one matching event were saved and retrieved. Batch size, severity, timestamps, invalid input, disabled sources and idempotent replay were checked. |
| F05 Detection rules | A SOC Lead created a rule matching failed attempts greater than or equal to five. Disabled rules produced no new alerts. |
| F06 Alert queue | One matching event created exactly one alert linked to its event and rule. The normal event created no alert. |

## Results

- PostgreSQL test database: fresh migrations, fresh seed, and **16 passing tests**. All four seeded roles passed login, session and logout checks with CSRF enforcement.
- Local PostgreSQL API acceptance: organization, users, asset, source, rotate key, rule, event and alert verified through the same endpoints used by React. Temporary acceptance records were rolled back.
- Frontend production build: passed with Vite's `runner` config loader. Vite reported a bundle-size warning.
- OpenAPI: Day 1 endpoints generate. The broader schema still reports pre-existing errors for five incident endpoints.
- Branding: company-published logo and colors are installed. See [Branding](branding.md) for sources and approval status.
- Browser acceptance: Chrome automation stopped when it could not verify the current browser URL. The updated browser workflow and responsive layout have not been signed off.

## Git handoff

The workspace has local Git history and no configured remote. An old local database password remains in earlier commits. Rotate it if still in use and prepare history and tracked assessment materials for authorized sharing before pushing. The earlier `day-1-complete` tag predates these changes.
