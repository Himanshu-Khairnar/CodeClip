import mongoose from "mongoose";

/** Fixed-window counters shared by every serverless instance. */
const RateLimitSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, default: 0 },
    // TTL index — MongoDB drops finished windows on its own.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { versionKey: false }
);

export default mongoose.models.RateLimit || mongoose.model("RateLimit", RateLimitSchema);
