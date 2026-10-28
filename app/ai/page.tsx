"use client";

import React from "react";
import { CommandCenter } from "@/components/ai/CommandCenter";
import { PageHeader } from "@/components/layout/PageHeader";

export default function AiCommandCenterPage() {
  return (
    <div className="">
      {/* <PageHeader
        title="AI Command Center"
        description="Unified natural-language intelligence platform for VA Nexus. Query stage counts, analyze pipeline bottlenecks, and inspect live lead metrics."
      /> */}
      <CommandCenter />
    </div>
  );
}
