import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, Newspaper, Search, UserRound } from "lucide-react";
import { useState } from "react";
import { getMarketData } from "@/lib/app.functions";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/trade/market")({ component: MarketPage });

const fmtUsd = (n: any) =>
  `${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const brandColors: Record<string, string> = {
  AAPL: "bg-black text-white",
  TSLA: "bg-red-600 text-white",
  NVDA: "bg-lime-600 text-white",
  AMD: "bg-zinc-950 text-white",
  AMZN: "bg-orange-500 text-white",
  NFLX: "bg-black text-red-500",
  MSFT: "bg-sky-600 text-white",
  META: "bg-blue-600 text-white",
  GOOGL: "bg-white text-blue-600",
  GME: "bg-zinc-800 text-white",
};

function MarketPage() {
  const fn = useServerFn(getMarketData);
  const { data, isLoading } = useQuery({
    queryKey: ["market-data"],
    queryFn: () => fn(),
    refetchInterval: 120000,
  });
  const [search, setSearch] = useState("");
  const markets = data?.markets ?? [];
  const indices = markets.filter((item: any) => ["Nasdaq", "Dow Jones", "S&P 500"].includes(item.label));
  const stocks = markets.filter((item: any) => !["Nasdaq", "Dow Jones", "S&P 500"].includes(item.label));
  const filtered = stocks.filter((item: any) =>
    `${item.label} ${item.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const hot = stocks.slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-full bg-muted/70 pl-11"
            placeholder="Search"
          />
        </div>
        <Link
          to="/settings"
          className="grid h-12 w-12 place-items-center rounded-full bg-muted text-foreground"
          aria-label="Profile"
        >
          <UserRound className="h-5 w-5" />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(indices.length ? indices : hot.slice(0, 3)).map((item: any) => (
          <MarketTile key={item.label} item={item} />
        ))}
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-full bg-muted text-sm font-semibold">
        <button className="rounded-full bg-foreground py-3 text-background">Hot</button>
        <button className="py-3 text-muted-foreground">Favorites</button>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border/70 rounded-xl border border-border/70 bg-card/70">
        {hot.map((item: any) => (
          <QuoteMini key={item.label} item={item} />
        ))}
        <div className="flex min-h-20 flex-col items-center justify-center text-muted-foreground">
          <span className="text-2xl leading-none">...</span>
          <span className="text-xs font-semibold">More</span>
        </div>
      </div>

      <div className="flex items-center gap-8 border-b border-border/70 text-sm font-semibold">
        <button className="border-b-4 border-foreground pb-3">24H Change</button>
        <button className="pb-3 text-muted-foreground">1H increase</button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-full bg-muted/70 pl-11"
          placeholder="Search"
        />
      </div>

      <div className="divide-y divide-border/50">
        {(filtered.length ? filtered : stocks).map((item: any) => (
          <Link key={item.label} to="/trade/mine" className="flex items-center gap-4 py-3">
            <LogoBubble label={item.label} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">{item.label}</div>
              <div className="truncate text-sm font-medium text-muted-foreground">{item.name}</div>
            </div>
            <QuoteValue item={item} />
          </Link>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Market News</h2>
          </div>
          {isLoading ? <span className="text-xs text-muted-foreground">Loading...</span> : null}
        </div>
        <div className="divide-y divide-border/60">
          {(data?.news ?? []).map((item: any) => (
            <a
              key={`${item.title}-${item.pubDate}`}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="block py-3"
            >
              <div className="text-sm font-semibold leading-snug">{item.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {item.source ? `${item.source} - ` : ""}
                {new Date(item.pubDate).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function MarketTile({ item }: { item: any }) {
  const positive = Number(item.change ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <div className="text-sm font-bold">{item.label}</div>
      <div className={`mt-2 text-sm font-bold ${positive ? "text-success" : "text-destructive"}`}>
        {fmtUsd(item.price)}
      </div>
      <div className={`text-xs font-bold ${positive ? "text-success" : "text-destructive"}`}>
        {positive ? "+" : ""}
        {Number(item.change ?? 0).toFixed(2)}%
      </div>
      <svg viewBox="0 0 80 50" className="mt-3 h-16 w-full">
        <polyline
          points={positive ? "4,44 16,30 28,34 40,22 52,26 64,12 76,18" : "4,16 16,30 28,20 40,28 52,22 64,32 76,44"}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={positive ? "text-success" : "text-destructive"}
        />
      </svg>
    </div>
  );
}

function QuoteMini({ item }: { item: any }) {
  const positive = Number(item.change ?? 0) >= 0;
  return (
    <div className="min-h-20 p-3 text-center">
      <div className="text-sm font-bold">{item.label}</div>
      <div className={`mt-1 font-bold ${positive ? "text-success" : "text-destructive"}`}>
        {fmtUsd(item.price)}
      </div>
      <div className={`text-xs font-bold ${positive ? "text-success" : "text-destructive"}`}>
        {positive ? "+" : ""}
        {Number(item.change ?? 0).toFixed(2)}%
      </div>
    </div>
  );
}

function LogoBubble({ label }: { label: string }) {
  const text = label === "GOOGL" ? "G" : label.slice(0, 1);
  return (
    <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-black ${brandColors[label] ?? "bg-muted text-foreground"}`}>
      {text}
    </div>
  );
}

function QuoteValue({ item }: { item: any }) {
  const positive = Number(item.change ?? 0) >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="text-right">
      <div className="font-bold">{fmtUsd(item.price)}</div>
      <div className={`flex items-center justify-end text-sm font-bold ${positive ? "text-success" : "text-destructive"}`}>
        <Icon className="h-3 w-3" />
        {positive ? "+" : ""}
        {Number(item.change ?? 0).toFixed(2)}%
      </div>
    </div>
  );
}
