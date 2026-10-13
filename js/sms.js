/**
 * SmartBudget — Модуль для перехвата и обработки входящих SMS сообщений.
 * Обрабатывает сообщения только от UZCARD для карты ***7318.
 * Поддерживает 5 типов операций:
 *   1. Kartaga otkazma — перевод на карту (доход)
 *   2. Kartadan chiqim — перевод с карты в другое приложение / чужую карту (расход)
 *   3. Online tolov — оплата онлайн (расход)
 *   4. Xarid — покупка (расход)
 *   5. Qaytarish — возврат средств (редактирует связанный Online tolov / расход)
 * Проверяет соответствие баланса значению Qoldiq из SMS.
 */

const SMS_PROCESSED_STORAGE_KEY = 'smartbudget_processed_sms_v1';

function isSmsAlreadyProcessed(timestamp, body) {
    try {
        const history = JSON.parse(localStorage.getItem(SMS_PROCESSED_STORAGE_KEY) || '[]');
        const key = `${timestamp}_${(body || '').substring(0, 40)}`;
        return history.includes(key);
    } catch(e) {
        return false;
    }
}

function markSmsProcessed(timestamp, body) {
    try {
        let history = JSON.parse(localStorage.getItem(SMS_PROCESSED_STORAGE_KEY) || '[]');
        const key = `${timestamp}_${(body || '').substring(0, 40)}`;
        history.push(key);
        if (history.length > 200) {
            history = history.slice(-200);
        }
        localStorage.setItem(SMS_PROCESSED_STORAGE_KEY, JSON.stringify(history));
    } catch(e) {}
}

window.processSmsQueue = async function(queue) {
    if (!queue || !Array.isArray(queue) || queue.length === 0) return;
    
    // Сортируем сообщения хронологически (от старых к новым) для корректного пошагового пересчета
    const sorted = [...queue].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    for (const sms of sorted) {
        if (!sms || !sms.body) continue;
        if (isSmsAlreadyProcessed(sms.timestamp, sms.body)) continue;
        
        await processSms(sms.sender, sms.body, sms.timestamp);
        markSmsProcessed(sms.timestamp, sms.body);
    }
};

window.checkPendingSms = async function() {
    if (window.AndroidApp && typeof window.AndroidApp.getPendingSms === 'function') {
        try {
            const queueStr = window.AndroidApp.getPendingSms();
            const queue = JSON.parse(queueStr);
            if (queue && queue.length > 0) {
                // Очищаем очередь в Android
                if (typeof window.AndroidApp.clearPendingSms === 'function') {
                    window.AndroidApp.clearPendingSms();
                }
                await window.processSmsQueue(queue);
            }
        } catch(e) {
            console.error("Ошибка при проверке входящих SMS:", e);
        }
    }
};

