import { randomUUID } from "node:crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const UUID_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getPrivateObjectDir() {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) {
    throw new Error("PRIVATE_OBJECT_DIR is not configured");
  }
  return dir.replace(/\/+$/, "");
}

function parseObjectPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const parts = normalized.split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return {
    bucketName: parts[1],
    objectName: parts.slice(2).join("/"),
  };
}

async function signObjectUrl({
  bucketName,
  objectName,
  method,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT";
}) {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL (${response.status})`);
  }
  const payload = (await response.json()) as { signed_url?: string };
  if (!payload.signed_url) {
    throw new Error("Object storage did not return a signed URL");
  }
  return payload.signed_url;
}

export async function requestResumeUpload(userId: string) {
  const objectId = randomUUID();
  const objectPath = `/objects/uploads/${userId}/${objectId}`;
  const { bucketName, objectName } = parseObjectPath(
    `${getPrivateObjectDir()}/uploads/${userId}/${objectId}`,
  );
  const uploadURL = await signObjectUrl({
    bucketName,
    objectName,
    method: "PUT",
  });
  return { uploadURL, objectPath };
}

export function isResumeObjectPathForUser(
  objectPath: string,
  userId: string,
) {
  const prefix = `/objects/uploads/${userId}/`;
  return (
    objectPath.startsWith(prefix) &&
    UUID_PATH_PATTERN.test(objectPath.slice(prefix.length))
  );
}

export async function requestResumeDownload(
  objectPath: string,
  userId: string,
) {
  const isCurrentPath = isResumeObjectPathForUser(objectPath, userId);
  const isLegacyPath = /^\/objects\/uploads\/[a-f0-9-]+$/i.test(objectPath);
  if (!isCurrentPath && !isLegacyPath) {
    throw new Error("Invalid resume object path");
  }
  const { bucketName, objectName } = parseObjectPath(
    `${getPrivateObjectDir()}${objectPath.slice("/objects".length)}`,
  );
  return signObjectUrl({ bucketName, objectName, method: "GET" });
}

export async function downloadResumeObject(objectPath: string, userId: string) {
  if (!isResumeObjectPathForUser(objectPath, userId)) {
    throw new Error("Invalid resume object path");
  }

  const downloadUrl = await requestResumeDownload(objectPath, userId);
  const response = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to download uploaded resume (${response.status})`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESUME_BYTES) {
    throw new Error("Uploaded resume exceeds the 10 MB size limit");
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_RESUME_BYTES) {
    throw new Error("Uploaded resume exceeds the 10 MB size limit");
  }
  return Buffer.from(bytes);
}