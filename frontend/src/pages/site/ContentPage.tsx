import { Bot, ClipboardCheck, ShieldAlert } from "lucide-react";
import { Pill } from "@/components/common/badges";
import { EmptyState, ExternalLink, PageHeader, StatCard } from "@/components/common/blocks";
import { Reveal } from "@/components/common/motion";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useLatestAudit } from "@/lib/hooks";
import { pathOf, titleCase } from "@/lib/utils";
import { useSiteCtx } from "./SiteLayout";

const pct = (v: number) => Math.round((v <= 1 ? v : v / 100) * 100);

export default function ContentPage() {
  const { siteId } = useSiteCtx();
  const { audit, isLoading } = useLatestAudit(siteId);
  const judgements = audit.data?.judgements ?? [];
  if (isLoading) return <Skeleton className="h-96" />;
  if (!judgements.length) {
    return (
      <div className="grid gap-5">
        <PageHeader icon={<ClipboardCheck />} title="Content quality" description="Page-by-page judgements from Jev, the Compliance Officer." />
        <EmptyState icon={<Bot />} title="No content judgements yet" description="Add a TypeSafe API key in Workspace settings. On the next audit, Jev judges every article for policy risk, depth and generic-AI writing." />
      </div>
    );
  }
  const risky = judgements.filter((j) => j.policy_risks.length).length;
  const generic = judgements.filter((j) => pct(j.reads_generic_ai) >= 75).length;
  const avgDepth = Math.round(judgements.reduce((a, j) => a + pct(j.helpful_depth), 0) / judgements.length);

  return (
    <div className="grid gap-5">
      <PageHeader icon={<ClipboardCheck />} title="Content quality" description={`Jev judged ${judgements.length} pages for policy risk, depth, sources and intent.`} />
      <Reveal className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<ClipboardCheck />} label="Pages judged" value={judgements.length} />
        <StatCard icon={<ShieldAlert />} label="Policy risks" value={risky} tone={risky ? "danger" : "success"} />
        <StatCard icon={<Bot />} label="Reads like generic AI" value={generic} tone={generic ? "warning" : "success"} />
        <StatCard icon={<ClipboardCheck />} label="Average depth" value={avgDepth} suffix="%" />
      </Reveal>
      <Card className="gap-0 overflow-hidden py-0 shadow-xs">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow><TableHead>Page</TableHead><TableHead>Policy risks</TableHead><TableHead className="w-36">Generic AI</TableHead><TableHead className="w-36">Depth</TableHead><TableHead>Sources</TableHead><TableHead>Intent</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {judgements.map((j) => (
              <TableRow key={j.url}>
                <TableCell className="max-w-xs"><ExternalLink href={j.url}>{pathOf(j.url)}</ExternalLink><div className="text-xs text-muted-foreground">{j.words} words</div></TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{j.policy_risks.length ? j.policy_risks.map((r) => <Pill key={r} tone="danger">{titleCase(r.replace(/_/g, " "))}</Pill>) : <Pill tone="success">None</Pill>}</div></TableCell>
                <TableCell>
                  <Tooltip><TooltipTrigger className="grid w-full gap-1 text-left"><span className="text-xs tabular">{pct(j.reads_generic_ai)}%</span><Progress value={pct(j.reads_generic_ai)} className="h-1.5 [&>div]:bg-amber-500" /></TooltipTrigger><TooltipContent>Confidence {pct(j.confidence.reads_generic_ai ?? 1)}%</TooltipContent></Tooltip>
                </TableCell>
                <TableCell><div className="grid gap-1"><span className="text-xs tabular">{pct(j.helpful_depth)}%</span><Progress value={pct(j.helpful_depth)} className="h-1.5 [&>div]:bg-emerald-500" /></div></TableCell>
                <TableCell><Pill tone={j.cites_sources ? "success" : "warning"}>{j.cites_sources ? "Cites sources" : "No sources"}</Pill></TableCell>
                <TableCell><Pill tone="neutral" className="capitalize">{j.search_intent}</Pill>{j.needs_medical_disclaimer && <Pill tone="warning" className="ml-1">Medical</Pill>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
