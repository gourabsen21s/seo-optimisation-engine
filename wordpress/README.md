# SEO Engine Bridge (WordPress plugin)

Lets the SEO Optimization Engine apply fixes to a WordPress site through the REST API:

- makes SEO fields writable over REST — Rank Math, Yoast, or a built-in fallback when neither is installed
  (title, meta description, canonical, Open Graph)
- outputs JSON-LD stored by the engine (sitewide and per post/page)
- serves `robots.txt`, `ads.txt` and `llms.txt` without SFTP access (a physical file in the web root still wins)

All routes require an Administrator (`manage_options`).

## Install

1. Zip the `seo-engine-bridge/` folder, then in WordPress go to **Plugins → Add New → Upload Plugin**, or copy the
   folder to `wp-content/plugins/`.
2. Activate **SEO Engine Bridge**.
3. Create an Application Password: **Users → Profile → Application Passwords**.
4. In the engine UI, open the site's **Settings → Connector**, choose *WordPress*, and enter the site URL, admin
   username and application password. Click **Test connection**; it should report `bridge_installed: true`.
