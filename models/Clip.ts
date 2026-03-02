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
  password?: string;
  isOneTimeView?: boolean;
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
  password: { type: String },
  isOneTimeView: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// TTL index for auto-expiry
ClipSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.Clip || mongoose.model<IClip>("Clip", ClipSchema);
