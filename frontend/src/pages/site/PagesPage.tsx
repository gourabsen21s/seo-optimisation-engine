import { useMemo, useState } from "react";
import { ArrowUpDown, FileText, Search } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { EmptyState, ExternalLink, PageHeader } from "@/components/common/blocks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLatestAudit } from "@/lib/hooks";
import type { PageRow } from "@/lib/types";
import { pathOf } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const PAGE = 25;
type SortKey = "url" | "words" | "status" | "response_ms" | "images_missing_alt";

export default function PagesPage() {
  const { siteId } = useSiteCtx();
  const { report, isLoading } = useLatestAudit(siteId);
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "url", dir: 1 });
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const list = (report?.pages ?? []).filter((p) => (type === "all" || p.type === type) && (!q || `${p.url} ${p.title ?? ""}`.toLowerCase().includes(q.toLowerCase())));
    return [...list].sort((a, b) => {
      const va = a[sort.key] as PageRow[SortKey];
      const vb = b[sort.key] as PageRow[SortKey];
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir;
    });
  }, [report, q, type, sort]);

  if (isLoading) return <Skeleton className="h-96" />;
  if (!report) return <EmptyState icon={<FileText />} title="No audit yet" />;

  const types = [...new Set(report.pages.map((p) => p.type))];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice(page * PAGE, page * PAGE + PAGE);
  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
      <Button variant="ghost" size="xs" className="-ml-2" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>{children}<ArrowUpDown /></Button>
    </TableHead>
  );

  return (
    <div className="grid gap-5">
      <PageHeader icon={<FileText />} title="Pages" description={`${report.pages.length} URLs from the latest crawl.`} />
      <div className="flex flex-wrap gap-2">
        <InputGroup className="w-full sm:w-80">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Filter by URL or title…" />
        </InputGroup>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem>{types.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card className="gap-0 overflow-hidden py-0 shadow-xs">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <SortHead k="url">Page</SortHead>
              <TableHead>Type</TableHead>
              <SortHead k="status">Status</SortHead>
              <SortHead k="words" className="text-right">Words</SortHead>
              <SortHead k="images_missing_alt">Alt missing</SortHead>
              <SortHead k="response_ms">Response</SortHead>
              <TableHead>Schema</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.map((p) => (
              <TableRow key={p.url}>
                <TableCell className="max-w-md">
                  <div className="truncate font-medium">{p.title || <span className="text-muted-foreground italic">No title</span>}</div>
                  <ExternalLink href={p.url} className="text-xs">{pathOf(p.url)}</ExternalLink>
                </TableCell>
                <TableCell><Pill tone="neutral" className="capitalize">{p.type}</Pill></TableCell>
                <TableCell><Pill tone={p.status === 200 ? "success" : p.status >= 400 ? "danger" : "warning"}>{p.status}</Pill>{!p.indexable && p.status === 200 && <Pill tone="warning" className="ml-1">noindex</Pill>}</TableCell>
                <TableCell className="text-right tabular">{p.words.toLocaleString()}</TableCell>
                <TableCell className="tabular">{p.images_missing_alt || "–"}</TableCell>
                <TableCell className="tabular text-muted-foreground">{p.response_ms} ms</TableCell>
                <TableCell><div className="flex max-w-48 flex-wrap gap-1">{p.schema.slice(0, 3).map((s) => <Pill key={s} tone="info">{s}</Pill>)}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {pages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(0, p - 1)); }} /></PaginationItem>
            <PaginationItem className="px-3 text-sm text-muted-foreground">Page {page + 1} of {pages}</PaginationItem>
            <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(pages - 1, p + 1)); }} /></PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
