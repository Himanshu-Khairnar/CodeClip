import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function uploadToCloudinary(
  buffer: Buffer,
  options: object
): Promise<any> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

export async function deleteFromCloudinary(
  publicId: string,
  resourceType: string
): Promise<void> {
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType as "image" | "video" | "raw",
  });
}
