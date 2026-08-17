import mongoose from "mongoose";
import dns from "dns";

// Some networks (e.g. local DNS proxies returning ECONNREFUSED) fail to resolve
// MongoDB Atlas SRV records. Pin a reliable public resolver and re-assert it
// before every connect attempt, retrying once on DNS/SRV lookup failures.
const DNS_SERVERS = ["8.8.8.8", "1.1.1.1", "8.8.4.4"];

function configureDns() {
  try {
    dns.setServers(DNS_SERVERS);
  } catch {
    // Ignore in environments where setServers is restricted (e.g. some serverless)
  }
}

configureDns();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/codeclip";

if (!MONGODB_URI) {
  throw new Error(
    "Please define the MONGODB_URI environment variable inside .env.local"
  );
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
    return await mongoose.connect(MONGODB_URI, { bufferCommands: false });
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
