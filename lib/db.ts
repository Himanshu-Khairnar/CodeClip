import mongoose from "mongoose";
import dns from "dns";

// Some networks (e.g. local DNS proxies returning ECONNREFUSED) fail to resolve
// MongoDB Atlas SRV records. Locally we pin a reliable public resolver and
// re-assert it before every connect attempt. `dns.setServers` changes DNS for
// the whole process, so it is skipped on Vercel unless MONGODB_DNS_SERVERS
// is set explicitly.
const DNS_SERVERS = process.env.MONGODB_DNS_SERVERS
  ? process.env.MONGODB_DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean)
  : process.env.VERCEL
    ? []
    : ["8.8.8.8", "1.1.1.1", "8.8.4.4"];

function configureDns() {
  if (DNS_SERVERS.length === 0) return;
  try {
    dns.setServers(DNS_SERVERS);
  } catch {
    // Ignore in environments where setServers is restricted (e.g. some serverless)
  }
}

configureDns();

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (uri) return uri;
  // Production must be configured explicitly; local dev may use a local mongod.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Please define the MONGODB_URI environment variable");
  }
  return "mongodb://127.0.0.1:27017/codeclip";
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCached: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCached ?? (global.mongooseCached = { conn: null, promise: null });

function isDnsError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNREFUSED" ||
    code === "querySrv" ||
    code === "queryA" ||
    code === "queryAaaa" ||
    code === "ERR_DNS_SRV_FAILED"
  );
}

async function connectWithRetry(allowRetry = true): Promise<typeof mongoose> {
  configureDns();
  try {
    return await mongoose.connect(getMongoUri(), { bufferCommands: false });
  } catch (err) {
    if (allowRetry && isDnsError(err)) {
      configureDns();
      return connectWithRetry(false);
    }
    throw err;
  }
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = connectWithRetry();
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
