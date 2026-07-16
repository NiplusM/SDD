# Аудит соответствия PRD Code Notes и реализации

Исходный PRD: `plugins/llm/codeNotes/prd.md`

Основные проверенные области реализации:
- `plugins/llm/codeNotes/`
- `plugins/llm/chat/src/com/intellij/ml/llm/core/chat/codeNotes/`
- напрямую связующая логика чата, настроек и ввода, используемая этими областями

## Проверенные пункты

### 1. Глобальный переключатель функции

Статус: в основном реализовано, но есть дополнительный глобальный gate через registry.

PRD ожидает настройки отдельно для поверхностей файлов и diff. В реализации также есть глобальный registry-ключ `llm.code.notes.enabled`; когда он выключен, весь UI отключается независимо от настроек отдельных поверхностей.

Соответствующая реализация:
- `CodeNoteIntegration.isFeatureEnabled()`
- `CodeNotesHighlighterService.isCodeNotesUiEnabled()`
- `CodeNoteDiffExtension.onViewerCreated()`

Отличие:
- PRD не упоминает глобальный kill switch в registry.


### 3. Переключатели в настройках

Статус: частично реализовано.

PRD говорит, что настройки должны находиться в `Tools > AI Assistant > Comments`, с двумя независимыми переключателями:
- `Enable Comments in Files`
- `Enable Comments in Diffs`

В реализации есть два независимых переключателя, добавляемых `LLMCodeNotesSettings`, но их названия:
- `Create code notes from editors`
- `Create code notes from diff viewers`

Отличия:
- названия не совпадают с терминологией PRD;
- отдельный подраздел `Comments` пока не найден; текущая реализация добавляет настройки функции в существующий UI настроек AI.

### 4. Переключатели в меню `+` / меню input

Статус: частично реализовано.

PRD говорит, что меню `+` должно содержать:
- `Comments in Diffs`
- `Comments in Files`
- синюю точку до первого открытия;
- метки `New` у каждого пункта до клика по этому пункту.

В реализации есть два пути для тех же переключателей:
- `CodeNotesContextPopupContributor` добавляет элементы `CodeNotesToggleOption` в context popup AI-чата, когда включен registry `llm.chat.input.context.options.in.popup`;
- когда этот popup-режим выключен, те же опции доступны как действия в правой части toolbar input через `AIAssistantInputCodeNotesToggleAction` и `AIAssistantInputCodeNotesDiffToggleAction`.

Отличия:
- названия: `Enable File Comments` и `Enable Diff Comments`, а не `Comments in Files/Diffs`;
- состояние onboarding с синей точкой не найдено;
- `ToggleContextPopupItemVm.isNew` всегда false, поэтому добавленные toggle-элементы Code Notes не показывают PRD-метку `New` для отдельных пунктов.

### 5. Иконка в gutter на пустых строках

Статус: реализовано.

PRD говорит, что gutter-иконка на пустой строке скрыта по умолчанию и появляется при hover строки/gutter.

Реализация:
- `CodeNoteGutterHoverController` создает hover highlighter только когда наведен столбец gutter-иконок и на строке нет notes.

Функциональных отличий в проверенном фрагменте не найдено.

### 6. Gutter badge на строках с комментариями

Статус: частично реализовано.

PRD говорит, что строки с комментариями всегда показывают badge с balloon + count, а при hover badge визуально превращается в plus-иконку для быстрого добавления.

Реализация:
- всегда показывает count-иконку через `CodeNoteGutterCountIcon`;
- действие клика по badge со счетчиком может создать еще один note, если создание разрешено.

Отличия:
- визуального превращения count badge в plus при hover не найдено; остается иконка со счетчиком.
- действие добавления есть, но PRD-специфичная hover UI с plus отсутствует.

### 7. Базовая логика composer

Статус: в основном реализовано.

Реализовано:
- inline inlay composer/card;
- placeholder `Write a comment`;
- `Cancel`;
- пустой текст отключает primary action;
- textarea растет до максимальной высоты, затем скроллится;
- для начального draft запрашивается focus;
- Esc отменяет;
- Ctrl/Command Enter отправляет.

Отличия:
- текст primary action для нового draft: `Add a Comment`, а не `Add to Current Chat Session` / `Add to {Chat Name}`;
- cancel по клику снаружи реализован для редактирования существующего note, но для нового draft это не подтверждено.

