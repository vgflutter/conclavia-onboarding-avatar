// Validate injected configuration before the standalone server can accept traffic.
import './check-production.mjs';
await import('../server.js');
