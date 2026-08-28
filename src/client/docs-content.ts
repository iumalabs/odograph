// In-app documentation content (specs/057-in-app-documentation). Every factual claim here is
// checked against the real implementation, not carried over from the Claude Design mockup's
// placeholder copy (which describes a Cloudflare Access / Docker deployment this app doesn't
// have — see research.md's per-section source table). Structured as `{ en: [...], ru: [...] }`
// (Constitution Principle IX — see plan.md's Constitution Check for why this file, not individual
// `t()` keys, is the right shape for long-form prose). `ru` is a real translation of `en`, not a
// stub — every section/block/list-item mirrors its English counterpart 1:1 (issue #267).

export type DocBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: Array<{ label: string; text: string }> }
  | { kind: "code"; text: string }
  | { kind: "note"; text: string };

export type DocSection = {
  id: string;
  number: string;
  kicker: string;
  title: string;
  lead: string;
  blocks: DocBlock[];
};

export const en: DocSection[] = [
  {
    id: "getting-started",
    number: "01",
    kicker: "GETTING STARTED",
    title: "What odograph does",
    lead:
      "odograph is a maintenance log for your vehicles — fill-ups, service history, reminders, a work planner, a photo gallery, and documents, all in one place.",
    blocks: [
      { kind: "heading", text: "What's inside" },
      {
        kind: "list",
        items: [
          {
            label: "Garage — ",
            text:
              "a card per vehicle: odometer, cost per distance, average fuel economy, and the next thing due.",
          },
          {
            label: "Fuel — ",
            text: "a quick form that computes economy and total cost from your odometer readings.",
          },
          {
            label: "Service — ",
            text: "a log of work done, with parts, cost, and who did it.",
          },
          {
            label: "Reminders — ",
            text: "by distance and by date; marking one done adds it to your service log.",
          },
          {
            label: "Planner — ",
            text: "a kanban board — ideas, to buy, in progress, done — for work you're planning.",
          },
          {
            label: "Gallery and documents — ",
            text: "photos by category, and scans of documents with expiry tracking.",
          },
        ],
      },
      { kind: "heading", text: "Getting a vehicle in" },
      {
        kind: "paragraph",
        text:
          "Add a vehicle from the Garage screen, by VIN lookup or by hand. Its odometer doesn't need to be exact up front — it updates from your first fill-up or service entry.",
      },
      {
        kind: "note",
        text:
          "Distance unit (km/mi) and currency are per-viewer preferences, switchable any time from the header. Distance unit recalculates the displayed figures (km ↔ mi); currency only swaps the symbol shown next to costs — amounts are never converted between currencies.",
      },
    ],
  },
  {
    id: "signing-in",
    number: "02",
    kicker: "ACCOUNTS",
    title: "Signing in",
    lead:
      "There's no password. Every account signs in with one of four methods, and every new sign-up gets its own private, fully isolated account immediately.",
    blocks: [
      { kind: "heading", text: "The four methods" },
      {
        kind: "list",
        items: [
          {
            label: "Passkey — ",
            text:
              "the primary method. Your device (Touch ID, Windows Hello, a security key) proves who you are — nothing to remember, nothing that can be phished.",
          },
          {
            label: "Magic link — ",
            text:
              "a sign-in link emailed to you, valid for 15 minutes and usable once. No account setup beyond an email address.",
          },
          {
            label: "Google — ",
            text: "sign in with an existing Google account.",
          },
          {
            label: "Cloudflare — ",
            text: "sign in via Cloudflare Access, if your operator has configured it.",
          },
        ],
      },
      {
        kind: "paragraph",
        text:
          "You can add more than one method to the same account later — for example, register a passkey on a second device, or link an additional email address or Google account — from the Garage screen once signed in.",
      },
      { kind: "heading", text: "Your data" },
      {
        kind: "paragraph",
        text:
          "Every account's data is fully isolated from every other account's — nothing is shared by default. You can permanently delete your account and everything in it from Account; this is immediate and cannot be undone.",
      },
    ],
  },
  {
    id: "fuel-and-consumption",
    number: "03",
    kicker: "FUEL",
    title: "Fuel and consumption",
    lead:
      "Fuel economy and cost-per-distance are computed for you from your fill-up history — you only enter what's on the receipt.",
    blocks: [
      { kind: "heading", text: "How it's computed" },
      {
        kind: "paragraph",
        text:
          'Each fill-up records an odometer reading, a volume, and (optionally) a cost. Fuel economy for a given fill-up is the distance since the previous one (by odometer reading, not by date) divided by the volume — every fill-up counts, there\'s no "only full tanks" restriction to remember.',
      },
      {
        kind: "note",
        text:
          "Entries are matched by odometer order, not entry order — logging a missed fill-up after the fact still slots it into the right place in the sequence.",
      },
      { kind: "heading", text: "Units and currency" },
      {
        kind: "paragraph",
        text:
          "Switch between km/L and mi/gal from the header at any time — the underlying figures are recalculated for you. Currency, switched the same way, only changes the symbol shown next to costs; there's no exchange-rate conversion, so the numbers themselves stay exactly as entered.",
      },
    ],
  },
  {
    id: "service-and-reminders",
    number: "04",
    kicker: "MAINTENANCE",
    title: "Service, reminders, and the planner",
    lead:
      "Reminders and the planner both feed the same service log — they're two ways of getting a job onto it, not separate systems.",
    blocks: [
      { kind: "heading", text: "How reminders trigger" },
      {
        kind: "paragraph",
        text:
          "A reminder watches both distance and date at once, whichever comes first. Marking one done creates a service-log entry for it automatically, using your vehicle's current odometer reading.",
      },
      { kind: "heading", text: "The planner" },
      {
        kind: "paragraph",
        text:
          'The planner is a kanban board — Ideas, To buy, In progress, Done — for work you\'re planning rather than something already due. Moving a card to "Done" creates a service-log entry for it too, carrying over its price if it had one.',
      },
      { kind: "heading", text: "Documents" },
      {
        kind: "paragraph",
        text:
          "Documents (insurance, inspection certificates, and similar) can have an expiry date — a reminder appears as that date approaches, the same way a distance-based reminder does.",
      },
    ],
  },
  {
    id: "api-access",
    number: "05",
    kicker: "AUTOMATION",
    title: "API access",
    lead:
      "For scripting or home automation, you can create a scoped API token from Account and call the same REST API the app itself uses.",
    blocks: [
      { kind: "heading", text: "Creating a token" },
      {
        kind: "paragraph",
        text:
          "Give it a label and a scope — read or write — from Account. The token is shown once at creation time; store it yourself, since it isn't shown again.",
      },
      { kind: "heading", text: "Using it" },
      {
        kind: "code",
        text:
          'curl https://your-instance.example/api/v1/vehicles \\\n  -H "Authorization: Bearer <your-token>"',
      },
      {
        kind: "note",
        text:
          "A read-scoped token can't perform writes, even if you construct the request yourself. Revoke a token any time from Account — it stops working immediately.",
      },
    ],
  },
  {
    id: "self-hosting",
    number: "06",
    kicker: "DEPLOYMENT",
    title: "Self-hosting",
    lead:
      "odograph runs entirely on Cloudflare's free-tier-friendly stack (Workers, D1, R2, KV). You can deploy your own instance to your own Cloudflare account.",
    blocks: [
      { kind: "heading", text: "How it's deployed" },
      {
        kind: "paragraph",
        text:
          "Deployment is plain `wrangler` commands run from your own machine against your own Cloudflare account — there's no Docker image, and no third-party auth gateway sits in front of the app.",
      },
      {
        kind: "list",
        items: [
          { label: "Provision — ", text: "one D1 database, one KV namespace, one R2 bucket." },
          {
            label: "Migrate — ",
            text: "apply the bundled migrations to set up the schema.",
          },
          {
            label: "Configure — ",
            text:
              "Google sign-in is optional; email sending (magic-link and reminder mail) needs Cloudflare Email Routing enabled on a domain you control.",
          },
          { label: "Deploy — ", text: "build and `wrangler deploy`. Your instance is live." },
        ],
      },
      {
        kind: "note",
        text:
          "This is a summary — the full step-by-step, including exact commands, lives in the project's `docs/self-hosting.md` on GitHub.",
      },
    ],
  },
];

