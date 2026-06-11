// Single place to turn an axios/API error into a message staff can act on.
// Offline/network failures get an explicit "not saved" message — paper-first users
// must never be left unsure whether an entry was recorded.
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const e = error as any;
  if (e?.message === "Network Error" || e?.code === "ERR_NETWORK" || e?.code === "ECONNABORTED") {
    return "You're offline — this hasn't been saved. Check your connection and try again.";
  }
  const serverMessage =
    typeof e?.response?.data?.message === "string" ? e.response.data.message :
    typeof e?.response?.data?.error === "string" ? e.response.data.error : undefined;
  return serverMessage ?? e?.message ?? fallback;
}
