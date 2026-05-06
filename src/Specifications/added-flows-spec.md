# Spec: Added Flows Overview And Reproduction Guide

## Goal

Зафиксировать, какие флоу сейчас реализованы в прототипе SDD / Agent Tasks, как их воспроизвести вручную, что именно они делают в UI и какие нюансы текущей реализации важно учитывать.

Документ описывает текущее наблюдаемое поведение. В этом snapshot нет `.git`, поэтому здесь "добавленные флоу" понимаются как флоу, которые явно оформлены в коде, в формальной модели и в автоматизированном JVM-сценарии.

## Source Of Truth

Основные источники для этого документа:

- `flow.md` - формальная модель исполнения спеки
- `src/Specifications/spec-flow.md` - lifecycle draft/spec/executed
- `src/Specifications/jvm-scenario-reproduced.md` - автоматизированный сценарий поверх текущего UI
- `src/App.jsx` - основной UI и состояния Agent Tasks
- `src/PlanDiffView.jsx` - diff view и inline review comments

## Preconditions

Для ручного воспроизведения:

1. Приложение запущено локально через `npm run dev`.
2. Открыт welcome screen или уже существующая задача в Agent Tasks.
3. Видны левая панель `Agent Tasks`, editor tab со spec и toolbar с `Build` / `Specify`.

Для автоматизированного воспроизведения:

1. Можно использовать встроенный Playwright-сценарий: `npm run scenario:jvm`.
2. Если dev server уже поднят отдельно, можно переиспользовать его:

```bash
SCENARIO_URL=http://127.0.0.1:5174/ npm run scenario:jvm -- --reuse-existing
```

3. Скриншоты сценария сохраняются в `test-results/jvm-scenario`.

## Short Summary

| Flow | Trigger | Main result |
| --- | --- | --- |
| New task + Specify | `New Agent Task`, затем `Specify` | Из prompt получается структурированная spec |
| Inspection + Fix + Specify | Quick fix или comment, затем `Specify` | Spec перегенерируется с учетом замечаний |
| Full Build | `Build` без выделения | Запускается полный execution cycle задачи |
| Partial Build | Выделение checkbox-пунктов + toolbar `Build` | Перепроверяются только выбранные пункты |
| Stop | `Stop` во время build | Активный build прерывается |
| Diff review | Комментарий в diff | Feedback синкается обратно в target spec item |
| Parallel tasks | Переключение между tabs / Agent Tasks | Несколько задач ведутся независимо |
| Extract to subtask | 2+ выбранных пункта + `Extract` | Создается дочерняя subtask-spec |
| Spec Flow picker | Выбор `New Feature` / `Bug Fix` / `Refactoring` | Выбирается и открывается instruction file |
| Add to project context | Кнопка в success banner | Результат / файл добавляется в project context |
| JVM scenario | `npm run scenario:jvm` | Автоматически проходит ключевые демо-биты |

## Flow 1. New Agent Task And Initial Spec Generation

### What problem it solves

Этот флоу переводит свободный текстовый запрос в структурированную рабочую spec, которую дальше можно инспектировать, улучшать и запускать.

### How to reproduce manually

1. На welcome screen нажать `New Agent Task`.
2. Откроется новый tab `New Task.md` и соответствующая запись появится в `Agent Tasks`.
3. Ввести prompt в editor area.
4. Нажать `Specify`.
5. Если появляется permission popup, разрешить выполнение.
6. Дождаться, когда вместо specify state появится обычный toolbar со spec и кнопкой `Build`.

### What it does

- Создает новую задачу в дереве Agent Tasks.
- Открывает editor tab для markdown-задачи.
- Берет текущий prompt и текущее содержимое editor area.
- Передает их в pipeline генерации.
- После завершения Specify UI показывает структурированную spec, а не просто текстовый prompt.

### What user sees after completion

- Spec в формате `Goal / Acceptance Criteria / Plan / ...`.
- Доступные действия `Build` и, при отсутствии новых правок, заблокированный `Specify`.
- Возможность перехода к инспекциям, комментариям и запуску.

