# AB Runner

AB Runner - desktop-приложение на Electron для запуска HTTP-запросов и сценариев по данным из JSON. По смыслу оно похоже на легкий Postman/Runner: можно собирать коллекции запросов, хранить окружения, подставлять переменные, запускать один запрос или целую пачку запросов по массиву данных.

## Возможности

- Коллекции, папки и шаги запросов.
- Методы `GET`, `POST`, `PUT`, `PATCH`, `DELETE` и другие HTTP-методы.
- Заголовки, авторизация, body разных типов и cURL-экспорт.
- Окружения с переменными вида `{{baseUrl}}`, `{{token}}`.
- Подстановка данных из JSON-файла: `{id}`, `{user.email}`, `{order.number}`.
- Вкладка `Scripts` для pre-request и post-response логики.
- Массовый запуск через Runner.
- История запросов и ответов.
- Импорт из cURL, Postman collection и Postman environment.
- Темы интерфейса и удобная работа с вкладками коллекций.

## Установка и запуск

Требования:

- Node.js 18 или новее.
- npm.

Установка зависимостей:

```bash
npm install
```

Запуск приложения:

```bash
npm start
```

Проверка кода:

```bash
npm run lint
npm test -- --runInBand
```

Сборка:

```bash
npm run build
```

Сборка Windows-версии:

```bash
npm run build:win
```

## Основные понятия

`Коллекция` - набор запросов. Обычно одна коллекция соответствует одному API, сервису или рабочему сценарию.

`Папка` - группа шагов внутри коллекции. Можно использовать для разделения API по модулям: auth, users, orders, delivery.

`Шаг` - один HTTP-запрос: метод, URL, headers, authorization, body и scripts.

`Окружение` - набор переменных. Например, `baseUrl`, `token`, `username`, `password`.

`Runner` - режим массового запуска, где приложение берет массив объектов из JSON-файла и выполняет запросы для каждого объекта.

## Интерфейс

Слева находится панель коллекций. Там можно:

- выбрать окружение;
- искать коллекции, папки и шаги;
- создать коллекцию;
- создать папку;
- импортировать данные;
- открыть JSON Generator;
- переключить тему;
- открыть историю.

Сверху окна находятся вкладки открытых коллекций. Если название длинное, оно обрезается и показывается в коротком виде. Коллекцию можно закрыть кнопкой закрытия или средним щелчком мыши по вкладке.

В верхней части окна рядом с названием приложения показывается текущая версия приложения.

В центральной части находится редактор выбранного шага: название, метод, URL и вкладки `Headers`, `Authorization`, `Body`, `Scripts`.

## Создание коллекции и запроса

1. Нажмите кнопку создания коллекции.
2. Введите название коллекции.
3. Создайте папку, если хотите сгруппировать запросы.
4. Создайте шаг запроса.
5. Укажите название шага.
6. Выберите HTTP-метод.
7. Укажите URL.
8. Заполните headers, authorization, body и scripts при необходимости.
9. Нажмите `Send`, чтобы отправить запрос.

Пример URL:

```text
{{baseUrl}}/users/{id}
```

Если в окружении есть `baseUrl`, а в данных Runner есть `id`, приложение подставит оба значения.

## Переменные и подстановки

AB Runner поддерживает два типа подстановок.

Переменные окружения:

```text
{{baseUrl}}
{{token}}
{{username}}
```

Данные текущего объекта Runner:

```text
{id}
{email}
{user.email}
{delivery.address.city}
```

Пример JSON-файла для Runner:

```json
[
  {
    "id": 1,
    "user": {
      "email": "first@example.com"
    }
  },
  {
    "id": 2,
    "user": {
      "email": "second@example.com"
    }
  }
]
```

Если URL выглядит так:

```text
{{baseUrl}}/users/{id}?email={user.email}
```

то для первого объекта он превратится в:

```text
https://example.com/users/1?email=first@example.com
```

## Headers

Во вкладке `Headers` можно добавлять пары ключ/значение.

Пример:

```text
Content-Type: application/json
Accept: application/json
Authorization: Bearer {{token}}
```

Заголовки также можно менять из скрипта через `pm.request.headers`.

## Authorization

Во вкладке `Authorization` выбирается тип авторизации.

