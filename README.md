# Shamim Wani Real Estate — Washington, DC

A responsive real-estate website prototype with neighborhood guides, property filters, detail views, image galleries, a saved-homes view, and an admin dashboard UI.

## Current state

- Property cards and neighborhood copy are demo content and are labeled as such.
- The Admin interface is still being connected to Supabase Auth and the shared database.
- `supabase/schema.sql` defines the intended database tables, Row Level Security policies, and property image storage rules.
- `supabase-config.js` contains only the Supabase project URL and publishable key. Publishable keys are designed for browser use and rely on correct Row Level Security policies. Never add a Supabase service-role key or passwords to this repository.
- Vercel deployment is intentionally pending until the Admin flow is wired to the protected database and checked.

## Preview locally

From the project folder, run:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Supabase setup

The SQL schema is in `supabase/schema.sql`. Create the initial admin account through Supabase Auth, then insert that user ID into `public.admin_users` before enabling the production Admin experience. Do not add public sign-up controls to the website.

