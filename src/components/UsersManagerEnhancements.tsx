'use client';

import { useEffect } from 'react';

function roleValue(label: string | null) {
  const value = (label ?? '').trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'magazijn') return 'warehouse';
  return 'customer';
}

export default function UsersManagerEnhancements() {
  useEffect(() => {
    function enhanceProfileForm() {
      const form = document.querySelector<HTMLFormElement>('.usersProfilePanel');
      if (!form) return;

      const fields = Array.from(form.querySelectorAll<HTMLElement>('.field'));
      const originalField = fields.find((field) => field.querySelector('label')?.textContent?.trim() === 'Naam / e-mail');
      const sourceInput = originalField?.querySelector<HTMLInputElement>('input');
      if (!originalField || !sourceInput) return;

      let displayField = form.querySelector<HTMLElement>('[data-display-name-field="true"]');
      if (!displayField) {
        displayField = document.createElement('div');
        displayField.className = 'field';
        displayField.dataset.displayNameField = 'true';

        const label = document.createElement('label');
        label.textContent = 'Weergavenaam';

        const input = document.createElement('input');
        input.className = 'input';
        input.name = 'display_name';
        input.required = true;
        input.placeholder = 'Bijv. Jasper';

        const help = document.createElement('small');
        help.className = 'muted';
        help.textContent = 'Deze naam wordt in de gebruikerslijst en bovenaan het profiel getoond.';

        displayField.append(label, input, help);
        originalField.before(displayField);

        const originalLabel = originalField.querySelector('label');
        if (originalLabel) originalLabel.textContent = 'E-mailadres';
      }

      const displayInput = displayField.querySelector<HTMLInputElement>('input[name="display_name"]');
      if (displayInput && document.activeElement !== displayInput) {
        const sourceValue = sourceInput.value.trim();
        displayInput.value = sourceValue.includes('@') ? sourceValue.split('@')[0] : sourceValue;
      }
    }

    function syncRoleFromSelectedRow() {
      const activeRow = document.querySelector<HTMLElement>('.usersDirectoryRow.active');
      const roleBadge = activeRow?.querySelector<HTMLElement>('.usersRoleBadge');
      const roleSelect = document.querySelector<HTMLSelectElement>('.usersProfilePanel select[name="role"]');
      if (roleSelect && roleBadge) {
        roleSelect.value = roleValue(roleBadge.textContent);
      }
    }

    function sync() {
      enhanceProfileForm();
      syncRoleFromSelectedRow();
    }

    sync();

    const observer = new MutationObserver(() => sync());
    const root = document.querySelector('.usersWorkspace');
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'value'] });

    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.usersDirectoryRow')) {
        window.setTimeout(sync, 0);
      }
    };
    document.addEventListener('click', clickHandler);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', clickHandler);
    };
  }, []);

  return null;
}
