'use server';

import { revalidatePath } from 'next/cache';
import { requirePlanningUser } from '@/lib/auth';

export async function updateFuelCardDistanceSetting(formData: FormData) {
  const { supabase, user, profile } = await requirePlanningUser();
  if (profile.role !== 'admin') return;

  const value = Math.round(Number(formData.get('fuel_card_distance_km')));
  if (!Number.isFinite(value) || value < 1) return;

  const { error } = await supabase
    .from('planning_settings')
    .upsert({
      id: 1,
      fuel_card_distance_km: value,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }, { onConflict: 'id' });

  if (error) throw new Error(error.message);
  revalidatePath('/planning');
}
