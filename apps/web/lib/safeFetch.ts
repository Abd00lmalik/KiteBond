export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: string
  ) {
    super(message);
  }
}

export async function safeFetch<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    throw new ApiError(
      `Network error: ${networkErr instanceof Error ? networkErr.message : "Unknown"}`,
      0,
      ""
    );
  }

  let text = "";
  try {
    text = await res.text();
  } catch {
    throw new ApiError(`Could not read response body (status ${res.status})`, res.status, "");
  }

  if (!text || text.trim() === "") {
    throw new ApiError(
      `Empty response from server (status ${res.status}). The server may have timed out.`,
      res.status,
      ""
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const preview = text.slice(0, 120).replace(/\n/g, " ");
    throw new ApiError(`invalid json (status ${res.status}): ${preview}`, res.status, text);
  }

  if (!res.ok) {
    const errObj = parsed as Record<string, unknown>;
    const apiMessage = (errObj.message as string) || (errObj.error as string) || `Request failed (${res.status})`;
    throw new ApiError(apiMessage, res.status, text);
  }

  return parsed as T;
}
