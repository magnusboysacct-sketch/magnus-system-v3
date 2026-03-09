import { supabase } from "./supabase";
import { logActivity } from "./activity";

export interface ProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_url: string;
  uploaded_by: string;
  created_at: string;
}

export async function uploadProjectFile(
  projectId: string,
  file: File
): Promise<{ success: boolean; error?: any; data?: ProjectDocument }> {
  try {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `${projectId}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("project-files")
      .upload(filePath, file);

    if (uploadError) {
      console.error("Error uploading file to storage:", uploadError);
      return { success: false, error: uploadError };
    }

    const { data: urlData } = supabase.storage
      .from("project-files")
      .getPublicUrl(filePath);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: new Error("User not authenticated") };
    }

    const { data: docData, error: docError } = await supabase
      .from("project_documents")
      .insert({
        project_id: projectId,
        file_name: file.name,
        file_type: file.type || `application/${fileExt}`,
        file_url: filePath,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (docError) {
      console.error("Error creating document record:", docError);
      await supabase.storage.from("project-files").remove([filePath]);
      return { success: false, error: docError };
    }

    await logActivity(projectId, "document_upload", `Uploaded document: ${file.name}`);

    return { success: true, data: docData };
  } catch (e) {
    console.error("Exception uploading project file:", e);
    return { success: false, error: e };
  }
}

export async function fetchProjectFiles(projectId: string) {
  try {
    const { data, error } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching project files:", error);
      return { success: false, error, data: [] };
    }

    return { success: true, data: data || [] };
  } catch (e) {
    console.error("Exception fetching project files:", e);
    return { success: false, error: e, data: [] };
  }
}

export async function deleteProjectFile(documentId: string, filePath: string) {
  try {
    const { error: storageError } = await supabase.storage
      .from("project-files")
      .remove([filePath]);

    if (storageError) {
      console.error("Error deleting file from storage:", storageError);
    }

    const { error: dbError } = await supabase
      .from("project_documents")
      .delete()
      .eq("id", documentId);

    if (dbError) {
      console.error("Error deleting document record:", dbError);
      return { success: false, error: dbError };
    }

    return { success: true };
  } catch (e) {
    console.error("Exception deleting project file:", e);
    return { success: false, error: e };
  }
}

export async function downloadProjectFile(filePath: string, fileName: string) {
  try {
    const { data, error } = await supabase.storage
      .from("project-files")
      .download(filePath);

    if (error) {
      console.error("Error downloading file:", error);
      return { success: false, error };
    }

    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true };
  } catch (e) {
    console.error("Exception downloading project file:", e);
    return { success: false, error: e };
  }
}
