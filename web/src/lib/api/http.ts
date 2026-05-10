
import type { ApiError } from "@/types/app";

export async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    return body.error ?? body.message ?? `HTTP_${response.status}`;
  } catch {
    return `HTTP_${response.status}`;
  }
}
