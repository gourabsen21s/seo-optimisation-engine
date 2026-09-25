"""Live research tools for the AI employees: search results, keyword ideas, competitor pages, domain authority,
Core Web Vitals and indexing. Every external call goes through `research.http` (one client factory, retries,
TTL cache) so it can be stubbed in tests and rate-limited in production."""
