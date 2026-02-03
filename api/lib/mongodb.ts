/**
 * MongoDB Connection Helper
 * Uses globalThis caching to prevent multiple connections in serverless environment
 */
import { MongoClient, Db, ObjectId } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "moviereckon";

if (!MONGODB_URI) {
  throw new Error("Please define MONGODB_URI environment variable");
}

interface CachedConnection {
  client: MongoClient;
  db: Db;
}

// Use globalThis for connection caching in serverless environment
declare global {
  // eslint-disable-next-line no-var
  var mongoConnection: CachedConnection | undefined;
}

let cached = globalThis.mongoConnection;

export async function connectToDatabase(): Promise<CachedConnection> {
  if (cached) {
    return cached;
  }

  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);

  cached = { client, db };
  globalThis.mongoConnection = cached;

  return cached;
}

// Export ObjectId for use in handlers
export { ObjectId };