### Notes

- Тот же entry point доступен с welcome screen и через левую панель Agent Tasks.
- В JVM-сценарии этот флоу используется как первый beat всей демо-последовательности.

## Flow 2. Spec Inspection, Quick Fixes, Comments And Specify

### What problem it solves

После генерации spec почти всегда требует уточнений: некоторые acceptance criteria могут быть двусмысленны, в плане может не хватать шагов, а пользователь может захотеть явно задать ограничения через комментарии.

### How to reproduce manually

1. Открыть уже сгенерированную spec.
2. Нажать на summary / issues counter в inspection area.
3. Выбрать проблемный AC или Plan item.
4. Либо открыть quick actions и применить fix, либо оставить комментарий на строке spec.
5. Дождаться, пока `Specify` станет активным и получит attention state.
6. Нажать `Specify`.

### What it does

- Фиксирует пользовательские правки и комментарии как pending changes.
- Помечает spec как требующую следующего Specify.
- По `Specify` запускает повторную генерацию с учетом сделанных правок.
- После успешного `Specify` очищает pending state и возвращает spec в "чистое" specified-состояние.

### What changes in the UI

- После edit/comment `Specify` становится доступным.
- После `Specify` прежние execution statuses и changed files сбрасываются.
- Обновленная spec становится новой базовой версией для следующих build.

### Practical value

Этот флоу отделяет "первую генерацию" от "доведения спеки до исполнимого вида". По сути это основной цикл уточнения между пользователем и агентом до того, как spec реально запускается.

## Flow 3. Full Build Of The Spec

### What problem it solves

Позволяет прогнать всю задачу целиком, а не отдельные пункты, и получить актуальные статусы по плану и acceptance criteria.

### How to reproduce manually

1. Убедиться, что никакие checkbox-пункты не выделены.
2. Нажать `Build` в toolbar.
3. Наблюдать, что `Build` меняется на `Stop`.
4. Дождаться завершения execution cycle.

### What it does

С точки зрения формальной модели:

- все checkbox items временно переводятся в `Outdated`
- запускается один активный build
- агент последовательно исполняет пункты
- по мере поступления результата item получает свежий статус
- после завершения становятся доступны changed files и diff

### What user sees after completion

- Статусы `Passed / Failed / Warning` у исполненных пунктов.
- Inspection widget с результатами.
- Возможность открыть diff после хотя бы одного build.

### Important nuance

В документации full build описан как execution всей spec. В UI это основной toolbar build без selection, то есть "запустить текущий полный execution cycle задачи".

## Flow 4. Partial Build And Selection Model

### What problem it solves

Позволяет не перепроходить всю spec после локального изменения, а перезапустить только нужные пункты.

### How to reproduce manually

1. Навести курсор на gutter у checkbox-строки.
2. Выделить один или несколько AC / Plan items.
3. При необходимости выбрать parent item, чтобы дети подтянулись визуально вместе с ним.
4. Нажать toolbar `Build`; если выбрано больше одного пункта, label будет `Build N`.
5. Дождаться завершения локального rebuild.

### What it does

- Selection доступен у всех checkbox items, не только у top-level.
- Если выделен parent, nested children тоже считаются выделенными визуально.
- При старте partial build выделенные пункты идут в execution.
- Невыбранные пункты получают `Outdated` как display modifier.
- Selection очищается сразу после запуска.

### Expected result

- Пользователь получает свежие статусы только для выбранных пунктов.
- Все остальные пункты сохраняют прошлый статус, но выглядят как `Outdated`.
- Toolbar label меняется с `Build` на `Build N`, если выделено больше одного элемента.

### Why this matters

Это ключевой флоу для итеративной работы со spec: он делает re-check адресным и дешевым по времени, а не глобальным.

## Flow 5. Stop Active Build

### What problem it solves

Позволяет прервать текущий build, если пользователь понял, что запустил не тот сценарий, хочет скорректировать spec или не хочет ждать окончания полного цикла.

