# Family Boggle

A live Boggle game for the whole family. Everyone opens the same link in a
browser (phone, tablet or computer), no accounts or app installs. Anyone can
start a round; everyone plays the same board at the same time.

## Single-player Sudoku

Choose **Play Sudoku** at the bottom of the lobby, below **How to play**.
The **← Boggle** button returns to the same room. Sudoku runs locally and
does not create a Boggle round or write to the multiplayer leaderboard.

Tap a square, then a number. Use Notes to enter pencil marks, Undo to reverse
an edit, Erase to clear a square, and Hint to reveal a value. Keyboard controls:
1–9 enter numbers, arrow keys select squares, N toggles notes, and Backspace
or Delete erases. Pause hides the board. The timer excludes time in a hidden
tab or while the phone is locked. Progress and display preferences are saved
on this device; when browser storage is unavailable, a message explains that
closing the tab will lose progress. Undo history lasts for the current visit.

Easy, Medium, and Hard use curated, uniquely solvable base puzzles transformed
by shuffled digits, bands, stacks, rows/columns within them, and transposition.
These transformations preserve solving logic and uniqueness. Easy is solvable
with naked singles, Medium also needs hidden singles, and Hard needs techniques
beyond those two. Each generated puzzle is checked for exactly one solution.
Difficulty changes apply when **New puzzle** is confirmed. Hints reveal a value;
they do not teach a solving technique. There is no hint limit.

Deploy `sudoku.html`, `sudoku.css`, `sudoku-engine.js`, and `sudoku.js` beside
`index.html` in the same directory served by `server.js` (root or `public/`).
No new dependencies or environment variables are required.

## Scoring and boards

Words score 1 point for 3 letters, 2 for 4, 3 for 5, and one more point for
each additional letter. Qu is one tile but counts as two letters. In multiplayer,
words found by just one player earn double points when the round ends; shared
words still earn base points. Solo rounds use base points. Word-entry feedback
shows base points; the unique-word bonus is determined at the end.

New rounds use these rules for results, wins, and saved statistics. Existing
leaderboard history is preserved at its original scores.

Boards roll one face from each of the 16 classic English dice, then shuffle
their positions. By default, the generator favors boards with at least 50 words,
a word of at least 7 letters, and at least 3 distinct words of 4+ letters ending
in "er". Boards below the "er" target have a 30% chance of passing that filter.
These thresholds can be overridden with the `BOGGLE_MIN_WORDS`, `BOGGLE_MIN_LONG`,
`BOGGLE_MIN_ER`, and `BOGGLE_ER_SOFT` environment variables.

## Run it on your own computer (to try it)

    npm install
    npm start

Then open http://localhost:3000 in two browser windows and play against yourself.

## Put it online for the family (Render, free)

Vercel can't host this one, because the game keeps live connections open. Render can.

1. Create a free account at https://github.com and make a new repository
   (for example `family-boggle`). Use "Add file > Upload files" and drag in
   everything from this folder (`server.js`, `package.json`, `public/`,
   `README.md`). Do not upload a `node_modules` folder.
2. Create a free account at https://render.com and sign in with GitHub.
3. New > Web Service > pick the `family-boggle` repository.
4. Settings: Runtime `Node`, Build Command `npm install`, Start Command
   `npm start`, Instance Type `Free`. Click Deploy.
5. After a few minutes Render shows an address like
   `https://family-boggle.onrender.com`. That is the link to send everyone.

On the free plan the game goes to sleep after 15 minutes with no activity and
takes about a minute to wake up. Open the link a few minutes before game time.
Nothing needs saving: scores are shown at the end of each round.

## Add to a phone's home screen

iPhone: open the link in Safari, tap Share, then Add to Home Screen.
Android: open in Chrome, tap the menu, then Add to Home screen.

## All-time leaderboard and keeping it safe

The lobby has an "All-time leaderboard": most wins, best round, longest word, most words in a
round, longest win streak and total points. It counts by name. Each finished round is saved to
`data/stats.json` next to the server.

On Render's free plan that folder is wiped whenever the service sleeps or redeploys, so the
stats are also copied to a **secret GitHub Gist** (free, on your own GitHub account) and loaded
back when the server starts. To turn that on, add one setting:

1. On GitHub: your picture > Settings > Developer settings > Personal access tokens >
   Tokens (classic) > Generate new token (classic). Name it `family-boggle backup`, pick an
   expiration, tick ONLY the `gist` box, and generate. Copy the token (it starts with `ghp_`).
2. On Render: your service > Environment > Add Environment Variable. Key `GITHUB_TOKEN`,
   value is the token. Save (Render redeploys).
3. After the first finished round, a secret gist called `family-boggle-stats.json` appears at
   https://gist.github.com. Leave it alone. The game reads and updates it by itself.

On a home server, point `DATA_DIR` at a folder that survives restarts (for example a Docker
volume). Set `GITHUB_TOKEN` there too to keep the Gist as a spare copy, and to pull in the
history already saved from Render. Only run ONE server against the same Gist at a time,
otherwise they overwrite each other's backup (stop or delete the Render service when you move).