### 8. Создание для одной строки и диапазона

Статус: в основном реализовано.

Реализовано:
- действие `Alt+Shift+K` существует;
- без выделения используется строка caret;
- выделение расширяется до полных выбранных строк;
- captions: `Comment on line N` / `Comments on lines A to B`.

Отличие:
- PRD говорит, что выбранный диапазон остается подсвеченным синим, пока composer открыт. Текущая реализация очищает range highlighter для drafts (`NoteUiBundle.updateDraft()` вызывает `clearRange()`), поэтому обещанная подсветка draft-range не найдена.

### 9. Target picker для новых комментариев

Статус: частично реализовано.

Реализовано:
- header draft может открыть target picker, когда есть несколько parent options;
- текущий чат, недавние чаты и `Create New Chat` доступны через `ChatCodeNoteParentOptionProvider`;
- выбор draft target меняет header.

Отличия:
- лимит недавних чатов равен 3, тогда как PRD говорит до 5;
- primary submit label не меняется на `Add to {Chat Name}`;
- `Create New Chat` показывается только когда `canAttachToNewChat(currentSession)` возвращает true, тогда как PRD описывает его как footer action в picker;
- picker находится в header, а не рядом с primary submit.

### 10. Target picker при редактировании

Статус: не реализовано.

PRD говорит, что edit mode сохраняет target picker и позволяет переместить комментарий в другой чат.

Реализация:
- backend имеет `moveNote`;
- RPC имеет `MoveCodeNoteRequestDto`;
- frontend-действия существующей card вызывают только `updateNote(text)` и `deleteNote()`;
- `CodeNoteCardModel.canChooseDraftTarget` true только для `NEW_DRAFT`.

Отличие:
- UI не позволяет при редактировании переместить note в другой чат.

### 11. Активные и неактивные комментарии

Статус: реализовано некорректно.

PRD говорит:
- активные комментарии показывают badge `Active Chat` и позволяют `Edit`, `Delete`;
- неактивные комментарии имеют muted header, без текстового badge, и `Edit`/`Delete` недоступны; клик по header переключает чат.

Реализация:
- визуальное состояние active/inactive есть через `ATTACHED_ACTIVE_PARENT` / `ATTACHED_INACTIVE_PARENT`;
- inactive header может открыть parent context;
- текст active badge: `Active {parentTypeShortName}`, например `Active Chat`.

Отличия:
- inactive comments все еще можно редактировать, потому что `isEditableAttachedState` включает `ATTACHED_INACTIVE_PARENT`;
- delete виден для inactive comments, потому что `isDeleteVisible` проверяет только not-new/not-sent плюс `canDelete`;
- меню показывает `To context` для inactive, а не только переключение через header, как описано.

### 12. Несколько комментариев на одной строке/диапазоне

Статус: реализовано.

Реализация хранит независимые notes и рендерит каждый note как отдельный inlay/card. Gutter count вычисляется подсчетом line icons из всех projections.

Функциональных отличий в проверенном фрагменте не найдено.

### 13. Attachment chips в input

Статус: частично реализовано.

Реализовано:
- комментарии для chat parent конвертируются в `CodeNotesContextAttachment`;
- attachments группируются по file path и origin (editor/diff);
- имя/icon/count chip различают editor и diff;
- удаление draft chip удаляет underlying live notes через `CodeNotesContextAttachment.onRemove()`.

Отличия:
- PRD говорит об одном chip на source, где source - это один diff tab или один file. Реализация группирует по `filePath + origin`; для diff notes ключ - только `filePath + DIFF`, поэтому комментарии из разных live diff contexts для одного файла могут схлопнуться в один chip, даже если их `before` version hash или diff side отличаются.
- При клике по такому grouped pending diff chip `CodeNotesContextAttachment.navigateToDiffNotes()` берет первый current note с origin `LiveDiff` и открывает реконструированный diff, используя сохраненную `before` version и side этого note. Другие diff contexts, сгруппированные в тот же chip, не используются для выбора открываемого diff.
- PRD требует hover preview с первыми 3 текстами комментариев и `+N more`; tooltip реализации - это только file path плюс count hint.
- PRD требует раскрытие multi-source chip через chevron; реализация уже разделяет по file/origin, и chevron/expanded source list не найден.

