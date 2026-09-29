"use client";

import { BookOpen } from "lucide-react";
import { EmptyState } from "../../ui/EmptyState";
import { PageHeader } from "../../ui/PageHeader";
import { ToolChips } from "../ToolChips";
import { tabMeta } from "../tabRegistry";
import { useTabRoute } from "../useTabRoute";

/** Learn tab shell: the route, nav and tool chips exist now; each tool's body lands in its own stream. */
export function LearnTab() {
  const { tool } = useTabRoute();
  const label = tabMeta("learn").tools?.find((t) => t.id === tool)?.label ?? "Learn";
  return (
    <>
      <PageHeader title="Learn" purpose="What an item is, which currency matters, and the atlas route step by step." action={<ToolChips tab="learn" />} />
      <EmptyState icon={<BookOpen className="h-5 w-5" />} title={label} sentence="Coming soon — this guide is being written and verified." />
    </>
  );
}