export const ru: DocSection[] = [
  {
    id: "getting-started",
    number: "01",
    kicker: "НАЧАЛО РАБОТЫ",
    title: "Что умеет odograph",
    lead:
      "odograph — журнал обслуживания автомобилей: заправки, история сервиса, напоминания, планировщик работ, фотогалерея и документы — всё в одном месте.",
    blocks: [
      { kind: "heading", text: "Что внутри" },
      {
        kind: "list",
        items: [
          {
            label: "Гараж — ",
            text:
              "карточка на каждый автомобиль: одометр, стоимость на расстояние, средний расход и ближайшее плановое обслуживание.",
          },
          {
            label: "Топливо — ",
            text:
              "быстрая форма, которая считает расход и итоговую стоимость по показаниям одометра.",
          },
          {
            label: "Обслуживание — ",
            text: "журнал выполненных работ с деталями, стоимостью и исполнителем.",
          },
          {
            label: "Напоминания — ",
            text:
              "по расстоянию и по дате; отметка «выполнено» добавляет запись в журнал обслуживания.",
          },
          {
            label: "Планировщик — ",
            text:
              "канбан-доска — идеи, купить, в работе, готово — для работ, которые вы только планируете.",
          },
          {
            label: "Галерея и документы — ",
            text: "фото по категориям и сканы документов с отслеживанием срока действия.",
          },
        ],
      },
      { kind: "heading", text: "Добавление автомобиля" },
      {
        kind: "paragraph",
        text:
          "Добавьте автомобиль на экране Гараж — по VIN или вручную. Точное значение одометра указывать не обязательно — оно обновится по первой заправке или записи обслуживания.",
      },
      {
        kind: "note",
        text:
          "Единица расстояния (км/мили) и валюта — персональные настройки, переключаются в любой момент из шапки. Единица расстояния пересчитывает отображаемые цифры (км ↔ мили); валюта лишь меняет значок рядом с суммами — сами суммы никогда не конвертируются между валютами.",
      },
    ],
  },
  {
    id: "signing-in",
    number: "02",
    kicker: "АККАУНТЫ",
    title: "Вход в аккаунт",
    lead:
      "Пароля нет. Вход в аккаунт — одним из четырёх способов, и каждая новая регистрация сразу получает свой личный, полностью изолированный аккаунт.",
    blocks: [
      { kind: "heading", text: "Четыре способа" },
      {
        kind: "list",
        items: [
          {
            label: "Passkey — ",
            text:
              "основной способ. Ваше устройство (Touch ID, Windows Hello, ключ безопасности) подтверждает, что это вы — ничего запоминать не нужно, и это невозможно выманить фишингом.",
          },
          {
            label: "Ссылка для входа — ",
            text:
              "присылается на почту, действует 15 минут и одноразовая. Никакой предварительной настройки аккаунта, кроме email.",
          },
          {
            label: "Google — ",
            text: "вход через существующий аккаунт Google.",
          },
          {
            label: "Cloudflare — ",
            text: "вход через Cloudflare Access, если он настроен вашим оператором.",
          },
        ],
      },
      {
        kind: "paragraph",
        text:
          "Позже к тому же аккаунту можно добавить ещё один способ входа — например, зарегистрировать passkey на втором устройстве или привязать дополнительный email либо аккаунт Google — на экране Гараж после входа.",
      },
      { kind: "heading", text: "Ваши данные" },
      {
        kind: "paragraph",
        text:
          "Данные каждого аккаунта полностью изолированы от данных остальных — по умолчанию ничего не является общим. Вы можете навсегда удалить свой аккаунт и всё, что в нём есть, со страницы Аккаунт; это происходит немедленно и необратимо.",
      },
    ],
  },
  {
    id: "fuel-and-consumption",
    number: "03",
    kicker: "ТОПЛИВО",
    title: "Топливо и расход",
    lead:
      "Расход топлива и стоимость на расстояние считаются автоматически по истории заправок — вы вводите только то, что написано на чеке.",
    blocks: [
      { kind: "heading", text: "Как считается" },
      {
        kind: "paragraph",
        text:
          "Каждая заправка фиксирует показание одометра, объём и (опционально) стоимость. Расход для конкретной заправки — это расстояние с предыдущей заправки (по показанию одометра, не по дате), делённое на объём — учитывается каждая заправка, ограничения «только полный бак» нет.",
      },
      {
        kind: "note",
        text:
          "Записи сопоставляются по порядку показаний одометра, а не по порядку добавления — запись о пропущенной заправке, добавленная задним числом, всё равно встанет на правильное место в последовательности.",
      },
      { kind: "heading", text: "Единицы и валюта" },
      {
        kind: "paragraph",
        text:
          "Переключайтесь между км/л и милями/галлонами в любой момент из шапки — базовые цифры при этом пересчитываются. Валюта переключается там же, но меняет только значок рядом с суммами; курсов конвертации нет, поэтому числа остаются точно такими, как введены.",
      },
    ],
  },
  {
    id: "service-and-reminders",
    number: "04",
    kicker: "ОБСЛУЖИВАНИЕ",
    title: "Обслуживание, напоминания и планировщик",
    lead:
      "Напоминания и планировщик оба ведут в один и тот же журнал обслуживания — это два способа добавить в него работу, а не отдельные системы.",
    blocks: [
      { kind: "heading", text: "Как срабатывают напоминания" },
      {
        kind: "paragraph",
        text:
          "Напоминание одновременно следит за расстоянием и датой — срабатывает то, что наступит раньше. Отметка «выполнено» автоматически создаёт запись в журнале обслуживания с текущим показанием одометра автомобиля.",
      },
      { kind: "heading", text: "Планировщик" },
      {
        kind: "paragraph",
        text:
          "Планировщик — это канбан-доска: Идеи, Купить, В работе, Готово — для работ, которые вы только планируете, а не для того, что уже пора делать. Перемещение карточки в «Готово» тоже создаёт запись в журнале обслуживания, перенося её стоимость, если она была указана.",
      },
      { kind: "heading", text: "Документы" },
      {
        kind: "paragraph",
        text:
          "У документов (страховка, талон техосмотра и подобные) может быть срок действия — по мере его приближения появляется напоминание, так же как и для напоминаний по расстоянию.",
      },
    ],
  },
  {
    id: "api-access",
    number: "05",
    kicker: "АВТОМАТИЗАЦИЯ",
    title: "Доступ к API",
    lead:
      "Для скриптов или домашней автоматизации можно создать API-токен с ограниченным доступом на странице Аккаунт и вызывать тот же REST API, которым пользуется само приложение.",
    blocks: [
      { kind: "heading", text: "Создание токена" },
      {
        kind: "paragraph",
        text:
          "Задайте метку и уровень доступа — чтение или запись — на странице Аккаунт. Токен показывается один раз, в момент создания; сохраните его сами, повторно он не отображается.",
      },
      { kind: "heading", text: "Использование" },
      {
        kind: "code",
        text:
          'curl https://your-instance.example/api/v1/vehicles \\\n  -H "Authorization: Bearer <your-token>"',
      },
      {
        kind: "note",
        text:
          "Токен только для чтения не может выполнять запись, даже если сформировать запрос вручную. Отозвать токен можно в любой момент на странице Аккаунт — он перестаёт работать немедленно.",
      },
    ],
  },
  {
    id: "self-hosting",
    number: "06",
    kicker: "РАЗВЁРТЫВАНИЕ",
    title: "Self-hosting",
    lead:
      "odograph полностью работает на стеке Cloudflare с щедрым бесплатным тарифом (Workers, D1, R2, KV). Вы можете развернуть свой собственный экземпляр в своём аккаунте Cloudflare.",
    blocks: [
      { kind: "heading", text: "Как это разворачивается" },
      {
        kind: "paragraph",
        text:
          "Развёртывание — это обычные команды `wrangler`, запускаемые с вашей машины в ваш собственный аккаунт Cloudflare — образа Docker нет, и перед приложением не стоит сторонний шлюз аутентификации.",
      },
      {
        kind: "list",
        items: [
          {
            label: "Подготовка — ",
            text: "одна база D1, один namespace KV, один bucket R2.",
          },
          {
            label: "Миграции — ",
            text: "примените входящие в поставку миграции, чтобы создать схему.",
          },
          {
            label: "Настройка — ",
            text:
              "вход через Google опционален; для отправки почты (ссылка для входа и напоминания) нужен включённый Cloudflare Email Routing на вашем домене.",
          },
          {
            label: "Развёртывание — ",
            text: "сборка и `wrangler deploy`. Ваш экземпляр в сети.",
          },
        ],
      },
      {
        kind: "note",
        text:
          "Это краткая сводка — полная пошаговая инструкция с точными командами находится в `docs/self-hosting.md` проекта на GitHub.",
      },
    ],
  },
];
