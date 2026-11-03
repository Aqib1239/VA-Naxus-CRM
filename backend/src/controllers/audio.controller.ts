import { Request, Response, NextFunction } from "express";
import https from "https";
import http from "http";
import { URL } from "url";
import { LeadService } from "../services/lead.service";
import { ApiResponse } from "../utils/response";
import { IAudioMetadata } from "../types/lead.types";
import { deleteCloudinaryAsset, generateSignedCloudinaryAudioUrl } from "../config/cloudinary";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { Lead, sanitizeLeadAudio } from "../models/Lead.model";
import { User } from "../models/User.model";
import { MediaTicketService } from "../services/media-ticket.service";

/**
 * AudioController manages compliance audio uploads, playback session issuance,
 * and secure authenticated streaming proxies for VA Nexus CRM.
 */
export class AudioController {
  /**
   * Upload and attach audio to a vigilance lead with authenticated Cloudinary delivery.
   */
  static async uploadAudio(req: Request, res: Response, next: NextFunction) {
    let newlyUploadedPublicId: string | undefined;
    let newlyUploadedDeliveryType: "authenticated" | "upload" = "authenticated";

    try {
      if (!req.file) {
        return ApiResponse.badRequest(res, "No audio file uploaded.");
      }

      // multer-storage-cloudinary augments req.file with Cloudinary fields
      const file = req.file as Express.Multer.File & {
        path: string;
        filename: string;
        secure_url?: string;
        public_id?: string;
        format?: string;
        resource_type?: string;
        type?: "authenticated" | "upload";
        version?: number | string;
      };

      const publicId = file.public_id || file.filename;
      newlyUploadedPublicId = publicId;
      newlyUploadedDeliveryType = file.type || "authenticated";

      if (!publicId) {
        logger.error({ file }, "Cloudinary upload did not produce a valid public ID");
        return ApiResponse.error(
          res,
          "Audio upload failed: Cloudinary did not return a valid resource identifier.",
          500
        );
      }

      const leadId = req.params.id;
      const user = req.user!;

      // Inspect lead beforehand to track previous audio for clean replacement
      const existingLead = await LeadService.getLeadById(leadId, user);
      const previousStoragePath = existingLead?.vigilanceDetails?.audio?.storagePath;
      const previousDeliveryType = existingLead?.vigilanceDetails?.audio?.deliveryType || "authenticated";

      // Synthetic deterministic waveform sample for visualization
      const waveformSample = Array.from({ length: 56 }, (_, i) => {
        const v = Math.abs(Math.sin(i * 0.63) * 0.55 + Math.cos(i * 0.27 + 1.3) * 0.45);
        return Math.round(22 + v * 78);
      });

      // Internal media proxy URL; raw Cloudinary URL is never exposed to browser
      const internalAudioUrl = `/api/leads/${leadId}/audio`;

      const audioMeta: IAudioMetadata = {
        id: `aud_${Date.now()}`,
        fileName: file.originalname,
        originalName: file.originalname,
        fileSize: file.size,
        duration: 180,
        url: internalAudioUrl,
        storagePath: publicId,
        publicId,
        resourceType: "video",
        deliveryType: newlyUploadedDeliveryType,
        format: file.format,
        version: file.version ? String(file.version) : undefined,
        mimeType: file.mimetype || "audio/mpeg",
        uploadedBy: `${user.name} (${user.role})`,
        uploadedAt: new Date().toISOString(),
        waveformSample,
      };

      const lead = await LeadService.attachAudio(leadId, audioMeta, user);

      // If replacing an existing Cloudinary asset, clean up the previous file
      if (
        previousStoragePath &&
        previousStoragePath !== publicId &&
        (previousStoragePath.startsWith("vibhanu-crm/audio/") || previousStoragePath.startsWith("audio_")) &&
        !previousStoragePath.endsWith(".wav") &&
        !previousStoragePath.endsWith(".mp3")
      ) {
        deleteCloudinaryAsset(previousStoragePath, "video", previousDeliveryType).catch((err) => {
          logger.warn({ err, previousStoragePath }, "Background cleanup of replaced Cloudinary audio failed");
        });
      }

      logger.info(
        { leadId, publicId, deliveryType: audioMeta.deliveryType },
        "Authenticated audio uploaded and attached to lead successfully"
      );

      const serializedLead = (lead.toJSON ? lead.toJSON() : lead) as any;
      sanitizeLeadAudio(serializedLead);

      return ApiResponse.created(
        res,
        { audio: serializedLead.vigilanceDetails?.audio, lead: serializedLead },
        "Call verification recording uploaded and attached successfully."
      );
    } catch (err) {
      if (newlyUploadedPublicId) {
        deleteCloudinaryAsset(newlyUploadedPublicId, "video", newlyUploadedDeliveryType).catch(() => {});
      }
      next(err);
    }
  }

