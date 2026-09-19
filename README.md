# Wizard Shit — wizardshit.store

The site for the Wizard Shit animated series, by Madam Studio.

- The pages, images and scripts in this folder are served by GitHub Pages.
- Everything dynamic — the merch shop and cart, donations, the crew pages,
  the mailing list, the message bubble, and the owners' console at
  `/login` — runs on one Cloudflare Worker in [`api/`](api/). Its README has
  the setup and every upgrade note.

Merch is printed to order by Printful and paid for through Stripe on the site
itself. Orders go to print only once the money has reached the bank; see
"the shop" in `api/README.md`.