### 14. Отправка только с attachments

Статус: не реализовано как специфицировано.

PRD говорит, что Send включен, когда есть хотя бы один attachment chip, даже если input text пустой.

Реализация:
- `AIAssistantChatPanel.onInputSubmit()` сразу возвращается, когда `inputText.trim().isEmpty()`;
- `ChatCodeNotesService.ensureDefaultInputText()` обходит это, вставляя `Address the attached code notes.` в пустой input, когда добавлен code-notes attachment.

Отличие:
- отправка только attachments буквально не поддерживается. Вместо этого реализация вставляет default text.

### 15. Sent attachments и жизненный цикл после отправки

Статус: реализовано иначе, чем в PRD.

PRD говорит, что после отправки комментарии перестают быть drafts, остаются на своих строках, а sent attachment остается в history. Второй комментарий начинает новый chip, а ранее отправленные комментарии остаются видимыми на своих строках.

Реализация:
- отправка создает immutable `CodeNotesChatAttachment` / read-only context snapshot;
- после отправки `contextViewModel.clean()` / `clearContextStorage()` вызывает `onRemove()` на pending `CodeNotesContextAttachment`;
- `onRemove()` удаляет live notes из `CodeNotesService`.

Отличие:
- sent comments удаляются из live gutter storage после отправки, поэтому они не остаются на строках, как описывает PRD.

### 16. Навигация sent attachment

Статус: частично реализовано.

Реализовано:
- клик по draft chip по возможности ведет к live editor/diff notes;
- клик по sent/read-only attachment открывает текстовое представление rendered prompt.

Отличия:
- PRD говорит, что клик по sent chip открывает соответствующий diff/file, при необходимости открывает AI chat, скроллит к строке комментария и фокусирует popup.
- Текущий read-only/sent path не переходит к исходному diff/file/comment; он открывает light virtual file `.code-notes.txt`.

### 17. Promo banner для file comments

Статус: частично реализовано.

Реализовано:
- текст/action notification существуют: `You can now leave comments directly on editor files.` / `Enable File Comments`;
- клик включает editor/file comments.

Отличия:
- PRD говорит, что banner появляется, когда пользователь уже отправил хотя бы одно сообщение с code comments и затем добавляет новый diff comment.
- Реализация показывает его на любом созданном note, чей parent - loaded chat, если file comments disabled и notification еще не был показан глобально. Проверок diff surface, new-vs-edit, существующего sent message или хотя бы одного total chat comment после операции не найдено.
- Dismissal сохраняется глобально (`PropertiesComponent`), а не только для текущей chat session, как говорит PRD.

### 18. Shortcut tooltip

Статус: частично реализовано.

Реализовано:
- существует одноразовый shortcut hint;
- одноразовое состояние хранится в `PropertiesComponent`.

Отличия:
- текст PRD: `A comment can be added from the keyboard: ⌥⇧K`.
- текст реализации: title `Add comments faster`, body `Press {shortcut} from the editor`.

### 19. Analytics events

Статус: не найдено.

PRD перечисляет события вроде `ai_comment_composer_opened`, `ai_comment_added`, `ai_comment_deleted`, события settings toggle, banner events и shortcut hint events.

Выделенного analytics logging для этих PRD-событий в проверенных путях реализации не найдено.

### 20. Gutter context menu Enable/Disable

Статус: не найдено.

PRD говорит, что gutter context menu должен содержать:
- `Enable Diff Comments` / `Disable Diff Comments`
- `Enable File Comments` / `Disable File Comments`

Результаты поиска:
- эти строки найдены только в PRD, но не в implementation resources/actions.
- `CreateCodeNoteAction` существует только как keyboard action (`AIAssistant.CodeNotes.CreateNote`).

Отличие:
- действий gutter context-menu для включения/выключения file или diff comments не найдено.

### 21. Отключение surface с существующими комментариями

Статус: реализовано некорректно.

PRD говорит, что отключение surface скрывает gutter controls, badges и popups для этой surface, но уже созданные comments остаются в storage, attachment chips остаются видимыми, а comments возвращаются при повторном включении surface.