You can look at the raw numbers at `/stats.json` (add `?room=name` for another room).

## Good to know

- Everyone who opens the same link plays together. To run a second, separate
  game (for example another branch of the family), add `?room=name` to the
  link, such as `https://family-boggle.onrender.com/?room=cousins`.
- There is a chat (speech-bubble button at the top). Everyone in the same room can chat during the lobby, countdown, round and results. The last 100 messages are kept while the server stays awake.
- The winner of each round gets a crown. Win streaks (rounds won in a row) show next to the crown from 2 wins on, and reset when someone else wins. Ties crown everyone tied, and a solo round never changes a streak. Streaks live in the server's memory, so they reset if Render restarts.
- Tap the "Family Boggle" title at any time to get back to the lobby (invite link, who is here, next round). While a round is running, the Start button waits until it ends, and a banner takes you back to the game.
- The gear button at the top lets anyone change their name at any time. Someone who opens the link in the middle of a round gets the name box right away.
- About 7 in 10 boards have at least 3 words ending in -er (not every board, but far more than pure chance gives). Tap the "N here" badge at the top to see who is connected.
- The page files (`index.html`, `manifest.webmanifest`, `icon.png`) can sit in a `public` folder or directly next to `server.js`; the server finds them either way.
- Every board is guaranteed to hold at least 50 words, including at least one word of 7 or more letters (the server re-rolls other boards before the round starts).
- If a phone loses Wi-Fi, it reconnects by itself and keeps the words it found.
- Word checking uses a list of about 50,000 everyday English words built into the page
  (obscure Scrabble-only words and names are left out). It lives in `public/index.html`.

## Room voice chat

The compact voice bar is available in the lobby, during rounds, and on results.
Enter a name, choose **Join Voice**, and allow microphone access. The microphone
icon is green while on and red while muted; click it to toggle outgoing audio
while you keep listening. A speech activity pulse uses local microphone levels
without recording. The exit icon stops the microphone and closes calls.
Click the avatar stack to see everyone and their connection and microphone status.
Avatars wrap after five participants. Joining is always manual, including after a lost
connection. Game sound settings do not mute voice. If the browser blocks incoming
sound, tap **Enable voice audio**. Headphones help prevent echo.

Voice is audio-only WebRTC, with up to eight participants per room. The app server
relays connection messages through the existing WebSocket; audio travels between
participants directly or through your configured TURN relay. The app does not
record audio. Production microphone access requires HTTPS (localhost works for
local testing). Room links grant access to both the game and its voice channel.

### Relay configuration for Coolify

STUN discovery works by default, but **configure TURN before relying on voice
across different households, cellular connections, or restrictive Wi-Fi**. TURN
provides an alternate route when browsers cannot connect directly.

Use either of these configurations in the Boggle application's Coolify environment:

- For a coturn-compatible relay using shared-secret authentication, set
  `VOICE_TURN_URLS` to comma-separated URLs such as
  `turn:relay.example.com:3478,turns:relay.example.com:5349`, and
  `VOICE_TURN_SECRET` to the same shared secret configured on that relay. The
  application issues credentials valid for 24 hours; the shared secret is never
  sent to browsers. Rejoin voice to obtain fresh credentials for a longer session.
- For a relay provider that supplies ICE configuration, set `VOICE_ICE_SERVERS`
  to its JSON array of `RTCIceServer` objects, for example
  `[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turns:relay.example.com:5349","username":"<relay-user>","credential":"<relay-password>"}]`.
  These client credentials are delivered to voice participants; use credentials
  intended for browser clients. This variable replaces the default STUN list.

Save the environment and redeploy. A TURN relay is a separate service and must
be reachable directly on its configured transport and media ports; the existing
Cloudflare HTTP tunnel for the game does not supply a TURN relay. There is no
need to change the game's HTTP port or WebSocket route.

Try two devices on different networks before inviting everyone. If a participant
shows a failed connection, check relay configuration, then leave and rejoin voice.
Mobile browsers may interrupt calls when backgrounded or the phone locks; keep
the game open during play.

### Checks

Run `npm test` for room isolation, session validation, mute/leave/disconnect,
replacement tabs, capacity, TURN credentials, and asset delivery checks.


### Merge duplicate player stats

Set `BOGGLE_ADMIN_PASSWORD` to a long, unique password in the server environment (Coolify: Environment Variables), redeploy, then visit `/admin` on the game’s HTTPS address. Admin access is disabled until the variable is set. The password stays in page memory only; locking or reloading clears it.

Select a room, the duplicate name, and the profile to retain. Review the preview and confirm. Games, wins, points, and words are added; best round, longest word, most words, and best streak retain the better record. Existing totals cannot reveal overlapping rounds, so review before merging. Merges are blocked during active rounds and when the preview is stale.

The old name redirects future scores to the retained stats record. This does not combine browser sessions or introduce login profiles. Original records and previous aliases are archived in `rooms[room].mergeHistory` inside `stats.json`, including the existing Gist backup. Recovery is manual: stop the server, restore the archived records and aliases in the authoritative stats file, update its `updatedAt`, and restart. Do not restore blindly after additional games.
