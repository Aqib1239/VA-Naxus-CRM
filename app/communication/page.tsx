"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { communicationLeadSchema, CommunicationLeadFormData } from "@/schemas/leads.schema";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DepartmentBadge, StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Lead } from "@/types/leads";
import { 
  MessageSquare, 
  Lock, 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  Phone, 
  ShieldCheck
} from "lucide-react";

export default function CommunicationPage() {
  const router = useRouter();
  const { leads, scheduleCommunicationMeeting } = useLeads();
  const communicationLeads = leads.filter((l) => l.currentDepartment === "communication");
  
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (communicationLeads.length > 0 && (!selectedLead || !communicationLeads.some(l => l.id === selectedLead.id))) {
      setSelectedLead(communicationLeads[0]);
    } else if (communicationLeads.length === 0) {
      setSelectedLead(null);
    }
  }, [communicationLeads, selectedLead]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CommunicationLeadFormData>({
    resolver: zodResolver(communicationLeadSchema),
    mode: "onChange",
  });

  useEffect(() => {
    if (selectedLead) {
      reset({
        name: selectedLead.name,
        contactNumber: selectedLead.contactNumber,
        postalAddress: selectedLead.postalAddress || "",
        city: selectedLead.city || "Mumbai",
        state: selectedLead.state || "Maharashtra",
        pincode: selectedLead.pincode || "",
        date: selectedLead.date || new Date().toISOString().split("T")[0],
        time: selectedLead.time || "11:30 AM",
        remark: selectedLead.remark || "",
      });
    }
  }, [selectedLead, reset]);

  const onSubmit = async (data: CommunicationLeadFormData) => {
    if (!selectedLead) return;
    setIsSubmitting(true);
    try {
      await scheduleCommunicationMeeting(selectedLead.id, data);
      const nextLeads = communicationLeads.filter((l) => l.id !== selectedLead.id);
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
        title="Communication Queue"
        description="Stage 2: Establish direct outreach, capture verified postal address details, and schedule the compliance meeting."
        badge={<DepartmentBadge department="communication" />}
      />

      {communicationLeads.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="w-6 h-6" />}
          title="No leads waiting in Communication"
          description="All incoming leads have had meetings scheduled and have advanced to Vigilance."
          actionLabel="Create New Lead"
          onAction={() => router.push("/marketing")}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Queue List */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-ui-sm font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Outreach Queue ({communicationLeads.length})
              </h3>
              <span className="text-xs text-muted-foreground">Select to edit</span>
            </div>

            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {communicationLeads.map((lead) => {
                const isSelected = selectedLead?.id === lead.id;

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "border-primary/60 bg-primary/10 shadow-neu-inset"
                        : "border-border/80 bg-card shadow-neu-raised-sm hover:shadow-neu-btn-hover hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {lead.name}
                      </span>
                      <span className="text-2xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {lead.leadCode}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-ui-sm text-muted-foreground font-mono">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground/70" />
                      <span>{lead.contactNumber}</span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{lead.city || "India"}</span>
                      <StatusBadge status={lead.status} showIcon={false} className="text-2xs py-0.5 px-2" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Master Detail Form */}
          <div className="lg:col-span-8">
            {selectedLead && (
              <Card className="rounded-2xl border border-border/80 shadow-neu-raised">
                <CardHeader className="flex flex-row items-center justify-between py-4 px-5 border-b border-border/70">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <CardTitle className="text-base font-semibold">Outreach: {selectedLead.name}</CardTitle>
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {selectedLead.leadCode}
                      </span>
                    </div>
                    <CardDescription className="text-ui-sm mt-0.5">
                      Update address & schedule meeting to advance lead to Vigilance
                    </CardDescription>
                  </div>
                  <Link href={`/leads/${selectedLead.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 text-ui-sm">
                      Profile
                    </Button>
                  </Link>
                </CardHeader>

                <CardContent className="p-5">
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* Locked Phone Notice */}
                    <div className="p-3.5 bg-muted/30 border border-border/80 shadow-neu-inset-sm rounded-xl text-ui-sm flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground text-xs">
                          <strong>Contact Number:</strong> Locked / Read-Only per anti-tampering policy.
                        </span>
                      </div>
                      <span className="text-ui-sm font-mono font-semibold text-foreground">
                        {selectedLead.contactNumber}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Name (Editable) */}
                      <div className="space-y-1.5">
                        <Label htmlFor="comm-name" required className="text-sm">
                          Prospect Name (Editable)
                        </Label>
                        <Input
                          id="comm-name"
                          leftIcon={<User className="w-4 h-4" />}
                          error={errors.name?.message}
                          {...register("name")}
                        />
                        {errors.name && (
                          <p className="text-xs text-destructive">{errors.name.message}</p>
                        )}
                      </div>

                      {/* Contact Number (Locked) */}
                      <div className="space-y-1.5">
                        <Label htmlFor="comm-phone" className="text-sm">Contact Number (Locked)</Label>
                        <Input
                          id="comm-phone"
                          readOnly
                          disabled
                          leftIcon={<Phone className="w-4 h-4" />}
                          value={selectedLead.contactNumber}
                        />
                      </div>
                    </div>

                    {/* Postal Address */}
                    <div className="space-y-1.5">
                      <Label htmlFor="comm-address" required className="text-sm">
                        Complete Postal Address
                      </Label>
                      <Input
                        id="comm-address"
                        placeholder="e.g. 402, Ramanujan IT City, Taramani"
                        leftIcon={<MapPin className="w-4 h-4" />}
                        error={errors.postalAddress?.message}
                        {...register("postalAddress")}
                      />
                      {errors.postalAddress && (
                        <p className="text-xs text-destructive">{errors.postalAddress.message}</p>
                      )}
                    </div>

                    {/* City, State, Pincode */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="comm-city" required className="text-sm">City</Label>
                        <Input id="comm-city" error={errors.city?.message} {...register("city")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="comm-state" required className="text-sm">State</Label>
                        <Input id="comm-state" error={errors.state?.message} {...register("state")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="comm-pincode" className="text-sm">Pincode</Label>
                        <Input id="comm-pincode" placeholder="e.g. 600113" {...register("pincode")} />
                      </div>
                    </div>

                    {/* Date & Time for Meeting */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="comm-date" required className="text-sm">
                          Scheduled Meeting Date
                        </Label>
                        <Input
                          id="comm-date"
                          type="date"
                          leftIcon={<Calendar className="w-4 h-4" />}
                          error={errors.date?.message}
                          {...register("date")}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="comm-time" required className="text-sm">
                          Scheduled Time Slot
                        </Label>
                        <Input
                          id="comm-time"
                          placeholder="e.g. 11:30 AM"
                          leftIcon={<Clock className="w-4 h-4" />}
                          error={errors.time?.message}
                          {...register("time")}
                        />
                      </div>
                    </div>

                    {/* Discussion Remark */}
                    <div className="space-y-1.5">
                      <Label htmlFor="comm-remark" required className="text-sm">
                        Outreach Summary & Meeting Remarks
                      </Label>
                      <Textarea
                        id="comm-remark"
                        placeholder="e.g. Discussed multi-branch deployment requirements. Client confirmed availability."
                        rows={2}
                        error={errors.remark?.message}
                        {...register("remark")}
                      />
                    </div>

                    {/* Submit Action */}
                    <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-indigo-500" />
                        Advances lead into <strong>Vigilance</strong> compliance audit.
                      </p>
                      <Button
                        type="submit"
                        isLoading={isSubmitting}
                        leftIcon={<Calendar className="w-4 h-4" />}
                      >
                        Schedule Meeting & Move to Vigilance
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
