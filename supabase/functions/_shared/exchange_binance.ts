export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export type FundingRateRow = { fundingRate: string; fundingTime: number; symbol: string };
export type OpenInterestRow = { openInterest: string; symbol: string; time?: number };

export async function getFundingRateNow(baseUrl: string, symbol: string) {
  const url = `${baseUrl}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`;
  const data = await fetchJson<any>(url);
  return {
    fundingRate: Number(data?.lastFundingRate ?? 0),
    markPrice: Number(data?.markPrice ?? 0),
    time: Number(data?.time ?? Date.now()),
  };
}

export async function getFundingRateHistory(baseUrl: string, symbol: string, limit = 24) {
  const url = `${baseUrl}/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  return await fetchJson<FundingRateRow[]>(url);
}

export async function getOpenInterest(baseUrl: string, symbol: string) {
  const url = `${baseUrl}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`;
  const data = await fetchJson<any>(url);
  return {
    openInterest: Number(data?.openInterest ?? 0),
    time: Date.now(),
  };
}
