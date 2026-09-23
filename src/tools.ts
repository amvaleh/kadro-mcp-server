import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { kadro, KadroApiError } from "./kadroClient.js";

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const text = err instanceof KadroApiError ? err.message : err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text }], isError: true };
}

// A safety note repeated across every reservation-adjacent tool description:
// this server never touches payment or login. It creates a hold and hands
// back a URL; a human opens that URL themselves to verify their phone and
// pay. No tool here accepts or needs card details, passwords, or OTP codes.

export function registerKadroTools(server: McpServer) {
  server.registerTool(
    "search_shoot_types",
    {
      title: "Search Kadro shoot types",
      description:
        "List the photography/videography service types Kadro offers (e.g. wedding, industrial, portrait), " +
        "each with a numeric shoot_type_id. Call this first if you don't already know the id for the kind " +
        "of shoot the user wants.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        return ok(await kadro.listShootTypes());
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "search_photographers",
    {
      title: "Search Kadro photographers",
      description:
        "Find real, bookable photographers for a given shoot_type_id (from search_shoot_types), " +
        "optionally narrowed to a city_id. Returns each photographer's uid (needed for every later call), " +
        "display name, rating, review count, and city.",
      inputSchema: {
        shoot_type_id: z.number().int().describe("A shoot_type_id from search_shoot_types."),
        city_id: z.number().int().optional().describe("Optional Kadro city id to narrow the search."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ shoot_type_id, city_id }) => {
      try {
        return ok(await kadro.searchPhotographers(shoot_type_id, city_id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_photographer_packages",
    {
      title: "Get a photographer's packages and prices",
      description:
        "List the real, currently bookable packages (with prices, in Toman) a specific photographer offers " +
        "for a given shoot_type_id. Rejects the shoot_type_id if that photographer doesn't actually offer it. " +
        "Use the returned package id with create_reservation.",
      inputSchema: {
        photographer_uid: z.string().describe("A photographer uid from search_photographers."),
        shoot_type_id: z.number().int(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ photographer_uid, shoot_type_id }) => {
      try {
        return ok(await kadro.getPackages(photographer_uid, shoot_type_id));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "create_reservation",
    {
      title: "Create a guest photographer reservation",
      description:
        "Book a specific photographer for a specific package, date/time, and address on the user's behalf — " +
        "no login required. This only places a 15-minute hold; it does NOT charge any money and does NOT " +
        "require or accept any payment information. Immediately follow this with get_payment_link and give " +
        "that URL to the human — they open it themselves to verify their phone number and pay. " +
        "start_time must be an ISO 8601 timestamp at least 6 hours in the future. Pass a stable idempotency_key " +
        "if you might retry this call, so a retry can't create a second reservation.",
      inputSchema: {
        shoot_type_id: z.number().int(),
        package_id: z.number().int(),
        city_id: z.number().int(),
        photographer_uid: z.string(),
        start_time: z.string().describe("ISO 8601 timestamp, at least 6 hours from now."),
        address_latitude: z.number(),
        address_longitude: z.number(),
        address_detail: z.string().describe("Human-readable address text for the shoot location."),
        shoot_detail: z.string().optional().describe("Free-text notes about the shoot for the photographer."),
        guest_display_name: z.string().optional().describe("The customer's name, if known."),
        idempotency_key: z
          .string()
          .optional()
          .describe("A key you generate to make retries safe. Reuse it only when retrying the exact same request."),
      },
      // Not readOnly (creates a Project + guest User) and not destructive (no
      // money moves, nothing existing is altered or deleted). idempotentHint
      // is false by default: it's only idempotent when idempotency_key is
      // reused, which callers may not do.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        return ok(await kadro.createReservation(params));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_payment_link",
    {
      title: "Get the payment link for a reservation",
      description:
        "Get a URL for the human to open in their own browser to finish this reservation: verify their phone " +
        "number by SMS code and pay. This is the last step this server ever takes — never ask the user for a " +
        "card number, OTP code, or password, and never try to open, submit, or complete this URL yourself. " +
        "Just hand the URL to the user.",
      inputSchema: {
        slug: z.string().describe("The slug returned by create_reservation."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ slug }) => {
      try {
        return ok(await kadro.getPaymentLink(slug));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_reservation_status",
    {
      title: "Check a reservation's status",
      description:
        "Check whether a reservation has been paid and confirmed. IMPORTANT: status values are " +
        "'awaiting_payment', 'expired', 'paid_awaiting_photographer_confirmation', 'confirmed', and 'rejected'. " +
        "'paid_awaiting_photographer_confirmation' means the customer paid but the photographer has not yet " +
        "accepted the booking and could still decline or ask to reschedule — do not tell the user their " +
        "booking is final until status is exactly 'confirmed'.",
      inputSchema: {
        slug: z.string().describe("The slug returned by create_reservation."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ slug }) => {
      try {
        return ok(await kadro.getStatus(slug));
      } catch (err) {
        return fail(err);
      }
    }
  );
}
