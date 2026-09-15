/**
 * SmartBudget — Главный контроллер приложения (App)
 * - PIN 1029 при каждой перезагрузке + блокировка через 1 мин неактивности
 * - Авто-обновление данных каждые 30 секунд
 * - Управление профилями (напрямую по имени: "Основной", "Работа" и т.д.)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // ─── Авторизация ─────────────────────────────────────────────────────────────
  const AUTH_PIN = '1029';
  const AUTH_SESSION_KEY = 'smart_budget_auth_session_v1';
  const INACTIVITY_MS = 60 * 1000; // 1 минута

  const authOverlay = document.getElementById('auth-overlay');
  const authForm    = document.getElementById('auth-form');
  const pinInput    = document.getElementById('pin-input');
  const authErrorMsg = document.getElementById('auth-error-msg');
  const mainApp     = document.getElementById('main-app');
  const lockAppBtn  = document.getElementById('lock-app-btn');

  let inactivityTimer = null;

  const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      lockApp();
    }, INACTIVITY_MS);
  };

  // Следим за активностью пользователя
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });

  let appInitialized = false;

  const unlockApp = async () => {
    sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
    authOverlay.classList.add('unlocked');
    setTimeout(() => { authOverlay.style.display = 'none'; }, 350);
    mainApp.style.display = 'block';
    resetInactivityTimer();
    // Обновляем данные при каждой разблокировке (кроме первого запуска — там своя инициализация)
    if (appInitialized) {
      await Storage.fetchTransactions();
      syncProfileState();
      renderProfiles();
      updateApp();
    }
  };

  const lockApp = () => {
    clearTimeout(inactivityTimer);
    sessionStorage.removeItem(AUTH_SESSION_KEY);
    authOverlay.style.display = 'flex';
    authOverlay.classList.remove('unlocked');
    mainApp.style.display = 'none';
    pinInput.value = '';
    authErrorMsg.hidden = true;
    setTimeout(() => pinInput.focus(), 100);
  };

  const checkAuth = async () => {
    const isAuth = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
    if (isAuth) {
      await unlockApp();
    } else {
      lockApp();
    }
  };

  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = pinInput.value.trim();
    if (entered === AUTH_PIN) {
      authErrorMsg.hidden = true;
      unlockApp();
    } else {
      authErrorMsg.hidden = false;
      pinInput.classList.add('error');
      pinInput.value = '';
      setTimeout(() => pinInput.classList.remove('error'), 400);
      pinInput.focus();
    }
  });

  if (lockAppBtn) {
    lockAppBtn.addEventListener('click', () => lockApp());
  }

  await checkAuth();

  // ─── Профили ──────────────────────────────────────────────────────────────────
  const profileToggleBtn    = document.getElementById('profile-toggle-btn');
  const profileDropdown     = document.getElementById('profile-dropdown');
  const profileListEl       = document.getElementById('profile-list');
  const addProfileBtn       = document.getElementById('add-profile-btn');
  const currentProfileLabel = document.getElementById('current-profile-label');

  let profiles = Storage.getProfiles();
  let activeProfileName = Storage.getActiveProfileId() || 'Основной';

  const syncProfileState = () => {
    profiles = Storage.getProfiles();
    activeProfileName = Storage.getActiveProfileId() || 'Основной';
    const current = profiles.find(p => p.name === activeProfileName) || profiles[0];
    if (current) {
      activeProfileName = current.name;
      Storage.setActiveProfile(activeProfileName);
      currentProfileLabel.textContent = current.name;
      profileToggleBtn.setAttribute('title', current.name);
    }
  };

  const renderProfiles = () => {
    profiles = Storage.getProfiles();
    activeProfileName = Storage.getActiveProfileId() || 'Основной';
    profileListEl.innerHTML = '';

    profiles.forEach(p => {
      const li = document.createElement('li');
      li.className = 'profile-item' + (p.name === activeProfileName ? ' profile-item-active' : '');
      li.dataset.name = p.name;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'profile-item-name';
      nameSpan.textContent = p.name;
      nameSpan.title = 'Нажмите чтобы переключить';

      nameSpan.addEventListener('click', () => {
        switchProfile(p.name);
      });

      const renameBtn = document.createElement('button');
      renameBtn.className = 'profile-item-btn';
      renameBtn.title = 'Переименовать';
      renameBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newName = prompt('Новое название профиля:', p.name);
        if (newName !== null && newName.trim()) {
          await Storage.renameProfile(p.name, newName.trim());
          if (activeProfileName === p.name) {
            activeProfileName = newName.trim();
          }
          syncProfileState();
          renderProfiles();
          updateApp();
        }
      });

      li.appendChild(nameSpan);
      li.appendChild(renameBtn);

      // Нельзя удалить профиль "Основной"
      if (p.name !== 'Основной' && p.name !== 'default') {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'profile-item-btn profile-item-delete';
        deleteBtn.title = 'Удалить профиль';
        deleteBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Удалить профиль "' + p.name + '" и все его данные?')) {
            await Storage.deleteProfile(p.name);
            if (activeProfileName === p.name) {
              switchProfile('Основной');
            } else {
              syncProfileState();
              renderProfiles();
              updateApp();
            }
          }
        });
        li.appendChild(deleteBtn);
      }

      profileListEl.appendChild(li);
    });
  };

  const switchProfile = (name) => {
    activeProfileName = name;
    Storage.setActiveProfile(name);
    syncProfileState();
    closeProfileDropdown();
    updateApp();
  };

  const openProfileDropdown = () => {
    renderProfiles();
    profileDropdown.classList.add('open');
  };

  const closeProfileDropdown = () => {
    profileDropdown.classList.remove('open');
  };

  profileToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profileDropdown.classList.contains('open') ? closeProfileDropdown() : openProfileDropdown();
  });

  addProfileBtn.addEventListener('click', () => {
    const name = prompt('Название нового профиля:');
    if (name !== null && name.trim()) {
      const newProfile = Storage.addProfile(name.trim());
      switchProfile(newProfile.name);
    }
  });

  document.addEventListener('click', (e) => {
    if (!profileDropdown.contains(e.target) && e.target !== profileToggleBtn) {
      closeProfileDropdown();
    }
  });

  syncProfileState();

  // ─── Состояние фильтрации ─────────────────────────────────────────────────────
  const state = {
    filterPeriod: 'all',
    filterType:   'all',
    searchQuery:  '',
    customFrom:   '',
    customTo:     '',
    chartDays:    7
  };

  // ─── DOM элементы дашборда ───────────────────────────────────────────────────
  const openModalBtn    = document.getElementById('open-modal-btn');
  const modalCloseBtn   = document.getElementById('modal-close-btn');
  const modalCancelBtn  = document.getElementById('modal-cancel-btn');
  const setNowBtn       = document.getElementById('set-now-btn');
  const btnTypeExpense  = document.getElementById('btn-type-expense');
  const btnTypeIncome   = document.getElementById('btn-type-income');
  const transactionForm = document.getElementById('transaction-form');
  const exportExcelBtn  = document.getElementById('export-excel-btn');
  const refreshBtn      = document.getElementById('refresh-btn');

  const cardPeriodDay   = document.getElementById('card-period-day');
  const cardPeriodWeek  = document.getElementById('card-period-week');
  const cardPeriodMonth = document.getElementById('card-period-month');

  const tabButtons      = document.querySelectorAll('.tab-btn');
  const customRangeBar  = document.getElementById('custom-range-bar');
  const customDateFrom  = document.getElementById('custom-date-from');
  const customDateTo    = document.getElementById('custom-date-to');
  const applyRangeBtn   = document.getElementById('apply-range-btn');
  const cancelRangeBtn  = document.getElementById('cancel-range-btn');

  const searchInput     = document.getElementById('search-input');
  const clearSearchBtn  = document.getElementById('clear-search-btn');
  const typeFilterSelect = document.getElementById('type-filter-select');

  const chartTabWeek    = document.getElementById('chart-tab-week');
  const chartTabMonth   = document.getElementById('chart-tab-month');

  // ─── Главная функция обновления дашборда ─────────────────────────────────────
  const updateApp = () => {
    const allTransactions = Storage.getTransactions();

    const summary = Analytics.calculateSummary(allTransactions);
    UI.renderSummary(summary);

    const chartData = Analytics.getDailySpendingChartData(allTransactions, state.chartDays);
    UI.renderBarChart(chartData, state.chartDays);

    const filtered = Analytics.filterTransactions(allTransactions, {
      period:     state.filterPeriod,
      type:       state.filterType,
      query:      state.searchQuery,
      customFrom: state.customFrom,
      customTo:   state.customTo
    });

    const grouped = Analytics.groupByDate(filtered);
    UI.renderTransactionsList(grouped, filtered.length, handleDeleteTransaction, handleEditTransaction);
    updateActivePeriodCards();
  };

  // ─── Авто-обновление каждые 30 секунд ────────────────────────────────────────
  let autoRefreshStarted = false;
  const startAutoRefresh = () => {
    if (autoRefreshStarted) return;
    autoRefreshStarted = true;
    setInterval(async () => {
      if (mainApp.style.display !== 'none') {
        await Storage.fetchTransactions();
        syncProfileState();
        renderProfiles();
        updateApp();
      }
    }, 30 * 1000);
  };

  // ─── Кнопка обновить вручную ──────────────────────────────────────────────────
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('spinning');
      await Storage.fetchTransactions();
      syncProfileState();
      renderProfiles();
      updateApp();
      setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
    });
  }

  const updateActivePeriodCards = () => {
    cardPeriodDay.classList.toggle('active-card', state.filterPeriod === 'today');
    cardPeriodWeek.classList.toggle('active-card', state.filterPeriod === 'week');
    cardPeriodMonth.classList.toggle('active-card', state.filterPeriod === 'month');
  };

  const setFilterPeriod = (period) => {
    state.filterPeriod = period;
    tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter-period') === period);
    });
    customRangeBar.hidden = period !== 'custom';
    updateApp();
  };

  cardPeriodDay.addEventListener('click', () => setFilterPeriod(state.filterPeriod === 'today' ? 'all' : 'today'));
  cardPeriodWeek.addEventListener('click', () => setFilterPeriod(state.filterPeriod === 'week' ? 'all' : 'week'));
  cardPeriodMonth.addEventListener('click', () => setFilterPeriod(state.filterPeriod === 'month' ? 'all' : 'month'));

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => setFilterPeriod(btn.getAttribute('data-filter-period')));
  });

  applyRangeBtn.addEventListener('click', () => {
    const from = customDateFrom.value;
    const to   = customDateTo.value;
    if (!from || !to) {
      UI.showToast('Выберите обе даты диапазона', 'error');
      return;
    }
    if (from > to) {
      UI.showToast('Начальная дата не может быть позже конечной', 'error');
      return;
    }
    state.customFrom = from;
    state.customTo   = to;
    updateApp();
  });

  cancelRangeBtn.addEventListener('click', () => {
    customDateFrom.value = '';
    customDateTo.value   = '';
    state.customFrom     = '';
    state.customTo       = '';
    setFilterPeriod('all');
  });

  typeFilterSelect.addEventListener('change', (e) => {
    state.filterType = e.target.value;
    updateApp();
  });

  let searchDebounce = null;
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearSearchBtn.hidden = val.length === 0;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.searchQuery = val.trim();
      updateApp();
    }, 180);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.hidden = true;
    state.searchQuery = '';
    updateApp();
    searchInput.focus();
  });

  chartTabWeek.addEventListener('click', () => {
    if (state.chartDays === 7) return;
    state.chartDays = 7;
    chartTabWeek.classList.add('active');
    chartTabMonth.classList.remove('active');
    updateApp();
  });

  chartTabMonth.addEventListener('click', () => {
    if (state.chartDays === 30) return;
    state.chartDays = 30;
    chartTabMonth.classList.add('active');
    chartTabWeek.classList.remove('active');
    updateApp();
  });

  exportExcelBtn.addEventListener('click', () => {
    const allTransactions = Storage.getTransactions();
    const currentFiltered = Analytics.filterTransactions(allTransactions, {
      period: state.filterPeriod, type: state.filterType,
      query: state.searchQuery, customFrom: state.customFrom, customTo: state.customTo
    });
    const result = Storage.exportToExcel(currentFiltered.length > 0 ? currentFiltered : allTransactions);
    if (result.success) UI.showToast('Выгружено ' + result.count + ' записей в файл Excel');
    else UI.showToast(result.message || 'Ошибка экспорта', 'error');
  });

  // ─── Модальное окно ───────────────────────────────────────────────────────────
  openModalBtn.addEventListener('click', () => UI.openModal());
  modalCloseBtn.addEventListener('click', () => UI.closeModal());
  modalCancelBtn.addEventListener('click', () => UI.closeModal());

  document.getElementById('transaction-modal').addEventListener('click', (e) => {
    if (e.target.id === 'transaction-modal') UI.closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') UI.closeModal();
  });

  btnTypeExpense.addEventListener('click', () => UI.setType('expense'));
  btnTypeIncome.addEventListener('click', () => UI.setType('income'));
  setNowBtn.addEventListener('click', () => UI.setFormTimeToNow());

  // ─── Управление персонами / именами ─────────────────────────────────────────
  const addPersonBtn = document.getElementById('add-person-btn');
  const personSelect = document.getElementById('select-person');

  const refreshPeopleManagement = () => {
    UI.renderPeopleList(
      // Обработчик удаления
      (personToDelete) => {
        if (confirm(`Удалить имя "${personToDelete}" из списка?`)) {
          Storage.deletePerson(personToDelete);
          refreshPeopleManagement();
          const currentVal = personSelect ? personSelect.value : 'Не указан';
          UI.updatePersonSelectOptions(currentVal === personToDelete ? 'Не указан' : currentVal);
          UI.showToast(`Имя "${personToDelete}" удалено`);
        }
      },
      // Обработчик переименования
      (personToRename) => {
        const newName = prompt(`Новое имя для "${personToRename}":`, personToRename);
        if (newName !== null && newName.trim() && newName.trim() !== personToRename) {
          Storage.renamePerson(personToRename, newName.trim()).then(success => {
            if (success) {
              refreshPeopleManagement();
              const currentVal = personSelect ? personSelect.value : 'Не указан';
              UI.updatePersonSelectOptions(currentVal === personToRename ? newName.trim() : currentVal);
              UI.showToast(`Имя обновлено на "${newName.trim()}"`);
              updateApp();
            }
          });
        }
      }
    );
  };

  const handleAddNewPerson = () => {
    const input = document.getElementById('input-new-person');
    if (!input) return;
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    const added = Storage.addPerson(name);
    input.value = '';
    refreshPeopleManagement();
    UI.updatePersonSelectOptions(added);
    UI.showToast(`Имя "${added}" добавлено`);
  };

  if (addPersonBtn) {
    addPersonBtn.addEventListener('click', () => {
      refreshPeopleManagement();
      UI.openPeopleModal();
    });
  }

  const btnSubmitAddPerson = document.getElementById('btn-submit-add-person');
  if (btnSubmitAddPerson) {
    btnSubmitAddPerson.addEventListener('click', handleAddNewPerson);
  }

  const inputNewPerson = document.getElementById('input-new-person');
  if (inputNewPerson) {
    inputNewPerson.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddNewPerson();
      }
    });
  }

  const peopleModalCloseBtn = document.getElementById('people-modal-close-btn');
  if (peopleModalCloseBtn) {
    peopleModalCloseBtn.addEventListener('click', () => {
      UI.closePeopleModal();
    });
  }

  const peopleModalDoneBtn = document.getElementById('people-modal-done-btn');
  if (peopleModalDoneBtn) {
    peopleModalDoneBtn.addEventListener('click', () => {
      UI.closePeopleModal();
    });
  }

  const peopleModal = document.getElementById('people-modal');
  if (peopleModal) {
    peopleModal.addEventListener('click', (e) => {
      if (e.target === peopleModal) {
        UI.closePeopleModal();
      }
    });
  }

  // Авто-генерация "Не указано X"
  const generateAutoNote = () => {
    const allTransactions = Storage.getTransactions();
    let maxNum = 0;
    const regex = /^(?:не указан\s*[\-—:–]\s*)?не указано\s*(\d+)$/i;
    allTransactions.forEach(t => {
      if (t.note) {
        const match = t.note.trim().match(regex);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      }
    });
    return 'Не указано ' + (maxNum + 1);
  };

  // Сохранение записи
  transactionForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editId     = document.getElementById('edit-id').value;
    const rawAmount  = document.getElementById('input-amount').value.replace(/\s/g, '');
    const amountVal  = parseInt(rawAmount, 10);
    const personVal  = personSelect ? personSelect.value : 'Не указан';
    let reasonVal    = document.getElementById('input-note').value.trim();
    const dateVal    = document.getElementById('input-date').value;
    const timeVal    = document.getElementById('input-time').value;
    const typeVal    = UI.getCurrentFormType();

    if (isNaN(amountVal) || amountVal <= 0) {
      UI.showToast('Введите корректную сумму больше нуля', 'error');
      document.getElementById('input-amount').focus();
      return;
    }

    if (!reasonVal && personVal === 'Не указан') {
      reasonVal = generateAutoNote();
    }

    const noteVal = Analytics.formatNote(personVal, reasonVal);

    if (!dateVal || !timeVal) {
      UI.showToast('Укажите дату и точное время операции', 'error');
      return;
    }

    const txPayload = { type: typeVal, amount: amountVal, note: noteVal, date: dateVal, time: timeVal };

    UI.closeModal();

    if (editId) {
      await Storage.updateTransaction(editId, txPayload);
      UI.showToast('Запись успешно обновлена');
    } else {
      await Storage.addTransaction(txPayload);
      UI.showToast(typeVal === 'income' ? 'Доход добавлен!' : 'Расход сохранен!');
    }

    updateApp();
  });

  function handleEditTransaction(id) {
    const tx = Storage.getTransactionById(id);
    if (tx) UI.openModal(tx);
  }

  async function handleDeleteTransaction(id) {
    const tx = Storage.getTransactionById(id);
    const noteText = tx ? '"' + tx.note + '"' : 'эту запись';
    if (confirm('Удалить ' + noteText + '?')) {
      await Storage.deleteTransaction(id);
      UI.showToast('Запись удалена');
      updateApp();
    }
  }

  // ─── Запуск приложения ────────────────────────────────────────────────────────
  UI.closeModal();
  await Storage.fetchTransactions();
  syncProfileState();
  renderProfiles();
  updateApp();
  appInitialized = true;
  startAutoRefresh();
});
