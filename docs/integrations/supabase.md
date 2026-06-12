# Supabase

Lets agents query and modify data in your Supabase project via its REST API, using the project URL and the service-role secret key.

[Supabase API keys documentation](https://supabase.com/docs/guides/api/api-keys)

## What you need

| Field       | Required | Notes                                     |
| ----------- | -------- | ----------------------------------------- |
| Project URL | Yes      | e.g. `https://xyzcompany.supabase.co`     |
| Secret Key  | Yes      | Secret — the project's `service_role` key |

## Getting your keys

1. Open your project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Go to **Project Settings → API**.
3. Copy the **Project URL** into the credential form.
4. Under **Project API keys**, reveal and copy the **service_role** key.

::: danger service_role bypasses Row Level Security
The service-role key has **full read/write access to all data** in your project — RLS policies do not apply to it. Attach this credential only to agents you fully trust, and never to agents that process untrusted input.
:::
