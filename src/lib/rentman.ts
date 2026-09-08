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

type RentmanSingleResponse<T> = {
  data?: T;
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
    throw new Error(`Beheerverbinding mislukt (${response.status}).`);
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

    if (pageCount > 100) {
      throw new Error('De beheergegevens zijn te groot om veilig te laden.');
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

export async function getRootEquipmentFolderMap() {
  const folders = await getRootEquipmentFolders();
  return new Map(folders.map((folder) => [folder.id, folder]));
}

async function getAllEquipmentFolders() {
  return rentmanFetchAll<RentmanFolder>(
    '/folders?itemtype=equipment&fields=id,name,parent,path&limit=1500',
  );
}

function getDescendantFolderIds(rootFolderId: number, folders: RentmanFolder[]) {
  const included = new Set<number>([rootFolderId]);
  let changed = true;

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

function getTopLevelCategoryName(rootFolderId: number, itemFolderId: number, folders: RentmanFolder[]) {
  if (itemFolderId === rootFolderId) return 'Overig';

  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  let current = folderMap.get(itemFolderId);
  const seen = new Set<number>();

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (!current.parent) return current.name || 'Overig';

    const parentId = Number(current.parent.split('/').pop());
    if (!Number.isFinite(parentId)) return current.name || 'Overig';
    if (parentId === rootFolderId) return current.name || 'Overig';

    current = folderMap.get(parentId);
  }

  return 'Overig';
}

export type RentmanEquipment = {
  id: number;
  category?: string;
  name: string;
  code?: string;
  folder?: string | null;
  image?: string | null;
  main_image_file_id?: number | null;
  current_quantity?: number;
  external_remark?: string;
  custom?: Record<string, unknown>;
  height?: number;
  width?: number;
  length?: number;
  weight?: number;
};

export type RentmanFile = {
  id: number;
  displayname?: string | null;
  readable_name?: string | null;
  description?: string | null;
  image?: boolean;
  type?: string | null;
  extension?: string | null;
  url?: string | null;
  proxy_url?: string | null;
  public?: boolean;
};

type ProjectEquipmentUsage = {
  id: number;
  equipment?: string | null;
  usageperiod_start?: string | null;
  usageperiod_end?: string | null;
};

function truthyPortalValue(value: unknown) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    return ['yes', 'ja', 'true', '1', 'show', 'visible'].includes(value.toLowerCase().trim());
  }
  return false;
}

function fileIdFromReference(reference?: string | null) {
  if (!reference?.startsWith('/files/')) return null;
  const id = Number(reference.split('/').pop());
  return Number.isFinite(id) ? id : null;
}

async function resolveEquipmentImage(reference?: string | null) {
  if (!reference) return null;
  if (reference.startsWith('http')) return reference;

  const fileId = fileIdFromReference(reference);
  if (!fileId) return null;

  try {
    const result = await rentmanFetch<RentmanSingleResponse<RentmanFile>>(`/files/${fileId}`);
    return result.data?.url ?? result.data?.proxy_url ?? null;
  } catch {
    return null;
  }
}

async function addResolvedImages(items: RentmanEquipment[]) {
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      image: await resolveEquipmentImage(item.image),
    })),
  );
}

export async function getVisibleEquipmentForFolder(folderId: number) {
  const customFieldKey = process.env.RENTMAN_PORTAL_CUSTOM_FIELD_KEY;
  if (!customFieldKey) return { items: [] as RentmanEquipment[], configured: false };

  const [folders, allEquipment] = await Promise.all([
    getAllEquipmentFolders(),
    rentmanFetchAll<RentmanEquipment>(
      '/equipment?fields=id,name,code,folder,image,current_quantity,external_remark,custom,height,width,length,weight&limit=1500',
    ),
  ]);

  const descendantFolderIds = getDescendantFolderIds(folderId, folders);
  const visibleItems = allEquipment
    .filter((item) => {
      if (!item.folder) return false;
      const itemFolderId = Number(item.folder.split('/').pop());
      const inBrandTree = Number.isFinite(itemFolderId) && descendantFolderIds.has(itemFolderId);
      const visible = truthyPortalValue(item.custom?.[customFieldKey]);
      return inBrandTree && visible;
    })
    .map((item) => {
      const itemFolderId = item.folder ? Number(item.folder.split('/').pop()) : NaN;
      return {
        ...item,
        category: Number.isFinite(itemFolderId)
          ? getTopLevelCategoryName(folderId, itemFolderId, folders)
          : 'Overig',
      };
    });

  return { items: await addResolvedImages(visibleItems), configured: true };
}

export async function getVisibleEquipmentItemForFolder(folderId: number, equipmentId: number) {
  const customFieldKey = process.env.RENTMAN_PORTAL_CUSTOM_FIELD_KEY;
  if (!customFieldKey) return null;

  const [folders, equipmentResult] = await Promise.all([
    getAllEquipmentFolders(),
    rentmanFetch<RentmanSingleResponse<RentmanEquipment>>(`/equipment/${equipmentId}`),
  ]);

  const item = equipmentResult.data;
  if (!item?.folder) return null;

  const descendantFolderIds = getDescendantFolderIds(folderId, folders);
  const itemFolderId = Number(item.folder.split('/').pop());
  const isInTree = Number.isFinite(itemFolderId) && descendantFolderIds.has(itemFolderId);
  const isVisible = truthyPortalValue(item.custom?.[customFieldKey]);
  if (!isInTree || !isVisible) return null;

  const mainImageFileId = fileIdFromReference(item.image);

  return {
    ...item,
    main_image_file_id: mainImageFileId,
    image: await resolveEquipmentImage(item.image),
  };
}


export async function getEquipmentFiles(equipmentId: number) {
  const files = await rentmanFetchAll<RentmanFile>(
    `/equipment/${equipmentId}/files?fields=id,displayname,readable_name,description,image,type,extension,url,proxy_url,public&limit=1500`,
  );

  return files
    .map((file) => ({
      ...file,
      href: file.url ?? file.proxy_url ?? null,
      name: file.readable_name ?? file.displayname ?? `Bestand ${file.id}`,
    }))
    .filter((file) => Boolean(file.href));
}

export async function getLastEquipmentUsageDate(equipmentId: number) {
  const params = new URLSearchParams({
    fields: 'id,equipment,usageperiod_start,usageperiod_end',
    equipment: `/equipment/${equipmentId}`,
    limit: '1500',
  });

  const usages = await rentmanFetchAll<ProjectEquipmentUsage>(`/projectequipment?${params.toString()}`);
  const now = Date.now();

  const completed = usages
    .filter((usage) => usage.usageperiod_start)
    .filter((usage) => {
      if (!usage.usageperiod_end) return true;
      const end = new Date(usage.usageperiod_end).getTime();
      return Number.isFinite(end) && end <= now;
    })
    .sort((a, b) => {
      const aDate = new Date(a.usageperiod_start ?? 0).getTime();
      const bDate = new Date(b.usageperiod_start ?? 0).getTime();
      return bDate - aDate;
    });

  return completed[0]?.usageperiod_start ?? null;
}
