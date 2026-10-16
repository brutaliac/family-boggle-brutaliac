# Family Boggle

A live Boggle game for the whole family. Everyone opens the same link in a
browser (phone, tablet or computer), no accounts or app installs. Anyone can
start a round; everyone plays the same board at the same time.

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
