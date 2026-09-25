import { ChatView } from "@/features/chat/ChatView";
import { useSiteCtx } from "./SiteLayout";

export default function ChatPage() {
  const { siteId } = useSiteCtx();
  return <ChatView siteId={siteId} />;
}
