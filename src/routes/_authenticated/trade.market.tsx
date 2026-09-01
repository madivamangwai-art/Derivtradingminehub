import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, Search, Newspaper } from "lucide-react";
import { getMarketData } from "@/lib/app.functions";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/trade/market")({ component: MarketPage });

const fmtUsd = (n: any) =>
  `${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function MarketPage() {
  const fn = useServerFn(getMarketData);
  const { data, isLoading } = useQuery({
    queryKey: ["market-data"],
    queryFn: () => fn(),
    refetchInterval: 120000,
  });
  const markets = data?.markets ?? [];
  const indices = markets.slice(3);
  const hot = markets.slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search" readOnly />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(indices.length ? indices : hot).map((item: any) => (
          <MarketTile key={item.label} item={item} compact />
        ))}
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Hot</h2>
          {isLoading ? <span className="text-xs text-muted-foreground">Loading...</span> : null}
        </div>
        <div className="divide-y divide-border/60">
          {hot.map((item: any) => (
            <Link
              key={item.label}
              to="/trade/mine"
              className="flex items-center justify-between py-3 text-sm"
            >
              <div>
                <div className="font-semibold">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.name}</div>
              </div>
              <QuoteValue item={item} />
            </Link>
          ))}
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">News</h2>
        </div>
        {(data?.news ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No news available right now.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {data!.news.map((item: any) => (
              <a
                key={`${item.title}-${item.pubDate}`}
                href={item.link}
                target="_blank"
                rel="noreferrer"
                className="block py-3"
              >
                <div className="text-sm font-semibold leading-snug">{item.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.pubDate).toLocaleString()}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MarketTile({ item, compact = false }: { item: any; compact?: boolean }) {
  const positive = Number(item.change ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="text-sm font-bold">{item.label}</div>
      <div className={`mt-1 text-xs font-semibold ${positive ? "text-success" : "text-destructive"}`}>
        {fmtUsd(item.price)}
      </div>
      <div className={`text-xs ${positive ? "text-success" : "text-destructive"}`}>
        {positive ? "+" : ""}
        {Number(item.change ?? 0).toFixed(2)}%
      </div>
      <svg viewBox="0 0 80 40" className="mt-2 h-12 w-full">
        <polyline
          points={positive ? "4,34 16,24 28,28 40,16 52,20 64,10 76,14" : "4,12 16,20 28,15 40,22 52,17 64,24 76,34"}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={positive ? "text-success" : "text-destructive"}
        />
      </svg>
      {!compact ? <div className="text-[10px] text-muted-foreground">{item.name}</div> : null}
    </div>
  );
}

function QuoteValue({ item }: { item: any }) {
  const positive = Number(item.change ?? 0) >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="text-right">
      <div className="font-semibold">{fmtUsd(item.price)}</div>
      <div className={`flex items-center justify-end text-xs ${positive ? "text-success" : "text-destructive"}`}>
        <Icon className="h-3 w-3" />
        {positive ? "+" : ""}
        {Number(item.change ?? 0).toFixed(2)}%
      </div>
    </div>
  );
}