Реализация:
- per-surface settings проверяются только `CodeNotesHighlighterService.isCreationEnabled()`;
- когда setting выключается, `refreshCreationAffordances()` удаляет open drafts и обновляет gutter icons;
- existing note projections/cards все еще reconciled и rendered.

Отличие:
- отключение `codeNotesInEditorEnabled` или `codeNotesInDiffEnabled` запрещает создавать новые notes, но не скрывает existing gutter badges/popups для этой surface.

### 22. Закрытие открытого composer при отключении surface

Статус: реализовано для drafts.

PRD говорит, что изменение setting при открытом composer закрывает composer без сохранения, если его surface отключается.

Реализация:
- `CodeNotesHighlighterService.applyCreationSettings()` вызывает `refreshCreationAffordances()`;
- `BindingState.refreshCreationAffordances()` вызывает `disposeDrafts()`, когда creation disabled для binding.

Функциональных отличий для draft composers не найдено.

### 23. Scope diff integration

Статус: реализовано шире, чем PRD.

PRD описывает agent-generated diffs внутри active agent session.

Реализация:
- `CodeNoteDiffExtension` устанавливается на любой `ContentDiffRequest`, который можно извлечь как live diff с current file справа и document/empty content слева;
- проверки, что diff относится к agent-generated change или active agent review session, не найдено.

Отличие:
- когда diff creation включен, комментарии могут появляться в более широком классе live diff viewers, чем описывает PRD.

### 24. Видимость комментариев после переключения session

Статус: в основном реализовано.

PRD говорит, что comments остаются видимыми между sessions, но только comments выбранной session являются Active; comments других sessions - Inactive.

Реализация:
- notes хранятся по parent chat session;
- `EditorUiState.cardState()` сравнивает note parent с `parentSelection.activeParent`;
- смена focused chat обновляет parent selection и перерендеривает cards.

Отличие:
- поскольку inactive cards все еще editable/deletable, визуальная часть active/inactive существует, но permissions не совпадают с PRD. См. пункт 11.

### 25. Draft chips при переключении session

Статус: реализовано.

PRD говорит, что attachment chips в input показывают только comments активной session; переключение chat скрывает draft chips предыдущей session.

Реализация:
- `ChatCodeNotesService.refreshState()` индексирует focused/recent chats отдельно;
- `createAttachments(session)` использует только `notesForChat(session)`;
- `pendingAttachments(session)` фильтрует по `parentRef == session.toCodeNoteParentRef()`.

Функциональных отличий в проверенном фрагменте не найдено.

### 26. Сохранение комментариев в chat history

Статус: реализовано.

PRD говорит, что sent comment history сохраняется внутри chat history.

Реализация:
- `CodeNotesChatAttachment` хранит `CodeNotesAttachmentPayload`, включая notes и rendered prompt;
- `ChatSessionStorage` сериализует typed attachment payload JSON и восстанавливает `CodeNotesChatAttachment`.

Отличий по persistence не найдено, но навигация из restored/sent attachments отличается от PRD. См. пункт 16.

### 27. Close button у sent attachment

Статус: реализовано.

PRD говорит, что sent chips в message history не имеют кнопки `x` и не могут быть удалены через chip.

Реализация:
- `MessageAttachmentView` для sent message attachments рендерит icon/name/count и click/tooltip handling;
- в отличие от input `ContextAttachmentView`, close button не добавляется.

Функциональных отличий в проверенном фрагменте не найдено.

### 28. Визуальное различие File и Diff attachment

Статус: реализовано.

PRD говорит, что attachment chips в input/history должны различать diff source и file source по icon/name.

Реализация:
- `CodeNotesAttachmentOrigin.EDITOR` использует `CollaborationToolsIcons.Comment`;
- `CodeNotesAttachmentOrigin.DIFF` использует `AllIcons.Actions.Diff`;
- diff presentation name: `Diff {fileName}`.

Функциональных отличий в проверенном фрагменте не найдено.

### 29. Gutter badges для range comments

Статус: не реализовано как специфицировано.

PRD говорит, что комментарий на диапазон строк логически является одним комментарием, но badges появляются в gutter у каждой строки диапазона.

Реализация:
- каждая note projection производит один `CodeNoteLineGutterIcon`;
- `NoteUiBundle.lineGutterIcon()` возвращает только `inlayLine`;
- `presentationLine()` - одна строка, обычно строка, содержащая конец диапазона.

