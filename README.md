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
js/auth.js      Session handling and route guards
js/demo-users.js Demo credential seed (development only)
js/login.js     Login form validation and submission
js/nav.js       Shared site header, rendered on every page
js/pokedex.js   List, search, filter, and detail dialog
```

## Authentication

**The current login is a demo and provides no real security.** Credentials are
checked in the browser against `js/demo-users.js`, which anyone can read. It
exists so the surrounding flow — validation, error states, sessions, guarded
pages, sign-out — is real and testable.

Demo credentials are listed in `js/demo-users.js` and shown on the login page.

Sessions are stored in `sessionStorage` by default, or `localStorage` when
"Keep me signed in" is checked, and expire after 12 hours.

### Making it real

Replace the body of `signIn` in `js/auth.js` with a call to your API:

```js
signIn: async function (email, password, remember) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) return { ok: false, error: "Invalid email or password." };
  return { ok: true, user: await res.json() };
}
```

Then delete `js/demo-users.js` and its `<script>` tags, and let the server set
an httpOnly session cookie. The guards (`requireAuth`, `redirectIfAuthenticated`)
and the login page need no changes.

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
