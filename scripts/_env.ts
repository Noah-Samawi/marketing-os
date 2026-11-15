// Loads .env.local for CLI scripts (Next.js does this itself for the app).
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: scripts still run, LLM features fall back or stay disabled.
}