Отличие:
- range comments получают один gutter badge на одной presentation line, а не badges на каждой строке выбранного диапазона.

### 30. Открытие существующего range comment из любой строки диапазона

Статус: не реализовано как специфицировано.

PRD говорит, что для range comment есть один popup независимо от того, из какой строки диапазона он был открыт.

Реализация:
- поскольку для диапазона рендерится только одна gutter icon, нет per-line range badge, чтобы открыть тот же popup из каждой строки.

Отличие:
- только presentation line имеет gutter affordance для range comment.

### 31. Existing range highlight

Статус: реализовано.

PRD говорит, что line/range должен оставаться привязанным к исходному диапазону, включая после редактирования.

Реализация:
- note anchor хранит `CodeNoteTextRange`;
- редактирование existing note обновляет только `CodeNoteUpdateDto(text = text)`;
- `NoteUiBundle.updateExisting()` использует `projection.exactRange`, чтобы отрисовать existing range highlighter, когда UI policy это позволяет.

Функциональных отличий по сохранению range existing note не найдено.

### 32. Отмена draft по клику снаружи

Статус: не реализовано как специфицировано.

PRD говорит, что `Cancel` или клик снаружи composer закрывает его без сохранения.

Реализация:
- `Cancel` и Esc отменяют draft;
- click-outside handling в `CodeNoteCardView` защищен `isEditingAttached`, поэтому применяется к редактированию существующего note, а не к новому draft composer.

Отличие:
- новый draft composer, похоже, не закрывается по клику снаружи.

### 33. Непрерывность между Diff/File tab

Статус: не реализовано как специфицировано.

PRD говорит, что comments сохраняют привязку к line/range при переключении между diff и обычными file tabs.

Реализация:
- regular editor bindings используют `CodeNoteProjectionContextDto.CurrentEditor`;
- diff bindings используют `CodeNoteProjectionContextDto.LiveDiff`;
- `CodeNotesService.getNotesForFile()` фильтрует notes по `anchor.origin.matches(projectionContext)`.

Отличие:
- note, созданный в live diff, имеет `CodeNoteOrigin.LiveDiff` и не проецируется в regular file editor с `CurrentEditor`; note, созданный в regular file, аналогично не проецируется в live diff.

### 34. Создание в stored / historical diff

Статус: намеренно не реализовано.

PRD говорит, что comments можно создавать в открытом diff во время active review flow. Он также обсуждает historical message attachments, которые ведут обратно к comments.

Реализация:
- creation разрешено только для `CurrentEditor` и `LiveDiff`;
- projection contexts `StoredEditor` и `StoredDiff` read-only для creation.

Отличие:
- historical/stored diff contexts могут рендерить existing notes из snapshots, но не могут создавать новые comments.

### 35. Отправка notes как agent context

Статус: реализовано.

PRD говорит, что агент получает comments как structured context, содержащий content комментария, code references и metadata.

Реализация:
- `CodeNotesContextAttachment.createChatAttachment()` строит `CodeNotesChatAttachment`;
- `CodeNotesPromptRenderingService` рендерит prompt с нумерованным списком notes и релевантными file/diff excerpts;
- selected text оборачивается в `NOTE` tags в rendered prompt.

Функциональных отличий в проверенном фрагменте не найдено.

### 37. Bulk delete draft chip

Статус: реализовано.

PRD говорит, что клик по `x` на draft chip batch-deletes все comments, включенные в этот chip; popups исчезают, gutter badges пересчитываются.

Реализация:
- удаление input context chip вызывает `ContextAttachmentVm.remove()`;
- он вызывает `AIChatContextViewModel.removeContextItem()`;
- `CodeNotesContextAttachment.onRemove()` удаляет из `CodeNotesService` все current notes, включенные в attachment;
- change subscriptions затем удаляют projections/gutter state.

Функциональных отличий в проверенном фрагменте не найдено.

### 38. Удаление одного комментария из card menu

Статус: реализовано для cards, но permissions отличаются для inactive comments.

PRD говорит, что `... -> Delete` удаляет ровно один active-session comment и пересчитывает gutter/attachment counters.

Реализация:
- `CodeNoteDeleteAction` вызывает `CodeNoteCardModel.deleteNote()`;
- actions existing card вызывают `CodeNotesRemoteApi.deleteNote()`;
- note change subscriptions и chat attachment sync пересчитывают UI state.

