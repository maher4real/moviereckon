const coalesce = (...values: Array<string | undefined>) =>
  values.find((value) => typeof value === "string" && value.length > 0) || "";

export const getPublicMongoApiUrl = () =>
  coalesce(
    process.env.NEXT_PUBLIC_MONGODB_API_URL,
    process.env.NEXT_PUBLIC_VITE_MONGODB_API_URL,
    process.env.VITE_MONGODB_API_URL,
  );

export const isDevelopment = () => process.env.NODE_ENV !== "production";
