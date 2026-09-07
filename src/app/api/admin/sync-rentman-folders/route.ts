import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRootEquipmentFolders } from '@/lib/rentman';

export async function POST() {
  try {
    await requireAdmin();
    const admin = createAdminClient();
    const folders = await getRootEquipmentFolders();
    const activeIds = folders.map((folder) => folder.id);

    for (const folder of folders) {
      const existing = await admin
        .from('brands')
        .select('id')
        .eq('rentman_folder_id', folder.id)
        .maybeSingle();

      if (existing.data?.id) {
        await admin
          .from('brands')
          .update({
            name: folder.name,
            rentman_name: folder.name,
            rentman_path: folder.path ?? folder.name,
            rentman_parent_id: null,
            rentman_active: true,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', existing.data.id);
      } else {
        await admin.from('brands').insert({
          name: folder.name,
          rentman_name: folder.name,
          rentman_folder_id: folder.id,
          rentman_path: folder.path ?? folder.name,
          rentman_parent_id: null,
          rentman_active: true,
          portal_enabled: false,
          is_brand: true,
          last_synced_at: new Date().toISOString(),
        });
      }
    }

    if (activeIds.length > 0) {
      const { data: known } = await admin.from('brands').select('id,rentman_folder_id').not('rentman_folder_id', 'is', null);
      const inactive = (known ?? []).filter((row) => row.rentman_folder_id && !activeIds.includes(row.rentman_folder_id));
      for (const row of inactive) {
        await admin.from('brands').update({ rentman_active: false, last_synced_at: new Date().toISOString() }).eq('id', row.id);
      }
    }

    revalidatePath('/admin/brands');
    revalidatePath('/portal');
    revalidatePath('/portal', 'layout');

    return NextResponse.json({ success: true, folders_synced: folders.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende fout';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
