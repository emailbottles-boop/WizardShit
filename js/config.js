// Backend configuration.
//
// After deploying the worker in api/ (see api/README.md), paste its URL here,
// e.g. "https://wizardshit-api.YOURNAME.workers.dev" — no trailing slash.
//
// While this is empty the site simply shows the content baked into the HTML,
// so nothing breaks before the backend exists (or if it's ever unreachable).
window.WIZ_API_BASE = "https://wizardshit.store";

// Donations by Stripe Payment Link.
//
// Paste the link Stripe gives you (Dashboard → Payment Links → your donation
// link, e.g. "https://donate.stripe.com/..." or "https://buy.stripe.com/...")
// and every DONATE button on the site sends people to it.
//
// While this is empty the DONATE buttons keep their original link. If the
// Worker has STRIPE_SECRET_KEY set, its on-site donate popup takes over
// instead, whatever is here.
window.WIZ_DONATE_LINK = "";
