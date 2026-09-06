import type { Metadata } from "next";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { notFound } from "next/navigation";
import { ArrowUpRight, Compass, Sparkles } from "lucide-react";
import { CityHero } from "@/components/ui/CityHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/config";

async function fetchShare(id: string): Promise<Share | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/share/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Share;
  } catch {
    return null;
  }
}

interface Share {
  id: string;
  title: string;
  city: string;
  country: string;
  days: number;
  markdown: string;
  /** Handle of whoever shared it. Empty for anonymous and pre-handle shares. */
  author?: string;
  created_at: string;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const share = await fetchShare(id);
  if (!share) return { title: "Trip not found" };
  const desc = `A ${share.days || ""}-day itinerary${
    share.city ? ` for ${share.city}${share.country ? `, ${share.country}` : ""}` : ""
  }${share.author ? ` shared by @${share.author}` : ""} — assembled with Wayfare. Read-only shared trip.`;

  return {
    title: share.title,
    description: desc,
    openGraph: {
      title: share.title,
      description: desc,
      type: "article",
      siteName: "Wayfare",
    },
    twitter: {
      card: "summary_large_image",
      title: share.title,
      description: desc,
    },
  };
}

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await fetchShare(id);
  if (!share) notFound();

  const createdOn = new Date(share.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 md:py-14" data-testid="shared-trip-view">
      {/* Meta strip */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          <Compass className="w-3 h-3 text-[var(--accent-hover)]" strokeWidth={2} />
          {share.author ? (
            <>Shared by <span className="text-[var(--fg)] normal-case">@{share.author}</span> · Read-only</>
          ) : (
            <>Shared via Wayfare · Read-only</>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[var(--fg-dim)] uppercase tracking-[0.12em]">
            {createdOn}
          </span>
          <Badge variant="secondary" className="font-mono">
            #{share.id}
          </Badge>
        </div>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="font-display text-5xl md:text-7xl leading-[0.95] tracking-tight text-[var(--fg)]">
          {share.title}
        </h1>
        {(share.city || share.days > 0) && (
          <p className="mt-4 text-[15px] text-[var(--fg-muted)]">
            {share.days > 0 && <span>{share.days}-day itinerary</span>}
            {share.days > 0 && share.city && <span> · </span>}
            {share.city && (
              <span className="font-display-italic">
                {share.city}
                {share.country ? `, ${share.country}` : ""}
              </span>
            )}
          </p>
        )}
      </div>

      {/* Hero */}
      {share.city && (
        <div className="mb-10">
          <CityHero city={share.city} country={share.country || undefined} />
        </div>
      )}

      {/* Markdown body */}
      <article className="prose-trip text-[15px] leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{share.markdown}</ReactMarkdown>
      </article>

      {/* Footer CTA */}
      <div className="mt-16 border-t border-[var(--border)] pt-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-2">
            <Sparkles className="w-3 h-3 text-[var(--accent-hover)]" strokeWidth={2} />
            Want your own?
          </div>
          <h2 className="font-display text-2xl md:text-3xl leading-tight">
            Draft a similar trip in a minute.
          </h2>
        </div>
        <Button asChild size="lg" data-testid="share-cta-plan">
          <Link href="/planner">
            Open the planner
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        </Button>
      </div>
    </div>
  );
}