Отличие:
- поскольку inactive comments тоже могут показывать delete, это не ограничено active-session comments. См. пункт 11.

### 39. Редактирование одного комментария

Статус: частично реализовано.

PRD говорит, что editing восстанавливает text и line/range caption; сохранение обновляет только text, если target picker не перемещает comment.

Реализация:
- compact existing card может войти в edit mode по клику / Enter / F2;
- gear menu group `AIAssistant.CodeNotes.Card.More` содержит `ToContext` и `Delete`, но не содержит action `Edit`;
- save вызывает `CodeNotesRemoteApi.updateNote()` с `CodeNoteUpdateDto(text = text)`;
- исходный range сохраняется, потому что обновляется только text.

Отличия:
- PRD явно требует `... -> Edit` для active comments, но в текущем gear menu пункт `Edit` не найден;
- edit доступен для inactive comments;
- edit mode не может переместить comment в другой chat. См. пункт 10.

### 40. Вход из message card / history attachment обратно к diff

Статус: не найдено как специфицировано.

PRD говорит, что diff можно открыть из agent message card и из attachment chip в message history, ведущего обратно к comment.

Найденная реализация:
- восстановление code-notes sent attachment существует через `CodeNotesChatAttachment.restore()`;
- click по message-history attachment вызывает `CodeNotesContextAttachment.performAction(isInMessage = true)`;
- этот path открывает текстовое представление, а не исходный diff/file/comment.

Отличие:
- в проверенных путях не найдено реализации, где sent history chip ведет обратно к comment popup в исходном diff/file.

### 41. Открытие chat из comment header

Статус: частично реализовано.

PRD говорит, что клик по header неактивного comment открывает AI chat при необходимости и переключает на эту session; клик по active comment при закрытом AI chat открывает chat на той же session.

Реализация:
- headers existing note получают callback `openParent` из `EditorUiState.parentHeader()`;
- `ChatCodeNoteParentType.openParent()` вызывает `AIAssistantChatUtil.openChat(project, session)`;
- `ContextHeaderButton` вызывает этот callback при клике по header.

Отличия:
- это реализовано как header action, а не как клик по всей comment card; клик по compact card начинает редактирование, когда card editable;
- inactive comments также показывают gear-menu action `To context`, который PRD явно относит к out of scope / alternative behavior.

### 42. Навигация по pending draft attachment click

Статус: частично реализовано.

PRD говорит, что клик по draft chip открывает source diff/file, открывает AI chat при необходимости, скроллит к строке с comment и фокусирует popup.

Реализация:
- клик по pending editor attachment открывает файл через `OpenFileDescriptor` на offset первого note;
- клик по pending diff attachment реконструирует live diff и задает `DiffUserDataKeys.SCROLL_TO_LINE`.

Отличия:
- явного focus/open соответствующего comment popup/card после навигации не найдено;
- явного path открытия/фокуса AI-chat tool-window внутри pending attachment click не найдено.

### 43. Hover preview sent attachment

Статус: не реализовано как специфицировано.

PRD говорит, что hover sent chip показывает тот же text preview, что и draft chip: title `Comment` / `Comments · N`, первые 3 текста comments и `+N more`; для multi-source-without-text показывает компактный source list.

Реализация:
- `CodeNotesContextAttachment.tooltipText` - только `filePath`;
- `tooltipDescriptionText` / `popupHintText` - count-only hints;
- read-only/sent attachments все еще используют те же presentation fields `CodeNotesContextAttachment`.

Отличие:
- hover sent chip не показывает preview текста комментариев или source-list preview, описанные в PRD.

### 44. Markers Active и Selected в target picker

Статус: не реализовано как специфицировано.

PRD говорит, что target picker помечает currently open chat как active и currently selected target как selected.

Реализация:
- `CodeNoteDraftParentOption` хранит `isActive`;
- `CodeNoteCardModel` хранит selected option;
- `CodeNoteCardView.createDraftTargetActions()` создает plain popup actions только с title/icon.

Отличие:
- UI marker/check/state в target picker для active chat или currently selected target не найден.

### 45. Порядок отображения нескольких комментариев

Статус: реализовано для PRD-сценария same-line/same-range.

