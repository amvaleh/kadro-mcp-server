// One-time helper: registers this server as a Kadro API partner and prints
// the token to put in .env as KADRO_API_TOKEN. Run with:
//   npm run register -- "your-platform-name" "you@example.com"
import "dotenv/config";

const BASE_URL = process.env.KADRO_API_BASE_URL ?? "https://www.kadro.co/api/agent/v1";

async function main() {
  const [name, contact_email] = process.argv.slice(2);
  if (!name || !contact_email) {
    console.error('Usage: npm run register -- "platform-name" "contact@email.com"');
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/partners/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, contact_email }),
  });
  const body = await res.json();

  if (!res.ok) {
    console.error("Registration failed:", body);
    process.exit(1);
  }

  console.log("Registered. Add this to .env:");
  console.log(`KADRO_API_TOKEN=${body.token}`);
  console.log(`(daily_limit: ${body.daily_limit} — email Kadro to request a higher one)`);
}

main();
