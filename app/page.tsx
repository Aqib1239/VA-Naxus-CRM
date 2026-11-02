"use client";

import React from "react";
import { useAuth } from "@/context/auth-context";
import { AdminDashboard } from "@/components/dashboard/AdminDashboard";
import { MarketingDashboard } from "@/components/dashboard/MarketingDashboard";
import { CommunicationDashboard } from "@/components/dashboard/CommunicationDashboard";
import { VigilanceDashboard } from "@/components/dashboard/VigilanceDashboard";
import { SupportDashboard } from "@/components/dashboard/SupportDashboard";
import { SalesDashboard } from "@/components/dashboard/SalesDashboard";

export default function DashboardPage() {
  const { role, user, isReady } = useAuth();

  if (!isReady || !user || !role) {
    return null;
  }

  switch (role) {
    case "ADMIN":
      return <AdminDashboard />;
    case "MARKETING":
      return <MarketingDashboard />;
    case "COMMUNICATION":
      return <CommunicationDashboard />;
    case "VIGILANCE":
      return <VigilanceDashboard />;
    case "SUPPORT":
      return <SupportDashboard />;
    case "SALES":
      return <SalesDashboard />;
    default:
      return null;
  }
}
