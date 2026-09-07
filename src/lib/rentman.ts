const API_BASE = 'https://api.rentman.net';

function token() {
  const value = process.env.RENTMAN_API_TOKEN;
  if (!value) throw new Error('RENTMAN_API_TOKEN is not configured.');
  return value;
}

type RentmanListResponse<T> = {
  data?: T[];
  next_page_url?: string | null;
};

async function rentmanFetch<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
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

async function rentmanFetchAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = path;
  let pageCount = 0;

  while (nextUrl) {
    const result: RentmanListResponse<T> = await rentmanFetch<RentmanListResponse<T>>(nextUrl);
    items.push(...(result.data ?? []));
    nextUrl = result.next_page_url ?? null;
    pageCount += 1;

    // Safety guard against a broken/looping pagination response.
    if (pageCount > 100) {
      throw new Error('Rentman pagination exceeded the safety limit.');
    }
  }

  return items;
}

export type RentmanFolder = {
  id: number;
  name: string;
  parent: string | null;
  path?: string;
};

export async function getRootEquipmentFolders() {
  const folders = await rentmanFetchAll<RentmanFolder>(
    '/folders?itemtype=equipment&fields=id,name,parent,path&limit=1500',
  );
  return folders.filter((folder) => folder.parent === null);
}

async function getAllEquipmentFolders() {
  return rentmanFetchAll<RentmanFolder>(
    '/folders?itemtype=equipment&fields=id,name,parent,path&limit=1500',
  );
}

function getDescendantFolderIds(rootFolderId: number, folders: RentmanFolder[]) {
  const included = new Set<number>([rootFolderId]);
  let changed = true;

  // Keep adding children of folders already included until no new folders are found.
  // This supports any nesting depth: Brand > POS > Displays > Small, etc.
  while (changed) {
    changed = false;

    for (const folder of folders) {
      if (included.has(folder.id) || !folder.parent) continue;

      const parentId = Number(folder.parent.split('/').pop());
      if (Number.isFinite(parentId) && included.has(parentId)) {
        included.add(folder.id);
        changed = true;
      }
    }
  }

  return included;
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

  const [folders, allEquipment] = await Promise.all([
    getAllEquipmentFolders(),
    rentmanFetchAll<RentmanEquipment>(
      '/equipment?fields=id,name,code,folder,image,current_quantity,external_remark,custom&limit=1500',
    ),
  ]);

  const descendantFolderIds = getDescendantFolderIds(folderId, folders);

  const items = allEquipment.filter((item) => {
    if (!item.folder) return false;

    const itemFolderId = Number(item.folder.split('/').pop());
    const inBrandTree = Number.isFinite(itemFolderId) && descendantFolderIds.has(itemFolderId);
    const visible = truthyPortalValue(item.custom?.[customFieldKey]);

    return inBrandTree && visible;
  });

  return { items, configured: true };
}
