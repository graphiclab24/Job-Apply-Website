import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from './firebase';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts',
];

// In-memory token cache (MANDATORY: NEVER stored in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let cachedDriveUser: {
  email?: string | null;
  name?: string | null;
  photoURL?: string | null;
} | null = null;

export const googleProvider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => googleProvider.addScope(scope));

// Clear token on auth sign out
auth.onAuthStateChanged((user) => {
  if (!user) {
    cachedAccessToken = null;
    cachedDriveUser = null;
  }
});

export function getDriveAccessToken(): string | null {
  return cachedAccessToken;
}

export function isDriveConnected(): boolean {
  return Boolean(cachedAccessToken);
}

export function getDriveUser() {
  return cachedDriveUser;
}

export function setDriveAccessToken(token: string, user?: { email?: string | null; name?: string | null; photoURL?: string | null }) {
  cachedAccessToken = token;
  if (user) cachedDriveUser = user;
}

/**
 * Connect Google Drive via Google Popup Auth
 */
export async function connectGoogleDrive(): Promise<{ accessToken: string; user: any }> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google Drive এক্সেস টোকেন পাওয়া যায়নি');
    }

    cachedAccessToken = credential.accessToken;
    cachedDriveUser = {
      email: result.user.email,
      name: result.user.displayName,
      photoURL: result.user.photoURL,
    };

    return {
      accessToken: cachedAccessToken,
      user: result.user,
    };
  } catch (error: any) {
    console.error('Google Drive connection error:', error);
    if (error?.code === 'auth/unauthorized-domain') {
      throw new Error(
        'ডোমেইন অনুমোদিত নয় (auth/unauthorized-domain)। অনুগ্রহ করে Firebase Console -> Authentication -> Settings -> Authorized Domains এ গিয়ে bdjobapply.site যোগ করুন।'
      );
    }
    throw error;
  }
}

export function disconnectGoogleDrive(): void {
  cachedAccessToken = null;
  cachedDriveUser = null;
}

export interface DriveStorageInfo {
  limit?: string;
  usage?: string;
  usageInDrive?: string;
  user?: {
    displayName?: string;
    emailAddress?: string;
    photoLink?: string;
  };
}

/**
 * Fetch Google Drive storage quota and user info
 */
export async function getDriveStorageInfo(): Promise<DriveStorageInfo> {
  const token = getDriveAccessToken();
  if (!token) {
    throw new Error('Google Drive সংযুক্ত নেই');
  }

  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota,user', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error('Google এক্সেস টোকেন মেয়াদোত্তীর্ণ হয়েছে। দয়া করে পুনরায় কানেক্ট করুন।');
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Google Drive তথ্য লোড করা যায়নি');
  }

  const data = await res.json();
  return {
    limit: data.storageQuota?.limit,
    usage: data.storageQuota?.usage,
    usageInDrive: data.storageQuota?.usageInDrive,
    user: data.user,
  };
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  size?: string;
  modifiedTime?: string;
}

/**
 * List files from Google Drive
 */
