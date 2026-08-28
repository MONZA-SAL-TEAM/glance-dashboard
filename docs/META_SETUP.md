# Instagram & Facebook tracking — setup

Glance's **Social** view reads Instagram and Facebook through the Meta Graph
API. The code is already deployed; it stays dormant and shows setup steps
until the credentials below exist.

**Never commit any of these values.** They go in the Vercel project
environment only, exactly like `GLANCE_SIGNALS_TOKEN`.

## What you need

| Variable | Required | What it is |
|---|---|---|
| `META_ACCESS_TOKEN` | yes | Long-lived Page or System-User access token |
| `META_PROFILES` | yes | JSON list of the accounts to report on |
| `META_API_VERSION` | no | Graph API version, defaults to `v21.0` |

### META_PROFILES format

```json
[
  {"label":"Monza SAL","ig_user_id":"178414...","page_id":"101234..."},
  {"label":"VOYAH Lebanon","ig_user_id":"178415..."},
  {"label":"MHERO Lebanon","ig_user_id":"178416..."}
]
```

Either `ig_user_id` or `page_id` may be omitted — a profile with only an
Instagram id simply reports no Facebook section, and vice versa.

The known Monza handles are `@monzasal.official`, `@voyahlebanon` and
`@mherolebanon`. The API needs the numeric **Instagram Business Account ID**,
not the handle (see below).

## Prerequisites on Meta's side

1. Each Instagram account must be a **Business** or **Creator** account
   (personal accounts have no insights API).
2. Each Instagram account must be **linked to a Facebook Page**.
3. Both must belong to a **Meta Business** portfolio you administer.

## Getting the token and IDs

1. Go to **developers.facebook.com** → create (or reuse) an App of type
   *Business*.
2. Add the **Instagram Graph API** and **Facebook Login** products.
3. In **Graph API Explorer**, select the app, then request these permissions:
   - `instagram_basic`
   - `instagram_manage_insights`
   - `pages_show_list`
   - `pages_read_engagement`
   - `read_insights`
   - `business_management`
4. Generate a **User token**, then exchange it for a **long-lived** token
   (60 days), or better, create a **System User** in Business Settings and
   issue a **non-expiring** System User token. A System User token is the
   right choice for a dashboard — a 60-day token means the Social view dies
   silently every two months.
5. Find the IDs:
   - Page ID: `GET /me/accounts` → the `id` of each Page.
   - Instagram Business Account ID:
     `GET /{page-id}?fields=instagram_business_account` → returns the
     numeric `id` to use as `ig_user_id`.

## Add to Vercel

Project → **Settings → Environment Variables → Production** (mark them
Sensitive), then redeploy. The Social view appears in the site switcher and
fills in on the next load.

## What the view shows

- **Per profile:** followers, reach, views, profile visits, website taps,
  accounts engaged, and a daily reach trend.
- **Top posts:** ranked by total interactions, with reach, likes, comments,
  shares and saves, linking to the post.
- **Audience:** Instagram follower demographics — cities, countries, age,
  gender.
- **Instagram signals:** how many click-outs those audiences actually
  produced on the websites, measured first-party. This is the number that
  connects reach to business outcome — the rest is audience size.

## Known constraints, by design

- **Meta caps insight queries at roughly 30 days.** Selecting 90d / 6m / 12m
  in Glance still shows the last 30 days for this view, and the panel says so
  rather than quietly truncating.
- **Meta retires metrics regularly.** Instagram's `impressions` gave way to
  `views`; a large batch of Page metrics was retired during 2024-25. Every
  metric group is fetched independently, so a retired metric removes that one
  number instead of breaking the page, and anything missing is listed under
  "items Meta did not return" rather than displayed as a zero.
- **Facebook Page reach** depends on which Page insight metrics remain
  available to your app version; if the Page section shows zeros, check that
  note list first.
- If the API version in `META_API_VERSION` has been sunset, Meta's own error
  text is surfaced in that same list — usually a one-line fix.
