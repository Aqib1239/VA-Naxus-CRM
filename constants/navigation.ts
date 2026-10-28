import { Role } from "@/types/auth";

export interface NavItem {
  title: string;
  href: string;
  iconName: "LayoutDashboard" | "Megaphone" | "MessageSquare" | "ShieldCheck" | "Headphones" | "TrendingUp" | "Users" | "Settings" | "Bot";
  badgeKey?: "marketing" | "communication" | "vigilance" | "support" | "sales" | "total";
  description: string;
  allowedRoles?: Role[]; // undefined means accessible by all, ADMIN sees all
}

export const MAIN_NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    iconName: "LayoutDashboard",
    description: "Overview of lead lifecycle and key performance indicators",
  },
  {
    title: "Marketing",
    href: "/marketing",
    iconName: "Megaphone",
    badgeKey: "marketing",
    description: "Create new leads and initiate the pipeline",
    allowedRoles: ["ADMIN", "MARKETING"],
  },
  {
    title: "Communication",
    href: "/communication",
    iconName: "MessageSquare",
    badgeKey: "communication",
    description: "Contact prospects, update details, schedule meetings",
    allowedRoles: ["ADMIN", "COMMUNICATION"],
  },
  {
    title: "Vigilance",
    href: "/vigilance",
    iconName: "ShieldCheck",
    badgeKey: "vigilance",
    description: "Verify lead authenticity and upload mandatory call audio",
    allowedRoles: ["ADMIN", "VIGILANCE"],
  },
  {
    title: "Support",
    href: "/support",
    iconName: "Headphones",
    badgeKey: "support",
    description: "Final verification checklist and sales queue allocation",
    allowedRoles: ["ADMIN", "SUPPORT"],
  },
  {
    title: "Sales",
    href: "/sales",
    iconName: "TrendingUp",
    badgeKey: "sales",
    description: "Listen to full audio recording to unlock and claim leads",
    allowedRoles: ["ADMIN", "SALES"],
  },
  {
    title: "Leads",
    href: "/leads",
    iconName: "Users",
    badgeKey: "total",
    description: "Master directory of all leads across departments",
  },
];

export const SECONDARY_NAV_ITEMS: NavItem[] = [
  {
    title: "Settings",
    href: "/settings",
    iconName: "Settings",
    description: "User roles, permissions and system preferences",
  },
  {
    title: "AI Command Center",
    href: "/ai",
    iconName: "Bot",
    description: "Natural-language queries and AI copilots for CRM data",
  },
];