### How to reproduce manually

1. Запустить `Build`.
2. Пока build активен, нажать `Stop`.

### What it does

- Передает агенту сигнал остановки.
- Завершает активный build.
- Возвращает toolbar button из `Stop` обратно в `Build`.
- Оставляет частичный результат там, где он уже успел появиться.

### Expected result

- Уже обновленные статусы остаются.
- Пункты, по которым агент еще не успел вернуть результат, остаются без нового финального статуса.
- Changed files могут остаться частичными.

## Flow 6. Diff Review And Comment Sync Back To The Spec

### What problem it solves

Флоу связывает code review с исходной spec: замечание, оставленное на diff-строке, не теряется в отдельном review-экране, а возвращается к соответствующему пункту плана или AC.

### How to reproduce manually

1. Сначала выполнить хотя бы один build.
2. Открыть diff для нужного plan item или changed file.
3. В diff выбрать конкретную строку и открыть comment toggle.
4. Ввести комментарий и сохранить его.
5. Вернуться в tab со spec.

### What it does

- Сохраняет inline diff comment на строке diff.
- Преобразует этот комментарий в comment entry, привязанный к target spec item.
- Синхронизирует данные обратно в состояние Agent Task.
- Делает review feedback частью контекста задачи, а не отдельно висящим замечанием.

### What user sees after completion

- Комментарий начинает жить не только в diff, но и в состоянии самой spec.
- Его можно агрегировать вместе с обычными spec comments.
- Следующий `Specify` или rebuild может учитывать это замечание как входное уточнение.

### Practical value

Этот флоу делает code review продолжением spec-driven цикла: сначала формулировка, потом исполнение, потом diff-review, потом обратная связь опять на уровень spec.

## Flow 7. Parallel Tasks And Task Switching

### What problem it solves

Прототип поддерживает не одну линейную задачу, а несколько соседних agent tasks, между которыми можно переключаться без потери состояния.

### How to reproduce manually

1. Открыть `visit-booking.md`.
2. Затем через Agent Tasks открыть `vet-schedules.md` или другую задачу.
3. Выполнить для второй задачи `Specify` или `Build`.
4. Вернуться обратно к первой задаче.

### What it does

- Держит отдельные состояния по задачам: code, document sections, comments, build status, diff state, selected items.
- Позволяет переключаться между tabs без сброса уже набранного контекста.
- Поддерживает сценарий, где одна задача основная, а другая идет параллельным треком.

### Expected result

- Переключение между задачами не смешивает их данные.
- Каждая задача сохраняет собственную lifecycle-историю.
- Agent Tasks panel работает как навигация по нескольким независимым specs.

## Flow 8. Extract To Subtask

### What problem it solves

Если часть spec становится слишком крупной или логически отдельной, ее можно вынести в дочернюю подзадачу вместо того, чтобы держать все в одном документе.

### How to reproduce manually

1. Выделить минимум два checkbox-пункта в spec.
2. Убедиться, что в toolbar появилась кнопка `Extract`.
3. Нажать `Extract`.
4. Посмотреть новый дочерний элемент в Agent Tasks tree и новый editor tab.

### What it does in the current implementation

- Берет тексты выбранных AC / Plan items.
- Генерирует slug-подобное имя файла на основе первого выбранного пункта.
- Создает дочернюю markdown-задачу.
- Копирует выбранные пункты в минимальный subtask document.
- Открывает subtask в отдельном tab.
- Ставит `pendingExtractSpecify` и на subtask, и на parent task.

### Expected result

- В дереве задач появляется дочерний subtask.
- Новый subtask можно отдельно открыть, доработать и запускать.
- У subtask и parent загорается `Specify`, потому что оба документа требуют следующего шага:
  - subtask нужно развернуть из сырой копии в полноценную spec
  - parent нужно позже связать с subtask вместо прямого дублирования пунктов

### Important nuance

