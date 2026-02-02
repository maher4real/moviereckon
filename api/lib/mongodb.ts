/**
 * MongoDB Connection Utility
 * Used by Vercel serverless functions and local development
 *
 * Implements connection pooling with globalThis caching to avoid
 * multiple connections in serverless environments.
 */
import { MongoClient, Db, ObjectId } from "mongodb";

// Connection string should be set as MONGODB_URI env var
const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB_NAME || "moviereckon";

// Use globalThis for serverless caching compatibility
declare global {
  var mongoClient: MongoClient | undefined;
  var mongoDb: Db | undefined;
}

export async function connectToDatabase(): Promise<{
  client: MongoClient;
  db: Db;
}> {
  // Return cached connection if available
  if (globalThis.mongoClient && globalThis.mongoDb) {
    return { client: globalThis.mongoClient, db: globalThis.mongoDb };
  }

  if (!uri) {
    throw new Error(
      "MONGODB_URI environment variable is not set. " +
        "Ensure .env.local or Vercel environment variables contain MONGODB_URI.",
    );
  }

  try {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    const db = client.db(dbName);

    // Cache in globalThis for reuse
    globalThis.mongoClient = client;
    globalThis.mongoDb = db;

    console.log(`[MongoDB] Connected to ${dbName}`);

    return { client, db };
  } catch (error) {
    console.error("[MongoDB] Connection failed:", error);
    throw new Error(
      `Failed to connect to MongoDB: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export { ObjectId };

// Helper to create a standard response
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Helper for error responses
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Helper for CORS preflight
export function corsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