export async function listDriveFiles(options?: {
  pageSize?: number;
  mimeFilter?: 'pdf' | 'images' | 'all';
  searchQuery?: string;
}): Promise<DriveFileItem[]> {
  const token = getDriveAccessToken();
  if (!token) {
    throw new Error('Google Drive সংযুক্ত নেই। দয়া করে প্রথমে Google Drive কানেক্ট করুন।');
  }

  let query = 'trashed = false';
  if (options?.mimeFilter === 'pdf') {
    query += " and mimeType = 'application/pdf'";
  } else if (options?.mimeFilter === 'images') {
    query += " and mimeType contains 'image/'";
  }

  if (options?.searchQuery && options.searchQuery.trim()) {
    const escaped = options.searchQuery.replace(/'/g, "\\'");
    query += ` and name contains '${escaped}'`;
  }

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('pageSize', String(options?.pageSize || 30));
  url.searchParams.set(
    'fields',
    'files(id, name, mimeType, webViewLink, webContentLink, thumbnailLink, size, modifiedTime)'
  );
  url.searchParams.set('orderBy', 'modifiedTime desc');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error('Google এক্সেস টোকেন মেয়াদোত্তীর্ণ হয়েছে। দয়া করে পুনরায় কানেক্ট করুন।');
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Google Drive ফাইল তালিকা লোড করতে ব্যর্থ হয়েছে');
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Upload a file directly to Google Drive and make it shareable
 */
export async function uploadFileToGoogleDrive(
  file: File | Blob,
  fileName: string,
  options?: { makePublic?: boolean; description?: string; folderId?: string }
): Promise<{ fileId: string; webViewLink: string; webContentLink?: string; directImageUrl?: string }> {
  const token = getDriveAccessToken();
  if (!token) {
    throw new Error('Google Drive সংযুক্ত নেই। দয়া করে প্রথমে Google Drive কানেক্ট করুন।');
  }

  const metadata: Record<string, any> = {
    name: fileName,
    description: options?.description || 'চাকরি আবেদন সার্ভিস পোর্টাল ফাইল',
  };

  if (options?.folderId) {
    metadata.parents = [options.folderId];
  }

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' })
  );
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    if (res.status === 401) {
      cachedAccessToken = null;
      throw new Error('Google এক্সেস টোকেন মেয়াদোত্তীর্ণ হয়েছে। পুনরায় কানেক্ট করুন।');
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Google Drive-এ ফাইল আপলোড ব্যর্থ হয়েছে');
  }

  const fileData = await res.json();
  const fileId = fileData.id;

  // Make file readable to anyone with link (so candidate & admin can view easily)
  if (options?.makePublic !== false) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      });
    } catch (e) {
      console.warn('Could not set public permission on drive file:', e);
    }
  }

  return {
    fileId,
    webViewLink: fileData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
    webContentLink: fileData.webContentLink,
    directImageUrl: getDriveDirectImageUrl(fileId),
  };
}

/**
 * Returns a high-speed direct CDN URL for Google Drive images (usable directly in <img src="...">)
 */
export function getDriveDirectImageUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/**
 * Finds or creates a designated folder in Google Drive (defaults to "BD Job Circular Images")
 */
export async function getOrCreateDriveFolder(folderName: string = 'BD Job Circular Images'): Promise<string> {
  const token = getDriveAccessToken();
  if (!token) {
    throw new Error('Google Drive সংযুক্ত নেই। দয়া করে প্রথমে Google Drive কানেক্ট করুন।');
  }

  // 1. Search for existing folder
  const escapedName = folderName.replace(/'/g, "\\'");
  const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
  searchUrl.searchParams.set(
    'q',
    `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and trashed = false`
  );
  searchUrl.searchParams.set('fields', 'files(id, name)');

  try {
    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }
  } catch (err) {
    console.warn('Folder search error:', err);
  }

  // 2. Folder does not exist, create it
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'বিডি জব পোর্টালের চাকরির বিজ্ঞপ্তি ইমেজ ও ফাইল',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Google Drive ফোল্ডার তৈরি করা যায়নি');
  }

  const folderData = await createRes.json();
  return folderData.id;
}

/**
 * Uploads a circular image directly into the designated "BD Job Circular Images" folder
 */
export async function uploadJobImageToDrive(
  file: File | Blob,
  fileName?: string
): Promise<{ fileId: string; directImageUrl: string; webViewLink: string }> {
  const folderId = await getOrCreateDriveFolder('BD Job Circular Images');
  const safeName = fileName || `circular_img_${Date.now()}.jpg`;

  const uploaded = await uploadFileToGoogleDrive(file, safeName, {
    makePublic: true,
    folderId,
    description: 'বিডি জব পোর্টাল সার্কুলার ইমেজ',
  });

  return {
    fileId: uploaded.fileId,
    directImageUrl: getDriveDirectImageUrl(uploaded.fileId),
    webViewLink: uploaded.webViewLink,
  };
}

/**
 * Delete file from Google Drive with mandatory user confirmation dialog
 */
export async function deleteDriveFile(fileId: string, fileName?: string): Promise<boolean> {
  const token = getDriveAccessToken();
  if (!token) {
    throw new Error('Google Drive সংযুক্ত নেই');
  }

  // Mandatory confirmation dialog for destructive mutations as per Workspace Skill Guidelines
  const confirmed = window.confirm(
    `আপনি কি নিশ্চিত যে Google Drive থেকে "${fileName || fileId}" ফাইলটি মুছে ফেলতে চান? এটি আর ফিরিয়ে আনা যাবে না।`
  );
  if (!confirmed) {
    return false;
  }

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Google Drive থেকে ফাইল মুছতে ব্যর্থ হয়েছে');
  }

  return true;
}
