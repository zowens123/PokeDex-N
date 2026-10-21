# PokeDex

A static Pokédex built on [PokéAPI](https://pokeapi.co), with a demo sign-in flow
and a few sandbox pages used for analytics testing.

No build step, no dependencies — open the files over any static server.

## Running locally

Browsers block some behavior on `file://` URLs, so serve the folder rather than
double-clicking the HTML:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Layout

```
index.html      Pokédex grid (sign-in required)
login.html      Sign-in page
other.html      Scratch page — forms and click targets
segment.html    Scratch page — Segment analytics snippet
test.html       Pokédex + New Relic browser agent (public)

css/style.css   Design system: tokens, primitives, components
js/analytics.js Novus by Pendo: boot, identify, Track Events, sign-out reset
js/auth.js      Session handling and route guards
js/login.js     Login form validation and submission
js/nav.js       Shared site header, rendered on every page
js/pokedex.js   List, search, filter, and detail dialog
```

## Authentication

**The login is open and provides no real security.** There are no accounts:
any non-empty username and password sign you in. The username becomes the
session identity (and the Pendo visitor id), with a display name derived from
it — `ash.ketchum` shows as *Ash Ketchum*. It exists so the surrounding flow —
validation, error states, sessions, guarded pages, sign-out, analytics
identify — is real and testable, and so each sign-in can be a distinct visitor.

Sessions are stored in `sessionStorage` by default, or `localStorage` when
"Keep me signed in" is checked, and expire after 12 hours.

### Making it real

Replace the body of `signIn` in `js/auth.js` with a call to your API:

```js
signIn: async function (username, password, remember) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) return { ok: false, error: "Invalid username or password." };
  return { ok: true, user: await res.json() };
}
```

Let the server set an httpOnly session cookie. The guards (`requireAuth`,
`redirectIfAuthenticated`) and the login page need no changes.

Note that client-side guards are a UX affordance, not a security boundary — the
server must still authorize every request.

### Protected pages

`index.html` calls `requireAuth()` in its `<head>`, before anything paints. To
make the Pokédex public, flip the flag near the top of that file:

```js
var PROTECTED = false;
```

Signed-out visitors are sent to `login.html?next=<page>` and returned to where
they were headed after signing in. The `next` parameter only accepts relative
same-site paths, so it can't be used as an open redirect.

## Pokédex data

One request fetches all 151 names, and the grid paints immediately — artwork
URLs are derived from the id. Type data is then hydrated through a
concurrency-limited pool (8 in flight) and cached in `sessionStorage`, so
reloads are instant and the API isn't hit with 151 serial requests.
