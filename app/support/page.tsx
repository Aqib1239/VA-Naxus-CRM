"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supportVerificationSchema, SupportVerificationFormData } from "@/schemas/leads.schema";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { DepartmentBadge } from "@/components/ui/status-badge";
import { AudioPlayer } from "@/components/ui/audio-player";
import { EmptyState } from "@/components/ui/empty-state";
import { Lead } from "@/types/leads";
import {
  Headphones,
  CheckSquare,
  Phone,
  TrendingUp,
  UserCheck,
  UserIcon
} from "lucide-react";

export default function SupportPage() {
  const { leads, allocateSupportLead } = useLeads();
  const supportLeads = leads.filter((l) => l.currentDepartment === "support");

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (supportLeads.length > 0 && (!selectedLead || !supportLeads.some(l => l.id === selectedLead.id))) {
      setSelectedLead(supportLeads[0]);
    } else if (supportLeads.length === 0) {
      setSelectedLead(null);
    }
  }, [supportLeads, selectedLead]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<SupportVerificationFormData>({
    resolver: zodResolver(supportVerificationSchema),
    mode: "onChange",
    defaultValues: {
      isDateVerified: false,
      isTimeVerified: false,
      isAddressVerified: false,
      allocatedTo: "Aditya Deshmukh",
      allocationNotes: "",
    },
  });

  const isDateVerified = watch("isDateVerified");
  const isTimeVerified = watch("isTimeVerified");
  const isAddressVerified = watch("isAddressVerified");
  const verifiedCount = [
    isDateVerified,
    isTimeVerified,
    isAddressVerified,
  ].filter(Boolean).length;

  const progressPercentage = (verifiedCount / 3) * 100;

  const allVerified = verifiedCount === 3;

  useEffect(() => {
    if (selectedLead) {
      reset({
        isDateVerified: selectedLead.supportDetails?.verification.isDateVerified || false,
        isTimeVerified: selectedLead.supportDetails?.verification.isTimeVerified || false,
        isAddressVerified: selectedLead.supportDetails?.verification.isAddressVerified || false,
        allocatedTo: selectedLead.supportDetails?.allocatedTo || "Aditya Deshmukh",
        allocationNotes: selectedLead.supportDetails?.allocationNotes || "",
      });
    }
  }, [selectedLead, reset]);

  const onSubmit = async (data: SupportVerificationFormData) => {
    if (!selectedLead) return;
    setIsSubmitting(true);
    try {
      await allocateSupportLead(selectedLead.id, data);
      const nextLeads = supportLeads.filter((l) => l.id !== selectedLead.id);
      setSelectedLead(nextLeads[0] || null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Support Allocation"
        description="Stage 4: Complete 3-point checklist validation (Date, Time, Address) and allocate to Sales Executive."
        badge={<DepartmentBadge department="support" />}
      />

      {supportLeads.length === 0 ? (
        <EmptyState
          icon={<Headphones className="w-6 h-6" />}
          title="No leads waiting in Support"
          description="All verified leads have been allocated to the Sales Executive pool."
          actionLabel="View Vigilance Queue"
          onAction={() => window.location.href = "/vigilance"}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Queue List */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Support Queue ({supportLeads.length})
              </h3>
              <span className="text-[12px] text-muted-foreground">Select to allocate</span>
            </div>

            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {supportLeads.map((lead) => {
                const isSelected = selectedLead?.id === lead.id;

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${isSelected
                      ? "border-teal-500/60 bg-teal-500/10 shadow-neu-inset"
                      : "border-border/80 bg-card shadow-neu-raised-sm hover:shadow-neu-btn-hover hover:border-border"
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[14px] font-semibold text-foreground truncate">{lead.name}</span>
                      <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {lead.leadCode}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground font-mono">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground/70" />
                      <span>{lead.contactNumber}</span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-[12px] text-muted-foreground">
                      <span>{lead.city}</span>
                      <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-md font-mono">
                        Audit Verified
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Verification & Allocation */}
          <div className="lg:col-span-8">
            {selectedLead && (
              <Card className="rounded-2xl border border-border/80 shadow-neu-raised">
                <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 py-4 sm:px-5 border-b border-border/70">
                  {/* Left: title block */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base font-semibold leading-tight break-words">
                        Verify &amp; Allocate: {selectedLead.name}
                      </CardTitle>
                      <span className="font-mono text-[11px] sm:text-[12px] text-muted-foreground bg-muted px-1.5 py-0.5 border border-border rounded-md whitespace-nowrap">
                        {selectedLead.leadCode}
                      </span>
                    </div>
                    <CardDescription className="text-[12px] sm:text-[13px] mt-1 leading-snug">
                      Confirm 3-point checklist to transfer lead into the active Sales Executive queue
                    </CardDescription>
                  </div>

                  {/* Right: action */}
                  <div className="shrink-0">
                    <Link href={`/leads/${selectedLead.id}`}>
                      <Button
                        variant="primary"
                        size="sm"
                        className="p-1.5 h-10 w-10 rounded-full sm:px-3 text-[13px]"
                        aria-label="View lead profile"
                      >
                        <UserIcon className="h-6 w-6 sm:hidden" />
                        <span className="hidden sm:inline">Profile</span>
                      </Button>
                    </Link>
                  </div>
                </CardHeader>

                <CardContent className="p-2 space-y-4">
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* Information Summary */}
                    <div className="rounded-2xl border border-border/80 bg-muted/20 shadow-neu-inset-sm p-2.5 space-y-3 text-[13px]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <span className="text-muted-foreground block text-[11px] font-mono uppercase tracking-wider">Prospect:</span>
                          <span className="font-semibold text-foreground text-[14px]">{selectedLead.name}</span>
                          <span className="block font-mono text-muted-foreground text-[12.5px]">{selectedLead.contactNumber}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px] font-mono uppercase tracking-wider">Meeting Slot:</span>
                          <span className="font-semibold text-foreground text-[14px]">
                            {selectedLead.date} at {selectedLead.time}
                          </span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-muted-foreground block text-[11px] font-mono uppercase tracking-wider">Dispatch Address:</span>
                          <span className="text-foreground text-[13px]">
                            {selectedLead.postalAddress}, {selectedLead.city}, {selectedLead.state} {selectedLead.pincode && `- ${selectedLead.pincode}`}
                          </span>
                        </div>
                      </div>

                      {/* Vigilance Audio */}
                      {selectedLead.vigilanceDetails?.audio && (
                        <div className="pt-2">
                          <AudioPlayer
                            src={selectedLead.vigilanceDetails.audio.url}
                            leadId={selectedLead.id}
                            protectionStatus={selectedLead.vigilanceDetails.audio.protectionStatus}
                            recordingId={selectedLead.leadCode}
                            fileName={selectedLead.vigilanceDetails.audio.fileName}
                            fileSize={selectedLead.vigilanceDetails.audio.fileSize}
                            durationSeconds={selectedLead.vigilanceDetails.audio.duration}
                            isCompleted={true}
                          />
                        </div>
                      )}
                    </div>

                    {/* 3-POINT CHECKLIST CONTROLS */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between pb-1.5 border-b border-border/70">
                        <Label required className="text-[14px] font-semibold text-foreground">
                          3-Point Checklist Verification
                        </Label>

                        {/* Dynamic Completion Badge */}
                        <span className="text-[11px] font-mono text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-md font-semibold tabular-nums">
                          {verifiedCount}/3
                        </span>
                      </div>

                      {/* Dynamic Progress Bar */}
                      <div
                        className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={verifiedCount}
                        aria-valuemin={0}
                        aria-valuemax={3}
                        aria-label="Checklist verification progress"
                      >
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all duration-300 ease-in-out"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>

                      <div className="space-y-2.5">
                        {/* Check 1 */}
                        <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${isDateVerified ? "border-teal-500/50 bg-teal-500/10 shadow-neu-inset" : "border-border/80 bg-card shadow-neu-raised-sm hover:shadow-neu-btn-hover"
                          }`}>
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-border text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600"
                            {...register("isDateVerified")}
                          />
                          <div className="text-[13px]">
                            <span className="font-semibold text-foreground block text-[14px]">
                              1. Verify Scheduled Date ({selectedLead.date || "N/A"})
                            </span>
                            <span className="text-muted-foreground text-[12.5px]">
                              Meeting date is confirmed with client calendar.
                            </span>
                          </div>
                        </label>

                        {/* Check 2 */}
                        <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${isTimeVerified ? "border-teal-500/50 bg-teal-500/10 shadow-neu-inset" : "border-border/80 bg-card shadow-neu-raised-sm hover:shadow-neu-btn-hover"
                          }`}>
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-border text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600"
                            {...register("isTimeVerified")}
                          />
                          <div className="text-[13px]">
                            <span className="font-semibold text-foreground block text-[14px]">
                              2. Verify Time Slot ({selectedLead.time || "N/A"})
                            </span>
                            <span className="text-muted-foreground text-[12.5px]">
                              Time slot is validated with executive team.
                            </span>
                          </div>
                        </label>

                        {/* Check 3 */}
                        <label className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${isAddressVerified ? "border-teal-500/50 bg-teal-500/10 shadow-neu-inset" : "border-border/80 bg-card shadow-neu-raised-sm hover:shadow-neu-btn-hover"
                          }`}>
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-border text-teal-600 focus:ring-teal-500 cursor-pointer accent-teal-600"
                            {...register("isAddressVerified")}
                          />
                          <div className="text-[13px]">
                            <span className="font-semibold text-foreground block text-[14px]">
                              3. Verify Complete Postal Address
                            </span>
                            <span className="text-muted-foreground text-[12.5px]">
                              Address cross-referenced against corporate registry records.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Sales Allocation Selection */}
                    <div className="space-y-4 pt-3 border-t border-border">
                      <div className="space-y-1.5">
                        <Label htmlFor="allocate-select" required className="text-[14px]">
                          Assign to Sales Executive
                        </Label>
                        <select
                          id="allocate-select"
                          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-[15px] text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          {...register("allocatedTo")}
                        >
                          <option value="Aditya Deshmukh">Aditya Deshmukh (Senior Enterprise Sales)</option>
                          <option value="Rohan Varma">Rohan Varma (Direct Sales Lead)</option>
                          <option value="Pooja Hegde">Pooja Hegde (Regional Account Manager)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="allocate-notes" className="text-[14px]">Support Handover Notes</Label>
                        <Textarea
                          id="allocate-notes"
                          placeholder="e.g. All 3 verification checks confirmed."
                          rows={2}
                          {...register("allocationNotes")}
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
                      <p className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-purple-500" />
                        Allocation transfers lead to <strong>Sales</strong> queue.
                      </p>
                      <Button
                        type="submit"
                        isLoading={isSubmitting}
                        disabled={!allVerified}
                        leftIcon={<UserCheck className="w-4 h-4" />}
                      >
                        Allocate Lead to Sales
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
