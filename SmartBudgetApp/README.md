# SmartBudgetApp

Android приложение — WebView-обёртка для [SmartBudget](https://firstvoid.github.io/SmartBudget/).

## Описание

SmartBudgetApp — нативное Android приложение, отображающее веб-версию SmartBudget внутри полноэкранного WebView. Приложение максимально интегрируется с системой: тёмный фон, полноэкранный режим, сохранение данных между сессиями.

## Возможности

- **WebView** с полным функционалом SmartBudget
- **LocalStorage** — данные профилей и транзакций сохраняются между запусками
- **Pull-to-refresh** — обновление страницы свайпом вниз
- **Тёмная тема** — цвета соответствуют дизайну SmartBudget (#090D16)
- **Edge-to-edge** — контент занимает весь экран
- **Навигация назад** — кнопка "Назад" работает внутри WebView
- **Внешние ссылки** — открываются в браузере, не в приложении

## Планируется

- **SMS интеграция** — автоматическое считывание банковских SMS и добавление транзакций в SmartBudget

## Сборка

### Требования

- Android Studio Hedgehog или новее
- JDK 17+
- Android SDK (minSdk 26, targetSdk 35)

### Шаги

1. Откройте папку `SmartBudgetApp` в Android Studio
2. Дождитесь синхронизации Gradle
3. Нажмите **Run** или **Build > Build APK**

## Структура проекта

```
SmartBudgetApp/
├── app/
│   └── src/main/
│       ├── java/com/smartbudget/app/
│       │   ├── MainActivity.java        # Главная Activity с WebView
│       │   └── sms/
│       │       └── SmsReceiver.java     # Заглушка для SMS (будущая функция)
│       ├── res/
│       │   ├── layout/activity_main.xml # Макет с WebView + SwipeRefresh
│       │   ├── values/                  # Цвета, строки, тема
│       │   └── xml/network_security_config.xml
│       └── AndroidManifest.xml
├── gradle/
│   ├── libs.versions.toml
│   └── wrapper/gradle-wrapper.properties
├── build.gradle
├── settings.gradle
└── gradle.properties
```

## Разрешения

| Разрешение | Статус | Назначение |
|---|---|---|
| INTERNET | Активно | Загрузка SmartBudget |
| ACCESS_NETWORK_STATE | Активно | Проверка подключения |
| RECEIVE_SMS | Неактивно | Будущая SMS-интеграция |
| READ_SMS | Неактивно | Будущая SMS-интеграция |
