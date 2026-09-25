import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUp, Check, ClipboardList, Copy, Eraser, Search, TrendingUp, Wrench } from "lucide-react";
import { Markdown } from "@/components/common/blocks";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EmployeeAvatar } from "@/features/team/EmployeeAvatar";
import { useTaskParam } from "@/features/team/useTaskParam";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useChat, useClearChat, useSendChat } from "@/lib/hooks";
import type { ChatEntry, ChatResponse } from "@/lib/types";
import { formatTime } from "@/lib/utils";

const SUGGESTIONS = [
  { icon: TrendingUp, title: "What should we fix first?", prompt: "What are the three most important things to fix first for AdSense approval and rankings? Be specific." },
  { icon: Search, title: "Explain my weakest area", prompt: "Which AdSense requirement section scores worst on my site, and what exactly is failing?" },
  { icon: ClipboardList, title: "Plan this week", prompt: "Plan this week's work for the team and assign the tasks to the right people." },
  { icon: Wrench, title: "Improve my titles", prompt: "Review my page titles and propose better ones for the pages with the most upside." },
];

const THINKING = ["Reading the latest audit…", "Checking the task board…", "Recalling team memory…", "Searching site knowledge…", "Drafting a reply…"];

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % THINKING.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <Message className="animate-in fade-in slide-in-from-bottom-2">
      <EmployeeAvatar actor="manager" size="sm" className="self-start" />
      <MessageContent>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          <span key={i} className="animate-in fade-in">{THINKING[i]}</span>
        </span>
      </MessageContent>
    </Message>
  );
}

/** Reveals the newest assistant reply progressively (typewriter), then renders full markdown. */
function Typewriter({ text, onDone }: { text: string; onDone?: () => void }) {
  const [shown, setShown] = useState(prefersReducedMotion() ? text.length : 0);
  useGSAP(() => {
    if (prefersReducedMotion()) return;
    const s = { n: 0 };
    gsap.to(s, {
      n: text.length,
      duration: Math.min(3.2, 0.5 + text.length / 420),
      ease: "none",
      onUpdate: () => setShown(Math.floor(s.n)),
      onComplete: () => { setShown(text.length); onDone?.(); },
    });
  }, { dependencies: [text] });
  return <Markdown>{text.slice(0, shown) + (shown < text.length ? " ▍" : "")}</Markdown>;
}

function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-xs" onClick={() => { void navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1400); }} aria-label="Copy reply">
          {ok ? <Check /> : <Copy />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{ok ? "Copied" : "Copy"}</TooltipContent>
    </Tooltip>
  );
}

function Bubble({ entry, animate, extras }: { entry: ChatEntry; animate: boolean; extras?: ChatResponse | null }) {
  const { openTask } = useTaskParam();
  if (entry.role === "user") {
    return (
      <Message align="end" className="animate-in fade-in slide-in-from-bottom-2">
        <MessageContent>
          <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
            {entry.content}
          </div>
        </MessageContent>
      </Message>
    );
  }
  return (
    <Message className="group animate-in fade-in slide-in-from-bottom-2">
      <EmployeeAvatar actor="manager" size="sm" className="mt-0.5 self-start" />
      <MessageContent className="max-w-[calc(100%-3rem)]">
        <div className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Maya</span> · {formatTime(entry.at)}</div>
        {animate ? <Typewriter text={entry.content} /> : <Markdown>{entry.content}</Markdown>}
        {extras && (extras.created_tasks?.length || extras.proposals.length) ? (
          <div className="flex flex-wrap gap-2">
            {extras.created_tasks?.map((id) => (
              <Button key={id} variant="outline" size="xs" onClick={() => openTask(id)}><ClipboardList /> Task #{id}</Button>
            ))}
            {extras.proposals.length > 0 && (
              <Button asChild variant="outline" size="xs"><Link to="../fixes" relative="path"><Wrench /> {extras.proposals.length} fixes proposed</Link></Button>
            )}
          </div>
        ) : null}
        <div className="flex opacity-0 transition-opacity group-hover:opacity-100"><CopyButton text={entry.content} /></div>
      </MessageContent>
    </Message>
  );
}

function Composer({ onSend, pending }: { onSend: (text: string) => void; pending: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    const t = text.trim();
    if (!t || pending) return;
    onSend(t);
    setText("");
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(200, el.scrollHeight)}px`;
  }, [text]);
  return (
    <InputGroup className="rounded-2xl bg-background shadow-xs">
      <InputGroupTextarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder="Ask Maya anything, or give the team work to do…"
        rows={1}
        className="max-h-[200px] min-h-12"
        aria-label="Message Maya"
      />
      <InputGroupAddon align="block-end">
        <InputGroupText className="text-xs">Enter to send · Shift+Enter for a new line</InputGroupText>
        <InputGroupButton variant="default" size="icon-sm" className="ml-auto rounded-full" onClick={send} disabled={!text.trim() || pending} aria-label="Send">
          {pending ? <Spinner /> : <ArrowUp />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export function ChatView({ siteId }: { siteId: number }) {
  const chat = useChat(siteId);
  const send = useSendChat(siteId);
  const clear = useClearChat(siteId);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState<{ at: string; res: ChatResponse } | null>(null);
  const transcript = chat.data?.transcript ?? [];

  const submit = (text: string) => {
    setPendingText(text);
    send.mutate(text, {
      onSuccess: (res) => setLastReply({ at: res.transcript.at(-1)?.at ?? "", res }),
      onSettled: () => setPendingText(null),
    });
  };

  const empty = transcript.length === 0 && !pendingText;

  return (
    <div className="relative flex h-[calc(100svh-8rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <EmployeeAvatar actor="manager" size="md" status={send.isPending ? "working" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Maya <span className="font-normal text-muted-foreground">· SEO manager</span></div>
          <div className="truncate text-xs text-muted-foreground">Sees your audit, the task board, team memory and every page — and can assign work.</div>
        </div>
        {transcript.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Eraser /> Clear</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear this conversation?</AlertDialogTitle>
                <AlertDialogDescription>Maya forgets the chat history. Team memory and tasks are not affected.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => clear.mutate()}>Clear chat</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-10">
          <div className="flex flex-col items-center gap-4 text-center animate-in fade-in duration-300">
            <EmployeeAvatar actor="manager" size="lg" />
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">How can I help?</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">I run your SEO team. Ask me about your site, or tell me what you need — I'll handle it or hand it to the right colleague.</p>
            </div>
          </div>
          <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => submit(s.prompt)}
                className="flex items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${i * 50}ms`, animationFillMode: "backwards" }}
              >
                <s.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{s.prompt}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 pt-6 pb-8 sm:px-6">
                {transcript.map((m, i) => (
                  <MessageScrollerItem key={`${m.at}-${i}`}>
                    <Bubble
                      entry={m}
                      animate={m.role === "assistant" && lastReply?.at === m.at && i === transcript.length - 1}
                      extras={m.role === "assistant" && lastReply?.at === m.at ? lastReply.res : null}
                    />
                  </MessageScrollerItem>
                ))}
                {pendingText && (
                  <>
                    <MessageScrollerItem><Bubble entry={{ role: "user", content: pendingText, at: "" }} animate={false} /></MessageScrollerItem>
                    <MessageScrollerItem scrollAnchor><Thinking /></MessageScrollerItem>
                  </>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
        <Composer onSend={submit} pending={send.isPending} />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">Maya can make mistakes. Changes she proposes appear in Fixes for review (unless autopilot is on).</p>
      </div>
    </div>
  );
}
