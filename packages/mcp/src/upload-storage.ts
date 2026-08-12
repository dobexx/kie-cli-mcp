import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import express, { type Request, type Response } from "express";

/**
 * Local file storage for MCP upload tool.
 *
 * Flow:
 * 1. Client calls get_upload_url → receives a one-time token + upload URL
 * 2. Client PUTs the file to that URL (raw body, no multipart needed)
 * 3. Server stores file in local volume, returns public download URL
 * 4. Download URL is valid for 24h, then file is auto-deleted
 *
 * No external storage (S3/MinIO) needed — runs entirely in the MCP container.
 */

const UPLOAD_DIR = process.env.MCP_UPLOAD_DIR || "/tmp/mcp-uploads";
const PUBLIC_BASE_URL = process.env.MCP_PUBLIC_URL || "http://localhost:3000";
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FILE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

interface UploadToken {
  id: string;
  filename: string;
  contentType: string;
  createdAt: number;
  used: boolean;
}

// In-memory token store (tokens are short-lived, restart-safe)
const tokens = new Map<string, UploadToken>();

// In-memory file registry for cleanup
const files = new Map<string, { path: string; expiresAt: number }>();

// Cleanup expired tokens and files every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, token] of tokens) {
    if (now - token.createdAt > TOKEN_TTL_MS || token.used) {
      tokens.delete(id);
    }
  }
  for (const [id, file] of files) {
    if (now > file.expiresAt) {
      try {
        unlinkSync(file.path);
      } catch {}
      files.delete(id);
    }
  }
}, 60 * 1000);

function generateToken(): string {
  return randomUUID().replace(/-/g, "");
}

function sanitizeFilename(name: string): string {
  // Remove path traversal, keep extension
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.slice(0, 100);
}

function getExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  return ext;
}

export function createUploadRouter(): express.Router {
  const router = express.Router();

  /**
   * GET /upload/token?filename=xxx&content_type=yyy
   *
   * Returns a one-time upload token and the URL to PUT the file to.
   * The LLM/client then PUTs the raw file bytes to that URL.
   */
  router.get("/upload/token", (req: Request, res: Response) => {
    const filename = sanitizeFilename(String(req.query.filename || "file.bin"));
    const contentType = String(req.query.content_type || "application/octet-stream");

    const token: UploadToken = {
      id: generateToken(),
      filename,
      contentType,
      createdAt: Date.now(),
      used: false,
    };
    tokens.set(token.id, token);

    const uploadUrl = `${PUBLIC_BASE_URL}/upload/${token.id}`;
    const downloadUrl = `${PUBLIC_BASE_URL}/files/${token.id}.${getExtension(filename)}`;

    res.json({
      token: token.id,
      upload_url: uploadUrl,
      download_url: downloadUrl,
      expires_in_seconds: TOKEN_TTL_MS / 1000,
      usage: `PUT the raw file bytes to upload_url with Content-Type: ${contentType}`,
    });
  });

  /**
   * PUT /upload/:token
   *
   * Receives raw file bytes (application/octet-stream or matching type).
   * Stores the file, marks token as used, returns the public download URL.
   */
  router.put("/upload/:token", express.raw({ type: "*/*", limit: MAX_FILE_SIZE }), (req: Request, res: Response) => {
    const tokenId = req.params.token;
    const token = tokens.get(tokenId);

    if (!token) {
      res.status(404).json({ error: "Token not found or expired" });
      return;
    }
    if (token.used) {
      res.status(410).json({ error: "Token already used" });
      return;
    }

    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({ error: "Empty or invalid file body" });
      return;
    }
    if (body.length > MAX_FILE_SIZE) {
      res.status(413).json({ error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` });
      return;
    }

    const fileId = generateToken();
    const ext = getExtension(token.filename);
    const filePath = join(UPLOAD_DIR, `${fileId}.${ext}`);

    try {
      writeFileSync(filePath, body);
    } catch (err) {
      res.status(500).json({ error: "Failed to store file" });
      return;
    }

    token.used = true;
    files.set(fileId, {
      path: filePath,
      expiresAt: Date.now() + FILE_TTL_MS,
    });

    const downloadUrl = `${PUBLIC_BASE_URL}/files/${fileId}.${ext}`;

    res.json({
      success: true,
      file_url: downloadUrl,
      filename: token.filename,
      size_bytes: body.length,
      content_type: token.contentType,
      expires_in_hours: FILE_TTL_MS / (60 * 60 * 1000),
    });
  });

  /**
   * GET /files/:id.:ext
   *
   * Serves the uploaded file. Publicly accessible (no auth).
   */
  router.get("/files/:file", async (req: Request, res: Response) => {
    const fileParam = req.params.file;
    const match = fileParam.match(/^([a-f0-9]+)\.([a-z0-9]+)$/);
    if (!match) {
      res.status(400).json({ error: "Invalid file ID" });
      return;
    }

    const [, fileId, ext] = match;
    const fileInfo = files.get(fileId);

    if (!fileInfo) {
      res.status(404).json({ error: "File not found or expired" });
      return;
    }

    try {
      const data = await readFile(fileInfo.path);
      const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        mp4: "video/mp4",
        mov: "video/quicktime",
        mp3: "audio/mpeg",
        wav: "audio/wav",
      };
      res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
      res.setHeader("Content-Length", data.length);
      res.setHeader("Cache-Control", "public, max-age=86400"); // 24h cache
      res.send(data);
    } catch {
      res.status(404).json({ error: "File not found on disk" });
    }
  });

  return router;
}
