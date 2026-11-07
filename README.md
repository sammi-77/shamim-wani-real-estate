# Shamim Wani Real Estate — Washington, DC

A responsive real-estate website with neighborhood guides, property filters, detail views, image galleries, saved homes, and a Supabase-backed admin dashboard.

## Current state

- Sample property cards are demo content and are labeled as such. Replace them with verified listings before representing homes as live inventory.
- Admin sign-in uses Supabase Auth, checks membership in `public.admin_users`, and relies on database Row Level Security for property and inquiry access.
- Admin listing edits, property image uploads, and website inquiries use the Supabase database and the `property-images` Storage bucket. The `supabase-js` browser SDK is pinned to version `2.119.0`.
- `supabase/schema.sql` defines the database tables, Row Level Security policies, and property image storage rules.
- `supabase-config.js` contains the Supabase project URL and publishable key. Publishable keys are designed for browser use and rely on correct Row Level Security policies. Never add a Supabase secret/service-role key or passwords to this repository.
- The owner created the Supabase Auth user, added its UID to `public.admin_users`, disabled public sign-ups, and confirmed admin sign-in and image upload work.
- Supabase Data API access is limited to the three required `public` tables, with automatic exposure disabled. Row Level Security is enabled on those tables. The public `property-images` bucket allows public reads and admin-only writes.

## Preview locally

From the project folder, run:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Supabase setup

The SQL schema and policies are in `supabase/schema.sql`. To provision another admin, create their user in Supabase Dashboard → Authentication → Users, then run this query in the project's SQL Editor with that user's UID:

```sql
insert into public.admin_users (user_id)
values ('PASTE-USER-UID-HERE')
on conflict (user_id) do nothing;
```

Only an approved member can open the Admin workspace. Public sign-ups should remain disabled. Never add a Supabase secret/service-role key or an account password to this repository.

For newly created Supabase projects, confirm `public` is exposed to the Data API in the project's API settings. Keep Row Level Security enabled for all exposed tables; see [Supabase API security guidance](https://supabase.com/docs/guides/api/securing-your-api).
