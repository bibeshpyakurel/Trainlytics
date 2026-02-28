import { jsonError } from "@/lib/apiResponse";

// Disabled to prevent account enumeration and auth-admin abuse.
export async function POST() {
  return jsonError("This endpoint is no longer available.", 410);
}
