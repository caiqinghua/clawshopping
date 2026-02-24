import { env } from "@/lib/env";

export async function hasVerificationPost(input: {
  xHandle?: string | null;
  verificationCode: string;
  windowMinutes: number;
}) {
  if (!env.X_BEARER_TOKEN) {
    return { matched: false, reason: "X_BEARER_TOKEN_MISSING" };
  }

  const query = input.xHandle
    ? `from:${input.xHandle} \"${input.verificationCode}\" -is:retweet`
    : `\"${input.verificationCode}\" -is:retweet`;
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "10");
  url.searchParams.set("tweet.fields", "created_at,text,author_id");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.X_BEARER_TOKEN}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    return { matched: false, reason: `X_API_ERROR:${res.status}:${text.slice(0, 120)}` };
  }

  const json = (await res.json()) as {
    data?: Array<{ created_at?: string; text?: string }>;
  };

  const threshold = Date.now() - input.windowMinutes * 60 * 1000;
  const codeLc = input.verificationCode.toLowerCase();

  const matched = (json.data ?? []).some((tweet) => {
    const createdAt = tweet.created_at ? new Date(tweet.created_at).getTime() : 0;
    if (!createdAt || createdAt < threshold) return false;
    return (tweet.text ?? "").toLowerCase().includes(codeLc);
  });

  return { matched, reason: matched ? null : "NO_MATCH" };
}
