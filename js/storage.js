/**
 * SmartBudget — Модуль хранения данных (Storage)
 * Прямая работа с Supabase БЕЗ localStorage.
 * Название профиля напрямую сохраняется в поле profile_id в Supabase.
 */

const Storage = (() => {
  const SUPABASE_URL = "https://ovcimbnjociehuollwuv.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92Y2ltYm5qb2NpZWh1b2xsd3V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDg2OTAsImV4cCI6MjEwNzQ4NDY5MH0.kGwSbNaQmEqcOs8xm3xSUd_VsGW7dyrQ_tCKbehDhoI";

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

  // ─── Оффлайн-хранилище записей (localStorage) ─────────────────────────────
  const STORAGE_OFFLINE_TXS_KEY = 'smart_budget_offline_txs_v1';
  let isSyncing = false;

  const getOfflineQueue = () => {
    try {
      const raw = localStorage.getItem(STORAGE_OFFLINE_TXS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Ошибка чтения offline очереди:', e);
      return [];
    }
  };

  const saveOfflineQueue = (queue) => {
    try {
      if (!queue || queue.length === 0) {
        localStorage.removeItem(STORAGE_OFFLINE_TXS_KEY);
      } else {
        localStorage.setItem(STORAGE_OFFLINE_TXS_KEY, JSON.stringify(queue));
      }
    } catch (e) {
      console.warn('Ошибка сохранения offline очереди:', e);
    }
  };

  const addOfflineRecord = (record) => {
    const queue = getOfflineQueue();
    if (!queue.some(item => item.id === record.id)) {
      queue.unshift(record);
      saveOfflineQueue(queue);
    }
  };

  const removeOfflineRecord = (id) => {
    const queue = getOfflineQueue();
    const filtered = queue.filter(item => item.id !== id);
    saveOfflineQueue(filtered);
  };

  const updateOfflineRecord = (id, updatedData) => {
    const queue = getOfflineQueue();
    const idx = queue.findIndex(item => item.id === id);
    if (idx !== -1) {
      queue[idx] = { ...queue[idx], ...updatedData };
      saveOfflineQueue(queue);
    }
  };

  // Загружаем сохраненные оффлайн-записи в оперативную память при старте
  const loadOfflineTransactions = () => {
    const offlineList = getOfflineQueue();
    offlineList.forEach(t => {
      if (!memoryCache.some(existing => existing.id === t.id)) {
        memoryCache.unshift(t);
      }
      if (t.profile_id) {
        knownProfiles.add(t.profile_id);
      }
    });
  };
  loadOfflineTransactions();

  /**
   * Синхронизация отложенных оффлайн-записей с Supabase.
   * После успешной записи в базу данных запись удаляется из оффлайн-хранилища.
   */
  const syncOfflineTransactions = async () => {
    if (isSyncing) return false;
    initSupabase();
    if (!supabaseClient) return false;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return false;

    const queue = getOfflineQueue();
    if (!queue || queue.length === 0) return false;

    isSyncing = true;
    let syncedCount = 0;

    try {
      const currentItems = [...queue];

      for (const item of currentItems) {
        const payload = {
          type: item.type === 'income' ? 'income' : 'expense',
          amount: Math.round(Math.abs(parseFloat(item.amount))),
          note: (item.note || '').trim() || 'Не указано',
          date: item.date || new Date().toISOString().split('T')[0],
          time: item.time || '00:00',
          profile_id: item.profile_id || 'Основной'
        };

        const { data, error } = await supabaseClient
          .from('transactions')
          .insert([payload])
          .select();

        if (!error && data && data[0]) {
          const inserted = {
            ...data[0],
            amount: Math.round(Math.abs(parseFloat(data[0].amount))),
            profile_id: data[0].profile_id || payload.profile_id
          };

          // Удаляем запись из оффлайн-хранилища после записи в базу данных
          removeOfflineRecord(item.id);

          // Заменяем временный local_ ID на настоящий ID из БД в оперативной памяти
          const cacheIdx = memoryCache.findIndex(t => t.id === item.id);
          if (cacheIdx !== -1) {
            memoryCache[cacheIdx] = inserted;
          } else if (!memoryCache.some(t => t.id === inserted.id)) {
            memoryCache.unshift(inserted);
          }

          syncedCount++;
        } else {
          console.warn('Не удалось синхронизировать оффлайн запись:', error ? error.message : error);
          break;
        }
      }
    } catch (err) {
      console.warn('Ошибка при синхронизации оффлайн записей:', err);
    } finally {
      isSyncing = false;
    }

    if (syncedCount > 0) {
      console.log(`Успешно синхронизировано ${syncedCount} оффлайн-записей в базу данных.`);
      return true;
    }

    return false;
  };

  // Автоматическая синхронизация при появлении интернет-соединения
  if (typeof window !== 'undefined') {
    window.addEventListener('online', async () => {
      console.log('Интернет-соединение восстановлено. Синхронизируем оффлайн-записи...');
      const didSync = await syncOfflineTransactions();
      if (didSync) {
        await fetchTransactions();
        if (typeof window.updateApp === 'function') {
          window.updateApp();
        }
        if (typeof UI !== 'undefined' && UI.showToast) {
          UI.showToast('Оффлайн-записи успешно сохранены в базу данных!');
        }
      }
    });
  }

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
      if (isNaN(parsedAmount)) continue;

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
    // Сначала пробуем отправить накопившиеся оффлайн-записи
    try {
      await syncOfflineTransactions();
    } catch (_) {}

    // Инициализируем клиент, если ещё не готов
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

      const validatedData = deduplicateAndValidate(data || []);

      // Оставляем в памяти ещё не синхронизированные оффлайн-записи
      const pendingOffline = getOfflineQueue();
      const existingIds = new Set(validatedData.map(d => d.id));
      const stillPending = pendingOffline.filter(p => !existingIds.has(p.id));

      // Объединяем: ожидающие оффлайн-записи + актуальные данные из базы
      memoryCache = [...stillPending, ...validatedData];

      // Наполняем профили прямо из ячеек базы данных и оффлайн записей
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

  const getTransactionsByProfile = (profileName) => {
    const target = (profileName || activeProfile || 'Основной').trim();
    return memoryCache.filter(t => (t.profile_id || 'Основной') === target);
  };

  const addTransaction = async (txData) => {
    const currentTarget = (txData && txData.profile_id) ? txData.profile_id.trim() : (activeProfile || 'Основной');
    if (currentTarget) {
      knownProfiles.add(currentTarget);
    }
    const newRecord = {
      type: txData.type === 'income' ? 'income' : 'expense',
      amount: Math.round(Math.abs(parseFloat(txData.amount))),
      note: (txData.note || '').trim() || 'Не указано',
      date: txData.date || new Date().toISOString().split('T')[0],
      time: txData.time || '00:00',
      profile_id: currentTarget // ПРЯМОЕ НАЗВАНИЕ ПРОФИЛЯ ("Основной", "Работа", "Карта" и т.д.)
    };

    initSupabase();
    const isOnline = typeof navigator === 'undefined' || navigator.onLine;

    if (supabaseClient && isOnline) {
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

    // Если нет связи с базой данных — сохраняем оффлайн локально
    const offlineRecord = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      ...newRecord,
      created_at: new Date().toISOString()
    };

    addOfflineRecord(offlineRecord);

    if (!memoryCache.some(t => t.id === offlineRecord.id)) {
      memoryCache.unshift(offlineRecord);
    }
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

    if (String(id).startsWith('local_')) {
      updateOfflineRecord(id, payload);
      return true;
    }

    initSupabase();
    if (supabaseClient) {
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

    if (String(id).startsWith('local_')) {
      removeOfflineRecord(id);
      return true;
    }

    initSupabase();
    if (supabaseClient) {
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

  return {
    fetchTransactions,
    getTransactions,
    getTransactionsByProfile,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactionById,
    syncOfflineTransactions,
    getOfflineQueue,
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
