import { supabase } from "./supabase";
import { logActivity } from "./activity";

export interface ProjectPhoto {
  id: string;
  project_id: string;
  photo_url: string;
  caption: string;
  uploaded_by: string;
  created_at: string;
}

export interface UploadPhotoData {
  project_id: string;
  caption?: string;
}

export async function uploadProjectPhoto(file: File, data: UploadPhotoData) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${data.project_id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("project-photos")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading photo to storage:", uploadError);
      return { success: false, error: uploadError };
    }

    const { data: publicUrlData } = supabase.storage
      .from("project-photos")
      .getPublicUrl(fileName);

    const photoUrl = publicUrlData.publicUrl;

    const { data: photoRecord, error: dbError } = await supabase
      .from("project_photos")
      .insert({
        project_id: data.project_id,
        photo_url: fileName,
        caption: data.caption || '',
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error saving photo record:", dbError);
      await supabase.storage.from("project-photos").remove([fileName]);
      return { success: false, error: dbError };
    }

    const caption = data.caption ? `: ${data.caption}` : "";
    await logActivity(data.project_id, "photo_upload", `Uploaded photo${caption}`);

    return { success: true, data: { ...photoRecord, publicUrl: photoUrl } };
  } catch (e) {
    console.error("Exception uploading photo:", e);
    return { success: false, error: e };
  }
}

export async function fetchProjectPhotos(projectId: string) {
  try {
    const { data, error } = await supabase
      .from("project_photos")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching photos:", error);
      return { success: false, error, data: [] };
    }

    const photosWithUrls = (data || []).map((photo) => {
      const { data: publicUrlData } = supabase.storage
        .from("project-photos")
        .getPublicUrl(photo.photo_url);

      return {
        ...photo,
        publicUrl: publicUrlData.publicUrl,
      };
    });

    return { success: true, data: photosWithUrls };
  } catch (e) {
    console.error("Exception fetching photos:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function deleteProjectPhoto(photoId: string, photoUrl: string) {
  try {
    const { error: dbError } = await supabase
      .from("project_photos")
      .delete()
      .eq("id", photoId);

    if (dbError) {
      console.error("Error deleting photo record:", dbError);
      return { success: false, error: dbError };
    }

    const { error: storageError } = await supabase.storage
      .from("project-photos")
      .remove([photoUrl]);

    if (storageError) {
      console.error("Error deleting photo from storage:", storageError);
    }

    return { success: true };
  } catch (e) {
    console.error("Exception deleting photo:", e);
    return { success: false, error: e };
  }
}
