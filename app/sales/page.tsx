"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { salesClaimSchema, SalesClaimFormData } from "@/schemas/leads.schema";
import { useLeads } from "@/context/leads-context";
import { useAuth } from "@/context/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DepartmentBadge } from "@/components/ui/status-badge";
import { AudioPlayer } from "@/components/ui/audio-player";
import { AudioIntelligencePanel } from "@/components/ai/AudioIntelligencePanel";
import { WorkflowTimeline } from "@/components/ui/workflow-timeline";
import { EmptyState } from "@/components/ui/empty-state";
import { Lead } from "@/types/leads";
import { formatDateTime } from "@/lib/utils";
import { 
  TrendingUp, 
  CheckCircle2, 
  Lock, 
  Unlock, 
  DollarSign, 
  FileText, 
  Phone, 
  Sparkles,
  Award
} from "lucide-react";

export default function SalesPage() {
  const { leads, markAudioListenCompleted, claimSalesLead } = useLeads();
  const { user } = useAuth();

  const salesLeads = leads.filter((l) => l.currentDepartment === "sales" || l.currentDepartment === "claimed");

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isAudioCompleted, setIsAudioCompleted] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    if (salesLeads.length > 0 && (!selectedLead || !salesLeads.some(l => l.id === selectedLead.id))) {
      setSelectedLead(salesLeads[0]);
    } else if (salesLeads.length === 0) {
      setSelectedLead(null);
    }
  }, [salesLeads, selectedLead]);

  useEffect(() => {
    if (selectedLead) {
      const alreadyCompleted =
        selectedLead.currentDepartment === "claimed" ||
        selectedLead.salesDetails?.audioListenCompleted === true;
      setIsAudioCompleted(alreadyCompleted);
    }
  }, [selectedLead]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SalesClaimFormData>({
    resolver: zodResolver(salesClaimSchema),
    mode: "onChange",
    defaultValues: {
      audioListenCompleted: false,
      dealValue: 450000,
      closingRemarks: "Deal proposal presented and accepted. Ready for enterprise contract onboarding.",
    },
  });

  const handleNaturalAudioEnd = async () => {
    if (!selectedLead) return;
    setIsAudioCompleted(true);
    setValue("audioListenCompleted", true, { shouldValidate: true });
    await markAudioListenCompleted(selectedLead.id);
  };

  const onSubmit = async (data: SalesClaimFormData) => {
    if (!selectedLead) return;
    setIsClaiming(true);
    try {
      const updated = await claimSalesLead(selectedLead.id, {
        dealValue: data.dealValue,
        closingRemarks: data.closingRemarks,
      });
      setSelectedLead(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Sales Executive Queue"
        description="Stage 5: Final lead qualification. Listen to the complete verification audio recording to unlock and claim enterprise leads."
        badge={<DepartmentBadge department="sales" />}
      />

      {salesLeads.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-6 h-6" />}
          title="No leads in the Sales queue"
          description="Leads will arrive here once the Support team finishes the 3-point checklist allocation."
          actionLabel="View Support Queue"
          onAction={() => window.location.href = "/support"}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Sales Deals Queue */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Sales Deals ({salesLeads.length})
              </h3>
              <span className="text-[12px] text-muted-foreground">Select deal</span>
            </div>

            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {salesLeads.map((lead) => {
                const isSelected = selectedLead?.id === lead.id;
                const isClaimed = lead.currentDepartment === "claimed";

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "border-purple-500/60 bg-purple-500/10 shadow-neu-inset"
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

                    <div className="mt-2.5 flex items-center justify-between text-[12px]">
                      <span className="text-muted-foreground">{lead.city}</span>
                      {isClaimed ? (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md font-mono">
                          Claimed
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-md font-mono">
                          Awaiting Claim
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Lead Info, Audio Player, Claim Flow */}
          <div className="lg:col-span-8">
            {selectedLead && (
              <Card className="rounded-2xl border border-border/80 shadow-neu-raised">
                <CardHeader className="flex flex-row items-center justify-between py-4 px-5 border-b border-border/70">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <CardTitle className="text-base font-semibold">{selectedLead.name}</CardTitle>
                      <span className="font-mono text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {selectedLead.leadCode}
                      </span>
                      {selectedLead.currentDepartment === "claimed" ? (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md font-mono">
                          Claimed & Closed
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-md font-mono">
                          Awaiting Claim
                        </span>
                      )}
                    </div>
                    <CardDescription className="text-[13px] mt-0.5">
                      Listen to the compliance verification voice recording before closing this account
                    </CardDescription>
                  </div>
                  <Link href={`/leads/${selectedLead.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 text-[13px]">
                      History
                    </Button>
                  </Link>
                </CardHeader>

                <CardContent className="p-5 space-y-5">
                  {/* Lead Information */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                    <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Prospect:</span>
                      <p className="font-semibold text-foreground text-[14px]">{selectedLead.name}</p>
                      <p className="font-mono text-muted-foreground text-[12.5px]">{selectedLead.contactNumber}</p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-border bg-card space-y-1">
                      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Meeting Slot:</span>
                      <p className="font-semibold text-foreground text-[14px]">
                        {selectedLead.date} at {selectedLead.time}
                      </p>
                      <p className="text-muted-foreground text-[13px] truncate">{selectedLead.remark}</p>
                    </div>

                    <div className="sm:col-span-2 p-3.5 rounded-xl border border-border bg-card space-y-1">
                      <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">Verified Address:</span>
                      <p className="text-foreground text-[13px]">
                        {selectedLead.postalAddress}, {selectedLead.city}, {selectedLead.state} {selectedLead.pincode && `- ${selectedLead.pincode}`}
                      </p>
                    </div>
                  </div>

                  {/* MANDATORY AUDIO PLAYER SECTION */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[14px] font-semibold text-foreground flex items-center gap-2">
                        {isAudioCompleted ? (
                          <Unlock className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Lock className="w-4 h-4 text-amber-500" />
                        )}
                        Compliance Voice Verification Recording
                      </Label>
                      <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        Audio Gating
                      </span>
                    </div>

                    <AudioPlayer
                      src={selectedLead.vigilanceDetails?.audio?.url}
                      fileName={selectedLead.vigilanceDetails?.audio?.fileName || "Vigilance_Call_Recording.mp3"}
                      fileSize={selectedLead.vigilanceDetails?.audio?.fileSize}
                      durationSeconds={selectedLead.vigilanceDetails?.audio?.duration || 180}
                      onNaturalEnd={handleNaturalAudioEnd}
                      isCompleted={isAudioCompleted}
                      disableForwardSeek={!isAudioCompleted}
                      requiredForAction="Claim Lead"
                    />

                    {/* Speech & Audio Intelligence Transcript Viewer */}
                    <AudioIntelligencePanel
                      leadId={selectedLead.id}
                      hasAudio={Boolean(selectedLead.vigilanceDetails?.audio)}
                      audioUrl={selectedLead.vigilanceDetails?.audio?.url}
                    />
                  </div>

                  {/* CLAIM STATE OR CLAIM FORM */}
                  {selectedLead.currentDepartment === "claimed" ? (
                    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5 space-y-3.5 shadow-neu-raised">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-neu-inset-sm">
                          <Award className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <h4 className="text-[14px] font-semibold text-foreground">Lead Successfully Claimed & Closed</h4>
                          <p className="text-[12.5px] text-muted-foreground">
                            Enterprise deal onboarding initiated by sales team.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-card/90 rounded-xl border border-border/80 shadow-neu-inset-sm p-3.5 text-[13px] font-mono">
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Claimed By:</span>
                          <span className="font-semibold text-foreground text-[13px]">
                            {selectedLead.salesDetails?.claimedBy || user?.name}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Claimed At:</span>
                          <span className="text-foreground text-[13px]">
                            {formatDateTime(selectedLead.salesDetails?.claimedAt || selectedLead.updatedAt)}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Deal Value:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-[13px] tabular-nums">
                            ₹{(selectedLead.salesDetails?.dealValue || 450000).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>

                      {selectedLead.salesDetails?.closingRemarks && (
                        <p className="text-[13px] text-muted-foreground italic">
                          "{selectedLead.salesDetails.closingRemarks}"
                        </p>
                      )}
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-3 border-t border-border">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="dealValue" className="text-[14px]">Estimated Deal Value (₹)</Label>
                          <Input
                            id="dealValue"
                            type="number"
                            placeholder="e.g. 450000"
                            leftIcon={<DollarSign className="w-4 h-4" />}
                            defaultValue={450000}
                            {...register("dealValue", { valueAsNumber: true })}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="closingRemarks" className="text-[14px]">Closing Remarks</Label>
                          <Input
                            id="closingRemarks"
                            placeholder="e.g. Contract approved."
                            leftIcon={<FileText className="w-4 h-4" />}
                            defaultValue="Ready for enterprise contract onboarding."
                            {...register("closingRemarks")}
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                        {!isAudioCompleted ? (
                          <p className="text-[13px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                            <Lock className="w-4 h-4 shrink-0" />
                            Claim button is locked until voice recording finishes playing.
                          </p>
                        ) : (
                          <p className="text-[13px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            Audio review finished. You are authorized to claim this lead.
                          </p>
                        )}

                        <Button
                          type="submit"
                          isLoading={isClaiming}
                          disabled={!isAudioCompleted}
                          variant="success"
                          leftIcon={<Sparkles className="w-4 h-4" />}
                          className="w-full sm:w-auto"
                        >
                          Claim Lead & Complete Deal
                        </Button>
                      </div>
                    </form>
                  )}

                  {/* Audit History */}
                  <div className="pt-4 border-t border-border/70">
                    <h4 className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wider font-mono mb-3">
                      Lifecycle History
                    </h4>
                    <WorkflowTimeline history={selectedLead.workflowHistory} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
