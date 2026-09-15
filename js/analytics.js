/**
 * SmartBudget — Модуль аналитики и расчетов (Analytics)
 * Расчет баланса, фильтрация по дням/неделям/месяцам и подготовка данных для графиков.
 * Форматирование только в числа без знаков валюты. Только целые числа.
 */

const Analytics = (() => {
  /**
   * Форматирование чисел (только числовое значение без символов валюты, целые)
   * Например: 12 450 или 1 000 000
   * @param {number} amount
   * @returns {string}
   */
  const formatCurrency = (amount) => {
    if (isNaN(amount) || amount == null) amount = 0;
    const n = Math.round(Math.abs(amount));
    // Используем regex вместо toLocaleString — работает на всех Android браузерах
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  };

  /**
   * Получить сегодняшнюю дату в формате 'YYYY-MM-DD'
   * @returns {string}
   */
  const getTodayDateStr = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * Проверить, относится ли дата к сегодняшнему дню
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {boolean}
   */
  const isToday = (dateStr) => {
    return dateStr === getTodayDateStr();
  };

  /**
   * Проверить, попадает ли дата в последние 7 дней
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {boolean}
   */
  const isInLast7Days = (dateStr) => {
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffTime = now - target;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays < 7;
  };

  /**
   * Проверить, относится ли дата к текущему календарному месяцу
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {boolean}
   */
  const isThisMonth = (dateStr) => {
    if (!dateStr) return false;
    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    return target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
  };

  /**
   * Основной расчет сводных показателей (баланс, день, неделя, месяц)
   * @param {Array} transactions
   * @returns {Object}
   */
  const calculateSummary = (transactions) => {
    let totalIncome = 0;
    let totalExpense = 0;

    let incomeToday = 0;
    let spentToday = 0;
    let countToday = 0;

    let incomeWeek = 0;
    let spentWeek = 0;
    let countWeek = 0;

    let incomeMonth = 0;
    let spentMonth = 0;
    let countMonth = 0;

    transactions.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'income') {
        totalIncome += amt;
        if (isToday(t.date)) {
          incomeToday += amt;
        }
        if (isInLast7Days(t.date)) {
          incomeWeek += amt;
        }
        if (isThisMonth(t.date)) {
          incomeMonth += amt;
        }
      } else if (t.type === 'expense') {
        totalExpense += amt;

        if (isToday(t.date)) {
          spentToday += amt;
          countToday++;
        }

        if (isInLast7Days(t.date)) {
          spentWeek += amt;
          countWeek++;
        }

        if (isThisMonth(t.date)) {
          spentMonth += amt;
          countMonth++;
        }
      }
    });

    const balance = totalIncome - totalExpense;

    return {
      balance,
      totalIncome,
      totalExpense,
      incomeToday,
      spentToday,
      countToday,
      incomeWeek,
      spentWeek,
      countWeek,
      incomeMonth,
      spentMonth,
      countMonth
    };
  };

  /**
   * Фильтрация транзакций
   * @param {Array} transactions
   * @param {Object} filterOptions
   * @returns {Array}
   */
  const filterTransactions = (transactions, filterOptions) => {
    const { period, type, query, customFrom, customTo } = filterOptions;

    return transactions.filter(t => {
      if (type !== 'all' && t.type !== type) {
        return false;
      }

      if (period === 'today') {
        if (!isToday(t.date)) return false;
      } else if (period === 'week') {
        if (!isInLast7Days(t.date)) return false;
      } else if (period === 'month') {
        if (!isThisMonth(t.date)) return false;
      } else if (period === 'custom') {
        if (customFrom && t.date < customFrom) return false;
        if (customTo && t.date > customTo) return false;
      }

      if (query && query.trim() !== '') {
        const q = query.toLowerCase().trim();
        const note = (t.note || '').toLowerCase();
        if (!note.includes(q)) return false;
      }

      return true;
    });
  };

  /**
   * Хронологическая сортировка
   * @param {Array} transactions
   * @returns {Array}
   */
  const sortChronological = (transactions) => {
    return [...transactions].sort((a, b) => {
      const dtA = new Date(`${a.date}T${a.time || '00:00'}`);
      const dtB = new Date(`${b.date}T${b.time || '00:00'}`);
      return dtB - dtA;
    });
  };

  /**
   * Группировка списка транзакций по дням
   * @param {Array} transactions
   * @returns {Array}
   */
  const groupByDate = (transactions) => {
    const sorted = sortChronological(transactions);
    const groupsMap = new Map();

    sorted.forEach(t => {
      if (!groupsMap.has(t.date)) {
        groupsMap.set(t.date, []);
      }
      groupsMap.get(t.date).push(t);
    });

    const groups = [];
    groupsMap.forEach((items, dateStr) => {
      let dayExpense = 0;
      items.forEach(it => {
        if (it.type === 'expense') dayExpense += (parseFloat(it.amount) || 0);
      });

      groups.push({
        dateStr,
        displayDate: formatGroupHeaderDate(dateStr),
        dayExpense,
        items
      });
    });

    return groups;
  };

  /**
   * Заголовок для группы дат
   * @param {string} dateStr 'YYYY-MM-DD'
   * @returns {string}
   */
  const formatGroupHeaderDate = (dateStr) => {
    if (isToday(dateStr)) return 'Сегодня';

    const target = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (target.getTime() === yesterday.getTime()) return 'Вчера';

    const options = { day: 'numeric', month: 'long', weekday: 'short' };
    if (target.getFullYear() !== now.getFullYear()) {
      options.year = 'numeric';
    }
    return target.toLocaleDateString('ru-RU', options);
  };

  /**
   * Подготовка данных для столбчатого графика трат
   * @param {Array} transactions
   * @param {number} daysCount 7 или 30
   * @returns {Object}
   */
  const getDailySpendingChartData = (transactions, daysCount = 7) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const dayTotals = new Map();
    const daysList = [];

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      let label = '';
      if (daysCount === 7) {
        label = d.toLocaleDateString('ru-RU', { weekday: 'short' });
      } else {
        label = `${d.getDate()}`;
      }

      dayTotals.set(dateStr, 0);
      daysList.push({
        date: dateStr,
        label,
        formattedDate: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        amount: 0
      });
    }

    let totalAmount = 0;
    transactions.forEach(t => {
      if (t.type === 'expense' && dayTotals.has(t.date)) {
        const amt = parseFloat(t.amount) || 0;
        dayTotals.set(t.date, dayTotals.get(t.date) + amt);
        totalAmount += amt;
      }
    });

    let maxAmount = 0;
    daysList.forEach(day => {
      day.amount = dayTotals.get(day.date) || 0;
      if (day.amount > maxAmount) maxAmount = day.amount;
    });

    const avgAmount = daysCount > 0 ? Math.round(totalAmount / daysCount) : 0;

    return {
      days: daysList,
      maxAmount: Math.max(maxAmount, 100),
      totalAmount,
      avgAmount
    };
  };

  /**
   * Разбор примечания на имя персоны и причину
   * Например: "Амир — такси до школы" -> { person: "Амир", reason: "такси до школы" }
   * @param {string} rawNote
   * @returns {{ person: string, reason: string }}
   */
  const parseNote = (rawNote) => {
    if (!rawNote || typeof rawNote !== 'string') {
      return { person: 'Не указан', reason: '' };
    }
    const trimmed = rawNote.trim();
    // Ищем разделитель "—", "-", ":" или "–"
    const match = trimmed.match(/^([^\-—:–]+)\s*[\-—:–]\s*(.+)$/);
    if (match && match[1]) {
      const name = match[1].trim();
      const reason = match[2].trim();
      if (name.toLowerCase() === 'не указан' || name.toLowerCase() === 'не указано') {
        return { person: 'Не указан', reason };
      }
      return { person: name, reason };
    }
    if (trimmed.toLowerCase() === 'не указан') {
      return { person: 'Не указан', reason: '' };
    }
    return { person: 'Не указан', reason: trimmed };
  };

  /**
   * Формирование строки записи с персоной и причиной
   * @param {string} person
   * @param {string} reason
   * @returns {string}
   */
  const formatNote = (person, reason) => {
    const cleanPerson = (person || '').trim();
    const cleanReason = (reason || '').trim();

    if (cleanPerson && cleanPerson !== 'Не указан') {
      if (cleanReason) {
        return `${cleanPerson} — ${cleanReason}`;
      }
      return cleanPerson;
    }
    return cleanReason;
  };

  return {
    formatCurrency,
    getTodayDateStr,
    isToday,
    isInLast7Days,
    isThisMonth,
    calculateSummary,
    filterTransactions,
    groupByDate,
    getDailySpendingChartData,
    parseNote,
    formatNote
  };
})();