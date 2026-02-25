import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, assetComments, assets, orders, sellers } from "@/db/schema";

export type MarketplaceStats = {
  agentCount: number;
  sellerCount: number;
  assetCount: number;
  orderCount: number;
  commentCount: number;
};

export type AgentListItem = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  xClaimVerified: boolean;
  sellerReviewStatus: string | null;
  reputationScore: number | null;
  reputationStars: number | null;
  createdAt: Date;
};

export type AssetListItem = {
  id: string;
  title: string;
  description: string | null;
  assetType: string;
  price: number;
  currency: string;
  inventory: number;
  status: string;
  sellerAgentId: string;
  sellerName: string;
  createdAt: Date;
  commentCount: number;
  averageRating: number | null;
};

export type AssetCommentItem = {
  id: string;
  reviewerAgentId: string;
  reviewerName: string;
  rating: number;
  content: string;
  createdAt: Date;
};

export type AssetDetail = AssetListItem & {
  sellerReviewStatus: string | null;
  sellerReputationScore: number | null;
  sellerReputationStars: number | null;
  comments: AssetCommentItem[];
};

export async function getMarketplaceStats(): Promise<MarketplaceStats> {
  const [agentsQ, sellersQ, assetsQ, ordersQ, commentsQ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(agents),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(sellers)
      .where(eq(sellers.reviewStatus, "approved")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(assets)
      .where(eq(assets.status, "approved")),
    db.select({ count: sql<number>`count(*)::int` }).from(orders),
    db.select({ count: sql<number>`count(*)::int` }).from(assetComments)
  ]);

  return {
    agentCount: Number(agentsQ[0]?.count ?? 0),
    sellerCount: Number(sellersQ[0]?.count ?? 0),
    assetCount: Number(assetsQ[0]?.count ?? 0),
    orderCount: Number(ordersQ[0]?.count ?? 0),
    commentCount: Number(commentsQ[0]?.count ?? 0)
  };
}

export async function listAgents(limit = 50): Promise<AgentListItem[]> {
  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      description: agents.description,
      status: agents.status,
      xClaimVerifiedAt: agents.xClaimVerifiedAt,
      createdAt: agents.createdAt,
      sellerReviewStatus: sellers.reviewStatus,
      reputationScore: sellers.reputationScore,
      reputationStars: sellers.reputationStars
    })
    .from(agents)
    .leftJoin(sellers, eq(sellers.agentId, agents.id))
    .orderBy(desc(agents.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    xClaimVerified: Boolean(row.xClaimVerifiedAt),
    sellerReviewStatus: row.sellerReviewStatus ?? null,
    reputationScore: row.reputationScore === null ? null : Number(row.reputationScore),
    reputationStars: row.reputationStars === null ? null : Number(row.reputationStars),
    createdAt: row.createdAt
  }));
}

export async function listApprovedAssets(limit = 60): Promise<AssetListItem[]> {
  const rows = await db
    .select({
      id: assets.id,
      title: assets.title,
      description: assets.description,
      assetType: assets.assetType,
      price: assets.price,
      currency: assets.currency,
      inventory: assets.inventory,
      status: assets.status,
      sellerAgentId: agents.id,
      sellerName: agents.name,
      createdAt: assets.createdAt
    })
    .from(assets)
    .innerJoin(agents, eq(agents.id, assets.sellerAgentId))
    .where(eq(assets.status, "approved"))
    .orderBy(desc(assets.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const assetIds = rows.map((row) => row.id);
  const summaryRows = await db
    .select({
      assetId: assetComments.assetId,
      commentCount: sql<number>`count(*)::int`,
      averageRating: sql<number>`round(avg(${assetComments.rating})::numeric, 2)::float`
    })
    .from(assetComments)
    .where(inArray(assetComments.assetId, assetIds))
    .groupBy(assetComments.assetId);

  const summaryMap = new Map(
    summaryRows.map((row) => [
      row.assetId,
      {
        commentCount: Number(row.commentCount ?? 0),
        averageRating: row.averageRating === null ? null : Number(row.averageRating)
      }
    ])
  );

  return rows.map((row) => {
    const summary = summaryMap.get(row.id);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      assetType: row.assetType,
      price: Number(row.price),
      currency: row.currency,
      inventory: row.inventory,
      status: row.status,
      sellerAgentId: row.sellerAgentId,
      sellerName: row.sellerName,
      createdAt: row.createdAt,
      commentCount: summary?.commentCount ?? 0,
      averageRating: summary?.averageRating ?? null
    };
  });
}

export async function getApprovedAssetDetail(assetId: string): Promise<AssetDetail | null> {
  const [assetRow] = await db
    .select({
      id: assets.id,
      title: assets.title,
      description: assets.description,
      assetType: assets.assetType,
      price: assets.price,
      currency: assets.currency,
      inventory: assets.inventory,
      status: assets.status,
      sellerAgentId: agents.id,
      sellerName: agents.name,
      sellerReviewStatus: sellers.reviewStatus,
      sellerReputationScore: sellers.reputationScore,
      sellerReputationStars: sellers.reputationStars,
      createdAt: assets.createdAt
    })
    .from(assets)
    .innerJoin(agents, eq(agents.id, assets.sellerAgentId))
    .leftJoin(sellers, eq(sellers.agentId, agents.id))
    .where(and(eq(assets.id, assetId), eq(assets.status, "approved")))
    .limit(1);

  if (!assetRow) return null;

  const [summary] = await db
    .select({
      commentCount: sql<number>`count(*)::int`,
      averageRating: sql<number>`round(avg(${assetComments.rating})::numeric, 2)::float`
    })
    .from(assetComments)
    .where(eq(assetComments.assetId, assetId));

  const comments = await db
    .select({
      id: assetComments.id,
      reviewerAgentId: assetComments.reviewerAgentId,
      reviewerName: agents.name,
      rating: assetComments.rating,
      content: assetComments.content,
      createdAt: assetComments.createdAt
    })
    .from(assetComments)
    .innerJoin(agents, eq(agents.id, assetComments.reviewerAgentId))
    .where(eq(assetComments.assetId, assetId))
    .orderBy(desc(assetComments.createdAt));

  return {
    id: assetRow.id,
    title: assetRow.title,
    description: assetRow.description,
    assetType: assetRow.assetType,
    price: Number(assetRow.price),
    currency: assetRow.currency,
    inventory: assetRow.inventory,
    status: assetRow.status,
    sellerAgentId: assetRow.sellerAgentId,
    sellerName: assetRow.sellerName,
    createdAt: assetRow.createdAt,
    commentCount: Number(summary?.commentCount ?? 0),
    averageRating: summary?.averageRating === null ? null : Number(summary?.averageRating),
    sellerReviewStatus: assetRow.sellerReviewStatus ?? null,
    sellerReputationScore: assetRow.sellerReputationScore === null ? null : Number(assetRow.sellerReputationScore),
    sellerReputationStars: assetRow.sellerReputationStars === null ? null : Number(assetRow.sellerReputationStars),
    comments
  };
}
