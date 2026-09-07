const API_BASE = 'https://api.rentman.net';

function token() {
  const value = process.env.RENTMAN_API_TOKEN;
  if (!value) throw new Error('RENTMAN_API_TOKEN is not configured.');
  return value;
}

async function rentmanFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Rentman request failed (${response.status}).`);
  }

  return response.json();
}

export type RentmanFolder = {
  id: number;
  name: string;
  parent: string | null;
  path?: string;
};

export async function getRootEquipmentFolders() {
  const result = await rentmanFetch<{ data: RentmanFolder[] }>(
    '/folders?itemtype=equipment&fields=id,name,parent,path&limit=1500',
  );
  return (result.data ?? []).filter((folder) => folder.parent === null);
}

export type RentmanEquipment = {
  id: number;
  name: string;
  code?: string;
  folder?: string | null;
  image?: string | null;
  current_quantity?: number;
  external_remark?: string;
  custom?: Record<string, unknown>;
};

function truthyPortalValue(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    return ['yes', 'ja', 'true', '1', 'show', 'visible'].includes(value.toLowerCase().trim());
  }
  return false;
}

export async function getVisibleEquipmentForFolder(folderId: number) {
  const customFieldKey = process.env.RENTMAN_PORTAL_CUSTOM_FIELD_KEY;
  if (!customFieldKey) return { items: [] as RentmanEquipment[], configured: false };

  const result = await rentmanFetch<{ data: RentmanEquipment[] }>(
    `/equipment?fields=id,name,code,folder,image,current_quantity,external_remark,custom&limit=1500`,
  );

  const folderPath = `/folders/${folderId}`;
  const items = (result.data ?? []).filter((item) => {
    const inFolder = item.folder === folderPath;
    const visible = truthyPortalValue(item.custom?.[customFieldKey]);
    return inFolder && visible;
  });

  return { items, configured: true };
}
