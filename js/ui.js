/**
 * SmartBudget — Модуль пользовательского интерфейса (UI)
 * Отрисовка карточек, графика, списка, управление модальными окнами.
 * Форматирование сумм: только целые числа с пробелами (1 000 000).
 */

const UI = (() => {
  const elements = {
    totalBalance:       document.getElementById('total-balance'),
    todayIncome:        document.getElementById('today-income'),
    todayExpense:       document.getElementById('today-expense'),
    spentToday:         document.getElementById('spent-today'),
    countToday:         document.getElementById('count-today'),
    dateTodayHint:      document.getElementById('date-today-hint'),
    spentWeek:          document.getElementById('spent-week'),
    countWeek:          document.getElementById('count-week'),
    spentMonth:         document.getElementById('spent-month'),
    countMonth:         document.getElementById('count-month'),
    dateMonthHint:      document.getElementById('date-month-hint'),
    incomeToday:        document.getElementById('income-today'),
    expenseTodayVal:    document.getElementById('expense-today-val'),
    incomeWeek:         document.getElementById('income-week'),
    expenseWeekVal:     document.getElementById('expense-week-val'),
    incomeMonth:        document.getElementById('income-month'),
    expenseMonthVal:    document.getElementById('expense-month-val'),
    transactionsCount:  document.getElementById('transactions-count'),
    transactionsList:   document.getElementById('transactions-list'),
    emptyState:         document.getElementById('empty-state'),
    chartSvg:           document.getElementById('spending-bar-chart'),
    chartTooltip:       document.getElementById('chart-tooltip'),
    chartDesc:          document.getElementById('chart-desc'),
    chartTotalVal:      document.getElementById('chart-total-val'),
    chartAvgVal:        document.getElementById('chart-avg-val'),
    chartTabWeek:       document.getElementById('chart-tab-week'),
    chartTabMonth:      document.getElementById('chart-tab-month'),
    modal:              document.getElementById('transaction-modal'),
    modalTitle:         document.getElementById('modal-title'),
    form:               document.getElementById('transaction-form'),
    editIdInput:        document.getElementById('edit-id'),
    personSelect:       document.getElementById('select-person'),
    addPersonBtn:       document.getElementById('add-person-btn'),
    amountInput:        document.getElementById('input-amount'),
    noteInput:          document.getElementById('input-note'),
    noteLabelText:      document.getElementById('note-label-text'),
    dateInput:          document.getElementById('input-date'),
    timeInput:          document.getElementById('input-time'),
    btnTypeExpense:     document.getElementById('btn-type-expense'),
    btnTypeIncome:      document.getElementById('btn-type-income'),
    toastContainer:     document.getElementById('toast-container'),
    peopleModal:        document.getElementById('people-modal'),
    peopleModalCloseBtn:document.getElementById('people-modal-close-btn'),
    peopleModalDoneBtn: document.getElementById('people-modal-done-btn'),
    peopleList:         document.getElementById('people-list'),
    inputNewPerson:     document.getElementById('input-new-person'),
    btnSubmitAddPerson: document.getElementById('btn-submit-add-person')
  };

  // ── Живое форматирование поля суммы (1000000 -> 1 000 000) ──────────────────
  // Обработка Backspace и Delete перед пробелом разделителя тысяч
  elements.amountInput.addEventListener('keydown', (e) => {
    const input = elements.amountInput;
    const val = input.value;
    const start = input.selectionStart;
    const end = input.selectionEnd;

    // Если выделен диапазон, стандартное удаление сработает в событии input
    if (start !== end) return;

    if (e.key === 'Backspace') {
      // Если курсор стоит сразу после неразрывного или обычного пробела,
      // удаляем и пробел, и цифру перед ним
      if (start > 0 && /\s|\u00A0/.test(val[start - 1])) {
        e.preventDefault();
        let deleteIdx = start - 1;
        while (deleteIdx > 0 && (/\s|\u00A0/.test(val[deleteIdx - 1]))) {
          deleteIdx--;
        }
        if (deleteIdx > 0) {
          deleteIdx--; // индекс цифры для удаления
        }
        const newVal = val.slice(0, deleteIdx) + val.slice(start);
        input.value = newVal;
        // Запускаем событие input для переформатирования с нужной позиции
        input.setSelectionRange(deleteIdx, deleteIdx);
        input.dispatchEvent(new Event('input'));
      }
    } else if (e.key === 'Delete') {
      // Если справа от курсора пробел, перескакиваем его и удаляем цифру за ним
      if (start < val.length && /\s|\u00A0/.test(val[start])) {
        e.preventDefault();
        let targetIdx = start;
        while (targetIdx < val.length && /\s|\u00A0/.test(val[targetIdx])) {
          targetIdx++;
        }
        if (targetIdx < val.length) {
          const newVal = val.slice(0, targetIdx) + val.slice(targetIdx + 1);
          input.value = newVal;
          input.setSelectionRange(start, start);
          input.dispatchEvent(new Event('input'));
        }
      }
    }
  });

  elements.amountInput.addEventListener('input', () => {
    const input = elements.amountInput;
    const oldVal = input.value;
    const selStart = input.selectionStart || 0;

    // Считаем сколько цифр было справа от курсора
    const digitsAfterCursor = oldVal.slice(selStart).replace(/\D/g, '').length;

    const raw = oldVal.replace(/\D/g, '');
    if (raw === '') {
      input.value = '';
      return;
    }
    const num = parseInt(raw, 10);
    const formatted = isNaN(num) ? '' : formatInt(num);
    input.value = formatted;

    // Восстанавливаем позицию курсора так, чтобы справа оставалось ровно то же число цифр
    if (formatted) {
      if (digitsAfterCursor === 0) {
        input.setSelectionRange(formatted.length, formatted.length);
      } else {
        let count = 0;
        let newPos = formatted.length;
        for (let i = formatted.length - 1; i >= 0; i--) {
          if (/\d/.test(formatted[i])) {
            count++;
            if (count === digitsAfterCursor) {
              newPos = i;
              break;
            }
          }
        }
        input.setSelectionRange(newPos, newPos);
      }
    }
  });

  // Функция форматирования целых чисел через regex (без toLocaleString, работает на любом Android)
  const formatInt = (n) => {
    const num = Math.round(Math.abs(parseInt(n, 10)));
    if (isNaN(num)) return '';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  };

  // ── Форматировать число для предзаполнения поля суммы ────────────────────────
  const formatAmountDisplay = (num) => {
    const n = parseInt(num, 10);
    if (isNaN(n)) return '';
    return formatInt(n);
  };

  /**
   * Обновление верхних карточек баланса и трат за периоды
   */
  const renderSummary = (summary) => {
    elements.totalBalance.textContent = Analytics.formatCurrency(summary.balance);
    elements.totalBalance.classList.toggle('negative', summary.balance < 0);

    if (elements.todayIncome) {
      elements.todayIncome.textContent  = '+' + Analytics.formatCurrency(summary.incomeToday || 0);
    }
    if (elements.todayExpense) {
      elements.todayExpense.textContent = '-' + Analytics.formatCurrency(summary.spentToday || 0);
    }

    elements.spentToday.textContent = Analytics.formatCurrency(summary.spentToday);
    elements.countToday.textContent = summary.countToday + ' ' + declension(summary.countToday, ['трата', 'траты', 'трат']);
    if (elements.incomeToday) {
      elements.incomeToday.textContent = '+' + Analytics.formatCurrency(summary.incomeToday || 0);
    }
    if (elements.expenseTodayVal) {
      elements.expenseTodayVal.textContent = '-' + Analytics.formatCurrency(summary.spentToday || 0);
    }

    elements.spentWeek.textContent  = Analytics.formatCurrency(summary.spentWeek);
    elements.countWeek.textContent  = summary.countWeek + ' ' + declension(summary.countWeek, ['трата', 'траты', 'трат']);
    if (elements.incomeWeek) {
      elements.incomeWeek.textContent = '+' + Analytics.formatCurrency(summary.incomeWeek || 0);
    }
    if (elements.expenseWeekVal) {
      elements.expenseWeekVal.textContent = '-' + Analytics.formatCurrency(summary.spentWeek || 0);
    }

    elements.spentMonth.textContent = Analytics.formatCurrency(summary.spentMonth);
    elements.countMonth.textContent = summary.countMonth + ' ' + declension(summary.countMonth, ['трата', 'траты', 'трат']);
    if (elements.incomeMonth) {
      elements.incomeMonth.textContent = '+' + Analytics.formatCurrency(summary.incomeMonth || 0);
    }
    if (elements.expenseMonthVal) {
      elements.expenseMonthVal.textContent = '-' + Analytics.formatCurrency(summary.spentMonth || 0);
    }

    const now = new Date();
    elements.dateTodayHint.textContent = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    elements.dateMonthHint.textContent = now.toLocaleDateString('ru-RU', { month: 'long' });
  };

  /**
   * Отрисовка списка транзакций, сгруппированных по дням
   */
  const renderTransactionsList = (dateGroups, totalFilteredCount, onDeleteCallback, onEditCallback) => {
    elements.transactionsCount.textContent = totalFilteredCount;
    elements.transactionsList.innerHTML = '';

    if (totalFilteredCount === 0) {
      elements.emptyState.hidden = false;
      return;
    }
    elements.emptyState.hidden = true;

    dateGroups.forEach(group => {
      const groupHeader = document.createElement('div');
      groupHeader.className = 'date-group-header';

      const headerTitle = document.createElement('span');
      headerTitle.textContent = group.displayDate;
      groupHeader.appendChild(headerTitle);

      if (group.dayExpense > 0) {
        const dayTotal = document.createElement('span');
        dayTotal.className = 'date-group-total mono';
        dayTotal.textContent = '-' + Analytics.formatCurrency(group.dayExpense);
        groupHeader.appendChild(dayTotal);
      }
      elements.transactionsList.appendChild(groupHeader);

      group.items.forEach(t => {
        elements.transactionsList.appendChild(createTransactionItemElement(t, onDeleteCallback, onEditCallback));
      });
    });
  };

  /**
   * Создание DOM-элемента отдельной транзакции
   */
  const createTransactionItemElement = (t, onDelete, onEdit) => {
    const isIncome = t.type === 'income';
    const item = document.createElement('div');
    item.className = 'tx-item ' + (isIncome ? 'tx-income' : 'tx-expense');
    item.dataset.id = t.id;

    const leftDiv = document.createElement('div');
    leftDiv.className = 'tx-left';

    const iconBadge = document.createElement('div');
    iconBadge.className = 'tx-icon-badge';
    iconBadge.textContent = isIncome ? '\u2193' : '\u2191';
    leftDiv.appendChild(iconBadge);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'tx-info';

    const titleRow = document.createElement('div');
    titleRow.className = 'tx-title-row';

    const parsed = Analytics.parseNote(t.note);
    if (parsed.person && parsed.person !== 'Не указан') {
      const personBadge = document.createElement('span');
      personBadge.className = 'tx-person-badge';
      personBadge.textContent = parsed.person;
      titleRow.appendChild(personBadge);
    }

    const noteEl = document.createElement('span');
    noteEl.className = 'tx-note';
    let displayReason = parsed.reason;
    if (!displayReason) {
      displayReason = (parsed.person && parsed.person !== 'Не указан') ? '' : (isIncome ? 'Доход' : 'Расход');
    }
    noteEl.textContent = displayReason;
    titleRow.appendChild(noteEl);
    infoDiv.appendChild(titleRow);

    const metaRow = document.createElement('div');
    metaRow.className = 'tx-meta-row';
    const timeBadge = document.createElement('span');
    timeBadge.className = 'tx-time-badge';
    timeBadge.textContent = t.time || '--:--';
    metaRow.appendChild(timeBadge);
    const dateText = document.createElement('span');
    dateText.className = 'tx-date-text';
    dateText.textContent = formatDateRu(t.date);
    metaRow.appendChild(dateText);

    infoDiv.appendChild(metaRow);
    leftDiv.appendChild(infoDiv);
    item.appendChild(leftDiv);

    const rightDiv = document.createElement('div');
    rightDiv.className = 'tx-right';

    const amountEl = document.createElement('div');
    amountEl.className = 'tx-amount mono';
    amountEl.textContent = (isIncome ? '+' : '-') + Analytics.formatCurrency(t.amount);
    rightDiv.appendChild(amountEl);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'tx-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'tx-btn-action';
    editBtn.title = 'Редактировать';
    editBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); onEdit(t.id); });
    actionsDiv.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tx-btn-action delete-action';
    deleteBtn.title = 'Удалить';
    deleteBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); onDelete(t.id); });
    actionsDiv.appendChild(deleteBtn);

    rightDiv.appendChild(actionsDiv);
    item.appendChild(rightDiv);
    return item;
  };

  /**
   * Отрисовка графика динамики трат
   */
  const renderBarChart = (chartData, daysCount = 7) => {
    const { days, maxAmount, totalAmount, avgAmount } = chartData;

    elements.chartTotalVal.textContent = Analytics.formatCurrency(totalAmount);
    elements.chartAvgVal.textContent   = Analytics.formatCurrency(avgAmount);
    elements.chartDesc.textContent = daysCount === 7
      ? 'Расходы по дням за последние 7 дней'
      : 'Расходы по дням за последние 30 дней';

    const svg = elements.chartSvg;
    svg.innerHTML = '';

    const svgWidth = 320;
    const chartBottom = 150;
    const chartTop = 20;
    const chartHeight = chartBottom - chartTop;
    const count = days.length;
    const barSpacing = svgWidth / count;
    const barWidth = Math.max(4, Math.min(26, barSpacing * 0.65));

    for (let r = 0; r <= 3; r++) {
      const y = chartTop + (chartHeight / 3) * r;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', '0'); line.setAttribute('y1', y);
      line.setAttribute('x2', svgWidth); line.setAttribute('y2', y);
      line.setAttribute('stroke', 'rgba(255, 255, 255, 0.05)');
      line.setAttribute('stroke-dasharray', '3 3');
      svg.appendChild(line);
    }

    days.forEach((d, idx) => {
      const x = idx * barSpacing + (barSpacing - barWidth) / 2;
      const heightPercent = maxAmount > 0 ? (d.amount / maxAmount) : 0;
      const barH = Math.max(d.amount > 0 ? 6 : 2, heightPercent * chartHeight);
      const y = chartBottom - barH;

      const bgBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgBar.setAttribute('class', 'chart-bar-bg');
      bgBar.setAttribute('x', x); bgBar.setAttribute('y', chartTop);
      bgBar.setAttribute('width', barWidth); bgBar.setAttribute('height', chartHeight);
      svg.appendChild(bgBar);

      const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bar.setAttribute('class', 'chart-bar');
      bar.setAttribute('x', x); bar.setAttribute('y', y);
      bar.setAttribute('width', barWidth); bar.setAttribute('height', barH);
      if (d.amount === 0) bar.setAttribute('fill', 'rgba(255, 255, 255, 0.1)');

      bar.addEventListener('mouseenter', () => {
        const bbox = bar.getBoundingClientRect();
        const svgBox = svg.getBoundingClientRect();
        elements.chartTooltip.hidden = false;
        elements.chartTooltip.style.left = (bbox.left - svgBox.left + barWidth / 2) + 'px';
        elements.chartTooltip.style.top  = (bbox.top  - svgBox.top) + 'px';
        elements.chartTooltip.innerHTML  = '<strong>' + d.formattedDate + '</strong><br>' + Analytics.formatCurrency(d.amount);
      });
      bar.addEventListener('mouseleave', () => { elements.chartTooltip.hidden = true; });
      svg.appendChild(bar);

      if (daysCount === 7 || idx % 5 === 0 || idx === count - 1) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'chart-axis-label');
        text.setAttribute('x', x + barWidth / 2);
        text.setAttribute('y', chartBottom + 16);
        text.textContent = d.label;
        svg.appendChild(text);
      }
    });
  };

  /**
   * Обновить список персон в выпадающем списке модального окна
   */
  const updatePersonSelectOptions = (selectedPerson = 'Не указан') => {
    if (!elements.personSelect) return;
    const people = Storage.getPeople();
    elements.personSelect.innerHTML = '';

    people.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      elements.personSelect.appendChild(opt);
    });

    if (selectedPerson && !people.includes(selectedPerson)) {
      const opt = document.createElement('option');
      opt.value = selectedPerson;
      opt.textContent = selectedPerson;
      elements.personSelect.appendChild(opt);
    }

    elements.personSelect.value = selectedPerson || 'Не указан';
  };

  /**
   * Открыть модальное окно добавления/редактирования
   */
  const openModal = (transactionToEdit = null) => {
    elements.form.reset();

    const now = new Date();
    const todayStr = Analytics.getTodayDateStr();
    const hours   = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = hours + ':' + minutes;

    if (transactionToEdit) {
      elements.modalTitle.textContent   = 'Редактировать запись';
      elements.editIdInput.value        = transactionToEdit.id;
      elements.amountInput.value        = formatAmountDisplay(transactionToEdit.amount);

      const parsed = Analytics.parseNote(transactionToEdit.note);
      updatePersonSelectOptions(parsed.person);
      elements.noteInput.value          = parsed.reason || '';

      elements.dateInput.value          = transactionToEdit.date;
      elements.timeInput.value          = transactionToEdit.time || currentTimeStr;
      setType(transactionToEdit.type);
    } else {
      elements.modalTitle.textContent = 'Новая запись';
      elements.editIdInput.value      = '';
      elements.amountInput.value      = '';
      updatePersonSelectOptions('Не указан');
      elements.noteInput.value        = '';
      elements.dateInput.value        = todayStr;
      elements.timeInput.value        = currentTimeStr;
      setType('expense');
    }

    elements.modal.removeAttribute('hidden');
    elements.modal.style.display = 'flex';
    elements.modal.classList.add('active');

    setTimeout(() => {
      elements.amountInput.focus();
    }, 50);
  };

  /**
   * Закрыть модальное окно надежно
   */
  const closeModal = () => {
    elements.modal.classList.remove('active');
    elements.modal.style.display = 'none';
    elements.modal.setAttribute('hidden', '');
    elements.editIdInput.value = '';
  };

  /**
   * Переключение типа: расход или доход
   */
  let currentFormType = 'expense';
  const setType = (type) => {
    currentFormType = type;
    if (type === 'income') {
      elements.btnTypeIncome.classList.add('active');
      elements.btnTypeExpense.classList.remove('active');
      elements.noteLabelText.textContent  = 'Источник дохода';
      elements.noteInput.placeholder       = 'например: зарплата, перевод';
    } else {
      elements.btnTypeExpense.classList.add('active');
      elements.btnTypeIncome.classList.remove('active');
      elements.noteLabelText.textContent  = 'Причина (на что была трата)';
      elements.noteInput.placeholder       = 'например: такси до школы';
    }
  };

  const getCurrentFormType = () => currentFormType;

  /**
   * Установить дату и время формы на текущий момент
   */
  const setFormTimeToNow = () => {
    const now = new Date();
    elements.dateInput.value = Analytics.getTodayDateStr();
    const hours   = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    elements.timeInput.value = hours + ':' + minutes;
  };

  /**
   * Toast-уведомление
   */
  const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icon = type === 'success' ? '\u2713' : (type === 'error' ? '\u2715' : '\u2139');
    toast.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + message + '</span>';
    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity   = '0';
      toast.style.transform = 'translateY(15px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  /**
   * Хелпер склонения слов
   */
  const declension = (number, titles) => {
    const cases = [2, 0, 1, 1, 1, 2];
    return titles[number % 100 > 4 && number % 100 < 20 ? 2 : cases[number % 10 < 5 ? number % 10 : 5]];
  };

  /**
   * Форматирование даты для отображения
   */
  const formatDateRu = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  /**
   * Отрисовка списка людей в модальном окне управления
   */
  const renderPeopleList = (onDeletePerson, onRenamePerson) => {
    if (!elements.peopleList) return;
    const people = Storage.getPeople();
    elements.peopleList.innerHTML = '';

    people.forEach(personName => {
      const item = document.createElement('div');
      item.className = 'people-list-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'people-item-name';
      nameSpan.textContent = personName;
      item.appendChild(nameSpan);

      if (personName === 'Не указан') {
        const badge = document.createElement('span');
        badge.className = 'people-item-default-badge';
        badge.textContent = 'По умолчанию';
        item.appendChild(badge);
      } else {
        const actions = document.createElement('div');
        actions.className = 'people-item-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'people-btn-action';
        editBtn.title = 'Переименовать';
        editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
        editBtn.addEventListener('click', () => {
          if (typeof onRenamePerson === 'function') onRenamePerson(personName);
        });
        actions.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'people-btn-action delete-action';
        deleteBtn.title = 'Удалить';
        deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        deleteBtn.addEventListener('click', () => {
          if (typeof onDeletePerson === 'function') onDeletePerson(personName);
        });
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
      }

      elements.peopleList.appendChild(item);
    });
  };

  /**
   * Открыть модальное окно управления именами
   */
  const openPeopleModal = () => {
    if (!elements.peopleModal) return;
    if (elements.inputNewPerson) elements.inputNewPerson.value = '';
    elements.peopleModal.removeAttribute('hidden');
    elements.peopleModal.style.display = 'flex';
    elements.peopleModal.classList.add('active');
    setTimeout(() => {
      if (elements.inputNewPerson) elements.inputNewPerson.focus();
    }, 50);
  };

  /**
   * Закрыть модальное окно управления именами
   */
  const closePeopleModal = () => {
    if (!elements.peopleModal) return;
    elements.peopleModal.classList.remove('active');
    elements.peopleModal.style.display = 'none';
    elements.peopleModal.setAttribute('hidden', '');
  };

  return {
    elements,
    renderSummary,
    renderTransactionsList,
    renderBarChart,
    openModal,
    closeModal,
    setType,
    getCurrentFormType,
    setFormTimeToNow,
    showToast,
    updatePersonSelectOptions,
    renderPeopleList,
    openPeopleModal,
    closePeopleModal
  };
})();