import { env } from "@/lib/env";

type ClaimLite = {
  id: string;
  claimToken: string;
  verificationCode: string;
  xHandle: string | null;
};

type VerificationResult = {
  claimId: string;
  claimToken: string;
  code: string;
  matched: boolean;
  reason: string | null;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildBatchQuery(codes: string[]) {
  const orCodes = codes.map((code) => `"${code}"`).join(" OR ");
  // We verify claims by checking posts that mention @clawshoppingai (or hashtag)
  // and include one of the verification codes.
  return `(${orCodes}) (@clawshoppingai OR #ClawShopping) -is:retweet -is:reply`;
}

async function searchRecent(query: string) {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", "100");
  url.searchParams.set("tweet.fields", "created_at,text,author_id");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.X_BEARER_TOKEN}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false as const, error: `X_API_ERROR:${res.status}:${text.slice(0, 120)}` };
  }

  const json = (await res.json()) as {
    data?: Array<{ created_at?: string; text?: string }>;
  };

  return { ok: true as const, tweets: json.data ?? [] };
}

export async function verifyClaimsByXBatch(input: {
  claims: ClaimLite[];
  windowMinutes: number;
}) {
  if (!env.X_BEARER_TOKEN) {
    return input.claims.map((claim) => ({
      claimId: claim.id,
      claimToken: claim.claimToken,
      code: claim.verificationCode,
      matched: false,
      reason: "X_BEARER_TOKEN_MISSING"
    }));
  }

  const results = new Map<string, VerificationResult>();
  for (const claim of input.claims) {
    results.set(claim.id, {
      claimId: claim.id,
      claimToken: claim.claimToken,
      code: claim.verificationCode,
      matched: false,
      reason: "NO_MATCH"
    });
  }

  const threshold = Date.now() - input.windowMinutes * 60 * 1000;
  const chunks = chunk(input.claims, 20);

  for (const part of chunks) {
    const codes = part.map((c) => c.verificationCode);
    const query = buildBatchQuery(codes);
    const searched = await searchRecent(query);

    if (!searched.ok) {
      for (const claim of part) {
        const current = results.get(claim.id);
        if (current && !current.matched) current.reason = searched.error;
      }
      continue;
    }

    const tweets = searched.tweets.filter((tweet) => {
      const createdAt = tweet.created_at ? new Date(tweet.created_at).getTime() : 0;
      return Boolean(createdAt && createdAt >= threshold);
    });

    for (const claim of part) {
      const codeLc = claim.verificationCode.toLowerCase();
      const matched = tweets.some((tweet) => (tweet.text ?? "").toLowerCase().includes(codeLc));
      if (matched) {
        const current = results.get(claim.id);
        if (current) {
          current.matched = true;
          current.reason = null;
        }
      }
    }
  }

  return [...results.values()];
}
