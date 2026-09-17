/**
 * SmartBudget — Модуль хранения данных (Storage)
 * Прямая работа с Supabase БЕЗ localStorage.
 * Название профиля напрямую сохраняется в поле profile_id в Supabase.
 */

const Storage = (() => {
  const SUPABASE_URL = "https://tdlhwokrmuyxsdleepht.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkbGh3b2tybXV5eHNkbGVlcGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MDc3ODAsImV4cCI6MjA4NDk4Mzc4MH0.RlfUmejx2ywHNcFofZM4mNE8nIw6qxaTNzqxmf4N4-4";

  let supabaseClient = null;
  const initSupabase = () => {
    if (supabaseClient) return true;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return true;
      } catch (e) {
        console.warn('Ошибка инициализации Supabase SDK:', e);
      }
    }
    return false;
  };
  initSupabase();

  // Данные живут в оперативной памяти и синхронизируются с Supabase
  let memoryCache = [];
  let knownProfiles = new Set(['Основной']);
  let activeProfile = 'Основной';

  // ─── Персоны / Имена для записей ─────────────────────────────────────────────
  const STORAGE_PEOPLE_KEY = 'smart_budget_people_v1';
  let knownPeople = new Set(['Не указан']);

  const loadSavedPeople = () => {
    try {
      const raw = localStorage.getItem(STORAGE_PEOPLE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(p => {
            if (p && typeof p === 'string' && p.trim() && p.trim() !== 'Не указан') {
              knownPeople.add(p.trim());
            }
          });
        }
      }
    } catch (_) {}
  };

  const savePeople = () => {
    try {
      const toSave = Array.from(knownPeople).filter(p => p !== 'Не указан');
      localStorage.setItem(STORAGE_PEOPLE_KEY, JSON.stringify(toSave));
    } catch (_) {}
  };

  loadSavedPeople();

  const getPeople = () => {
    // Также сканируем memoryCache на наличие имен в записях транзакций
    memoryCache.forEach(t => {
      if (t.note) {
        const match = t.note.match(/^([^\-—:–]+)\s*[\-—:–]\s*(.+)$/);
        if (match && match[1]) {
          const name = match[1].trim();
          if (name && name.toLowerCase() !== 'не указан' && !name.toLowerCase().startsWith('не указано')) {
            knownPeople.add(name);
          }
        }
      }
    });

    const list = Array.from(knownPeople);
    return ['Не указан', ...list.filter(p => p !== 'Не указан')];
  };

  const addPerson = (name) => {
    const clean = (name || '').trim();
    if (!clean || clean.toLowerCase() === 'не указан') return 'Не указан';
    knownPeople.add(clean);
    savePeople();
    return clean;
  };

  const deletePerson = (name) => {
    const clean = (name || '').trim();
    if (!clean || clean === 'Не указан') return;
    knownPeople.delete(clean);
    savePeople();
  };

  /**
   * Переименование персоны.
   * Обновляет knownPeople, localStorage и поле note во всех затронутых
   * транзакциях — как в оперативной памяти, так и в Supabase.
   */
  const renamePerson = async (oldName, newName) => {
    const oldClean = (oldName || '').trim();
    const newClean = (newName || '').trim();
    if (!oldClean || !newClean || oldClean === 'Не указан' || newClean.toLowerCase() === 'не указан') return false;
    knownPeople.delete(oldClean);
    knownPeople.add(newClean);
    savePeople();

    // Шаблон разделителя: «Имя — причина» или «Имя» без причины
    const separatorRe = /^(.+?)\s*[\-—:–]\s*(.+)$/;

    // Обновляем note в памяти и собираем ID для Supabase
    const idsToUpdate = [];
    memoryCache.forEach(t => {
      if (!t.note) return;
      const exactMatch = separatorRe.exec(t.note);
      if (exactMatch && exactMatch[1].trim() === oldClean) {
        t.note = `${newClean} — ${exactMatch[2].trim()}`;
        idsToUpdate.push({ id: t.id, note: t.note });
      } else if (t.note.trim() === oldClean) {
        t.note = newClean;
        idsToUpdate.push({ id: t.id, note: t.note });
      }
    });

    // Синхронизируем изменения с Supabase
    initSupabase();
    if (supabaseClient && idsToUpdate.length > 0) {
      for (const { id, note } of idsToUpdate) {
        try {
          await supabaseClient
            .from('transactions')
            .update({ note })
            .eq('id', id);
        } catch (err) {
          console.warn('Ошибка обновления note при переименовании персоны:', err);
        }
      }
    }

    return true;
  };

  // ─── Профили ─────────────────────────────────────────────────────────────────

  const getProfiles = () => {
    const list = Array.from(knownProfiles);
    // Если профилей нет вообще — добавляем дефолтный
    if (list.length === 0) list.push('Основной');
    return list.map(name => ({ id: name, name: name }));
  };

  const loadProfiles = () => getProfiles();

  const setActiveProfile = (name) => {
    if (name && typeof name === 'string') {
      const clean = name.trim();
      if (clean) {
        activeProfile = clean;
        knownProfiles.add(clean);
      }
    }
  };

  const getActiveProfileId = () => activeProfile;

  const addProfile = (name) => {
    const clean = (name || '').trim();
    if (!clean) return { id: 'Основной', name: 'Основной' };
    knownProfiles.add(clean);
    activeProfile = clean;
    return { id: clean, name: clean };
  };

  const renameProfile = async (oldName, newName) => {
    const cleanOld = (oldName || '').trim();
    const cleanNew = (newName || '').trim();
    if (!cleanNew || cleanOld === cleanNew) return;

    knownProfiles.delete(cleanOld);
    knownProfiles.add(cleanNew);

    if (activeProfile === cleanOld) {
      activeProfile = cleanNew;
    }

    // Обновляем в памяти
    memoryCache.forEach(t => {
      if (t.profile_id === cleanOld) {
        t.profile_id = cleanNew;
      }
    });

    // Обновляем в Supabase
    if (supabaseClient) {
      try {
        await supabaseClient
          .from('transactions')
          .update({ profile_id: cleanNew })
          .eq('profile_id', cleanOld);
      } catch (err) {
        console.warn('Ошибка переименования профиля в базе данных:', err);
      }
    }
  };

  const deleteProfile = async (name) => {
    const clean = (name || '').trim();
    if (!clean || clean === 'Основной') return;

    knownProfiles.delete(clean);
    memoryCache = memoryCache.filter(t => t.profile_id !== clean);

    if (activeProfile === clean) {
      activeProfile = 'Основной';
    }

    // Удаляем из базы данных Supabase
    if (supabaseClient) {
      try {
        await supabaseClient
          .from('transactions')
          .delete()
          .eq('profile_id', clean);
      } catch (err) {
        console.warn('Ошибка удаления профиля из базы данных:', err);
      }
    }
  };

  // ─── Валидация и нормализация ────────────────────────────────────────────────

  const deduplicateAndValidate = (items) => {
    if (!Array.isArray(items)) return [];
    const seenIds = new Set();
    const result = [];

    for (const item of items) {
      if (!item || !item.id) continue;
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);

      const parsedAmount = Math.round(Math.abs(parseFloat(item.amount)));
      if (isNaN(parsedAmount) || parsedAmount <= 0) continue;

      let pid = item.profile_id;
      if (!pid || pid === 'default') {
        pid = 'Основной';
      }

      result.push({
        id: String(item.id),
        profile_id: pid,
        type: item.type === 'income' ? 'income' : 'expense',
        amount: parsedAmount,
        note: (item.note || '').trim() || 'Не указано',
        date: item.date || new Date().toISOString().split('T')[0],
        time: item.time || '00:00',
        created_at: item.created_at || new Date().toISOString()
      });
    }

    return result;
  };

  // ─── CRUD транзакций ──────────────────────────────────────────────────────────

  const fetchTransactions = async () => {
    // Пытаемся инициализировать клиент, если ещё не готов (CDN мог загрузиться позже)
    initSupabase();
    if (!supabaseClient) return getTransactions();

    try {
      const { data, error } = await supabaseClient
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .order('time', { ascending: false });

      if (error) {
        console.warn('Supabase fetch error:', error.message);
        return getTransactions();
      }

      memoryCache = deduplicateAndValidate(data || []);

      // Наполняем профили прямо из ячеек базы данных
      knownProfiles = new Set(['Основной']);
      memoryCache.forEach(t => {
        if (t.profile_id) {
          knownProfiles.add(t.profile_id);
        }
      });
      if (activeProfile) {
        knownProfiles.add(activeProfile);
      }

      return getTransactions();
    } catch (err) {
      console.warn('Сетевая ошибка Supabase:', err);
      return getTransactions();
    }
  };

  const getTransactions = () => {
    const currentTarget = activeProfile || 'Основной';
    return memoryCache.filter(t => (t.profile_id || 'Основной') === currentTarget);
  };

  const addTransaction = async (txData) => {
    const currentTarget = activeProfile || 'Основной';
    const newRecord = {
      type: txData.type === 'income' ? 'income' : 'expense',
      amount: Math.round(Math.abs(parseFloat(txData.amount))),
      note: txData.note.trim(),
      date: txData.date,
      time: txData.time,
      profile_id: currentTarget // ПРЯМОЕ НАЗВАНИЕ ПРОФИЛЯ ("Основной", "Работа", и т.д.)
    };

    initSupabase();
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('transactions')
          .insert([newRecord])
          .select();

        if (!error && data && data[0]) {
          const inserted = {
            ...data[0],
            amount: Math.round(Math.abs(parseFloat(data[0].amount))),
            profile_id: data[0].profile_id || currentTarget
          };

          if (!memoryCache.some(t => t.id === inserted.id)) {
            memoryCache.unshift(inserted);
          }
          return inserted;
        } else if (error) {
          console.error('Supabase insert error:', error.message);
        }
      } catch (err) {
        console.warn('Сетевая ошибка вставки:', err);
      }
    }

    // Если нет связи с базой данных
    const offlineRecord = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      ...newRecord,
      created_at: new Date().toISOString()
    };
    memoryCache.unshift(offlineRecord);
    return offlineRecord;
  };

  const updateTransaction = async (id, updatedData) => {
    const payload = {
      type: updatedData.type,
      amount: Math.round(Math.abs(parseFloat(updatedData.amount))),
      note: updatedData.note.trim(),
      date: updatedData.date,
      time: updatedData.time
    };

    const index = memoryCache.findIndex(t => t.id === id);
    if (index !== -1) {
      memoryCache[index] = { ...memoryCache[index], ...payload };
    }

    initSupabase();
    if (supabaseClient && !id.startsWith('local_')) {
      try {
        const { error } = await supabaseClient
          .from('transactions')
          .update(payload)
          .eq('id', id);

        if (error) {
          console.error('Supabase update error:', error);
          return false;
        }
      } catch (err) {
        console.warn('Ошибка сети при обновлении:', err);
      }
    }
    return true;
  };

  const deleteTransaction = async (id) => {
    memoryCache = memoryCache.filter(t => t.id !== id);

    initSupabase();
    if (supabaseClient && !id.startsWith('local_')) {
      try {
        const { error } = await supabaseClient
          .from('transactions')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Supabase delete error:', error);
          return false;
        }
      } catch (err) {
        console.warn('Ошибка сети при удалении:', err);
      }
    }
    return true;
  };

  const getTransactionById = (id) => memoryCache.find(t => t.id === id) || null;

  const exportToExcel = (customList = null) => {
    const items = customList || getTransactions();
    if (!items || items.length === 0) return { success: false, message: 'Нет данных для экспорта' };

    const headers = ['Дата', 'Время', 'Тип операции', 'Сумма', 'На что потрачено / Источник'];
    const sorted = [...items].sort((a, b) => {
      return new Date(`${b.date}T${b.time || '00:00'}`) - new Date(`${a.date}T${a.time || '00:00'}`);
    });

    const rows = sorted.map(t => {
      const typeStr = t.type === 'income' ? 'Доход' : 'Расход';
      const amountStr = Math.round(t.amount).toString();
      const safeNote = `"${(t.note || '').replace(/"/g, '""')}"`;
      return [t.date, t.time, typeStr, amountStr, safeNote].join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Бюджет_${activeProfile}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true, count: items.length };
  };

  return {
    fetchTransactions,
    getTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactionById,
    exportToExcel,
    getProfiles,
    addProfile,
    renameProfile,
    deleteProfile,
    setActiveProfile,
    getActiveProfileId,
    getPeople,
    addPerson,
    deletePerson,
    renamePerson
  };
})();
