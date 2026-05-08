/**
 * MongoDB Connection Helper
 * Uses globalThis caching to prevent multiple connections in serverless environment
 */
import { MongoClient, Db, ObjectId } from "mongodb";

interface CachedConnection {
  client: MongoClient;
  db: Db;
}

type GenericDocument = Record<string, unknown>;

// Use globalThis for connection caching in serverless environment
declare global {
  var mongoConnection: CachedConnection | undefined;
  var mongoIndexBootstrapPromise: Promise<void> | undefined;
}

let cached = globalThis.mongoConnection;
const INDEX_BOOTSTRAP_DISABLED = process.env.MONGODB_SKIP_INDEX_BOOTSTRAP === "true";

function getMongoConfig() {
  const uri = process.env.MONGODB_URI;
  const tlsInsecure = process.env.MONGODB_TLS_INSECURE === "true";

  if (tlsInsecure && process.env.NODE_ENV === "production") {
    throw new Error("MONGODB_TLS_INSECURE must never be enabled in production");
  }

  if (!uri) {
    throw new Error("Please define MONGODB_URI environment variable");
  }

  return {
    uri,
    dbName: process.env.MONGODB_DB_NAME || "moviereckon",
    tlsInsecure,
  };
}

function logIndexBootstrapWarning(name: string, error: unknown) {
  const details = error instanceof Error ? error.message : String(error);
  console.warn(`Mongo index bootstrap warning (${name}): ${details}`);
}

async function createIndexSafe(
  db: Db,
  collectionName: string,
  keys: Record<string, 1 | -1>,
  options: Record<string, unknown>,
) {
  try {
    await db
      .collection<GenericDocument>(collectionName)
      .createIndex(keys, options);
  } catch (error) {
    logIndexBootstrapWarning(
      `${collectionName}:${JSON.stringify(keys)}`,
      error,
    );
  }
}

