import mongoose from "mongoose";

export interface IFile {
  filename: string;
  path: string;
  size: number;
  key?: string;
  resourceType?: string;
}

export interface IClip extends mongoose.Document {
  code: string;
  text?: string;
  files: IFile[];
  totalSize: number;
  createdAt: Date;
  expiresAt: Date;
  isOneTimeView?: boolean;
  consumed?: boolean;
  passwordHash?: string;
  salt?: string;
}

const FileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  path: { type: String, required: true },
  size: { type: Number, required: true },
  key: { type: String },
  resourceType: { type: String },
});

const ClipSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  text: { type: String },
  files: [FileSchema],
  totalSize: { type: Number, default: 0 },
  isOneTimeView: { type: Boolean, default: false },
  consumed: { type: Boolean, default: false },
  passwordHash: { type: String },
  salt: { type: String },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// NOTE: no TTL index on expiresAt. The /api/cleanup cron deletes both the
// MongoDB document AND the Cloudinary files, so a TTL index would orphan
// the Cloudinary assets (the document disappears before the cron sees it).

export default mongoose.models.Clip || mongoose.model<IClip>("Clip", ClipSchema);