  /**
   * Issue a cryptographically secure, bounded playback session token for authorized audio playback.
   * Requires an authenticated session and verifies lead & department RBAC before issuing session.
   */
  static async createAudioTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user;

      if (!user) {
        return ApiResponse.unauthorized(res, "Authentication required to generate media ticket.");
      }

      // 1. Verify user has permission to access this lead
      const lead = await LeadService.getLeadById(leadId, user);
      const audioMeta = lead.vigilanceDetails?.audio;

      if (!audioMeta) {
        return ApiResponse.notFound(res, "Audio recording not found for this lead.");
      }

      // 2. Prevent caching of ticket responses
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");

      // 3. Issue bounded playback session bound to leadId, userId, and asset metadata
      const publicId = audioMeta.publicId || audioMeta.storagePath || audioMeta.id;
      const session = await MediaTicketService.createSession(
        leadId,
        user.id,
        {
          publicId,
          resourceType: audioMeta.resourceType || "video",
          deliveryType: audioMeta.deliveryType || "authenticated",
        }
      );

      return ApiResponse.success(
        res,
        {
          ticket: session.ticket,
          token: session.token,
          leadId,
          expiresInSeconds: session.expiresInSeconds,
          maxLifetimeSeconds: session.maxLifetimeSeconds,
          streamUrl: session.streamUrl,
        },
        "Media playback session generated successfully."
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Secure Backend Streaming Proxy for Call Recordings.
   *
   * Flow:
   * 1. Strictly rejects reusable JWTs in query parameters (?token=...).
   * 2. Authenticates via short-lived playback session (?ticket=...), Bearer header, or session cookie.
   * 3. Validates session in Redis atomically and verifies lead and resource bindings.
   * 4. Revalidates user active status and lead access authorization against the database.
   * 5. Generates the backend-only HMAC-signed Cloudinary URL for the authenticated asset.
   * 6. Requests media from Cloudinary (HEAD or GET) forwarding HTTP Range and If-Range headers.
   * 7. Streams audio bytes directly to the client with backpressure (no whole-file buffering).
   * 8. Aborts upstream request if the client disconnects or cancels seeking.
   * 9. Emits strict security headers; NEVER redirects 302 to Cloudinary.
   */
  static async getAudio(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;

      // 1. Strictly reject reusable JWT tokens in URL query strings
      if (typeof req.query.token === "string" && req.query.token) {
        return ApiResponse.unauthorized(
          res,
          "Reusable authentication tokens in URL query parameters are strictly prohibited. Use standard Authorization headers or request a media playback session."
        );
      }

      const ticket = typeof req.query.ticket === "string" ? req.query.ticket : undefined;
      let authenticatedUser = req.user;

      if (!ticket && !authenticatedUser) {
        return ApiResponse.unauthorized(
          res,
          "Authentication required. Please provide an authorized session or playback session ticket."
        );
      }

      // 2. Retrieve lead and verify audio asset exists (supports ObjectId or leadCode like 'VA-2026-1012')
      const lead = await Lead.findOne(LeadService.getLeadQuery(leadId));
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      const audioMeta = lead.vigilanceDetails?.audio;
      if (!audioMeta) {
        return ApiResponse.notFound(res, "Audio recording not found for this lead.");
      }

      const publicId = audioMeta.publicId || audioMeta.storagePath;
      if (!publicId && !audioMeta.url) {
        return ApiResponse.notFound(res, "Audio recording metadata is invalid or unavailable.");
      }

      // 3. Atomically validate ticket session if redeeming via ticket
      if (ticket) {
        const alternateLeadId = lead._id?.toString() === leadId ? lead.leadCode : lead._id?.toString();
        const sessionValidation = await MediaTicketService.validateSession(
          ticket,
          leadId,
          publicId,
          alternateLeadId
        );

        if (!sessionValidation.valid) {
          return ApiResponse.forbidden(
            res,
            "Invalid, expired, or unauthorized playback session. Please request a new playback ticket."
          );
        }

        // 4. Revalidate User Account Active Status from Database
        const sessionUserId = sessionValidation.session?.userId;
        if (sessionUserId) {
          const userDoc = await User.findById(sessionUserId).select("+isActive");
          if (!userDoc || !userDoc.isActive) {
            await MediaTicketService.revokeSession(ticket);
            return ApiResponse.forbidden(
              res,
              "User account has been deactivated or no longer exists. Playback access revoked."
            );
          }

          authenticatedUser = {
            id: userDoc._id.toString(),
            name: userDoc.name,
            email: userDoc.email,
            role: userDoc.role,
            department: userDoc.department,
            avatar: userDoc.avatar,
            isActive: userDoc.isActive,
          };
        }
      }

      // 5. Revalidate Lead RBAC Authorization for current user
      if (authenticatedUser) {
        try {
          await LeadService.getLeadById(leadId, authenticatedUser);
        } catch (authErr) {
          if (ticket) {
            await MediaTicketService.revokeSession(ticket);
          }
          return ApiResponse.forbidden(
            res,
            "Access to this lead's verification audio is restricted for your account role."
          );
        }
      }

      // 6. Security & Anti-Leakage Response Headers
      res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");

      // 7. Construct Upstream Cloudinary URL (SSRF Safe)
      let upstreamUrlStr: string;
      const isCloudinaryAsset =
        publicId &&
        (publicId.startsWith("vibhanu-crm/audio/") ||
          (publicId.startsWith("audio_") && !publicId.endsWith(".wav") && !publicId.endsWith(".mp3")));

      if (isCloudinaryAsset) {
        // Generate backend-only signed Cloudinary URL with the exact stored delivery type
        const deliveryType = audioMeta.deliveryType || "authenticated";
        upstreamUrlStr = generateSignedCloudinaryAudioUrl(publicId, {
          resourceType: "video",
          deliveryType,
          format: audioMeta.format,
        });
      } else if (audioMeta.url && audioMeta.url.startsWith("https://res.cloudinary.com/")) {
        // Legacy Cloudinary URL
        upstreamUrlStr = audioMeta.url;
      } else {
        return ApiResponse.notFound(
          res,
          "Audio recording file is unavailable. The recording was stored locally in a legacy version and must be re-uploaded."
        );
      }

      // Strict SSRF & Host Validation: verify protocol, exact hostname, and port
      let parsedUpstream: URL;
      try {
        parsedUpstream = new URL(upstreamUrlStr);
      } catch {
        return ApiResponse.error(res, "Internal error: Malformed upstream media URL.", 500);
      }

      // Scheme validation: strictly HTTPS (allow HTTP only in dev/test for mocks)
      const isDevOrTest = env.NODE_ENV === "development" || env.NODE_ENV === "test";
      if (parsedUpstream.protocol !== "https:" && (!isDevOrTest || parsedUpstream.protocol !== "http:")) {
        logger.error({ protocol: parsedUpstream.protocol }, "Blocked attempt to stream over non-HTTPS protocol");
        return ApiResponse.forbidden(res, "Upstream media protocol verification failed.");
      }

      // Exact configured delivery hostname validation (default res.cloudinary.com)
      const configuredHost = (process.env.CLOUDINARY_DELIVERY_HOST || "res.cloudinary.com").toLowerCase().trim();
      const host = parsedUpstream.hostname.toLowerCase();
      if (host !== configuredHost) {
        logger.error({ host, configuredHost }, "Blocked attempt to stream from untrusted upstream host");
        return ApiResponse.forbidden(res, "Upstream media host verification failed.");
      }

      // Port validation: strictly default/empty or 443 (allow standard test ports in dev/test)
      if (parsedUpstream.port && parsedUpstream.port !== "443" && (!isDevOrTest || (parsedUpstream.port !== "80" && parsedUpstream.port !== "5000"))) {
        logger.error({ port: parsedUpstream.port }, "Blocked attempt to stream from untrusted upstream port");
        return ApiResponse.forbidden(res, "Upstream media port verification failed.");
      }

      // 8. Stream from Upstream Cloudinary with HTTP Range & Backpressure Support
      const clientMethod = req.method.toUpperCase();
      const upstreamMethod = clientMethod === "HEAD" ? "HEAD" : "GET";

      // Whitelisted headers only: never forward CRM Authorization or Cookie headers to Cloudinary
      const headersToForward: http.OutgoingHttpHeaders = {
        "User-Agent": "VA-Nexus-Media-Proxy/1.0",
        Accept: audioMeta.mimeType || "*/*",
      };

      // Forward HTTP Range headers
      if (req.headers.range) {
        headersToForward["Range"] = req.headers.range;
      }
      if (req.headers["if-range"]) {
        headersToForward["If-Range"] = req.headers["if-range"];
      }

      const clientProtocol = parsedUpstream.protocol === "http:" ? http : https;

      // Event listener references for safe cleanup
      let onClientClose: (() => void) | null = null;
      let onClientError: ((err: Error) => void) | null = null;

      const cleanupClientListeners = () => {
        if (onClientClose) {
          res.removeListener("close", onClientClose);
          onClientClose = null;
        }
        if (onClientError) {
          res.removeListener("error", onClientError);
          onClientError = null;
        }
      };

      const upstreamReq = clientProtocol.request(
        upstreamUrlStr,
        {
          method: upstreamMethod,
          headers: headersToForward,
          timeout: 15000,
        },
        (upstreamRes) => {
          const statusCode = upstreamRes.statusCode || 200;

          // Reject unexpected upstream redirects to prevent SSRF bypass
          if (statusCode >= 300 && statusCode < 400) {
            cleanupClientListeners();
            logger.warn({ statusCode, location: upstreamRes.headers.location }, "Unexpected upstream redirect blocked");
            return ApiResponse.error(res, "Upstream storage redirected unexpectedly.", 502);
          }

          // Forward HTTP Range status codes and responses
          if (statusCode === 200 || statusCode === 206 || statusCode === 416) {
            res.status(statusCode);

            // Forward Content-Type, Content-Length, Content-Range, Accept-Ranges, ETag
            if (upstreamRes.headers["content-type"]) {
              res.setHeader("Content-Type", upstreamRes.headers["content-type"]);
            } else if (audioMeta.mimeType) {
              res.setHeader("Content-Type", audioMeta.mimeType);
            }

            if (upstreamRes.headers["content-length"]) {
              res.setHeader("Content-Length", upstreamRes.headers["content-length"]);
            }

            if (upstreamRes.headers["content-range"]) {
              res.setHeader("Content-Range", upstreamRes.headers["content-range"]);
            }

            res.setHeader("Accept-Ranges", upstreamRes.headers["accept-ranges"] || "bytes");

            if (upstreamRes.headers.etag) {
              res.setHeader("ETag", upstreamRes.headers.etag);
            }

            if (upstreamRes.headers["last-modified"]) {
              res.setHeader("Last-Modified", upstreamRes.headers["last-modified"]);
            }

            if (upstreamMethod === "HEAD") {
              cleanupClientListeners();
              return res.end();
            }

            // Stream response bytes directly with backpressure
            upstreamRes.pipe(res);

            upstreamRes.on("error", (pipeErr) => {
              cleanupClientListeners();
              logger.error({ pipeErr: (pipeErr as Error).message }, "Error during upstream audio streaming");
              if (!res.headersSent) {
                res.status(502).end();
              } else {
                res.end();
              }
            });

            upstreamRes.on("end", () => {
              cleanupClientListeners();
            });

            upstreamRes.on("close", () => {
              cleanupClientListeners();
            });
          } else if (statusCode === 404) {
            cleanupClientListeners();
            return ApiResponse.notFound(res, "Audio asset not found on upstream storage.");
          } else {
            cleanupClientListeners();
            logger.warn(
              { statusCode, leadId },
              "Upstream Cloudinary returned non-success response during audio streaming"
            );
            return ApiResponse.error(res, "Unable to stream audio recording from storage.", 502);
          }
        }
      );

      // Handle premature client disconnection via response lifecycle
      onClientClose = () => {
        // Only abort upstream request if the outgoing response did not finish normally
        if (!res.writableFinished) {
          logger.debug({ leadId }, "Client closed response prematurely; cancelling upstream audio stream");
          if (!upstreamReq.destroyed) {
            upstreamReq.destroy();
          }
        }
        cleanupClientListeners();
      };

      onClientError = (clientErr: Error) => {
        logger.warn({ err: clientErr.message, leadId }, "Client response stream error; cancelling upstream request");
        if (!upstreamReq.destroyed) {
          upstreamReq.destroy();
        }
        cleanupClientListeners();
      };

      res.on("close", onClientClose);
      res.on("error", onClientError);
      res.on("finish", cleanupClientListeners);

      upstreamReq.on("timeout", () => {
        cleanupClientListeners();
        upstreamReq.destroy(new Error("Upstream connection timed out"));
        if (!res.headersSent) {
          res.status(504).json({ success: false, message: "Storage gateway timeout" });
        }
      });

      upstreamReq.on("error", (reqErr) => {
        cleanupClientListeners();
        logger.error({ err: reqErr.message, leadId }, "Upstream media request connection error");
        if (!res.headersSent) {
          res.status(502).json({ success: false, message: "Upstream storage connection failure" });
        }
      });

      upstreamReq.end();
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete audio recording from Cloudinary and remove from MongoDB lead document.
   */
  static async deleteAudio(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user!;

      const lead = await LeadService.getLeadById(leadId, user);
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      const audioMeta = lead.vigilanceDetails?.audio;
      if (!audioMeta) {
        return ApiResponse.notFound(res, "No audio recording found to delete for this lead.");
      }

      const storagePath = audioMeta.publicId || audioMeta.storagePath;
      const deliveryType = audioMeta.deliveryType || "authenticated";
      const resourceType = (audioMeta.resourceType as "video" | "raw") || "video";
      if (storagePath) {
        await deleteCloudinaryAsset(storagePath, resourceType, deliveryType);
      }

      const updatedLead = await Lead.findOneAndUpdate(
        { _id: lead._id },
        { $unset: { "vigilanceDetails.audio": 1 } },
        { new: true }
      );

      logger.info({ leadId, storagePath, deliveryType }, "Audio deleted from Cloudinary and unlinked from lead");

      return ApiResponse.success(res, { lead: updatedLead }, "Audio recording deleted successfully.");
    } catch (err) {
      next(err);
    }
  }
}