Формальная модель описывает более широкий сценарий, включая подстановку ссылок и связь родителя с дочерней spec. Текущий код уже делает базовую механику создания дочерней задачи и pending state, но сам смысловой "довод" происходит на следующем `Specify`.

## Flow 9. Spec Flow Picker

### What problem it solves

Позволяет выбрать тип instruction flow, по которому пользователь хочет формировать задачу: `New Feature`, `Bug Fix` или `Refactoring`.

### How to reproduce manually

1. Открыть spec или пустую задачу.
2. В toolbar нажать на picker `Spec Flow`.
3. Выбрать одну из опций.
4. При желании открыть соответствующий instruction file.

### What it does

- Показывает список доступных instruction files.
- Переключает выбранную опцию в локальном UI state.
- Дает открыть конкретный markdown-instruction для чтения.

### Important nuance

Формальная модель предполагает, что следующий build / specify использует выбранный Spec Flow как правило исполнения. В текущем коде picker точно существует и хранит selected option в UI, но явной передачи этого выбора в specify / build handler сейчас не видно. Поэтому на текущем этапе это в первую очередь selector + opener для instruction file, а не полностью проведенный execution input.

## Flow 10. Add To Project Context

### What problem it solves

После успешного execution / review пользователь может захотеть вынести полезный результат в project context, чтобы использовать его дальше как часть общего рабочего контекста.

### How to reproduce manually

1. Дойти до состояния, в котором поверх spec появляется success banner.
2. Если banner показывает action `Add to project context`, нажать его.

### What it does

- Берет рекомендованный контекстный файл / артефакт из текущего состояния задачи.
- Добавляет его в project context через attach-механику.
- Скрывает повторный показ этого banner action для текущего состояния.

### Important nuance

Кнопка показывается не всегда. В JVM-сценарии она нажимается только если реально видна в UI. Это не универсальный обязательный шаг, а условный финализирующий action.

## Flow 11. Automated JVM Scenario

### What problem it solves

Этот сценарий нужен для воспроизводимого демо и для быстрой проверки, что ключевые UI-флоу не сломались.

### How to reproduce automatically

Вариант 1, сценарий сам поднимет сервер:

```bash
npm run scenario:jvm
```

Вариант 2, переиспользовать уже поднятый сервер:

```bash
SCENARIO_URL=http://127.0.0.1:5174/ npm run scenario:jvm -- --reuse-existing
```

### What it covers

Сценарий автоматизирует следующие биты:

1. Создание новой задачи и первичную генерацию spec.
2. Инспекции, quick fixes, комментарии и `Specify`.
3. Первый `Build`.
4. Открытие diff и добавление review comment.
5. Переключение на параллельную задачу `vet-schedules.md`.
6. Возврат к `visit-booking.md`, повторный `Build` и условный `Add to project context`.

### Result

- Сценарий воспроизводит текущую демо-последовательность в браузере через Playwright.
- Ключевые состояния сохраняются в виде скриншотов.
- Это самый близкий к "официальному demo flow" автоматизированный маршрут в текущем проекте.

## Recommended Reading Order

Если нужно быстро понять систему сверху вниз, лучше идти в таком порядке:

1. `Flow 1` - откуда берется spec
2. `Flow 2` - как spec дорабатывается
3. `Flow 3` и `Flow 4` - как spec исполняется полностью и частично
4. `Flow 6` - как code review возвращается обратно в spec
5. `Flow 7` и `Flow 8` - как система масштабируется на несколько задач
6. `Flow 9` и `Flow 10` - дополнительные управляющие флоу
7. `Flow 11` - как все это воспроизвести автоматически

## Acceptance Criteria

1. Для каждого ключевого флоу выше есть ручной способ воспроизведения.
2. Для каждого ключевого флоу описан его практический эффект, а не только UI-клик.
3. Документ различает формальную модель и текущее наблюдаемое поведение там, где между ними есть зазор.
4. Документ можно использовать как краткий briefing для product / design / QA без чтения всего `App.jsx`.