PRD говорит, что несколько comments на одной строке/диапазоне рендерятся как отдельные popups в порядке создания.

Реализация:
- `EditorUiState.sortedNotes()` сортирует по presentation line, range start/end, `createdAtEpochMillis`, затем note id;
- для comments на одной строке/диапазоне это дает порядок создания.

Функциональных отличий для same-line/same-range ordering не найдено.

### 46. Добавление еще одного комментария без закрытия существующих

Статус: в основном реализовано.

PRD говорит, что клик по plus на строке с existing comments открывает новый composer под existing popup без закрытия existing popups.

Реализация:
- counted gutter badge имеет add action, когда creation разрешено;
- `EditorUiState.requestNewNote()` отменяет другие open drafts, но projections/cards existing notes не удаляются;
- после сохранения пересчитываются note list и attachment counter.

Отличие:
- поведение существует, но отсутствует PRD hover morph в видимую plus icon. См. пункт 6.

### 47. Click-outside behavior composer при редактировании

Статус: реализовано иначе, чем в PRD.

PRD говорит, что `Cancel` или клик снаружи composer закрывает его без сохранения; для editing также сказано, что canceling edit не меняет comment.

Реализация:
- click-outside/focus-out handling применяется только при редактировании existing attached note;
- `finishEditingAttached()` сохраняет edit при outside click/focus loss, когда primary action enabled;
- если текст отличается только trailing spaces, он восстанавливает saved text.

Отличие:
- outside click при редактировании может сохранить измененный comment вместо отмены без сохранения.

### 48. Размещение composer / влияние на layout

Статус: реализовано иначе, чем формулировка PRD.

PRD говорит, что composer открывается inline прямо под target line/range без сдвига кода.

Реализация:
- comment cards устанавливаются через `editor.addComponentInlay(...)` с `ComponentInlayRenderer`;
- это editor inlay, занимающий место в layout над/под строкой, а не floating popup overlay.

Отличие:
- реализация, похоже, использует layout-affecting inlay, а не popup без сдвига.

### 49. Отправка пустого комментария

Статус: реализовано.

PRD говорит, что пустой comment отключает primary submit и empty comments не отправляются.

Реализация:
- `CodeNoteCardModel.isPrimaryActionEnabled` проверяет `normalizedText.isNotBlank()`;
- `attachToParent()` и `updateNote()` также отклоняют blank normalized text.

Функциональных отличий в проверенном фрагменте не найдено.

### 50. Delete необратим

Статус: реализовано.

PRD говорит, что удаленные comments нельзя восстановить и их нужно создать заново.

Реализация:
- menu delete и chip delete вызывают `CodeNotesService.deleteNote(...)`;
- path undo/restore для deleted notes не найден.

Функциональных отличий в проверенном фрагменте не найдено.

### 51. Текущие тесты, закрепляющие отличающееся поведение

Статус: поведение реализации покрыто тестами, включая часть поведения, которое отличается от PRD.

Примеры:
- `ChatCodeNotesServiceTest.test parent options include current chat title and three recent chats` закрепляет текущий лимит 3 recent chats, тогда как PRD говорит до 5.
- `CodeNotesContextAttachmentTest.test sent code notes attachment opens text representation` закрепляет открытие `.code-notes.txt` при клике по sent attachment, тогда как PRD говорит о навигации обратно к source comment.
- `CodeNotesContextAttachmentTest.test removing pending code notes attachment deletes live notes` закрепляет удаление live notes при удалении chip.
- `ChatCodeNotesServiceTest.test file comments notification is shown once and enables editor comments` закрепляет текущее глобальное one-time promo behavior, а не PRD-условия для текущего chat/session.

Отличие:
- несколько несоответствий PRD не являются случайными пробелами аудита; это текущий протестированный контракт реализации.

### 52. Открытые вопросы и out-of-scope разделы

Статус: реализация не требуется PRD.

PRD явно помечает эти области как open questions или out of scope:
- unresolved feedback indicator в VCS/file-tree;
- состояния Pending и Archive во время/после agent processing;
- поведение при rebase, file rename или удалении исходных строк;
- повторная отправка already-sent comments в новый chat без их повторного создания;
- агрегированный comment counter на editor-tab.

Для этих разделов отличия реализации не учитывались.
