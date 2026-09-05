// Where the backend lives.
//
// After you deploy the worker (see api/README.md) paste its URL here — no
// trailing slash. It looks like:
//
//   window.MEMORIAL_API = "https://memorial-api.YOURNAME.workers.dev";
//
// Once the site and the worker share a custom domain, set this to "" instead.
// The page then calls /api/... on its own origin, which is faster and means
// nothing to update if the worker URL ever changes.
window.MEMORIAL_API = "";
