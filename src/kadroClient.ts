// Thin wrapper around Kadro's Api::Agent::V1 REST API
// (see Main-Rails: app/controllers/api/agent/v1/*).

const BASE_URL = process.env.KADRO_API_BASE_URL ?? "https://www.kadro.co/api/agent/v1";
const TOKEN = process.env.KADRO_API_TOKEN;

export class KadroApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      body && typeof body === "object" && "errors" in (body as Record<string, unknown>)
        ? JSON.stringify((body as Record<string, unknown>).errors)
        : `HTTP ${status}`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!TOKEN) {
    throw new Error(
      "KADRO_API_TOKEN is not set. Run `npm run register` once to get a token from " +
        "POST /api/agent/v1/partners/register, then put it in .env."
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => undefined);
  if (!res.ok) {
    throw new KadroApiError(res.status, json);
  }
  return json as T;
}

export interface ShootType {
  id: number;
  title: string;
}

export interface PhotographerSummary {
  uid: string;
  display_name: string;
  rating: number;
  review_count: number;
  grade: string | null;
  city: string | null;
}

export interface Package {
  id: number;
  title: string;
  price: string;
  duration: string;
  digitals: number;
  is_full: boolean;
  vip: boolean;
}

export interface ReservationCreateParams {
  shoot_type_id: number;
  package_id: number;
  city_id: number;
  photographer_uid: string;
  start_time: string;
  address_latitude: number;
  address_longitude: number;
  address_detail: string;
  shoot_detail?: string;
  guest_display_name?: string;
  idempotency_key?: string;
}

export interface Reservation {
  slug: string;
  price: string;
  currency: string;
  hold_expires_at: string | null;
  status: string;
}

export interface PaymentLink {
  payment_url: string;
  hold_expires_at: string | null;
}

export interface ReservationStatus {
  slug: string;
  status: string;
  hold_expires_at: string | null;
}

export const kadro = {
  listShootTypes: () => request<ShootType[]>("GET", "/shoot_types"),

  searchPhotographers: (shoot_type_id: number, city_id?: number) => {
    const qs = new URLSearchParams({ shoot_type_id: String(shoot_type_id) });
    if (city_id !== undefined) qs.set("city_id", String(city_id));
    return request<PhotographerSummary[]>("GET", `/photographers?${qs}`);
  },

  getPackages: (photographer_uid: string, shoot_type_id: number) => {
    const qs = new URLSearchParams({ shoot_type_id: String(shoot_type_id) });
    return request<Package[]>(
      "GET",
      `/photographers/${encodeURIComponent(photographer_uid)}/packages?${qs}`
    );
  },

  createReservation: (params: ReservationCreateParams) =>
    request<Reservation>("POST", "/reservations", params),

  getPaymentLink: (slug: string) =>
    request<PaymentLink>("POST", `/reservations/${encodeURIComponent(slug)}/payment_link`),

  getStatus: (slug: string) =>
    request<ReservationStatus>("GET", `/reservations/${encodeURIComponent(slug)}/status`),
};
