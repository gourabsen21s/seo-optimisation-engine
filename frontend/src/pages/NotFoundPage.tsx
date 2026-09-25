import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { EmptyState } from "@/components/common/blocks";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Page not found"
      description="The page you're looking for doesn't exist."
      action={<Button asChild><Link to="/">Back to your websites</Link></Button>}
      className="mt-10"
    />
  );
}
