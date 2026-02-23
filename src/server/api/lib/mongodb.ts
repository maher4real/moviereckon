/**
 * MongoDB Connection Helper
 * Uses globalThis caching to prevent multiple connections in serverless environment
 */
import { MongoClient, Db, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "moviereckon";
// Optional: allow disabling strict TLS verification for debugging only.
// Do NOT use in production unless you understand the security implications.
const MONGODB_TLS_INSECURE = process.env.MONGODB_TLS_INSECURE === "true";

if (MONGODB_TLS_INSECURE && process.env.NODE_ENV === "production") {
  throw new Error("MONGODB_TLS_INSECURE must never be enabled in production");
}

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI environment variable");
}

interface CachedConnection {
  client: MongoClient;
  db: Db;
}

// Use globalThis for connection caching in serverless environment
declare global {
  var mongoConnection: CachedConnection | undefined;
}

let cached = globalThis.mongoConnection;

export async function connectToDatabase(): Promise<CachedConnection> {
  if (cached) {
    return cached;
  }

  // Ensure common Atlas options exist on the connection string.
  // This avoids subtle runtime differences across environments (like Vercel Node/OpenSSL).
  const uri = new URL(MONGODB_URI!);
  const params = uri.searchParams;
  if (!params.has("retryWrites")) params.set("retryWrites", "true");
  if (!params.has("w")) params.set("w", "majority");
  if (!params.has("appName")) params.set("appName", "moviereckon");
  // With Atlas SRV URIs, TLS is implied, but we set it explicitly for clarity.
  if (!params.has("tls") && !params.has("ssl")) params.set("tls", "true");

  const client = new MongoClient(uri.toString(), {
    // Fail fast in serverless when the cluster/network is misconfigured
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 20_000,
    // TLS settings
    tls: true,
    ...(MONGODB_TLS_INSECURE
      ? {
          tlsInsecure: true,
          tlsAllowInvalidCertificates: true,
        }
      : {}),
  });
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);

  cached = { client, db };
  globalThis.mongoConnection = cached;

  return cached;
}

// Export ObjectId for use in handlers
export { ObjectId };
