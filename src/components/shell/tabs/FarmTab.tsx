"use client";

import dynamic from "next/dynamic";
import { FarmAdvisor } from "../../FarmAdvisor";
import { PanelLoading } from "../PanelLoading";

const BossEvTool = dynamic(() => import("../../tools/bossev/BossEvTool").then((m) => m.BossEvTool), {
  loading: PanelLoading,
});

/*
 * Interim Farm tab: today's mechanic heat ranking and the Boss EV tool, unchanged, so nothing is
 * lost while the combined farm board (stream C) replaces both.
 */
export function FarmTab() {
  return (
    <>
      <FarmAdvisor />
      <BossEvTool />
    </>
  );
}
