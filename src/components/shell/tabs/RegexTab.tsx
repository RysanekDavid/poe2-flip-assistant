"use client";

import dynamic from "next/dynamic";
import { PanelLoading } from "../PanelLoading";

// Lazy: the regex engine and its item catalog are only worth downloading when the tab is open.
const RegexTool = dynamic(() => import("../../tools/regex/RegexTool").then((m) => m.RegexTool), {
  loading: PanelLoading,
});

/** Stash-search regex suite. The tool reads its own ?tool= mode via useTabRoute when it needs one. */
export function RegexTab() {
  return <RegexTool />;
}