async function processSms(sender, body, timestamp) {
    if (!sender || sender.toUpperCase().indexOf('UZCARD') === -1) return;
    if (!body || body.indexOf('7318') === -1) return;
    
    // Нормализуем текст (убираем апострофы для надежного сравнения узбекских слов: to'lov -> tolov, o'tkazma -> otkazma)
    const normalizedText = body.toLowerCase().replace(/['`‘ʼ]/g, '');
    
    let type = '';
    if (normalizedText.includes('kartaga otkazma')) {
        type = 'income';
    } else if (normalizedText.includes('kartadan chiqim')) {
        type = 'expense_chiqim';
    } else if (normalizedText.includes('online tolov')) {
        type = 'expense_online';
    } else if (normalizedText.includes('xarid')) {
        type = 'expense_xarid';
    } else if (normalizedText.includes('qaytarish')) {
        type = 'refund';
    } else {
        return; // Неизвестный или неподдерживаемый тип операции
    }
    
    // Извлекаем сумму (UZCARD всегда отправляет целые суммы в сумах)
    const summaMatch = body.match(/Summa:\s*([\d\s,\.]+)/i);
    if (!summaMatch) return;
    
    const amountStr = summaMatch[1].replace(/[^\d]/g, '');
    const amount = parseInt(amountStr, 10);
    
    if (isNaN(amount) || amount <= 0) return;
    
    // Извлекаем остаток (Qoldiq)
    const qoldiqMatch = body.match(/Qoldiq:\s*([\d\s,\.]+)/i);
    let qoldiq = -1;
    if (qoldiqMatch) {
        const qStr = qoldiqMatch[1].replace(/[^\d]/g, '');
        qoldiq = parseInt(qStr, 10);
    }
    
    // Извлекаем торговую точку или приложение (Joy / Ilova / Xizmat), не захватывая Qoldiq и точку с запятой
    const joyMatch = body.match(/(?:Joy|Ilova|Xizmat):\s*(.+?)(?=(?:;\s*|[\r\n]+|Qoldiq:|$))/i);
    let vendor = joyMatch ? joyMatch[1].trim() : '';
    
    let person = 'Не указан';
    if (vendor && vendor.toLowerCase().includes('yandex go scooter')) {
        person = 'Умар';
    }
    
    await processSmsTransactionAsync(type, amount, vendor, person, qoldiq, timestamp);
}

async function processSmsTransactionAsync(type, amount, vendor, person, qoldiq, timestamp) {
    // Переключаем профиль на "Карта"
    Storage.setActiveProfile('Карта');
    
    // Получаем все транзакции профиля "Карта"
    const txs = Storage.getTransactionsByProfile('Карта');
    
    let currentBalance = 0;
    txs.forEach(t => {
        if (t.type === 'income') currentBalance += t.amount;
        else currentBalance -= t.amount;
    });
    
    let expectedBalance = currentBalance;
    
    // Определяем дату и время транзакции по времени SMS
    let txDate = Analytics.getTodayDateStr();
    let txTime = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (timestamp && !isNaN(timestamp)) {
        const d = new Date(Number(timestamp));
        if (!isNaN(d.getTime())) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            txDate = `${yyyy}-${mm}-${dd}`;
            txTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
    }
    
    let newTx = {
        amount: amount,
        profile_id: 'Карта',
        date: txDate,
        time: txTime
    };
    
    if (type === 'income') {
        newTx.type = 'income';
        newTx.note = person !== 'Не указан' ? `${person} — Перевод на карту` : (vendor ? `Перевод на карту (${vendor})` : `Перевод на карту`);
        expectedBalance += amount;
        
    } else if (type === 'expense_online' || type === 'expense_xarid' || type === 'expense_chiqim') {
        newTx.type = 'expense';
        const defaultTitle = type === 'expense_chiqim' ? 'Перевод с карты' : 'Покупка по карте';
        const displayVendor = vendor || defaultTitle;
        newTx.note = person !== 'Не указан' ? `${person} — ${displayVendor}` : displayVendor;
        expectedBalance -= amount;
        
    } else if (type === 'refund') {
        // Ищем предыдущую связанную операцию расхода на эту сумму (начиная с самых свежих)
        const lastExpense = txs.find(t => t.type === 'expense' && t.amount === amount && (!t.note || !t.note.includes('[ВОЗВРАТ]')));
        
        if (lastExpense) {
            // Редактируем найденную запись расхода
            const cleanOldNote = (lastExpense.note || '').replace(/^\[ОШИБКА РАСЧЕТА\]\s*/, '');
            lastExpense.note = '[ВОЗВРАТ] ' + cleanOldNote;
            lastExpense.amount = 0;
            lastExpense.hasError = false;
            
            // Поскольку сумма расхода стала 0, баланс восстанавливается на +amount
            expectedBalance += amount;
            
            if (qoldiq !== -1 && expectedBalance !== qoldiq) {
                lastExpense.hasError = true;
                lastExpense.note = '[ОШИБКА РАСЧЕТА] ' + lastExpense.note;
                UI.showToast(`Возврат: ошибка расчета остатка (ожидался ${expectedBalance}, в SMS ${qoldiq})`, 'error');
            } else {
                UI.showToast('Возврат успешно обработан: ' + (vendor || 'Сумма восстановлена'));
            }
            
            await Storage.updateTransaction(lastExpense.id, lastExpense);
            if (window.updateApp) window.updateApp();
            return;
        } else {
            // Если предыдущий расход не найден, создаем операцию дохода
            newTx.type = 'income';
            newTx.note = `Возврат — ${vendor || 'Карта'}`;
            expectedBalance += amount;
        }
    }
    
    // Сверка с остатком из SMS
    if (qoldiq !== -1 && expectedBalance !== qoldiq) {
        newTx.hasError = true;
        newTx.note = '[ОШИБКА РАСЧЕТА] ' + (newTx.note || '');
        UI.showToast(`SMS добавлено: ошибка расчета (ожидался ${expectedBalance}, в SMS ${qoldiq})`, 'error');
    } else {
        UI.showToast('Операция по карте успешно добавлена');
    }
    
    await Storage.addTransaction(newTx);
    
    if (window.updateApp) window.updateApp();
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.checkPendingSms === 'function') {
            window.checkPendingSms();
        }
    }, 1500);
});