Если запрос не требует авторизации, оставьте `No Auth`.

Если токен уже есть в окружении, можно использовать обычный header:

```text
Authorization: Bearer {{token}}
```

Если токен нужно получать автоматически перед запросом, используйте вкладку `Scripts`. Старый режим `auto token` больше не нужен: вся такая логика теперь должна жить в pre-request script.

## Body

Во вкладке `Body` можно выбрать тип тела запроса:

- `none` - без тела.
- `form-data` - multipart form-data.
- `x-www-form-urlencoded` - обычная HTML-форма.
- `raw` - JSON, JavaScript, XML, HTML или plain text.
- `binary` - файл.
- `GraphQL` - GraphQL query и variables.

Для JSON чаще всего используется `raw` + `JSON`.

Пример:

```json
{
  "id": "{id}",
  "email": "{user.email}",
  "status": "active"
}
```

Перед отправкой `{id}` и `{user.email}` будут заменены значениями из текущего объекта данных.

## Scripts

Во вкладке `Scripts` можно писать JavaScript-код для шага.

Есть два сценария:

- `Pre-request` - выполняется перед отправкой основного запроса.
- `Post-response` - выполняется после получения ответа.

Pre-request удобно использовать для:

- получения токена;
- обновления headers;
- изменения body;
- пропуска запроса;
- подготовки данных.

Post-response удобно использовать для:

- проверки ответа;
- сохранения данных из ответа в окружение;
- логирования;
- остановки Runner при ошибке.

### Доступные возможности `pm`

Работа с окружением:

```js
pm.env.get('token');
pm.env.set('token', 'value');
pm.env.unset('token');
pm.env.all();
```

Работа с запросом:

```js
pm.request.url;
pm.request.method;
pm.request.headers.get('Authorization');
pm.request.headers.set('Authorization', 'Bearer token');
pm.request.headers.remove('Authorization');
pm.request.headers.has('Content-Type');
pm.request.headers.all();
pm.request.body.get();
pm.request.body.set({ name: 'Alex' });
```

Данные текущего элемента Runner:

```js
pm.request.data;
```

Ответ после запроса:

```js
pm.response.status;
pm.response.statusText;
pm.response.headers;
pm.response.body;
pm.response.data;
pm.response.time;
```

Дополнительные команды:

```js
await pm.sendRequest({ method, url, headers, body });
await pm.runStep('Название шага');
pm.log('message');
pm.skip('reason');
pm.abort('reason');
pm.expect(value).toBe(expected);
```

### Пример: получить токен перед запросом

Этот пример проверяет, есть ли токен. Если токена нет, скрипт отправляет login-запрос, сохраняет токен в окружение и добавляет его в основной запрос.

```js
let token = pm.env.get('token');

if (!token) {
  const login = await pm.sendRequest({
    method: 'POST',
    url: '{{baseUrl}}/auth/token',
    headers: {
      'Content-Type': 'application/json'
    },
    body: {
      username: pm.env.get('username'),
      password: pm.env.get('password')
    }
  });

  token = login.data.token;
  pm.env.set('token', token);
}

pm.request.headers.set('Authorization', `Bearer ${token}`);
```

После этого основной запрос отправится уже с заголовком:

```text
Authorization: Bearer <token>
```

### Пример: изменить body перед отправкой

```js
const body = pm.request.body.get();

body.requestId = pm.request.data.id;
body.sentAt = new Date().toISOString();

pm.request.body.set(body);
```

### Пример: проверить ответ

```js
pm.expect(pm.response.status).toBe(200);

if (!pm.response.data.success) {
  pm.abort('API вернул success=false');
}
```

### Пример: сохранить значение из ответа

```js
if (pm.response.data.token) {
  pm.env.set('token', pm.response.data.token);
}
```

## Send одного запроса

Кнопка `Send` отправляет выбранный шаг один раз.

Если запрос использует плейсхолдеры `{id}` или `{user.email}`, можно указать тестовые данные для одиночного запуска. Это удобно, когда нужно проверить один запрос без запуска всего Runner.

Горячая клавиша:

```text
Ctrl+Enter
```

На macOS:

```text
Cmd+Enter
```

## Runner

Runner нужен для массового запуска запросов по JSON-файлу.

Как использовать:

