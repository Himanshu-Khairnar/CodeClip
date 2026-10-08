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
  /** sha256 of the creator's owner token — required to edit/delete. */
  ownerTokenHash?: string;
  views: number;
  lastViewedAt?: Date;
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
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  ownerTokenHash: { type: String },
  views: { type: Number, default: 0 },
  lastViewedAt: { type: Date },
});

// Lets the create route cheaply reject a file key already used by another clip.
ClipSchema.index({ "files.key": 1 });

// NOTE: no TTL index on expiresAt. The /api/cleanup cron deletes both the
// MongoDB document AND the Cloudinary files, so a TTL index would orphan
// the Cloudinary assets (the document disappears before the cron sees it).

export default mongoose.models.Clip || mongoose.model<IClip>("Clip", ClipSchema);
