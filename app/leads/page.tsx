"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DepartmentBadge, StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading-state";
import { Department, LeadStatus } from "@/types/leads";
import { formatDate, getInitials } from "@/lib/utils";
import { toast } from "sonner";
import { 
  Users, 
  Search, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Eye, 
  Copy, 
  RotateCcw
} from "lucide-react";

export default function LeadsPage() {
  const { leads, isLoading } = useLeads();

  const [searchQuery, setSearchQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<Department | "all">("all");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "currentDepartment">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        if (departmentFilter !== "all" && lead.currentDepartment !== departmentFilter) {
          return false;
        }
        if (statusFilter !== "all" && lead.status !== statusFilter) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = lead.name.toLowerCase().includes(q);
          const matchCode = lead.leadCode.toLowerCase().includes(q);
          const matchPhone = lead.contactNumber.includes(q);
          const matchCity = lead.city?.toLowerCase().includes(q);
          const matchAddr = lead.postalAddress?.toLowerCase().includes(q);
          return matchName || matchCode || matchPhone || matchCity || matchAddr;
        }
        return true;
      })
      .sort((a, b) => {
        let valA = a[sortBy] || "";
        let valB = b[sortBy] || "";

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [leads, departmentFilter, statusFilter, searchQuery, sortBy, sortOrder]);

  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage) || 1;
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const toggleSort = (column: "createdAt" | "name" | "currentDepartment") => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label}`, { description: text });
  };

  const resetFilters = () => {
    setSearchQuery("");
    setDepartmentFilter("all");
    setStatusFilter("all");
    setSortBy("createdAt");
    setSortOrder("desc");
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Leads Directory"
        description="Master database of all enterprise accounts across the 5-stage workflow pipeline."
        badge={<span suppressHydrationWarning className="text-xs font-mono bg-muted text-muted-foreground px-2.5 py-1 rounded-md border border-border/80 font-medium">{leads.length} Records</span>}
      >
        <Link href="/marketing">
          <Button size="md" leftIcon={<Plus className="w-4 h-4" />}>
            Create Lead
          </Button>
        </Link>
      </PageHeader>

      {/* Filter and Search Bar */}
      <Card className="p-4 shadow-neu-raised rounded-2xl border border-border/80 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, lead ID, contact number, or city..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="flex h-10 w-full rounded-xl border border-border/80 bg-background/80 shadow-neu-inset pl-10 pr-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
            />
          </div>

          <div className="w-full sm:w-48">
            <select
              value={departmentFilter}
              onChange={(e) => {
                setDepartmentFilter(e.target.value as Department | "all");
                setCurrentPage(1);
              }}
              className="flex h-10 w-full rounded-xl border border-border/80 bg-background/80 shadow-neu-inset px-3 py-2 text-ui-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium transition-all"
            >
              <option value="all">All Departments</option>
              <option value="marketing">Marketing</option>
              <option value="communication">Communication</option>
              <option value="vigilance">Vigilance</option>
              <option value="support">Support</option>
              <option value="sales">Sales Queue</option>
              <option value="claimed">Claimed Deals</option>
            </select>
          </div>

          <div className="w-full sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as LeadStatus | "all");
                setCurrentPage(1);
              }}
              className="flex h-10 w-full rounded-xl border border-border/80 bg-background/80 shadow-neu-inset px-3 py-2 text-ui-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium transition-all"
            >
              <option value="all">All Statuses</option>
              <option value="new">New Entry</option>
              <option value="in_progress">In Outreach</option>
              <option value="meeting_scheduled">Meeting Scheduled</option>
              <option value="verified">Audit Verified</option>
              <option value="allocated">Allocated</option>
              <option value="claimed">Claimed</option>
            </select>
          </div>

          {(searchQuery || departmentFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              className="text-ui-sm h-10 text-muted-foreground px-3 shrink-0 rounded-xl"
            >
              Reset
            </Button>
          )}
        </div>
      </Card>

      {/* Main CRM Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading && leads.length === 0 ? (
            <TableSkeleton rows={6} cols={6} />
          ) : filteredLeads.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No matching leads found"
              description="No records match your active search and filter criteria."
              actionLabel="Clear Filters"
              onAction={resetFilters}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-mono text-xs uppercase tracking-wider">
                    <th
                      className="py-3 px-5 font-semibold cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("name")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Lead Prospect</span>
                        <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </div>
                    </th>
                    <th className="py-3 px-5 font-semibold">Contact</th>
                    <th
                      className="py-3 px-5 font-semibold cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("currentDepartment")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Department</span>
                        <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </div>
                    </th>
                    <th className="py-3 px-5 font-semibold">Status</th>
                    <th className="py-3 px-5 font-semibold">Meeting Slot</th>
                    <th
                      className="py-3 px-5 font-semibold cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort("createdAt")}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Created</span>
                        <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/70" />
                      </div>
                    </th>
                    <th className="py-3 px-5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paginatedLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-muted/40 transition-colors group">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold font-mono text-xs shrink-0 border border-primary/20">
                            {getInitials(lead.name)}
                          </div>
                          <div className="min-w-0">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="font-semibold text-foreground hover:text-primary transition-colors truncate block text-sm"
                            >
                              {lead.name}
                            </Link>
                            <span className="text-xs font-mono text-muted-foreground">
                              {lead.leadCode}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-5 font-mono text-ui-sm text-foreground/80">
                        <div className="flex items-center gap-1.5">
                          <span>{lead.contactNumber}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(lead.contactNumber, "phone number")}
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                            title="Copy number"
                            aria-label={`Copy phone number for ${lead.name}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground block font-sans mt-0.5">
                          {lead.city || "India"}
                        </span>
                      </td>

                      <td className="py-3.5 px-5">
                        <DepartmentBadge department={lead.currentDepartment} />
                      </td>

                      <td className="py-3.5 px-5">
                        <StatusBadge status={lead.status} />
                      </td>

                      <td className="py-3.5 px-5 text-muted-foreground font-mono text-xs tabular-nums">
                        {lead.date ? (
                          <div>
                            <span className="font-semibold text-foreground block text-ui-sm">{lead.date}</span>
                            <span className="text-xs text-muted-foreground">{lead.time || "Slot pending"}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/60 italic font-sans">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-5 font-mono text-xs text-muted-foreground tabular-nums">
                        {formatDate(lead.createdAt)}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <Link href={`/leads/${lead.id}`}>
                          <Button size="sm" variant="outline" className="h-8 text-ui-sm px-3" leftIcon={<Eye className="w-3.5 h-3.5" />}>
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isLoading && filteredLeads.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-border/80 text-ui-sm">
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                {Math.min(currentPage * itemsPerPage, filteredLeads.length)} of{" "}
                {filteredLeads.length} leads
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                  className="h-8 px-3 text-ui-sm"
                >
                  Prev
                </Button>

                <div className="flex items-center gap-1 font-mono text-xs px-2">
                  <span className="font-semibold text-foreground">{currentPage}</span>
                  <span className="text-muted-foreground">/</span>
                  <span>{totalPages}</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                  className="h-8 px-3 text-ui-sm"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