1. Подготовьте JSON-файл с массивом объектов.
2. Откройте нужную коллекцию.
3. Выберите шаги, которые нужно запускать.
4. Выберите файл данных.
5. При необходимости задайте задержку между запросами.
6. Нажмите запуск Runner.
7. Следите за прогрессом и результатами.

Пример файла:

```json
[
  {
    "id": "A-100",
    "amount": 1200,
    "client": {
      "phone": "+10000000000"
    }
  },
  {
    "id": "A-101",
    "amount": 900,
    "client": {
      "phone": "+20000000000"
    }
  }
]
```

В запросе можно использовать:

```text
{id}
{amount}
{client.phone}
```

Если один из скриптов вызывает `pm.abort('reason')`, Runner остановит выполнение.

Если скрипт вызывает `pm.skip('reason')`, текущий запрос будет пропущен.

## История

История хранит выполненные запросы и ответы. Через нее удобно проверять:

- какой URL реально был отправлен;
- какие headers ушли;
- какой body ушел;
- какой статус вернул сервер;
- сколько времени занял запрос;
- какой ответ пришел.

История хранится локально на компьютере.

## Импорт

AB Runner поддерживает импорт из:

- cURL-команды;
- Postman collection;
- Postman environment.

cURL можно импортировать как новый шаг или использовать для быстрого создания запроса.

## JSON Generator

JSON Generator помогает быстро создать тестовый JSON-файл для Runner. Его удобно использовать, когда нужно подготовить массив объектов без ручного написания большого JSON.

## Сохранение данных

Данные приложения сохраняются локально в папке пользовательских данных Electron.

Обычно там находятся:

- `ab-runner-data.json` - коллекции, окружения и настройки;
- `ab-runner-history.json` - история запросов.

Перед большими изменениями можно сделать резервную копию этих файлов.

## Горячие клавиши

```text
Ctrl+S              сохранить
Ctrl+N              новая коллекция
Ctrl+Shift+F        поиск
Ctrl+Enter          отправить выбранный запрос
Ctrl+/              комментарий в редакторе кода
Esc                 закрыть модальное окно
Middle click        закрыть вкладку коллекции сверху
```

На macOS вместо `Ctrl` используется `Cmd`.

## Советы по работе

- Храните `baseUrl`, `token`, `username`, `password` в окружении.
- Не прописывайте токены вручную в каждом запросе - добавляйте их через переменные или pre-request script.
- Для авторизации через login-запрос используйте `pm.sendRequest`.
- Для сложных сценариев сначала проверьте один запрос через `Send`, потом запускайте Runner.
- Если скрипт внезапно ведет себя странно, проверьте историю: там видно фактически отправленный URL, headers и body.
- Не создавайте бесконечные циклы в scripts: у скриптов есть ограничение по времени выполнения.

## Частые проблемы

### Не подставляется `{{baseUrl}}`

Проверьте, что выбрано правильное окружение и в нем есть переменная `baseUrl`.

### Не подставляется `{id}`

Проверьте, что Runner запускается с JSON-файлом, где у каждого объекта есть поле `id`.

### Токен не добавляется в запрос

Проверьте pre-request script. В конце скрипта должен быть вызов:

```js
pm.request.headers.set('Authorization', `Bearer ${token}`);
```

### JSON body отправляется неправильно

Проверьте, что во вкладке `Body` выбран `raw` и формат `JSON`, а также указан header:

```text
Content-Type: application/json
```

### Скрипт не успевает получить токен

Если используется `pm.sendRequest`, перед ним должен быть `await`:

```js
const login = await pm.sendRequest({
  method: 'POST',
  url: '{{baseUrl}}/auth/token'
});
```

## Структура проекта

```text
main.js                    главный Electron-процесс
preload.js                 безопасный мост между Electron и renderer
renderer.html              HTML интерфейса
style.css                  стили приложения
src/renderer/app.js        основная логика интерфейса
src/shared/scriptRunner.js выполнение scripts
src/shared/scriptHelpers.js API pm для scripts
tests/                     тесты
```

## Разработка

После изменения логики scripts желательно запускать:

```bash
npm run lint
npm test -- --runInBand
```

После изменения интерфейса желательно проверить приложение вручную через:

```bash
npm start
```