async function ensureMongoIndexes(db: Db): Promise<void> {
  if (INDEX_BOOTSTRAP_DISABLED) return;
  if (globalThis.mongoIndexBootstrapPromise) {
    return globalThis.mongoIndexBootstrapPromise;
  }

  globalThis.mongoIndexBootstrapPromise = (async () => {
    await createIndexSafe(db, "users", { email: 1 }, { unique: true, name: "users_email_unique" });
    await createIndexSafe(db, "users", { username: 1 }, { unique: true, name: "users_username_unique" });
    await createIndexSafe(db, "users", { role: 1 }, { name: "users_role" });
    await createIndexSafe(db, "users", { verificationTokenHash: 1 }, {
      unique: true,
      sparse: true,
      name: "users_verification_token_hash_unique_sparse",
    });
    await createIndexSafe(db, "users", { passwordResetTokenHash: 1 }, {
      unique: true,
      sparse: true,
      name: "users_password_reset_token_hash_unique_sparse",
    });
    await createIndexSafe(db, "users", { google_sub: 1 }, {
      unique: true,
      sparse: true,
      name: "users_google_sub_unique_sparse",
    });

    await createIndexSafe(db, "user_preferences", { user_id: 1 }, {
      unique: true,
      name: "user_preferences_user_id_unique",
    });

    await createIndexSafe(db, "watch_history", { user_id: 1, content_id: 1, content_type: 1 }, {
      unique: true,
      name: "watch_history_user_content_unique",
    });
    await createIndexSafe(db, "watch_history", { user_id: 1, watched_at: -1, _id: -1 }, {
      name: "watch_history_user_time_desc",
    });

    await createIndexSafe(db, "liked_items", { user_id: 1, content_id: 1, content_type: 1 }, {
      unique: true,
      name: "liked_items_user_content_unique",
    });
    await createIndexSafe(db, "liked_items", { user_id: 1, liked_at: -1, _id: -1 }, {
      name: "liked_items_user_time_desc",
    });

    await createIndexSafe(db, "watchlist", { user_id: 1, content_id: 1, content_type: 1 }, {
      unique: true,
      name: "watchlist_user_content_unique",
    });
    await createIndexSafe(db, "watchlist", { user_id: 1, position: 1 }, {
      name: "watchlist_user_position",
    });

    await createIndexSafe(db, "content_feedback", { user_id: 1, content_id: 1, content_type: 1 }, {
      unique: true,
      name: "content_feedback_user_content_unique",
    });
    await createIndexSafe(db, "content_feedback", { user_id: 1, updated_at: -1, _id: -1 }, {
      name: "content_feedback_user_time_desc",
    });
    await createIndexSafe(db, "content_feedback", { content_id: 1, content_type: 1, feedback_type: 1 }, {
      name: "content_feedback_content_feedback_type",
    });
    await createIndexSafe(db, "content_feedback_summary", { content_id: 1, content_type: 1 }, {
      unique: true,
      name: "content_feedback_summary_content_unique",
    });

    await createIndexSafe(db, "content_comments", { content_id: 1, content_type: 1, created_at: -1, _id: -1 }, {
      name: "content_comments_content_time_desc",
    });
    await createIndexSafe(db, "content_comments", { user_id: 1, created_at: -1, _id: -1 }, {
      name: "content_comments_user_time_desc",
    });

    await createIndexSafe(db, "refresh_tokens", { token_hash: 1 }, {
      unique: true,
      name: "refresh_tokens_hash_unique",
    });
    await createIndexSafe(db, "refresh_tokens", { user_id: 1, expires_at: -1 }, {
      name: "refresh_tokens_user_exp_desc",
    });
    await createIndexSafe(db, "refresh_tokens", { user_id: 1, created_at: -1, _id: -1 }, {
      name: "refresh_tokens_user_created_desc",
    });
    await createIndexSafe(db, "refresh_tokens", { user_id: 1, session_id: 1 }, {
      name: "refresh_tokens_user_session",
    });
    await createIndexSafe(db, "refresh_tokens", { expires_at: 1 }, {
      expireAfterSeconds: 0,
      name: "refresh_tokens_ttl_expires_at",
    });

    await createIndexSafe(db, "security_event_aggregates", { bucket_start: 1, event_field: 1 }, {
      name: "security_event_aggregates_bucket_field",
    });
    await createIndexSafe(db, "security_event_aggregates", { updated_at: -1 }, {
      name: "security_event_aggregates_updated_desc",
    });

    await createIndexSafe(db, "security_events", { created_at: -1 }, {
      name: "security_events_created_desc",
    });
    await createIndexSafe(db, "security_events", { created_at: 1 }, {
      expireAfterSeconds: Number(process.env.SECURITY_EVENTS_TTL_SECONDS || 14 * 24 * 60 * 60),
      name: "security_events_ttl_created_at",
    });

    await createIndexSafe(db, "theater_movies", { createdAt: -1 }, {
      name: "theater_movies_created_desc",
    });
    await createIndexSafe(db, "theater_movies", { genre: 1 }, {
      name: "theater_movies_genre",
    });
  })();

  return globalThis.mongoIndexBootstrapPromise;
}

export async function connectToDatabase(): Promise<CachedConnection> {
  if (cached) {
    await ensureMongoIndexes(cached.db);
    return cached;
  }

  // Ensure common Atlas options exist on the connection string.
  // This avoids subtle runtime differences across environments (like Vercel Node/OpenSSL).
  const mongoConfig = getMongoConfig();
  const uri = new URL(mongoConfig.uri);
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
    ...(mongoConfig.tlsInsecure
      ? {
          tlsInsecure: true,
          tlsAllowInvalidCertificates: true,
        }
      : {}),
  });
  await client.connect();
  const db = client.db(mongoConfig.dbName);
  await ensureMongoIndexes(db);

  cached = { client, db };
  globalThis.mongoConnection = cached;

  return cached;
}

// Export ObjectId for use in handlers
export { ObjectId };
