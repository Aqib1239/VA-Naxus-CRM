"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vigilanceLeadSchema, VigilanceLeadFormData } from "@/schemas/leads.schema";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { DepartmentBadge } from "@/components/ui/status-badge";
import { AudioPlayer } from "@/components/ui/audio-player";
import { EmptyState } from "@/components/ui/empty-state";
import { Lead, AudioData } from "@/types/leads";
import { DEMO_AUDIO_URL } from "@/services/mockData";
import {
  ShieldCheck,
  Upload,
  FileAudio,
  Trash2,
  CheckCircle2,
  Lock,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  AlertCircle,
  Headphones,
  User2Icon
} from "lucide-react";

export default function VigilancePage() {
  const router = useRouter();
  const { leads, verifyVigilanceLead } = useLeads();
  const vigilanceLeads = leads.filter((l) => l.currentDepartment === "vigilance");

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [uploadedAudio, setUploadedAudio] = useState<AudioData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (vigilanceLeads.length > 0 && (!selectedLead || !vigilanceLeads.some(l => l.id === selectedLead.id))) {
      setSelectedLead(vigilanceLeads[0]);
    } else if (vigilanceLeads.length === 0) {
      setSelectedLead(null);
    }
  }, [vigilanceLeads, selectedLead]);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<VigilanceLeadFormData>({
    resolver: zodResolver(vigilanceLeadSchema),
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
        time: selectedLead.time || "10:30 AM",
        remark: selectedLead.remark || "Identity and corporate details verified via telephone audit call.",
        hasAudio: !!selectedLead.vigilanceDetails?.audio,
      });

      if (selectedLead.vigilanceDetails?.audio) {
        setUploadedAudio(selectedLead.vigilanceDetails.audio);
      } else {
        setUploadedAudio(null);
      }
    }
  }, [selectedLead, reset]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 25;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsUploading(false);
        const localBlobUrl = URL.createObjectURL(file);
        const audioData: AudioData = {
          id: `aud-${Date.now()}`,
          fileName: file.name || "Vigilance_Call_Recording.mp3",
          fileSize: file.size || 0,
          duration: 180,
          url: localBlobUrl,
          uploadedAt: new Date().toISOString(),
          uploadedBy: "Vikram Malhotra (Vigilance)",
          mimeType: file.type || "audio/mpeg",
          _file: file, // kept for backend upload
        };
        setUploadedAudio(audioData);
        setValue("hasAudio", true, { shouldValidate: true });
      }
    }, 150);
  };

  const handleRemoveAudio = () => {
    if (uploadedAudio?.url?.startsWith("blob:")) {
      URL.revokeObjectURL(uploadedAudio.url);
    }
    setUploadedAudio(null);
    setValue("hasAudio", false, { shouldValidate: true });
  };

  const onSubmit = async (data: VigilanceLeadFormData) => {
    if (!selectedLead || !uploadedAudio) return;
    setIsSubmitting(true);
    try {
      await verifyVigilanceLead(selectedLead.id, {
        name: data.name,
        postalAddress: data.postalAddress,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        date: data.date,
        time: data.time,
        remark: data.remark,
        audio: uploadedAudio,
      });
      const nextLeads = vigilanceLeads.filter((l) => l.id !== selectedLead.id);
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
        title="Vigilance Verification"
        description="Stage 3: Review compliance details and attach mandatory customer verification call audio."
        badge={<DepartmentBadge department="vigilance" />}
      />

      {vigilanceLeads.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="w-6 h-6" />}
          title="No leads currently waiting in Vigilance"
          description="New leads will arrive here once Communication finishes initial outreach and schedules a meeting."
          actionLabel="View Communication Queue"
          onAction={() => router.push("/communication")}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Queue List */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-ui-sm font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                Audit Queue ({vigilanceLeads.length})
              </h3>
              <span className="text-xs text-muted-foreground">Select to audit</span>
            </div>

            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
              {vigilanceLeads.map((lead) => {
                const isSelected = selectedLead?.id === lead.id;

                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLead(lead)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${isSelected
                      ? "border-amber-500/60 bg-amber-500/10 shadow-neu-inset"
                      : "border-border/80 bg-card shadow-neu-raised-sm hover:shadow-neu-btn-hover hover:border-border"
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-foreground truncate">{lead.name}</span>
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
                      <span className="text-2xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md font-mono">
                        Audio Required
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Vigilance Audit Form */}
          <div className="lg:col-span-8">
            {selectedLead && (
              <Card className="rounded-2xl border border-border/80 shadow-neu-raised">

                {/* ── CardHeader ─────────────────────────────────────────────────────── */}
                <CardHeader className="flex flex-col gap-3 px-4 py-4 border-b border-border sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <CardTitle className="min-w-0 break-words text-sm font-semibold sm:text-base">
                        Audit: {selectedLead.name}
                      </CardTitle>
                      <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] leading-5 text-muted-foreground sm:text-xs">
                        {selectedLead.leadCode}
                      </span>
                    </div>
                    <CardDescription className="mt-1 text-xs text-muted-foreground sm:mt-0.5 sm:text-ui-sm">
                      Review details and attach voice call recording to clear for Support allocation
                    </CardDescription>
                  </div>
                  <Link
                    href={`/leads/${selectedLead.id}`}
                    className="shrink-0 sm:self-start "
                  >
                    <Button variant="outline" size="sm" className="h-9 w-full text-ui-sm sm:h-8 sm:w-auto border border-border">
                      <User2Icon className="w-3.5 h-3.5" />
                      Profile
                    </Button>
                  </Link>
                </CardHeader>

                <CardContent className="p-5">
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    {/* ── Locked Phone ───────────────────────────────────────────────────── */}
                    <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/30 p-3 text-xs shadow-neu-inset-sm sm:flex-row sm:items-center sm:justify-between sm:p-3.5 sm:text-ui-sm">
                      <div className="flex min-w-0 items-start gap-2 sm:items-center">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground sm:mt-0" />
                        <span className="min-w-0 text-muted-foreground">
                          <strong className="text-foreground">Locked Field:</strong>{" "}
                          Contact phone number is locked against changes.
                        </span>
                      </div>
                      <span className="shrink-0 pl-6 sm:pl-0 font-mono text-xs font-semibold text-foreground sm:self-auto sm:text-ui-sm">
                        {selectedLead.contactNumber}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Name (Editable) */}
                      <div className="space-y-1.5">
                        <Label htmlFor="vig-name" required className="text-sm">
                          Verified Client Name (Editable)
                        </Label>
                        <Input
                          id="vig-name"
                          leftIcon={<User className="w-4 h-4" />}
                          error={errors.name?.message}
                          {...register("name")}
                        />
                      </div>

                      {/* Contact Number (Locked) */}
                      <div className="space-y-1.5">
                        <Label htmlFor="vig-phone" className="text-sm">Contact Number (Locked)</Label>
                        <Input
                          id="vig-phone"
                          readOnly
                          disabled
                          leftIcon={<Phone className="w-4 h-4" />}
                          value={selectedLead.contactNumber}
                        />
                      </div>
                    </div>

                    {/* Postal Address (Editable) */}
                    <div className="space-y-1.5">
                      <Label htmlFor="vig-address" required className="text-sm">
                        Verified Postal Address (Editable)
                      </Label>
                      <Input
                        id="vig-address"
                        leftIcon={<MapPin className="w-4 h-4" />}
                        error={errors.postalAddress?.message}
                        {...register("postalAddress")}
                      />
                    </div>

                    {/* City, State, Pincode */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="vig-city" required className="text-sm">City</Label>
                        <Input id="vig-city" error={errors.city?.message} {...register("city")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="vig-state" required className="text-sm">State</Label>
                        <Input id="vig-state" error={errors.state?.message} {...register("state")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="vig-pincode" className="text-sm">Pincode</Label>
                        <Input id="vig-pincode" {...register("pincode")} />
                      </div>
                    </div>

                    {/* Date & Time */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="vig-date" required className="text-sm">
                          Verified Date (Editable)
                        </Label>
                        <Input
                          id="vig-date"
                          type="date"
                          leftIcon={<Calendar className="w-4 h-4" />}
                          error={errors.date?.message}
                          {...register("date")}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="vig-time" required className="text-sm">
                          Verified Time Slot (Editable)
                        </Label>
                        <Input
                          id="vig-time"
                          leftIcon={<Clock className="w-4 h-4" />}
                          error={errors.time?.message}
                          {...register("time")}
                        />
                      </div>
                    </div>

                    {/* Remark (Editable) */}
                    <div className="space-y-1.5">
                      <Label htmlFor="vig-remark" required className="text-sm">
                        Vigilance Audit Remarks (Editable)
                      </Label>
                      <Textarea
                        id="vig-remark"
                        rows={2}
                        error={errors.remark?.message}
                        {...register("remark")}
                      />
                    </div>

                    {/* MANDATORY AUDIO UPLOAD SECTION */}
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="flex items-center justify-between">
                        <Label required className="text-sm font-semibold text-foreground">
                          Mandatory Verification Audio Recording
                        </Label>
                        <span className="text-2xs font-mono text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md font-semibold">
                          Required
                        </span>
                      </div>

                      {uploadedAudio ? (
                        <div className="space-y-3">
                          <AudioPlayer
                            src={uploadedAudio.url}
                            leadId={selectedLead.id}
                            protectionStatus={uploadedAudio.protectionStatus}
                            recordingId={selectedLead.leadCode}
                            fileName={uploadedAudio.fileName}
                            fileSize={uploadedAudio.fileSize}
                            durationSeconds={uploadedAudio.duration}
                            isCompleted={true}
                          />

                          {/* ── Recording attached row ─────────────────────────────────────────── */}
                          <div className="flex pt-1 text-xs  items-center justify-between sm:text-ui-sm">
                            <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <span className="min-w-0 text-[11px]">Call recording attached</span>
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={handleRemoveAudio}
                              className="h-8 w-fit justify-end px-1 sm:px-2.5 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 sm:w-auto sm:justify-center sm:px-3 sm:text-ui-sm"
                              leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}
                            >
                              <span className="truncate text-[12px]">Remove / Replace Audio</span>
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border-2 border-dashed border-border/80 p-6 text-center shadow-neu-inset bg-muted/20 hover:border-primary/50 transition-colors">
                          {isUploading ? (
                            <div className="space-y-2.5">
                              <div className="h-8 w-8 mx-auto rounded-xl bg-primary/10 text-primary flex items-center justify-center animate-spin shadow-neu-inset-sm">
                                <FileAudio className="w-4 h-4" />
                              </div>
                              <p className="text-sm font-semibold text-foreground">
                                Uploading audio... {uploadProgress}%
                              </p>
                              <div className="w-48 mx-auto h-2 bg-muted/80 rounded-full overflow-hidden shadow-neu-inset-sm">
                                <div
                                  className="h-full bg-primary transition-all duration-200"
                                  style={{ width: `${uploadProgress}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="h-10 w-10 mx-auto rounded-xl bg-card border border-border/70 shadow-neu-btn flex items-center justify-center text-muted-foreground">
                                <Upload className="w-5 h-5" />
                              </div>
                              <div>
                                <label
                                  htmlFor="audio-upload"
                                  className="text-sm font-semibold text-primary hover:underline cursor-pointer"
                                >
                                  Upload verification audio recording (.mp3, .wav, .m4a)
                                </label>
                                <input
                                  id="audio-upload"
                                  type="file"
                                  accept="audio/*"
                                  className="hidden"
                                  onChange={handleFileUpload}
                                />
                              </div>
                              <p className="text-ui-sm text-muted-foreground">
                                Voice recording confirming client credentials and dispatch address.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {errors.hasAudio && (
                        <p className="text-ui-sm text-destructive font-medium flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="w-4 h-4" />
                          {errors.hasAudio.message}
                        </p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Headphones className="w-4 h-4 text-teal-500" />
                        Verification moves this lead to <strong>Support</strong>.
                      </p>
                      <Button
                        type="submit"
                        isLoading={isSubmitting}
                        disabled={!uploadedAudio}
                        leftIcon={<ShieldCheck className="w-4 h-4" />}
                      >
                        Verified & Transfer to Support
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
