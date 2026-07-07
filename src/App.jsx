import { Fragment, createElement, cloneElement, isValidElement, useState, useRef, useEffect, useLayoutEffect, useCallback, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { WelcomeProjectsPanel, WelcomeGradientArea } from './WelcomeScreen.jsx';
import {
  PlanDiffEditorArea,
  arePlanDiffUiStatesEqual,
  normalizePlanDiffUiState,
} from './PlanDiffView.jsx';
import {
  ThemeProvider,
  MainWindow,
  MainToolbar,
  Banner,
  SettingsDialog,
  ToolWindow,
  PositionedPopup,
  Popup,
  PopupCell,
  Tooltip,
  Loader,
  Icon,
  IconButton,
  Button,
  Input,
  Checkbox,
  Tree,
  getIcon,
  iconRegistry,
  DEFAULT_EDITOR_TABS,
  DEFAULT_EDITOR_TAB_CONTENTS,
  DEFAULT_LEFT_STRIPE_ITEMS,
  DEFAULT_RIGHT_STRIPE_ITEMS,
  DEFAULT_PROJECT_TREE_DATA,
  DEFAULT_SETTINGS_TREE_ITEMS,
  defaultLeftPanelContent,
  defaultRightPanelContent,
  defaultBottomPanelContent,
} from '@jetbrains/int-ui-kit';
import './App.css';

const PROBLEMS_REFERENCE_VIEW_OPTIONS_ICON = 'problems/referenceViewOptions';

function ProblemsReferenceViewOptionsIcon(props) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke="#CED0D6" />
      <path d="M6.5 3V13" stroke="#CED0D6" strokeLinecap="round" />
      <path d="M8.5 5.5H11.5" stroke="#CED0D6" strokeLinecap="round" />
      <path d="M8.5 8H11.5" stroke="#CED0D6" strokeLinecap="round" />
      <path d="M8.5 10.5H11.5" stroke="#CED0D6" strokeLinecap="round" />
    </svg>
  );
}

iconRegistry[PROBLEMS_REFERENCE_VIEW_OPTIONS_ICON] = ProblemsReferenceViewOptionsIcon;

// ─── Data ────────────────────────────────────────────────────────────────────

const PROJECT_NAME = 'spring-petclinic';
const BRANCH_NAME = 'feature/visit-booking';
const PRIMARY_BREADCRUMBS = [PROJECT_NAME, 'src/main/java', 'VisitController.java'];
const TOOLBAR_INPUT_IS_EDITABLE = false;
const ATTACHED_FILES_SYNC_WITH_EDITOR = false;
const DIFF_TAB_ICON_NAME = 'vcs/diff';
const AGENT_TASK_LOADING_STATE_ENABLED = true;
const AGENT_TASK_GENERATING_STATE_ENABLED = true;
const AGENT_TASK_USES_INTERMEDIATE_STATES =
  AGENT_TASK_LOADING_STATE_ENABLED || AGENT_TASK_GENERATING_STATE_ENABLED;
const AGENT_TASK_LOADING_STEP_DELAY_MS = 1200;
const AGENT_TASK_CONTENT_MORPH_MAX_FRAMES = 24;
const AGENT_TASK_CONTENT_MORPH_INLINE_MAX_FRAMES = 18;
const AGENT_TASK_CONTENT_MORPH_STEP_DELAY_MS = 36;
const SPEC_DONE_SCROLL_SELECTOR = '.spec-done-scroll[data-overlay-scroll-body="true"]';
const ISSUE_INTENTION_POPUP_OPEN_DELAY_MS = 140;
const ISSUE_INTENTION_POPUP_GAP = 4;
const ISSUE_INTENTION_POPUP_WIDTH = 414;
const ISSUE_INTENTION_POPUP_OPEN_EVENT = 'spec-done-intention-popup-opened';
const SPEC_DONE_CLEAR_FOCUS_EVENT = 'spec-done-clear-focus';
const VISIT_BOOKING_PROMPT_TEXT = 'Book visits against a specific vet and time slot, with no double-booking';

function getSpecDoneScrollElement() {
  if (typeof document === 'undefined') return null;
  return document.querySelector(SPEC_DONE_SCROLL_SELECTOR);
}

function captureSpecDoneScrollSnapshot() {
  const scrollElement = getSpecDoneScrollElement();
  if (!scrollElement) return null;

  return {
    scrollTop: scrollElement.scrollTop,
    scrollLeft: scrollElement.scrollLeft,
  };
}

function scheduleSpecDoneScrollRestore(snapshot) {
  if (!snapshot) return;

  const restore = () => {
    const scrollElement = getSpecDoneScrollElement();
    if (!scrollElement) return;

    scrollElement.scrollTop = snapshot.scrollTop;
    scrollElement.scrollLeft = snapshot.scrollLeft ?? 0;
  };

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(restore));
    return;
  }

  setTimeout(restore, 0);
}

const MY_PROJECTS = [
  { id: '1', name: 'spring-petclinic', path: '~/projects/spring-petclinic', initials: 'SP', gradient: ['#22c55e', '#15803d'] },
  { id: '2', name: 'auth-module',     path: '~/projects/auth-module',     initials: 'AM', gradient: ['#8b5cf6', '#6d28d9'] },
  { id: '3', name: 'api-gateway',     path: '~/projects/api-gateway',     initials: 'AG', gradient: ['#10b981', '#059669'] },
];

const MY_EDITOR_TABS = [];
const MY_EDITOR_TAB_CONTENTS = {};

const PLAN_CODE_DIFF_PRESETS = {
  0: {
    fileLabel: 'schema.sql',
    language: 'sql',
    beforeCode: `CREATE TABLE visits (
    id          INTEGER IDENTITY PRIMARY KEY,
    pet_id      INTEGER NOT NULL,
    visit_date  DATE NOT NULL,
    description VARCHAR(255),
    CONSTRAINT fk_visits_pet FOREIGN KEY (pet_id) REFERENCES pets(id)
);`,
    afterCode: `CREATE TABLE visits (
    id          INTEGER IDENTITY PRIMARY KEY,
    pet_id      INTEGER NOT NULL,
    vet_id      INTEGER NOT NULL,
    visit_date  DATE NOT NULL,
    visit_time  TIME NOT NULL,
    description VARCHAR(255),
    CONSTRAINT fk_visits_pet FOREIGN KEY (pet_id) REFERENCES pets(id),
    CONSTRAINT fk_visits_vet FOREIGN KEY (vet_id) REFERENCES vets(id),
    CONSTRAINT uk_vet_date_time UNIQUE (vet_id, visit_date, visit_time)
);`,
  },
  1: {
    fileLabel: 'Visit.java',
    language: 'java',
    beforeCode: `@Entity
@Table(name = "visits")
public class Visit extends BaseEntity {

    @Column(name = "visit_date")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @NotNull
    private LocalDate date;

    @Column(name = "description")
    private String description;
}`,
    afterCode: `@Entity
@Table(name = "visits")
public class Visit extends BaseEntity {

    @Column(name = "visit_date")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @NotNull
    private LocalDate date;

    @Column(name = "visit_time")
    @NotNull
    private LocalTime time;

    @ManyToOne
    @JoinColumn(name = "vet_id")
    @NotNull
    private Vet vet;

    @Column(name = "description")
    private String description;
}`,
  },
  2: {
    fileLabel: 'VisitRepository.java',
    language: 'java',
    beforeCode: `public interface VisitRepository extends CrudRepository<Visit, Integer> {
}`,
    afterCode: `public interface VisitRepository extends CrudRepository<Visit, Integer> {

    boolean existsByVetIdAndDateAndTime(Integer vetId, LocalDate date, LocalTime time);
}`,
  },
  3: {
    fileLabel: 'ownerDetails.html',
    language: 'html',
    beforeCode: `<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Description</th>
    </tr>
  </thead>
</table>`,
    afterCode: `<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Time</th>
      <th>Vet</th>
      <th>Description</th>
    </tr>
  </thead>
</table>`,
  },
  4: {
    fileLabel: 'VisitController.java',
    language: 'java',
    beforeCode: `@ModelAttribute("timeSlots")
public List<LocalTime> populateTimeSlots() {
    List<LocalTime> slots = new ArrayList<>();
    for (int hour = 9; hour <= 16; hour++) {
        slots.add(LocalTime.of(hour, 0));
    }
    return slots;
}`,
    afterCode: `private final List<LocalTime> timeSlots;

public VisitController(...) {
    this.timeSlots = IntStream.rangeClosed(9, 16)
        .mapToObj(hour -> LocalTime.of(hour, 0))
        .toList();
}

@ModelAttribute("timeSlots")
public List<LocalTime> populateTimeSlots() {
    return this.timeSlots;
}`,
  },
  5: {
    fileLabel: 'createOrUpdateVisitForm.html',
    language: 'html',
    beforeCode: `<form th:object="\${visit}" method="post">
  <input type="date" th:field="*{date}" />
  <textarea th:field="*{description}"></textarea>
</form>`,
    afterCode: `<form th:object="\${visit}" method="post">
  <input type="date" th:field="*{date}" />
  <select th:field="*{vet}"></select>
  <select th:field="*{time}"></select>
  <textarea th:field="*{description}"></textarea>
</form>`,
  },
  6: {
    fileLabel: 'VisitControllerTests.java',
    language: 'java',
    beforeCode: `@WebMvcTest(VisitController.class)
class VisitControllerTests {

    @Test
    void initCreationFormDoesNotExposeVetChoices() throws Exception {
        mockMvc.perform(get("/owners/1/pets/1/visits/new"))
            .andExpect(status().isOk());
    }
}`,
    afterCode: `@WebMvcTest(VisitController.class)
class VisitControllerTests {

    @Test
    void rejectsDoubleBookingForSameVetAndTime() throws Exception {
        when(visitRepository.existsByVetIdAndDateAndTime(3, LocalDate.parse("2026-04-15"), LocalTime.of(10, 0)))
            .thenReturn(true);

        mockMvc.perform(post("/owners/1/pets/1/visits/new")
                .param("date", "2026-04-15")
                .param("time", "10:00")
                .param("vet", "3"))
            .andExpect(model().attributeHasFieldErrors("visit", "time"));
    }
}`,
  },
};

const MY_PROJECT_TREE = [
  {
    id: 'root',
    label: PROJECT_NAME,
    icon: 'nodes/folder',
    isExpanded: true,
    children: [
      {
        id: 'src',
        label: 'src/main/java',
        icon: 'nodes/sourceRoot',
        isExpanded: true,
        children: [
          {
            id: 'owner',
            label: 'owner',
            icon: 'nodes/package',
            isExpanded: true,
            children: [
              { id: 'visit',           label: 'Visit.java',             icon: 'fileTypes/java' },
              { id: 'visitCtrl',       label: 'VisitController.java',   icon: 'fileTypes/java' },
              { id: 'visitRepo',       label: 'VisitRepository.java',   icon: 'fileTypes/java' },
              { id: 'owner-file',      label: 'Owner.java',             icon: 'fileTypes/java' },
              { id: 'pet',             label: 'Pet.java',               icon: 'fileTypes/java' },
              { id: 'petTypeFormatter', label: 'PetTypeFormatter.java', icon: 'fileTypes/java' },
            ],
          },
          {
            id: 'vet',
            label: 'vet',
            icon: 'nodes/package',
            isExpanded: true,
            children: [
              { id: 'vet-file',     label: 'Vet.java',           icon: 'fileTypes/java' },
              { id: 'vetRepo',      label: 'VetRepository.java', icon: 'fileTypes/java' },
              { id: 'vetFormatter', label: 'VetFormatter.java',  icon: 'fileTypes/java' },
              { id: 'vetSchedule',  label: 'VetSchedule.java',   icon: 'fileTypes/java' },
            ],
          },
          {
            id: 'model',
            label: 'model',
            icon: 'nodes/package',
            isExpanded: true,
            children: [
              { id: 'baseEntity', label: 'BaseEntity.java', icon: 'fileTypes/java' },
              { id: 'person',     label: 'Person.java',     icon: 'fileTypes/java' },
            ],
          },
        ],
      },
      {
        id: 'resources',
        label: 'src/main/resources',
        icon: 'nodes/resourcesRoot',
        isExpanded: true,
        children: [
          {
            id: 'templates',
            label: 'templates',
            icon: 'nodes/folder',
            isExpanded: true,
            children: [
              {
                id: 'templates-pets',
                label: 'pets',
                icon: 'nodes/folder',
                isExpanded: true,
                children: [
                  { id: 'visitForm', label: 'createOrUpdateVisitForm.html', icon: 'fileTypes/html' },
                ],
              },
              {
                id: 'templates-owners',
                label: 'owners',
                icon: 'nodes/folder',
                isExpanded: true,
                children: [
                  { id: 'ownerDetails', label: 'ownerDetails.html', icon: 'fileTypes/html' },
                ],
              },
            ],
          },
          {
            id: 'db',
            label: 'db',
            icon: 'nodes/folder',
            isExpanded: true,
            children: [
              {
                id: 'db-h2',
                label: 'h2',
                icon: 'nodes/folder',
                isExpanded: true,
                children: [
                  { id: 'schema', label: 'schema.sql', icon: 'fileTypes/text' },
                  { id: 'data',   label: 'data.sql',   icon: 'fileTypes/text' },
                ],
              },
            ],
          },
          { id: 'appProps', label: 'application.properties', icon: 'fileTypes/text' },
        ],
      },
      {
        id: 'test',
        label: 'src/test/java',
        icon: 'nodes/testRoot',
        isExpanded: true,
        children: [
          { id: 'test1', label: 'VisitControllerTests.java', icon: 'fileTypes/java' },
          { id: 'test2', label: 'ClinicServiceTests.java',   icon: 'fileTypes/java' },
        ],
      },
    ],
  },
];

const PROJECT_ROOT_PATH = '~/projects/spring-petclinic';
const AGENT_SPECS_PATH = `${PROJECT_ROOT_PATH}/Agent Specifications`;
const PROBLEMS_SECONDARY_GAP = '\u00A0\u00A0\u00A0';
const TERMINAL_RUN_INPUT = { path: AGENT_SPECS_PATH, branch: BRANCH_NAME };
const TERMINAL_RUN_VISIBLE_DELAY_MS = 110;
const TERMINAL_RUN_INITIAL_DELAY_MS = 160;
const TERMINAL_RUN_STEP_DELAY_MS = 420;
const TERMINAL_RUN_END_DELAY_MS = 480;
const TERMINAL_UPDATE_SPEC_STEP_DELAY_MS = 620;
const TERMINAL_UPDATE_SPEC_INTRO_LINE_COUNT = 2;
const RESTORE_PLAN_FRAME_INITIAL_DELAY_MS = TERMINAL_RUN_VISIBLE_DELAY_MS + TERMINAL_RUN_INITIAL_DELAY_MS + (TERMINAL_UPDATE_SPEC_STEP_DELAY_MS * TERMINAL_UPDATE_SPEC_INTRO_LINE_COUNT);
const RESTORE_PLAN_FRAME_STEP_DELAY_MS = TERMINAL_UPDATE_SPEC_STEP_DELAY_MS;
const RUN_STATUS_REVEAL_STEP_DELAY_MS = 120;
const CHAINED_SECTION_START_DELAY_MS = 220;
const TERMINAL_PERMISSION_PROMPT = 'Allow agent execution?';
const TERMINAL_PERMISSION_OPTIONS = [
  { id: 'allow-once', label: 'Allow once' },
  { id: 'allow-session', label: 'Allow for session' },
  { id: 'reject', label: 'Reject' },
];
const AC_WARNING_TARGET_ORIGINAL_INDEX = 0;
const AC_WARNING_PROMPT = 'AC #1 partially met. Pre-filtering works on POST re-renders (booked vets excluded via findByDateAndTime). But on initial page load, no date/time is selected — `RequestParam` values are null — so all vets are shown. AC says "available vets for the selected date/time", implying always-filtered. Full filtering on date selection would require AJAX (out of scope). Suggest rewording AC.';

function buildTerminalBlocks(lines = []) {
  return lines.length > 0
    ? [{ path: TERMINAL_RUN_INPUT.path, lines }]
    : [];
}

function buildTerminalFrames(lines = [], baseLines = []) {
  return lines.map((_, idx) => buildTerminalBlocks([
    ...baseLines,
    ...lines.slice(0, idx + 1),
  ]));
}

function formatTerminalQuestion(question) {
  if (!question) return '';
  return question
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTerminalPermissionContinuationLines(choiceId) {
  if (choiceId === 'allow-session') {
    return [
      { type: 'output', text: 'Permission granted for this session' },
      { type: 'output', text: 'Starting agent execution...' },
      { type: 'output', text: 'Applying specification...' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'allow-once') {
    return [
      { type: 'output', text: 'Permission granted for this run' },
      { type: 'output', text: 'Starting agent execution...' },
      { type: 'output', text: 'Applying specification...' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'reject') {
    return [
      { type: 'error', text: 'Execution rejected' },
    ];
  }

  return [];
}

function buildTerminalContextLabel({
  mode = 'section',
  taskLabel = TERMINAL_TASK_TAB_BASE_LABEL,
  sectionTitle = null,
  checkTarget = null,
} = {}) {
  const resolvedTaskLabel = taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;

  if (checkTarget?.kind === 'ac' && Number.isInteger(checkTarget.index)) {
    return `${resolvedTaskLabel} > Acceptance Criteria > AC ${checkTarget.index + 1}`;
  }

  if (checkTarget?.kind === 'plan' && Number.isInteger(checkTarget.index)) {
    return `${resolvedTaskLabel} > Plan > Item ${checkTarget.index + 1}`;
  }

  if (mode === 'generate' || mode === 'update-spec') {
    return `${resolvedTaskLabel} > Full specification`;
  }

  if (typeof sectionTitle === 'string' && sectionTitle.trim().length > 0) {
    return `${resolvedTaskLabel} > ${sectionTitle.trim()}`;
  }

  return resolvedTaskLabel;
}

function buildTerminalRunSequence({
  mode = 'section',
  sectionTitle,
  taskLabel = TERMINAL_TASK_TAB_BASE_LABEL,
  checkTarget = null,
  permissionChoice = 'prompt',
} = {}) {
  const resolvedTaskLabel = taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;
  const contextLabel = buildTerminalContextLabel({
    mode,
    taskLabel: resolvedTaskLabel,
    sectionTitle,
    checkTarget,
  });

  if (mode === 'generate') {
    const introLines = [
      { type: 'command', text: `agent run "${resolvedTaskLabel}" --specify` },
      { type: 'output', text: `Reading ${resolvedTaskLabel}` },
      { type: 'output', text: `Context: ${contextLabel}` },
      { type: 'output', text: 'Resolving referenced files...' },
      { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
      { type: 'output', text: 'Specifying visit-booking specification...' },
      { type: 'output', text: 'Processed 9 plan steps' },
    ];

    if (permissionChoice === 'prompt') {
      return {
        initialLines: introLines,
        permissionPrompt: {
          question: TERMINAL_PERMISSION_PROMPT,
          options: TERMINAL_PERMISSION_OPTIONS,
        },
      };
    }

    return {
      initialLines: [
        ...introLines,
        ...buildTerminalPermissionContinuationLines(permissionChoice),
      ],
      permissionPrompt: null,
    };
  }

  if (mode === 'update-spec') {
    const planUpdateLines = createVisitBookingPlanItems()
      .flatMap((item) => [
        item?.text,
        ...(item?.children ?? []).map((child) => child?.text),
      ])
      .filter((text) => typeof text === 'string' && text.trim().length > 0)
      .map((text) => ({ type: 'output', text: `Generating Plan item: ${text}` }));
    const introLines = [
      { type: 'command', text: `agent run "${resolvedTaskLabel}" --update-spec` },
      { type: 'output', text: 'Updating specification plan items...' },
      ...planUpdateLines,
      { type: 'output', text: 'Prepared plan steps' },
    ];

    return {
      initialLines: [
        ...introLines,
        ...buildTerminalPermissionContinuationLines(permissionChoice),
      ],
      permissionPrompt: null,
    };
  }

  const resolvedSection = sectionTitle || 'Plan';
  const activityLine = resolvedSection.toLowerCase() === 'acceptance criteria'
    ? 'Building acceptance checks...'
    : 'Building execution plan...';

  return {
    initialLines: [
      { type: 'command', text: `agent run "${resolvedTaskLabel}" --section "${resolvedSection}"` },
      { type: 'output', text: `Reading ${resolvedTaskLabel}` },
      { type: 'output', text: `Context: ${contextLabel}` },
      { type: 'output', text: 'Resolving referenced files...' },
      { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
      { type: 'output', text: activityLine },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Build finished without issues' },
    ],
    permissionPrompt: null,
  };
}

function buildAcceptanceCriteriaIntroLines(runRequest = {}) {
  const resolvedTaskLabel = runRequest?.taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;
  const contextLabel = buildTerminalContextLabel({
    mode: 'section',
    taskLabel: resolvedTaskLabel,
    sectionTitle: 'Acceptance Criteria',
    checkTarget: runRequest?.checkTarget ?? null,
  });
  return [
    { type: 'command', text: `agent run "${resolvedTaskLabel}" --section "Acceptance Criteria"` },
    { type: 'output', text: `Reading ${resolvedTaskLabel}` },
    { type: 'output', text: `Context: ${contextLabel}` },
    { type: 'output', text: 'Resolving referenced files...' },
    { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
    { type: 'output', text: 'Building acceptance checks...' },
  ];
}

function buildAcceptanceCriteriaContinuationLines(choiceId) {
  if (choiceId === 'allow-session') {
    return [
      { type: 'output', text: 'Permission granted for this session' },
      { type: 'output', text: 'Continuing acceptance checks...' },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'allow-once') {
    return [
      { type: 'output', text: 'Permission granted for this run' },
      { type: 'output', text: 'Continuing acceptance checks...' },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Build finished without issues' },
    ];
  }

  if (choiceId === 'reject') {
    return [
      { type: 'error', text: 'Acceptance checks stopped after warning' },
    ];
  }

  return [];
}

function TerminalPermissionPrompt({
  question,
  options,
  selectedIdx,
  onMoveSelection,
  onSelect,
  onHover,
}) {
  const promptRef = useRef(null);

  useEffect(() => {
    promptRef.current?.focus();
  }, []);

  const selectedOption = options[selectedIdx] ?? options[0] ?? null;

  return (
    <div
      ref={promptRef}
      className="terminal-permission-prompt text-editor-default"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMoveSelection(1);
          return;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMoveSelection(-1);
          return;
        }

        if (event.key === 'Tab') {
          event.preventDefault();
          onMoveSelection(event.shiftKey ? -1 : 1);
          return;
        }

        if (event.key === 'Enter' && selectedOption) {
          event.preventDefault();
          onSelect(selectedOption.id);
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          onSelect('reject');
        }
      }}
    >
      <div className="terminal-permission-question">{question}</div>
      <div className="terminal-permission-options">
        {options.map((option, idx) => {
          const isSelected = idx === selectedIdx;
          return (
            <button
              key={option.id}
              type="button"
              className={`terminal-permission-option${isSelected ? ' is-selected' : ''}`}
              data-demo-id={`terminal-permission-${option.id}`}
              onMouseEnter={() => onHover(idx)}
              onClick={() => onSelect(option.id)}
            >
              <span className="terminal-permission-caret" aria-hidden="true">
                {isSelected ? '>' : ''}
              </span>
              <span className="terminal-permission-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function areAllChecklistStatusesPassed(statuses = null) {
  return Array.isArray(statuses)
    && statuses.length > 0
    && statuses.every((statusItem) => statusItem?.status === 'passed' && !isRunStatusItemOutdated(statusItem));
}

function hasChecklistStatuses(statuses = null) {
  return Array.isArray(statuses) && statuses.length > 0;
}

function hasChecklistWarningOrError(statuses = null) {
  const isWarningOrError = (status) => status === 'warning' || status === 'failed' || status === 'error';

  return Array.isArray(statuses)
    && statuses.some((statusItem) => (
      isWarningOrError(statusItem?.status)
      || (Array.isArray(statusItem?.checks) && statusItem.checks.some((check) => isWarningOrError(check?.status)))
    ));
}

function countRecordedTradeoffs(documentSections = []) {
  if (!Array.isArray(documentSections) || documentSections.length === 0) {
    return 0;
  }

  const countItemsForTitle = (title) => {
    const section = documentSections.find((item) => item?.title?.toLowerCase() === title);
    return Array.isArray(section?.items)
      ? section.items.filter((item) => typeof item?.text === 'string' && item.text.trim().length > 0).length
      : 0;
  };

  return (
    countItemsForTitle('tradeoffs')
    || countItemsForTitle('other')
    || countItemsForTitle('notes')
    || 0
  );
}

function formatSuccessCountLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildSuccessBannerMessage({
  acceptanceCriteriaCount = 0,
  planItemCount = 0,
  tradeoffCount = 0,
} = {}) {
  const acceptanceCriteriaLabel = formatSuccessCountLabel(
    acceptanceCriteriaCount,
    'acceptance criterion',
    'acceptance criteria',
  );
  const planItemLabel = formatSuccessCountLabel(
    planItemCount,
    'plan item',
    'plan items',
  );
  const noteSentence = tradeoffCount > 0
    ? `${formatSuccessCountLabel(tradeoffCount, 'follow-up note', 'follow-up notes')} recorded.`
    : 'No follow-up notes recorded.';

  return `Specification is ready for handoff: ${acceptanceCriteriaLabel} and ${planItemLabel} validated. ${noteSentence}`;
}

function getProjectContextFile(documentSections = [], addPopupFiles = []) {
  const referencedFiles = (documentSections ?? [])
    .map((section) => section?.meta?.text)
    .filter((value) => typeof value === 'string' && value.trim().length > 0);

  const preferredLabels = [...referencedFiles, 'Configuration.md'];

  for (const label of preferredLabels) {
    const matchingFile = (addPopupFiles ?? []).find((item) => item?.label === label);
    if (matchingFile) {
      return matchingFile;
    }
  }

  return null;
}

function DoneSuccessBanner({
  message,
  onAddToProjectContext = null,
}) {
  const bannerActions = onAddToProjectContext
    ? [{
        label: 'Add to project context',
        onClick: () => onAddToProjectContext?.(),
      }]
    : undefined;

  return (
    <div className="spec-done-warning-slot">
      <Banner
        type="success"
        showCloseButton={false}
        className="spec-done-success-banner"
        actions={bannerActions}
      >
        {message}
      </Banner>
    </div>
  );
}

/// Statuses shown after running Acceptance Criteria. Each item: { status, checks[] }
const AC_RUN_STATUSES = [
  {
    status: 'failed',
    highlight: {
      match: 'filtered to available vets for selected date/time',
      className: 'spec-inline-warning-highlight',
      tooltip: {
        title: 'Still shows all vets before availability filtering.',
        hint: 'Dropdown filters to available vets after date/time is submitted',
      },
    },
    issue: {
      severity: 'warning',
      label: 'AC/Plan mismatch — AC says "available vets" but plan loads all vets',
      secondaryText: 'Line 6',
    },
    proposal: 'Exclude already-booked vets from dropdown',
    checks: [
      { status: 'passed', text: 'Pre-filter works on POST re-render', chip: 'VisitController.java' },
      { status: 'failed', text: 'On initial load no date is selected, all vets shown — live filtering on date pick needs AJAX (out of scope)', chip: null },
    ],
  },
  null,
  {
    status: 'failed',
    checkboxStatus: null,
    highlight: {
      match: 'A vet cannot be booked for the same date+time twice.',
      className: 'spec-inline-warning-highlight',
      tooltip: {
        title: 'Double-booking error UX is unspecified.',
        hint: 'Specify what the user sees when a booking is blocked.',
      },
    },
    issue: {
      severity: 'warning',
      label: 'Double-booking error UX is unspecified.',
      secondaryText: 'Line 8',
    },
    proposalOptions: [
      {
        label: 'Inline field error on form re-render',
        replacementText: 'A vet cannot be booked for the same date+time twice. On a blocked booking, the form re-renders with an inline error on the vet field.',
      },
      {
        label: 'Modal with conflict details',
        replacementText: 'A vet cannot be booked for the same date+time twice. On conflict, the user sees a modal with conflict details and can pick a different time slot.',
      },
      {
        label: 'Let the agent decide',
        replacementText: 'A vet cannot be booked for the same date+time twice. On a blocked booking, the form re-renders with an inline error on the vet field.',
      },
      { type: 'text' },
    ],
    checks: [],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: '`ManyToOne` vet persisted', chip: 'Visit.java' },
      { status: 'passed', text: 'LocalTime time persisted', chip: 'Visit.java' },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Vet column in ownerDetails.html', chip: 'ownerDetails.html' },
      { status: 'passed', text: 'Time column in ownerDetails.html', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'H2, MySQL, PostgreSQL schemas updated', chip: 'schema.sql' },
      { status: 'passed', text: 'Seed data includes vet_id and visit_time', chip: 'data.sql' },
    ],
  },
];

const PLAN_RUN_STATUSES = [
  { status: 'passed' },
  { status: 'passed' },
  {
    status: 'failed',
    highlight: {
      match: 'double-booking check',
      className: 'spec-inline-warning-highlight',
      tooltip: {
        title: 'Concurrent requests can still bypass this check.',
        hint: 'Replace with DB UNIQUE plus the existing lookup.',
      },
    },
    issue: {
      severity: 'warning',
      label: 'Possible race condition — check-then-act without DB constraint',
      secondaryText: 'Line 10',
    },
  },
  { status: 'passed' },
  {
    status: 'failed',
    highlight: {
      match: '<select> for vet',
      className: 'spec-inline-error-highlight',
      tooltip: {
        title: 'Vet select is added, but binding is still missing.',
        hint: 'Replace with vet select, VetFormatter, and time slot.',
      },
    },
    issue: {
      severity: 'error',
      label: 'Incomplete plan — missing VetFormatter, form POST will fail',
      secondaryText: 'Line 12',
    },
  },
  { status: 'passed' },
  { status: 'passed' },
];

const ISSUE_QUICK_FIX_CONFIG = {
  ac: {
    0: {
      actionLabel: 'Exclude already-booked vets from dropdown',
      replacementText: 'Visit form shows a dropdown of vets, excluding those already booked for the selected date and time.',
      resolvedStatus: {
        status: 'passed',
        checks: [
          { status: 'passed', text: 'Pre-filter on POST re-render', chip: 'VisitController.java' },
          { status: 'passed', text: 'All vets shown on initial GET (expected)', chip: null },
        ],
      },
    },
    1: {
      actionLabel: 'Specify 09:00–16:00, configurable',
      replacementText: 'Visit form includes a time slot picker with hourly slots from 09:00 to 16:00 (last bookable slot). Slot range is configurable.',
      resolvedStatus: {
        status: 'passed',
        checks: [],
      },
    },
    2: {
      actionLabel: 'Show inline field error on booking conflict',
      replacementText: 'A vet cannot be booked for the same date+time twice. On a blocked booking, the form re-renders with an inline error on the vet field.',
      resolvedStatus: {
        status: 'passed',
        checks: [],
      },
    },
  },
  plan: {
    2: {
      actionLabel: 'Add booking constraint',
      replacementText: 'VisitRepository — add double-booking query + UNIQUE(vet_id, visit_date, visit_time) constraint',
      resolvedStatus: {
        status: 'passed',
      },
    },
    4: {
      actionLabel: 'Add vet formatter',
      replacementText: 'Form template — add <select> for vet with VetFormatter (per PetTypeFormatter pattern) and time slot',
      resolvedStatus: {
        status: 'passed',
      },
    },
  },
};

function getIssueQuickFixConfig(kind, index) {
  return ISSUE_QUICK_FIX_CONFIG[kind]?.[index] ?? null;
}

function getBaseRunStatusesForKind(kind) {
  return kind === 'plan' ? PLAN_RUN_STATUSES : AC_RUN_STATUSES;
}

function mapVisibleIssueIndexToOriginal(kind, visibleIndex, removedIssueIndices = null) {
  if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return visibleIndex;

  const baseStatuses = getBaseRunStatusesForKind(kind);
  const removedMap = removedIssueIndices?.[kind] ?? {};
  let nextVisibleIndex = 0;

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    if (removedMap[originalIndex]) continue;
    if (nextVisibleIndex === visibleIndex) return originalIndex;
    nextVisibleIndex += 1;
  }

  return visibleIndex;
}

function mapOriginalIssueIndexToVisible(kind, originalIndex, removedIssueIndices = null) {
  if (!Number.isInteger(originalIndex) || originalIndex < 0) return originalIndex;

  const baseStatuses = getBaseRunStatusesForKind(kind);
  const removedMap = removedIssueIndices?.[kind] ?? {};
  if (removedMap[originalIndex]) return -1;

  let visibleIndex = 0;
  for (let idx = 0; idx < baseStatuses.length; idx += 1) {
    if (removedMap[idx]) continue;
    if (idx === originalIndex) return visibleIndex;
    visibleIndex += 1;
  }

  return originalIndex;
}

function buildResolvedRunStatuses(baseStatuses, kind, appliedIssueFixes, removedIssueIndices = null, { runComplete = false } = {}) {
  const removedMap = removedIssueIndices?.[kind] ?? {};

  return baseStatuses.reduce((nextStatuses, status, originalIndex) => {
    if (removedMap[originalIndex]) return nextStatuses;

    if (!getAppliedIssueFixValue(appliedIssueFixes, kind, originalIndex)) {
      nextStatuses.push(status);
      return nextStatuses;
    }

    if (runComplete) {
      // Run completed after fix — show resolved (green) status
      const fixConfig = getIssueQuickFixConfig(kind, originalIndex);
      nextStatuses.push(fixConfig?.resolvedStatus ?? resolveRuntimeInspectionItem(status));
    } else {
      // Fix applied but not yet confirmed by a run — show empty (null)
      nextStatuses.push(null);
    }
    return nextStatuses;
  }, []);
}

function cloneRunStatusItem(statusItem) {
  if (!statusItem || typeof statusItem !== 'object') {
    return statusItem;
  }

  return {
    ...statusItem,
    checks: Array.isArray(statusItem.checks)
      ? statusItem.checks.map((check) => ({ ...check }))
      : statusItem.checks,
    issue: statusItem.issue ? { ...statusItem.issue } : statusItem.issue,
    highlight: statusItem.highlight
      ? {
          ...statusItem.highlight,
          tooltip: statusItem.highlight.tooltip ? { ...statusItem.highlight.tooltip } : statusItem.highlight.tooltip,
        }
      : statusItem.highlight,
  };
}

function withRunStatusOutdated(statusItem, isOutdated = true) {
  const nextStatusItem = statusItem && typeof statusItem === 'object'
    ? cloneRunStatusItem(statusItem)
    : { status: 'pending' };

  if (isOutdated) {
    nextStatusItem.isOutdated = true;
  } else {
    delete nextStatusItem.isOutdated;
  }

  return nextStatusItem;
}

function isRunStatusItemOutdated(statusItem) {
  return Boolean(statusItem?.isOutdated);
}

function cloneIssueStateMap(issueState = null) {
  return {
    ac: { ...(issueState?.ac ?? {}) },
    plan: { ...(issueState?.plan ?? {}) },
  };
}

function getAppliedIssueFixValue(appliedIssueFixes, kind, index) {
  return appliedIssueFixes?.[kind]?.[index] ?? null;
}

function getAppliedIssueFixReplacementText(appliedIssueFixes, kind, index) {
  const appliedFix = getAppliedIssueFixValue(appliedIssueFixes, kind, index);
  return appliedFix && typeof appliedFix === 'object' && typeof appliedFix.replacementText === 'string'
    ? appliedFix.replacementText
    : null;
}

function createAppliedIssueFixValue(replacementText = null) {
  return typeof replacementText === 'string' && replacementText.trim().length > 0
    ? { applied: true, replacementText }
    : true;
}

function parseProblemRawIndexFromSecondaryText(secondaryText) {
  if (typeof secondaryText !== 'string') return null;

  const match = secondaryText.trim().match(/^Line\s+(\d+)$/i);
  if (!match) return null;

  const lineNumber = Number(match[1]);
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) return null;

  return lineNumber - 1;
}

function getDocumentCheckRawIndex(documentSections, kind, visibleIndex) {
  if (!Array.isArray(documentSections) || !Number.isInteger(visibleIndex) || visibleIndex < 0) {
    return null;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  const { lineMap } = buildSerializedDocumentLines(documentSections);
  let currentVisibleIndex = 0;

  for (let rawIndex = 0; rawIndex < lineMap.length; rawIndex += 1) {
    const entry = lineMap[rawIndex];
    if (entry?.type !== 'item' || entry.itemType !== 'check' || (entry.nestingLevel ?? 0) > 0) continue;

    const section = documentSections[entry.sectionIndex];
    if (section?.title?.toLowerCase() !== targetSectionTitle) continue;

    if (currentVisibleIndex === visibleIndex) {
      return rawIndex;
    }

    currentVisibleIndex += 1;
  }

  return null;
}

function getDocumentCheckTargetAtRawIndex(documentSections, rawIndex, removedIssueIndices = null) {
  if (!Array.isArray(documentSections) || !Number.isInteger(rawIndex) || rawIndex < 0) {
    return null;
  }

  const { lineMap } = buildSerializedDocumentLines(documentSections);
  const targetEntry = lineMap[rawIndex];
  if (targetEntry?.type !== 'item' || targetEntry.itemType !== 'check' || (targetEntry.nestingLevel ?? 0) > 0) {
    return null;
  }

  const targetSection = documentSections[targetEntry.sectionIndex];
  const normalizedSectionTitle = targetSection?.title?.toLowerCase();
  const kind = normalizedSectionTitle === 'acceptance criteria'
    ? 'ac'
    : normalizedSectionTitle === 'plan'
      ? 'plan'
      : null;

  if (!kind) {
    return null;
  }

  let visibleIndex = 0;
  for (let index = 0; index <= rawIndex; index += 1) {
    const entry = lineMap[index];
    if (entry?.type !== 'item' || entry.itemType !== 'check' || (entry.nestingLevel ?? 0) > 0) continue;

    const section = documentSections[entry.sectionIndex];
    if (section?.title?.toLowerCase() !== normalizedSectionTitle) continue;

    if (index === rawIndex) {
      return {
        kind,
        index: mapVisibleIssueIndexToOriginal(kind, visibleIndex, removedIssueIndices),
      };
    }

    visibleIndex += 1;
  }

  return null;
}

function getDocumentCheckItem(documentSections, kind, visibleIndex) {
  if (!Array.isArray(documentSections) || !Number.isInteger(visibleIndex) || visibleIndex < 0) {
    return null;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  let currentVisibleIndex = 0;

  for (const section of documentSections) {
    if (section?.title?.toLowerCase() !== targetSectionTitle) {
      continue;
    }

    for (const item of (section.items ?? [])) {
      if (item?.type !== 'check') {
        continue;
      }

      if (currentVisibleIndex === visibleIndex) {
        return item;
      }

      currentVisibleIndex += 1;
    }
  }

  return null;
}

function normalizeDocumentCheckItemForComparison(item) {
  if (!item || item.type !== 'check') {
    return null;
  }

  return {
    text: typeof item.text === 'string' ? item.text.trim() : '',
    checked: Boolean(item.checked),
    children: Array.isArray(item.children)
      ? item.children
          .map((child) => normalizeDocumentCheckItemForComparison(child))
          .filter(Boolean)
      : [],
  };
}

function areComparableValuesEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function collectRunRerunOriginalIndices({
  kind,
  currentDocumentSections,
  nextDocumentSections,
  currentStatuses = null,
  nextStatuses = null,
  currentRemovedIssueIndices = null,
  nextRemovedIssueIndices = null,
} = {}) {
  const baseStatuses = getBaseRunStatusesForKind(kind);
  const rerunOriginalIndices = [];

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const currentVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, currentRemovedIssueIndices);
    const nextVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);

    if (!Number.isInteger(nextVisibleIndex) || nextVisibleIndex < 0) {
      continue;
    }

    const currentStatus = Array.isArray(currentStatuses) && currentVisibleIndex >= 0
      ? (currentStatuses[currentVisibleIndex] ?? null)
      : null;
    const nextStatus = Array.isArray(nextStatuses)
      ? (nextStatuses[nextVisibleIndex] ?? null)
      : null;
    const currentItem = currentVisibleIndex >= 0
      ? normalizeDocumentCheckItemForComparison(getDocumentCheckItem(currentDocumentSections, kind, currentVisibleIndex))
      : null;
    const nextItem = normalizeDocumentCheckItemForComparison(
      getDocumentCheckItem(nextDocumentSections, kind, nextVisibleIndex),
    );

    if (
      currentVisibleIndex < 0
      || currentStatus === null
      || nextStatus === null
      || !areComparableValuesEqual(currentItem, nextItem)
      || !areComparableValuesEqual(currentStatus, nextStatus)
    ) {
      rerunOriginalIndices.push(originalIndex);
    }
  }

  return rerunOriginalIndices;
}

function buildRunStatusesRevealSeed({
  kind,
  currentStatuses = null,
  nextStatuses = null,
  currentRemovedIssueIndices = null,
  nextRemovedIssueIndices = null,
  rerunOriginalIndices = [],
  allowPendingOutdated = true,
} = {}) {
  if (!Array.isArray(nextStatuses)) {
    return nextStatuses;
  }

  const rerunOriginalIndexSet = new Set(rerunOriginalIndices);
  const baseStatuses = getBaseRunStatusesForKind(kind);
  const nextResult = new Array(nextStatuses.length).fill(null);

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const currentVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, currentRemovedIssueIndices);
    const nextVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);
    if (!Number.isInteger(nextVisibleIndex) || nextVisibleIndex < 0) {
      continue;
    }

    const currentStatus = Array.isArray(currentStatuses) && currentVisibleIndex >= 0
      ? currentStatuses[currentVisibleIndex]
      : undefined;

    if (rerunOriginalIndexSet.has(originalIndex)) {
      nextResult[nextVisibleIndex] = currentStatus == null && !allowPendingOutdated
        ? null
        : withRunStatusOutdated(currentStatus);
      continue;
    }

    nextResult[nextVisibleIndex] = currentStatus !== undefined
      ? currentStatus
      : (nextStatuses[nextVisibleIndex] ?? null);
  }

  return nextResult;
}

function mergeOriginalIssueIndices(...groups) {
  return Array.from(new Set(
    groups.flatMap((group) => (
      Array.isArray(group)
        ? group.filter((index) => Number.isInteger(index) && index >= 0)
        : []
    ))
  )).sort((left, right) => left - right);
}

function buildRunStatusesSeedWithPendingOriginalIndices({
  kind,
  currentStatuses = null,
  nextStatuses = null,
  currentRemovedIssueIndices = null,
  nextRemovedIssueIndices = null,
  rerunOriginalIndices = [],
  pendingOriginalIndices = [],
  allowPendingOutdated = true,
} = {}) {
  const seededStatuses = buildRunStatusesRevealSeed({
    kind,
    currentStatuses,
    nextStatuses,
    currentRemovedIssueIndices,
    nextRemovedIssueIndices,
    rerunOriginalIndices,
    allowPendingOutdated,
  });

  if (!Array.isArray(seededStatuses) || !Array.isArray(pendingOriginalIndices) || pendingOriginalIndices.length === 0) {
    return seededStatuses;
  }

  const nextResult = [...seededStatuses];
  pendingOriginalIndices.forEach((originalIndex) => {
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);
    if (Number.isInteger(visibleIndex) && visibleIndex >= 0) {
      nextResult[visibleIndex] = null;
    }
  });

  return nextResult;
}

function remapRunStatusesForRemovedIssueIndices(kind, statuses = null, currentRemovedIssueIndices = null, nextRemovedIssueIndices = null) {
  if (!Array.isArray(statuses)) {
    return statuses;
  }

  const baseStatuses = getBaseRunStatusesForKind(kind);
  const nextResult = [];

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const currentVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, currentRemovedIssueIndices);
    const nextVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);

    if (!Number.isInteger(nextVisibleIndex) || nextVisibleIndex < 0) {
      continue;
    }

    nextResult[nextVisibleIndex] = Number.isInteger(currentVisibleIndex) && currentVisibleIndex >= 0
      ? (statuses[currentVisibleIndex] ?? null)
      : null;
  }

  return nextResult;
}

function buildSelectiveRunRevealOptions({
  kind,
  runRequest = null,
  currentStatuses = null,
  removedIssueIndices = null,
} = {}) {
  const rerunOriginalIndices = kind === 'ac'
    ? (Array.isArray(runRequest?.rerunAcOriginalIndices) ? runRequest.rerunAcOriginalIndices : [])
    : (Array.isArray(runRequest?.rerunPlanOriginalIndices) ? runRequest.rerunPlanOriginalIndices : []);
  const revealIndices = mapOriginalIssueIndicesToVisible(kind, rerunOriginalIndices, removedIssueIndices);
  const requestInitialResult = kind === 'ac'
    ? runRequest?.initialAcRunResult
    : runRequest?.initialPlanRunResult;
  const hasPreservableInitialResult =
    Array.isArray(requestInitialResult)
    || Array.isArray(currentStatuses);
  const initialResult = Array.isArray(requestInitialResult)
    ? requestInitialResult
    : (Array.isArray(currentStatuses) ? currentStatuses : []);
  const hasSelectiveRerun = revealIndices.length > 0 && hasPreservableInitialResult;

  return {
    hasSelectiveRerun,
    initialResult,
    indices: revealIndices,
    rerunOriginalIndices,
  };
}

function mapOriginalIssueIndicesToVisible(kind, originalIndices = [], removedIssueIndices = null) {
  const visibleIndices = Array.isArray(originalIndices)
    ? originalIndices
        .map((originalIndex) => mapOriginalIssueIndexToVisible(kind, originalIndex, removedIssueIndices))
        .filter((visibleIndex) => Number.isInteger(visibleIndex) && visibleIndex >= 0)
    : [];

  return Array.from(new Set(visibleIndices)).sort((left, right) => left - right);
}

function getVisibleIssueOriginalIndices(kind, removedIssueIndices = null) {
  const baseStatuses = getBaseRunStatusesForKind(kind);
  const visibleOriginalIndices = [];

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, removedIssueIndices);
    if (Number.isInteger(visibleIndex) && visibleIndex >= 0) {
      visibleOriginalIndices.push(originalIndex);
    }
  }

  return visibleOriginalIndices;
}

function getVisibleDocumentCheckOriginalIndices(kind, documentSections = [], removedIssueIndices = null) {
  const targetSectionTitle = kind === 'ac' ? 'acceptance criteria' : 'plan';
  const section = (documentSections ?? []).find((candidate) => (
    typeof candidate?.title === 'string'
    && candidate.title.toLowerCase() === targetSectionTitle
  ));
  const removedMap = removedIssueIndices?.[kind] ?? {};
  const visibleOriginalIndices = [];

  (section?.items ?? []).forEach((item, originalIndex) => {
    if (item?.type === 'check' && !removedMap[originalIndex]) {
      visibleOriginalIndices.push(originalIndex);
    }
  });

  return visibleOriginalIndices;
}

function getSectionCheckItemCount(documentSections = [], sectionTitle = '') {
  const normalizedTitle = typeof sectionTitle === 'string' ? sectionTitle.toLowerCase() : '';
  const section = (documentSections ?? []).find((candidate) => (
    typeof candidate?.title === 'string'
    && candidate.title.toLowerCase() === normalizedTitle
  ));

  return (section?.items ?? []).filter((item) => item?.type === 'check').length;
}

function restorePlanItemsIfEmpty(documentSections = [], fallbackItems = []) {
  const fallbackPlanItems = Array.isArray(fallbackItems)
    ? fallbackItems.filter((item) => item?.type === 'check')
    : [];
  if (fallbackPlanItems.length === 0 || getSectionCheckItemCount(documentSections, 'Plan') > 0) {
    return documentSections;
  }

  let changed = false;
  const nextSections = (documentSections ?? []).map((section) => {
    if (typeof section?.title !== 'string' || section.title.toLowerCase() !== 'plan') {
      return section;
    }

    changed = true;
    return withDerivedPlanChildren({
      ...section,
      items: fallbackPlanItems.map((item) => cloneDocumentItem(item)),
    });
  });

  return changed ? nextSections : documentSections;
}

function hasAnyAppliedIssueFix(appliedIssueFixes = null) {
  return ['ac', 'plan'].some((kind) => (
    Object.values(appliedIssueFixes?.[kind] ?? {}).some(Boolean)
  ));
}

function addVisitBookingDecisionsAfterQuickFixes(documentSections = [], appliedIssueFixes = null) {
  if (!hasAnyAppliedIssueFix(appliedIssueFixes)) {
    return documentSections;
  }

  let changed = false;
  const nextSections = (documentSections ?? []).map((section) => {
    if (typeof section?.title !== 'string' || section.title.toLowerCase() !== 'decisions') {
      return section;
    }

    const existingItems = Array.isArray(section.items) ? section.items : [];
    const existingTexts = new Set(
      existingItems
        .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
        .filter(Boolean),
    );
    const missingItems = VISIT_BOOKING_DECISION_ITEMS
      .filter((item) => !existingTexts.has(item.text))
      .map((item) => cloneDocumentItem(item));

    if (missingItems.length === 0) {
      return section;
    }

    changed = true;
    return {
      ...section,
      items: [
        ...existingItems.map((item) => cloneDocumentItem(item)),
        ...missingItems,
      ],
    };
  });

  return changed ? nextSections : documentSections;
}

function buildPlanRestoreFrames(documentSections = [], fallbackItems = []) {
  const fallbackPlanItems = Array.isArray(fallbackItems)
    ? fallbackItems.filter((item) => item?.type === 'check')
    : [];
  if (fallbackPlanItems.length === 0) {
    return [];
  }

  const hasPlanItems = getSectionCheckItemCount(documentSections, 'Plan') > 0;
  if (hasPlanItems) {
    return [];
  }

  const fullPlanItems = withDerivedPlanChildren({
    id: 'plan',
    title: 'Plan',
    items: fallbackPlanItems.map((item) => cloneDocumentItem(item)),
  }).items ?? [];
  const restoreSteps = fullPlanItems.flatMap((item, parentIndex) => {
    const childSteps = (item.children ?? [])
      .filter((child) => child?.type === 'check')
      .map((_, childIndex) => ({ parentIndex, childIndex }));

    return [
      { parentIndex, childIndex: null },
      ...childSteps,
    ];
  });

  return restoreSteps.map((step, stepIndex) => {
    const frameItems = fullPlanItems
      .slice(0, step.parentIndex + 1)
      .map((item, itemIndex) => {
        const nextItem = cloneDocumentItem(item);
        if (itemIndex < step.parentIndex) {
          return nextItem;
        }

        nextItem.children = Number.isInteger(step.childIndex)
          ? (nextItem.children ?? []).slice(0, step.childIndex + 1)
          : [];
        return nextItem;
      });
    const frameDocument = (documentSections ?? []).map((section) => {
      if (typeof section?.title !== 'string' || section.title.toLowerCase() !== 'plan') {
        return cloneDocumentSection(section);
      }

      return {
        ...cloneDocumentSection(section),
        items: frameItems,
      };
    });
    const framePlanRunResult = new Array(stepIndex + 1).fill(null);
    framePlanRunResult[stepIndex] = { status: 'pending' };

    return {
      code: serializeSpecDocument(frameDocument),
      documentSections: frameDocument,
      planRunResult: framePlanRunResult,
    };
  });
}

function buildProblemTreeNodeId(issue, fallbackIndex) {
  const rawIndex = Number.isInteger(issue?.rawIndex)
    ? issue.rawIndex
    : parseProblemRawIndexFromSecondaryText(issue?.secondaryText);
  const suffix = issue?.id ?? `idx-${fallbackIndex}`;

  if (!Number.isInteger(rawIndex) || rawIndex < 0) {
    return `problem-node-${suffix}`;
  }

  return `problem-line-${rawIndex}-${suffix}`;
}

function getProblemRawIndexFromTreeNodeId(nodeId) {
  if (typeof nodeId !== 'string') return null;

  const match = nodeId.match(/^problem-line-(\d+)-/);
  if (!match) return null;

  const rawIndex = Number(match[1]);
  return Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : null;
}

function updateDocumentCheckItem(documentSections, { kind, index, updater }) {
  if (!Array.isArray(documentSections) || !Number.isInteger(index) || index < 0 || typeof updater !== 'function') {
    return documentSections;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  let targetFound = false;
  let checkIndex = 0;

  const nextSections = documentSections.map((section) => {
    if (section?.title?.toLowerCase() !== targetSectionTitle) {
      return section;
    }

    let sectionChanged = false;
    const nextItems = [];

    (section.items ?? []).forEach((item) => {
      if (item?.type !== 'check') {
        nextItems.push(item);
        return;
      }

      if (checkIndex === index) {
        const nextItem = updater(item);
        targetFound = true;
        sectionChanged = true;
        if (nextItem) {
          nextItems.push(nextItem);
        }
      } else {
        nextItems.push(item);
      }

      checkIndex += 1;
    });

    return sectionChanged ? { ...section, items: nextItems } : section;
  });

  return targetFound ? nextSections : documentSections;
}

function applyUpdaterToDocumentCheckItem(item, childPath = [], updater) {
  if (!item || typeof updater !== 'function') {
    return item;
  }

  if (!Array.isArray(childPath) || childPath.length === 0) {
    return updater(item);
  }

  if (item.type !== 'check' || !Array.isArray(item.children)) {
    return item;
  }

  const [childIndex, ...restChildPath] = childPath;
  let didChange = false;

  const nextChildren = item.children.reduce((result, childItem, nextChildIndex) => {
    if (nextChildIndex !== childIndex) {
      result.push(childItem);
      return result;
    }

    const nextChildItem = applyUpdaterToDocumentCheckItem(childItem, restChildPath, updater);
    if (nextChildItem !== childItem) {
      didChange = true;
    }
    if (nextChildItem) {
      result.push(nextChildItem);
    }
    return result;
  }, []);

  if (!didChange) {
    return item;
  }

  return {
    ...item,
    children: nextChildren,
  };
}

function updateDocumentItemAtLineMapEntry(documentSections, lineMapEntry, updater) {
  if (
    !Array.isArray(documentSections)
    || !lineMapEntry
    || lineMapEntry.type !== 'item'
    || !Number.isInteger(lineMapEntry.sectionIndex)
    || !Number.isInteger(lineMapEntry.itemIndex)
    || typeof updater !== 'function'
  ) {
    return documentSections;
  }

  return documentSections.map((section, sectionIndex) => {
    if (sectionIndex !== lineMapEntry.sectionIndex) return section;

    let sectionChanged = false;
    const nextItems = (section.items ?? []).reduce((result, item, itemIndex) => {
      if (itemIndex !== lineMapEntry.itemIndex) {
        result.push(item);
        return result;
      }

      const nextItem = applyUpdaterToDocumentCheckItem(
        item,
        Array.isArray(lineMapEntry.childPath) ? lineMapEntry.childPath : [],
        updater,
      );
      if (nextItem !== item) {
        sectionChanged = true;
      }
      if (nextItem) {
        result.push(nextItem);
      }
      return result;
    }, []);

    return sectionChanged ? { ...section, items: nextItems } : section;
  });
}

function applyIssueQuickFixToDocumentSections(documentSections, { kind, index, replacementText }) {
  if (!replacementText) return documentSections;

  return updateDocumentCheckItem(documentSections, {
    kind,
    index,
    updater: (item) => ({ ...item, text: replacementText }),
  });
}

function applyPendingIssueFixesToSpec({ code, documentSections, appliedIssueFixes, removedIssueIndices }) {
  let nextCode = typeof code === 'string' ? code : '';
  let nextDocument = Array.isArray(documentSections) ? documentSections : [];

  ['ac', 'plan'].forEach((kind) => {
    const fixesForKind = appliedIssueFixes?.[kind] ?? {};
    Object.keys(fixesForKind).forEach((rawOriginalIndex) => {
      const originalIndex = Number(rawOriginalIndex);
      if (!Number.isInteger(originalIndex) || !fixesForKind[originalIndex]) return;

      const fixConfig = getIssueQuickFixConfig(kind, originalIndex);
      const replacementText = getAppliedIssueFixReplacementText(appliedIssueFixes, kind, originalIndex)
        ?? fixConfig?.replacementText;
      if (!replacementText) return;

      const visibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, removedIssueIndices);
      if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return;

      nextCode = applyIssueQuickFixToCode(nextCode, {
        kind,
        index: visibleIndex,
        replacementText,
      });
      nextDocument = applyIssueQuickFixToDocumentSections(nextDocument, {
        kind,
        index: visibleIndex,
        replacementText,
      });
    });
  });

  return {
    code: nextCode,
    documentSections: nextDocument,
  };
}

function normalizeSpecSectionTitle(title = '') {
  return String(title).trim().toLowerCase();
}

function orderAcceptanceBeforePlanSections(documentSections = []) {
  if (!Array.isArray(documentSections)) return [];

  const planIndex = documentSections.findIndex((section) => normalizeSpecSectionTitle(section?.title) === 'plan');
  const acceptanceIndex = documentSections.findIndex((section) => normalizeSpecSectionTitle(section?.title) === 'acceptance criteria');

  if (planIndex < 0 || acceptanceIndex < 0 || acceptanceIndex < planIndex) {
    return documentSections;
  }

  const nextSections = [...documentSections];
  const [acceptanceSection] = nextSections.splice(acceptanceIndex, 1);
  const nextPlanIndex = nextSections.findIndex((section) => normalizeSpecSectionTitle(section?.title) === 'plan');
  nextSections.splice(nextPlanIndex, 0, acceptanceSection);
  return nextSections;
}

function orderAcceptanceBeforePlanCode(code = '') {
  const lines = typeof code === 'string' ? code.split(/\r?\n/) : [];
  const sections = [];
  let preamble = [];
  let currentSection = null;

  lines.forEach((line) => {
    if (/^\s*##\s+/.test(line)) {
      currentSection = { lines: [line], title: getDoneHeadingTitle(line) ?? '' };
      sections.push(currentSection);
      return;
    }

    if (currentSection) {
      currentSection.lines.push(line);
      return;
    }

    preamble.push(line);
  });

  if (sections.length === 0) return code;

  const orderedSections = orderAcceptanceBeforePlanSections(sections);
  return [...preamble, ...orderedSections.flatMap((section) => section.lines)].join('\n');
}

function buildSerializedDocumentLines(documentSections) {
  const lines = [];
  const lineMap = [];
  const orderedDocumentSections = orderAcceptanceBeforePlanSections(documentSections);

  orderedDocumentSections.forEach((section) => {
    const sectionIndex = (documentSections ?? []).indexOf(section);
    const sectionStableId = section?.id ?? `section-${sectionIndex}`;
    const pushCheckLine = (item, itemIndex, { nestingLevel = 0, childPath = [] } = {}) => {
      const normalizedChildPath = Array.isArray(childPath) ? childPath : [];
      const itemStableId = item?.id ?? (
        normalizedChildPath.length === 0
          ? `${sectionStableId}:item-${itemIndex}`
          : `${sectionStableId}:item-${itemIndex}:child-${normalizedChildPath.join('-')}`
      );
      const parentItemId = normalizedChildPath.length > 0
        ? (section.items?.[itemIndex]?.id ?? `${sectionStableId}:item-${itemIndex}`)
        : null;

      lines.push(`${'  '.repeat(nestingLevel)}- [${item.checked ? 'x' : ' '}] ${item.text}`);
      lineMap.push({
        type: 'item',
        sectionIndex,
        itemIndex,
        itemType: item.type,
        sectionId: sectionStableId,
        itemId: itemStableId,
        parentItemId,
        childIndex: normalizedChildPath.length > 0 ? normalizedChildPath[normalizedChildPath.length - 1] : null,
        childPath: normalizedChildPath,
        nestingLevel,
        stableKey: `section-item:${itemStableId}`,
      });

      (item.children ?? []).forEach((childItem, childIndex) => {
        const nextChildPath = [...normalizedChildPath, childIndex];
        if (childItem?.type === 'check') {
          pushCheckLine(childItem, itemIndex, {
            nestingLevel: nestingLevel + 1,
            childPath: nextChildPath,
          });
          return;
        }

        if (childItem?.type === 'bullet') {
          const childStableId = childItem?.id ?? `${itemStableId}:child-${childIndex + 1}`;
          lines.push(`${'  '.repeat(nestingLevel + 1)}- ${childItem.text}`);
          lineMap.push({
            type: 'item',
            sectionIndex,
            itemIndex,
            itemType: childItem.type,
            sectionId: sectionStableId,
            itemId: childStableId,
            parentItemId: itemStableId,
            childIndex,
            childPath: nextChildPath,
            nestingLevel: nestingLevel + 1,
            stableKey: `section-item:${childStableId}`,
          });
        }
      });
    };

    lines.push(`## ${section.title}`);
    lineMap.push({
      type: 'heading',
      sectionIndex,
      sectionId: sectionStableId,
      stableKey: `section-heading:${sectionStableId}`,
    });

    (section.items ?? []).forEach((item, itemIndex) => {
      const itemStableId = item?.id ?? `${sectionStableId}:item-${itemIndex}`;
      if (item.type === 'paragraph') {
        lines.push(item.text);
        lineMap.push({
          type: 'item',
          sectionIndex,
          itemIndex,
          itemType: item.type,
          sectionId: sectionStableId,
          itemId: itemStableId,
          stableKey: `section-item:${itemStableId}`,
        });
      }
      if (item.type === 'check') {
        pushCheckLine(item, itemIndex);
      }
      if (item.type === 'bullet') {
        lines.push(`- ${item.text}`);
        lineMap.push({
          type: 'item',
          sectionIndex,
          itemIndex,
          itemType: item.type,
          sectionId: sectionStableId,
          itemId: itemStableId,
          stableKey: `section-item:${itemStableId}`,
        });
      }
      if (item.type === 'comment') {
        lines.push(`// ${item.text}`);
        lineMap.push({
          type: 'item',
          sectionIndex,
          itemIndex,
          itemType: item.type,
          sectionId: sectionStableId,
          itemId: itemStableId,
          stableKey: `section-item:${itemStableId}`,
        });
      }
    });

    if (orderedDocumentSections.indexOf(section) < orderedDocumentSections.length - 1) {
      lines.push('');
      lineMap.push({
        type: 'separator',
        sectionIndex,
        sectionId: sectionStableId,
        stableKey: `section-separator:${sectionStableId}`,
      });
    }
  });

  return {
    lines,
    lineMap,
    code: lines.join('\n'),
  };
}

function buildDisplayRowSerializedLineMatches(displayRows = [], serializedLines = [], lineMap = []) {
  const matches = new Array(displayRows.length).fill(null);
  let searchStart = 0;

  displayRows.forEach((row, rowIndex) => {
    if (!Number.isInteger(row?.rawIndex) || row?.isVirtual) {
      return;
    }

    const line = typeof row?.line === 'string' ? row.line : '';
    let matchedIndex = -1;

    if (
      row.rawIndex >= searchStart &&
      row.rawIndex < lineMap.length
    ) {
      matchedIndex = row.rawIndex;
    } else {
      for (let index = searchStart; index < serializedLines.length; index += 1) {
        if (serializedLines[index] === line) {
          matchedIndex = index;
          break;
        }
      }
    }

    if (matchedIndex === -1) {
      return;
    }

    matches[rowIndex] = lineMap[matchedIndex]
      ? {
          ...lineMap[matchedIndex],
          matchedIndex,
          sourceLine: serializedLines[matchedIndex] ?? '',
        }
      : null;
    searchStart = matchedIndex + 1;
  });

  return matches;
}

function removeDocumentLineAtRawIndex(documentSections, rawIndex) {
  if (!Array.isArray(documentSections) || !Number.isInteger(rawIndex) || rawIndex < 0) {
    return documentSections;
  }

  const { lineMap } = buildSerializedDocumentLines(documentSections);
  const target = lineMap[rawIndex];
  if (!target || target.type !== 'item') {
    return documentSections;
  }

  return updateDocumentItemAtLineMapEntry(documentSections, target, () => null);
}

function removeLineFromCode(code, rawIndex) {
  if (typeof code !== 'string' || !Number.isInteger(rawIndex) || rawIndex < 0) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  if (rawIndex >= lines.length) return code;
  lines.splice(rawIndex, 1);
  return lines.join('\n');
}

function getLatestCommentCommand(comments = []) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    if (typeof comment !== 'string') continue;

    const normalizedComment = comment.replace(/\s+/g, ' ').trim().toLowerCase();
    if (/^delete(?: this)?[.!?]?$/.test(normalizedComment)) {
      return {
        action: 'delete',
        text: comment,
      };
    }

    if (/^fix(?: this)?[.!?]?$/.test(normalizedComment)) {
      return {
        action: 'fix',
        text: comment,
      };
    }
  }

  return null;
}

function getLatestCommentText(comments = []) {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    if (typeof comment !== 'string') continue;

    const normalizedComment = comment.replace(/\s+/g, ' ').trim();
    if (normalizedComment) {
      return normalizedComment;
    }
  }

  return '';
}

function normalizeCommentInstructionText(commentText = '') {
  if (typeof commentText !== 'string') return '';

  return commentText
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(note|comment)\s*:\s*/i, '')
    .replace(/^(please|pls)\s+/i, '');
}

function lowercaseLeadingCharacter(text = '') {
  if (!text) return '';
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function finishSentence(text = '') {
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function compactCommentRewriteText(commentText = '') {
  const normalizedCommentText = normalizeCommentInstructionText(commentText);
  if (!normalizedCommentText) return '';

  const firstSentence = normalizedCommentText.split(/(?<=[.!?])\s+/)[0] ?? normalizedCommentText;
  const compactText = firstSentence.replace(/[.!?]\s*$/, '').trim();
  if (compactText.length <= 96) return compactText;

  return `${compactText.slice(0, 93).trimEnd()}...`;
}

function applyCommentTextReplacement(baseText = '', instructionText = '') {
  const replacementMatch =
    instructionText.match(/^replace\s+["“'](.+?)["”']\s+with\s+["“'](.+?)["”']$/i) ??
    instructionText.match(/^rename\s+["“'](.+?)["”']\s+to\s+["“'](.+?)["”']$/i);

  if (!replacementMatch) {
    return '';
  }

  const [, fromText, toText] = replacementMatch;
  if (!fromText || !toText || !baseText.includes(fromText)) {
    return '';
  }

  return baseText.replace(fromText, toText);
}

function buildCommentEnhancedText(currentText = '', commentText = '') {
  const normalizedCurrentText = typeof currentText === 'string' ? currentText.trim() : '';
  const normalizedCommentText = compactCommentRewriteText(commentText);

  if (!normalizedCurrentText || !normalizedCommentText) {
    return normalizedCurrentText || currentText;
  }

  const normalizedBaseText = normalizedCurrentText.replace(/\s*[:;,.]\s*$/, '');
  if (!normalizedBaseText) {
    return normalizedCurrentText || currentText;
  }

  const explicitReplacement = applyCommentTextReplacement(normalizedBaseText, normalizedCommentText);
  if (explicitReplacement) {
    return finishSentence(explicitReplacement.trim());
  }

  if (normalizedBaseText.toLowerCase().includes(normalizedCommentText.toLowerCase())) {
    return finishSentence(normalizedBaseText);
  }

  return finishSentence(`${normalizedBaseText}; ${lowercaseLeadingCharacter(normalizedCommentText)}`);
}

function updateDocumentItemAtRawIndex(documentSections, rawIndex, updater) {
  if (!Array.isArray(documentSections) || !Number.isInteger(rawIndex) || rawIndex < 0 || typeof updater !== 'function') {
    return documentSections;
  }

  const { lineMap } = buildSerializedDocumentLines(documentSections);
  const target = lineMap[rawIndex];
  if (!target || target.type !== 'item') {
    return documentSections;
  }

  return updateDocumentItemAtLineMapEntry(documentSections, target, updater);
}

function getDocumentItemLocationForCommentEntry(documentSections, entry, removedIssueIndices = null) {
  if (!Array.isArray(documentSections)) {
    return null;
  }

  const serializedDocument = buildSerializedDocumentLines(documentSections);
  const { lineMap, lines } = serializedDocument;

  if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey) {
    const stableKeyRawIndex = lineMap.findIndex((lineEntry) => (
      lineEntry?.type === 'item' && lineEntry.stableKey === entry.rowStableKey
    ));

    if (stableKeyRawIndex >= 0) {
      return {
        rawIndex: stableKeyRawIndex,
        lineMapEntry: lineMap[stableKeyRawIndex] ?? null,
        line: lines[stableKeyRawIndex] ?? '',
      };
    }
  }

  const normalizedTarget = normalizeCommentTarget(entry?.checkTarget ?? entry?.issueTarget ?? null);
  if (normalizedTarget) {
    const visibleIndex = mapOriginalIssueIndexToVisible(
      normalizedTarget.kind,
      normalizedTarget.index,
      removedIssueIndices,
    );
    const rawIndex = getDocumentCheckRawIndex(documentSections, normalizedTarget.kind, visibleIndex);
    if (Number.isInteger(rawIndex) && rawIndex >= 0) {
      return {
        rawIndex,
        lineMapEntry: lineMap[rawIndex] ?? null,
        line: lines[rawIndex] ?? '',
      };
    }
  }

  if (Number.isInteger(entry?.rawIndex) && entry.rawIndex >= 0) {
    const rawEntry = lineMap[entry.rawIndex];
    if (rawEntry?.type === 'item') {
      return {
        rawIndex: entry.rawIndex,
        lineMapEntry: rawEntry,
        line: lines[entry.rawIndex] ?? '',
      };
    }
  }

  return null;
}

function updateDocumentItemForCommentEntry(documentSections, entry, removedIssueIndices = null, updater) {
  if (!Array.isArray(documentSections) || typeof updater !== 'function') {
    return documentSections;
  }

  const location = getDocumentItemLocationForCommentEntry(documentSections, entry, removedIssueIndices);
  if (!location?.lineMapEntry || location.lineMapEntry.type !== 'item') {
    return documentSections;
  }

  return updateDocumentItemAtLineMapEntry(documentSections, location.lineMapEntry, updater);
}

function buildCommentTargetEntryMetadata(documentSections, target, removedIssueIndices = null) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) {
    return {};
  }

  const location = getDocumentItemLocationForCommentEntry(
    documentSections,
    {
      checkTarget: normalizedTarget,
      issueTarget: normalizedTarget,
    },
    removedIssueIndices,
  );

  if (!location) {
    return {};
  }

  return {
    rawIndex: location.rawIndex,
    rowStableKey: location.lineMapEntry?.stableKey ?? null,
    line: location.line ?? '',
  };
}

function applyCommentCommandsToSpec({
  code,
  documentSections,
  commentEntries,
  appliedIssueFixes,
  removedIssueIndices,
}) {
  let nextDocument = documentSections;
  let nextCode = typeof code === 'string' ? code : serializeSpecDocument(documentSections);
  const nextAppliedIssueFixes = cloneIssueStateMap(appliedIssueFixes);
  const nextRemovedIssueIndices = cloneIssueStateMap(removedIssueIndices);
  const deleteActions = [];
  const quickFixActions = [];
  const enhanceActions = [];

  (commentEntries ?? []).forEach((entry) => {
    const command = getLatestCommentCommand(entry?.comments ?? []);
    const latestCommentText = getLatestCommentText(entry?.comments ?? []);
    const fixTarget = entry?.issueTarget ?? entry?.checkTarget ?? null;
    const deleteTarget = entry?.checkTarget ?? entry?.issueTarget ?? null;

    if (!command) {
      if (latestCommentText) {
        enhanceActions.push({
          ...entry,
          commentText: latestCommentText,
        });
      }
      return;
    }

    const nextAction = {
      ...entry,
      deleteTarget,
      fixTarget,
      action: command.action,
    };

    if (command.action === 'delete') {
      if (deleteTarget || Number.isInteger(entry?.rawIndex) || entry?.rowStableKey) {
        deleteActions.push(nextAction);
      }
      return;
    }

    if (command.action === 'fix') {
      if (fixTarget && getIssueQuickFixConfig(fixTarget.kind, fixTarget.index)) {
        quickFixActions.push(nextAction);
      }
    }
  });

  deleteActions
    .slice()
    .forEach((entry) => {
      const location = getDocumentItemLocationForCommentEntry(
        nextDocument,
        entry,
        nextRemovedIssueIndices,
      );
      if (!location || !Number.isInteger(location.rawIndex)) {
        return;
      }

      nextCode = removeLineFromCode(nextCode, location.rawIndex);
      nextDocument = removeDocumentLineAtRawIndex(nextDocument, location.rawIndex);

      const isNestedChildRow = Array.isArray(location.lineMapEntry?.childPath) && location.lineMapEntry.childPath.length > 0;

      if (entry.deleteTarget && !isNestedChildRow) {
        nextRemovedIssueIndices[entry.deleteTarget.kind][entry.deleteTarget.index] = true;
        delete nextAppliedIssueFixes[entry.deleteTarget.kind][entry.deleteTarget.index];
      }
    });

  quickFixActions.forEach((entry) => {
    const { kind, index } = entry.fixTarget;
    if (nextRemovedIssueIndices[kind][index]) return;

    const fixConfig = getIssueQuickFixConfig(kind, index);
    if (!fixConfig) return;
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, index, nextRemovedIssueIndices);
    if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return;

    nextCode = applyIssueQuickFixToCode(nextCode, {
      kind,
      index: visibleIndex,
      replacementText: fixConfig.replacementText,
    });
    nextDocument = applyIssueQuickFixToDocumentSections(nextDocument, {
      kind,
      index: visibleIndex,
      replacementText: fixConfig.replacementText,
    });
    nextAppliedIssueFixes[kind][index] = createAppliedIssueFixValue(fixConfig.replacementText);
  });

  let hasEnhancedComments = false;

  enhanceActions.forEach((entry) => {
    const previousDocument = nextDocument;
    nextDocument = updateDocumentItemForCommentEntry(nextDocument, entry, nextRemovedIssueIndices, (item) => {
      if (!item || typeof item.text !== 'string') return item;

      const nextText = buildCommentEnhancedText(item.text, entry.commentText);
      if (!nextText || nextText === item.text) return item;

      return {
        ...item,
        text: nextText,
      };
    });

    if (nextDocument !== previousDocument) {
      hasEnhancedComments = true;
    }
  });

  nextCode = serializeSpecDocument(nextDocument);

  const hasActionableComments =
    deleteActions.length > 0
    || quickFixActions.length > 0
    || hasEnhancedComments;

  return {
    hasActionableComments,
    nextDocument,
    nextAppliedIssueFixes,
    nextRemovedIssueIndices,
    sourceCode: nextCode,
  };
}

const DEFAULT_PROBLEMS_ISSUES = [
  { severity: 'warning', label: 'Review nullable branch', secondaryText: 'Line 8' },
  { severity: 'error', label: 'Resolve failing validation', secondaryText: 'Line 14' },
];

const AGENT_TASK_PROBLEMS_ISSUES = [
  { severity: 'warning', label: 'Double-booking error UX is unspecified.', secondaryText: 'Line 8' },
];

const VISIT_BOOKING_CONFLICT_PROBLEM_TARGET = { kind: 'ac', index: 2 };
const VISIT_BOOKING_CONFLICT_PROBLEM_TITLE = 'Double-booking error UX is unspecified.';
const VISIT_BOOKING_CONFLICT_PROBLEM_DESCRIPTION = 'How would you like to specify it?';
const VISIT_BOOKING_CONFLICT_PROBLEM_OPTIONS = [
  {
    label: 'Inline error on vet field',
    replacementText: 'A vet cannot be booked for the same date+time twice. On a blocked booking, the form re-renders with an inline error on the vet field.',
  },
  {
    label: 'Conflict modal',
    replacementText: 'A vet cannot be booked for the same date+time twice. On conflict, the user sees a modal with conflict details and can pick a different time slot.',
  },
  {
    label: 'Let the agent decide',
    isSoftOption: true,
    replacementText: 'A vet cannot be booked for the same date+time twice. On a blocked booking, the form re-renders with an inline error on the vet field.',
  },
  {
    label: 'Describe a different fix',
    isCustomInput: true,
    replacementText: 'A vet cannot be booked for the same date+time twice. The conflict UX follows the custom instruction provided for this inspection.',
  },
];

const EDITOR_PROBLEMS_BY_LABEL = {
  'VisitController.java': {
    path: `${PROJECT_ROOT_PATH}/src/main/java/org/springframework/samples/petclinic/owner`,
    issues: [
      { severity: 'warning', label: 'populateTimeSlots() rebuilds list on every request', secondaryText: 'Line 121' },
      { severity: 'warning', label: '`ModelAttribute("vets")` loads all vets on GET — no pre-filtering', secondaryText: 'Line 95' },
      { severity: 'error', label: 'DataIntegrityViolationException not caught — 500 on concurrent booking', secondaryText: 'Line 142' },
      { severity: 'error', label: 'Missing VetFormatter — form binding will fail at runtime', secondaryText: 'Line 108' },
    ],
  },
};

const MY_LEFT_STRIPE = DEFAULT_LEFT_STRIPE_ITEMS.filter(i =>
  ['project', 'commit', 'structure'].includes(i.id)
);
const DECORATIVE_LEFT_STRIPE_ITEMS = MY_LEFT_STRIPE.map(({ panel, ...item }) => item);
const DECORATIVE_RIGHT_STRIPE_ITEMS = DEFAULT_RIGHT_STRIPE_ITEMS.map(({ panel, ...item }) => item);

const AGENT_TASKS_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M13.2701 19.13C14.0501 19.13 14.6901 18.5 14.6901 17.71C14.6901 16.92 14.0601 16.29 13.2701 16.29C12.4801 16.29 11.8501 16.92 11.8501 17.71C11.8501 18.5 12.4801 19.13 13.2701 19.13Z" fill="currentColor"/>
    <path d="M10.4202 17.71C6.0202 17.71 2.4502 14.26 2.4502 10C2.4502 5.74004 6.0202 2.29004 10.4202 2.29004" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M17.34 7.87004C17.34 10.86 14.35 13.45 10.43 13.45C6.51002 13.45 3.52002 10.86 3.52002 7.87004C3.52002 4.88004 6.51002 2.29004 10.43 2.29004C14.35 2.29004 17.34 4.88004 17.34 7.87004Z" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);

// ─── Completion data ──────────────────────────────────────────────────────────

const COMPLETION_POPUP_MAX_ITEMS = 8;

const AT_COMPLETIONS = [
  { label: 'New Task.md',                  description: 'Agent Specifications' },
  { label: 'Configuration.md',             description: 'Agent Specifications' },
  { label: 'visit-booking.md',             description: 'Agent Specifications' },
  { label: 'vet-schedules.md',             description: 'Agent Specifications' },
  { label: 'visit-booking-inspections.md', description: 'Agent Specifications' },
  { label: 'visit-booking-beat-3-execution.md', description: 'Agent Specifications' },
  { label: 'visit-booking-code-review-moment.md', description: 'Agent Specifications' },
];

const HASH_COMPLETIONS = [
  { label: 'Configuration.md',             description: 'Agent Specifications' },
  { label: 'VisitController.java',         description: 'owner'          },
  { label: 'Visit.java',                   description: 'owner'          },
  { label: 'VetFormatter.java',            description: 'vet'            },
  { label: 'createOrUpdateVisitForm.html', description: 'templates/pets' },
  { label: 'schema.sql',                   description: 'db/h2'          },
];

const SLASH_COMPLETIONS = [
  { label: '/summarize-changes', description: 'Summarizes the changes made in the run' },
  { label: '/update-knowledge-base', description: 'Records what was learned for future runs' },
  { label: '/check-unused', description: 'Flags dead code and unused imports' },
  { label: '/post-metrics', description: 'Logs run duration, tokens, and pass rate' },
];

const COMPLETION_PREVIEW_MAX_LINES = 5;
const COMPLETION_PREVIEW_MAX_SECTIONS = 6;

const COMPLETION_PREVIEW_LIBRARY = {
  'New Task.md': {
    previewLines: [
      '## Goal',
      'Describe the capability or workflow the agent should deliver.',
      '## Acceptance Criteria',
      '- Make the result testable and concrete.',
      '## Plan',
      '- Outline the implementation steps.',
    ],
    sections: ['Goal', 'Acceptance Criteria', 'Plan', 'Implementation Notes'],
  },
  'Configuration.md': {
    previewLines: [
      '## Context',
      '- `VetRepository.findAll()` is `Cacheable("vets")`.',
      '- Formatter<T> is required for entity-backed form selects.',
      '## Constraints',
      '- Keep H2, MySQL, and PostgreSQL schema updates aligned.',
    ],
    sections: ['Context', 'Constraints', 'Dependencies', 'Related Files'],
  },
  'visit-booking-inspections.md': {
    previewLines: [
      '## Acceptance Criteria Findings',
      '- AC/Plan mismatch around available vets filtering.',
      '- Ambiguous time-slot granularity in AC #2.',
      '## Plan Findings',
      '- Missing VetFormatter step for form binding.',
    ],
    sections: ['Acceptance Criteria Findings', 'Plan Findings', 'Quick Fixes'],
  },
  'visit-booking-beat-3-execution.md': {
    previewLines: [
      '## Command',
      'agent run "visit-booking.md" --section "Acceptance Criteria"',
      '## Pause',
      'Paused - AC 1 requires spec update.',
      '## Rebuild',
    ],
    sections: ['Command', 'Execution Log', 'Pause', 'Rebuild'],
  },
  'visit-booking-code-review-moment.md': {
    previewLines: [
      '## Review Summary',
      '- Time slots are rebuilt on every request.',
      '- Race condition still needs DB-backed protection.',
      '## Follow-up',
      '- Tighten the implementation notes and rebuild checks.',
    ],
    sections: ['Review Summary', 'Blocking Findings', 'Follow-up'],
  },
  'VisitController.java': {
    sections: ['populateVets()', 'populateTimeSlots()', 'initNewVisitForm()', 'processNewVisitForm()'],
  },
  'Visit.java': {
    sections: ['Fields', 'Relationships', 'Accessors'],
  },
  'VetFormatter.java': {
    previewLines: [
      'public class VetFormatter implements Formatter<Vet> {',
      '    public Vet parse(String text, Locale locale) {',
      '        return this.vetRepository.findById(Integer.parseInt(text));',
      '    }',
      '}',
    ],
    sections: ['parse()', 'print()'],
  },
  'createOrUpdateVisitForm.html': {
    sections: ['vet-select', 'time-slot-select', 'validation-message'],
  },
  'schema.sql': {
    sections: ['visits-table', 'unique-constraint', 'seed-data'],
  },
  '/update-knowledge-base': {
    previewLines: [
      '## Skill',
      'Capture durable decisions, conventions, or discoveries from the current task.',
      '## Typical use',
      '- Update project memory after a meaningful implementation pass.',
    ],
    sections: ['Skill', 'Typical use'],
  },
  '/check-unused': {
    previewLines: [
      '## Skill',
      'Look for dead code, stale references, and imports or assets that are no longer needed.',
      '## Typical use',
      '- Run after a larger refactor or workflow simplification.',
    ],
    sections: ['Skill', 'Typical use'],
  },
  '/post-metric': {
    previewLines: [
      '## Skill',
      'Record a short delivery metric or execution note for the current task.',
      '## Typical use',
      '- Publish a lightweight progress signal at the end of a run.',
    ],
    sections: ['Skill', 'Typical use'],
  },
  '/guided-merge': {
    previewLines: [
      '## Skill',
      'Prepare a cautious merge path with checks, context, and reviewer-facing notes.',
      '## Typical use',
      '- Use after implementation and self-review are already complete.',
    ],
    sections: ['Skill', 'Typical use'],
  },
};

function getCompletionItemsForTrigger(trigger) {
  if (trigger === '@') return AT_COMPLETIONS;
  if (trigger === '#') return HASH_COMPLETIONS;
  if (trigger === '/') return SLASH_COMPLETIONS;
  return [];
}

function buildCompletionPreviewLinesFromText(text = '', maxLines = COMPLETION_PREVIEW_MAX_LINES) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\u00A0/g, ' ').trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines);

  return lines.length > 0 ? lines : ['No preview available'];
}

function slugifyCompletionAnchor(text = '') {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function normalizeCompletionPreviewSections(sections = []) {
  return (sections ?? [])
    .map((section, index) => {
      if (typeof section === 'string') {
        return {
          id: `${slugifyCompletionAnchor(section)}-${index}`,
          title: section,
          anchor: slugifyCompletionAnchor(section),
        };
      }

      if (!section || typeof section.title !== 'string' || section.title.trim().length === 0) {
        return null;
      }

      return {
        id: section.id ?? `${slugifyCompletionAnchor(section.title)}-${index}`,
        title: section.title,
        anchor: section.anchor ?? slugifyCompletionAnchor(section.title),
      };
    })
    .filter(Boolean)
    .slice(0, COMPLETION_PREVIEW_MAX_SECTIONS);
}

function buildCompletionPreviewSectionsFromDocument(documentSections = []) {
  return normalizeCompletionPreviewSections(
    (documentSections ?? [])
      .filter((section) => typeof section?.title === 'string' && section.title.trim().length > 0)
      .map((section) => ({
        id: section.id ?? section.title,
        title: section.title.trim(),
      }))
  );
}

function getEditorTabContentByLabel(label = '') {
  if (label === 'VisitController.java') return MY_EDITOR_TAB_CONTENTS['1'] ?? null;
  if (label === 'Visit.java') return MY_EDITOR_TAB_CONTENTS['2'] ?? null;
  if (label === 'createOrUpdateVisitForm.html') return MY_EDITOR_TAB_CONTENTS['3'] ?? null;
  if (label === 'schema.sql') return MY_EDITOR_TAB_CONTENTS['4'] ?? null;
  return null;
}

function buildDocumentCompletionPreview(item, documentSections = []) {
  return {
    label: item.label,
    description: item.description,
    previewLines: buildCompletionPreviewLinesFromText(serializeSpecDocument(documentSections)),
    sections: buildCompletionPreviewSectionsFromDocument(documentSections),
  };
}

function getCompletionPreviewData(item) {
  if (!item) return null;

  if (item.label === 'visit-booking.md') {
    return buildDocumentCompletionPreview(item, createSpecDocument());
  }

  if (item.label === 'vet-schedules.md') {
    return buildDocumentCompletionPreview(item, createVetSchedulesSpecDocument());
  }

  const editorTabContent = getEditorTabContentByLabel(item.label);
  const preset = COMPLETION_PREVIEW_LIBRARY[item.label] ?? null;

  return {
    label: item.label,
    description: item.description,
    previewLines: preset?.previewLines
      ? buildCompletionPreviewLinesFromText(preset.previewLines.join('\n'))
      : buildCompletionPreviewLinesFromText(editorTabContent?.code ?? item.description),
    sections: normalizeCompletionPreviewSections(preset?.sections ?? []),
  };
}

function buildCompletionSelection(item, section = null) {
  if (!item) return null;

  return {
    ...item,
    insertText: `${item.label}${section?.anchor ? `#${section.anchor}` : ''}`,
    attachment: {
      label: item.label,
      description: item.description,
    },
    section: section ? { ...section } : null,
  };
}

function getCompletionInsertText(item) {
  return item?.insertText ?? item?.label ?? '';
}

function getCompletionAttachment(item) {
  if (item?.attachment?.label) {
    return item.attachment;
  }

  if (typeof item?.label === 'string' && item.label.trim().length > 0) {
    return {
      label: item.label,
      description: item.description,
    };
  }

  return null;
}

const BOTTOM_TOOL_WINDOW_IDS = new Set(['terminal', 'git', 'problems']);
const BOTTOM_TOOL_WINDOW_TITLES = {
  terminal: 'Terminal',
  git: 'Git',
  problems: 'Problems',
};
const TERMINAL_TASK_TAB_BASE_LABEL = 'visit-booking.md';

function ProblemsFileNodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.9498 3.05025C15.6835 5.78392 15.6835 10.2161 12.9498 12.9497C10.2162 15.6834 5.784 15.6834 3.05033 12.9497C0.316663 10.2161 0.316663 5.78392 3.05033 3.05025C5.784 0.316582 10.2162 0.316583 12.9498 3.05025Z" fill="#3D3223" />
      <path fillRule="evenodd" clipRule="evenodd" d="M14.9144 6.90481L13.9266 7.06045C13.736 5.85124 13.1756 4.69027 12.2427 3.75736C11.3098 2.82445 10.1488 2.26404 8.93963 2.07352L9.09527 1.0857C10.5063 1.30802 11.8624 1.96287 12.9498 3.05025C14.0372 4.13763 14.6921 5.49375 14.9144 6.90481ZM6.90489 1.0857L7.06053 2.07352C5.85132 2.26404 4.69035 2.82445 3.75744 3.75736C2.82453 4.69027 2.26412 5.85124 2.0736 7.06045L1.08579 6.90481C1.30811 5.49375 1.96295 4.13763 3.05033 3.05025C4.13771 1.96287 5.49383 1.30802 6.90489 1.0857ZM1.08579 9.09519C1.30811 10.5063 1.96295 11.8624 3.05033 12.9497C4.13771 14.0371 5.49383 14.692 6.90489 14.9143L7.06053 13.9265C5.85132 13.736 4.69035 13.1755 3.75744 12.2426C2.82453 11.3097 2.26412 10.1488 2.0736 8.93955L1.08579 9.09519ZM9.09527 14.9143L8.93963 13.9265C10.1488 13.736 11.3098 13.1755 12.2427 12.2426C13.1756 11.3097 13.736 10.1488 13.9266 8.93955L14.9144 9.09519C14.6921 10.5063 14.0372 11.8624 12.9498 12.9497C11.8624 14.0371 10.5063 14.692 9.09527 14.9143Z" fill="#D6AE58" />
      <path d="M9 4.5L6 8H10L7 11.5" stroke="#D6AE58" strokeLinecap="round" />
    </svg>
  );
}

function ProblemsWarningNodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M1.27603 10.8634L6.3028 1.98903C7.04977 0.670323 8.94893 0.670326 9.69589 1.98903L14.7227 10.8634C15.516 12.2639 14.5047 14 12.8956 14H3.10308C1.494 14 0.482737 12.2639 1.27603 10.8634Z" fill="#C7A450" />
      <path d="M9 5C9 4.44772 8.55228 4 8 4C7.44772 4 7 4.44772 7 5V7.5C7 8.05229 7.44772 8.5 8 8.5C8.55229 8.5 9 8.05228 9 7.5L9 5Z" fill="#1E1F22" />
      <path d="M8 12C8.55228 12 9 11.5523 9 11C9 10.4477 8.55228 10 8 10C7.44772 10 7 10.4477 7 11C7 11.5523 7.44772 12 8 12Z" fill="#1E1F22" />
    </svg>
  );
}

function ProblemsErrorNodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8ZM7 5C7 4.44772 7.44772 4 8 4C8.55229 4 9 4.44772 9 5V8C9 8.55228 8.55229 9 8 9C7.44772 9 7 8.55228 7 8V5ZM9 11C9 11.5523 8.55229 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55229 10 9 10.4477 9 11Z" fill="#DB5C5C" />
    </svg>
  );
}

function ProblemsCommentNodeIcon() {
  return (
    <span className="problems-comment-node-icon" aria-hidden="true">
      <DoneCommentCountIcon />
    </span>
  );
}

function VisitBookingProblemDiagnosticLabel({ rawIndex = null, onExpand = null }) {
  return (
    <div
      className="visit-problem-diagnostic-label"
      data-problem-raw-index={Number.isInteger(rawIndex) ? rawIndex : undefined}
      onClick={() => onExpand?.(rawIndex)}
    >
      <span className="visit-problem-diagnostic-title">{VISIT_BOOKING_CONFLICT_PROBLEM_TITLE}</span>
      <span className="visit-problem-diagnostic-description">{VISIT_BOOKING_CONFLICT_PROBLEM_DESCRIPTION}</span>
    </div>
  );
}

function VisitBookingProblemOptionLabel({ option, optionIndex = 0, onSelect }) {
  const optionClassName = [
    'visit-problem-option',
    option?.isSoftOption ? 'visit-problem-option-soft' : '',
    option?.isCustomInput ? 'visit-problem-option-custom' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={optionClassName}
      data-visit-problem-option-index={optionIndex}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect?.(option);
      }}
    >
      <span className="visit-problem-option-caret" aria-hidden="true">
        <DoneCommentCountIcon />
      </span>
      <span className="visit-problem-option-label">{option.label}</span>
    </button>
  );
}

function VisitBookingProblemCommentLabel({ comment, isFading = false }) {
  return (
    <div className={`visit-problem-comment-label${isFading ? ' visit-problem-comment-label-fading' : ''}`}>
      <span className="visit-problem-comment-marker" aria-hidden="true">
        <DoneCommentCountIcon />
      </span>
      <span className="visit-problem-comment-text">{comment}</span>
    </div>
  );
}

function renderProblemsFileIcon(tab) {
  if (typeof tab?.icon === 'string') {
    return (
      <span className="problems-active-file-icon">
        <Icon name={tab.icon} size={16} />
      </span>
    );
  }

  if (tab?.icon) {
    return <span className="problems-active-file-icon">{tab.icon}</span>;
  }

  return (
    <span className="problems-active-file-icon">
      <ProblemsFileNodeIcon />
    </span>
  );
}

function EditorTabRunningIcon({ icon, tone = 'green' }) {
  return (
    <span className="editor-tab-running-icon" aria-hidden="true">
      {typeof icon === 'string' ? <Icon name={icon} size={16} /> : icon}
      <span className={`editor-tab-running-dot editor-tab-running-dot-${tone}`} />
    </span>
  );
}

function StatusBarActiveFileLabel({ icon, label, tone = null }) {
  return (
    <span className="status-bar-active-file">
      {tone && typeof icon === 'string'
        ? <EditorTabRunningIcon icon={icon} tone={tone} />
        : (typeof icon === 'string'
            ? <Icon name={icon} size={16} className="tab-icon" />
            : <span className="tab-icon">{icon}</span>)}
      <span className="status-bar-active-file-label">{label}</span>
    </span>
  );
}

function findFirstProjectFileFromRunStatuses(...statusLists) {
  for (const statuses of statusLists) {
    if (!Array.isArray(statuses)) continue;

    for (const statusItem of statuses) {
      const checks = Array.isArray(statusItem?.checks) ? statusItem.checks : [];
      const checkWithFile = checks.find((check) => typeof check?.chip === 'string' && check.chip.trim().length > 0);
      if (checkWithFile) return checkWithFile.chip.trim();
    }
  }

  return null;
}

function getProblemsMetaForTab(tab, agentTaskIssuesOverride = null) {
  if (!tab || tab.id === 'welcome') {
    return {
      label: 'No file selected',
      path: PROJECT_ROOT_PATH,
      issues: [],
    };
  }

  const staticMeta = EDITOR_PROBLEMS_BY_LABEL[tab.label];
  if (staticMeta) {
    return {
      label: tab.label,
      path: staticMeta.path,
      issues: staticMeta.issues,
    };
  }

  if (tab.id?.startsWith('agent-task-') || tab.label.endsWith('.md')) {
    return {
      label: tab.label,
      path: AGENT_SPECS_PATH,
      issues: agentTaskIssuesOverride ?? AGENT_TASK_PROBLEMS_ISSUES,
    };
  }

  return {
    label: tab.label,
    path: PROJECT_ROOT_PATH,
    issues: DEFAULT_PROBLEMS_ISSUES,
  };
}

function buildCommentIssuesFromEntries(commentEntries = []) {
  return commentEntries.flatMap((entry, entryIndex) => (
    (entry.comments ?? []).map((comment, commentIndex) => ({
      id: `comment-${entry.rowIndex ?? entryIndex}-${commentIndex}`,
      severity: 'comment',
      label: comment,
      rawIndex: Number.isInteger(entry.rawIndex) ? entry.rawIndex : null,
      secondaryText: Number.isInteger(entry.rawIndex)
        ? `Line ${entry.rawIndex + 1}`
        : (entry.sectionTitle || 'Comment'),
    }))
  ));
}

function getCommentTargetStorageKey(entry) {
  const checkKind = entry?.checkTarget?.kind;
  const checkIndex = entry?.checkTarget?.index;
  if ((checkKind === 'ac' || checkKind === 'plan') && Number.isInteger(checkIndex) && checkIndex >= 0) {
    return `check:${checkKind}:${checkIndex}`;
  }

  const issueKind = entry?.issueTarget?.kind;
  const issueIndex = entry?.issueTarget?.index;
  if ((issueKind === 'ac' || issueKind === 'plan') && Number.isInteger(issueIndex) && issueIndex >= 0) {
    return `issue:${issueKind}:${issueIndex}`;
  }

  return null;
}

function normalizeCommentTarget(target) {
  const kind = target?.kind;
  const index = target?.index;

  if ((kind === 'ac' || kind === 'plan') && Number.isInteger(index) && index >= 0) {
    return { kind, index };
  }

  return null;
}

function formatDemoTargetId(target) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) return null;

  return `${normalizedTarget.kind}-${normalizedTarget.index}`;
}

function toDemoSlug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function doesEntryMatchCommentTarget(entry, target) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) return false;

  const matchesCheckTarget =
    entry?.checkTarget?.kind === normalizedTarget.kind &&
    entry?.checkTarget?.index === normalizedTarget.index;
  const matchesIssueTarget =
    entry?.issueTarget?.kind === normalizedTarget.kind &&
    entry?.issueTarget?.index === normalizedTarget.index;

  return matchesCheckTarget || matchesIssueTarget;
}

function normalizeStoredDiffCommentsState(diffComments = {}) {
  if (!diffComments || typeof diffComments !== 'object') {
    return {};
  }

  return Object.entries(diffComments).reduce((nextState, [rowId, comments]) => {
    const nextComments = Array.isArray(comments)
      ? comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
      : [];

    if (nextComments.length > 0) {
      nextState[rowId] = nextComments;
    }

    return nextState;
  }, {});
}

function flattenStoredDiffCommentsState(diffComments = {}) {
  const seenComments = new Set();

  return Object.values(normalizeStoredDiffCommentsState(diffComments))
    .flat()
    .filter((comment) => {
      const normalizedComment = comment.trim().toLowerCase();
      if (seenComments.has(normalizedComment)) {
        return false;
      }
      seenComments.add(normalizedComment);
      return true;
    });
}

function getCommentsForCommentTarget(commentEntries = [], target) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) return [];

  return (commentEntries ?? []).flatMap((entry) => (
    doesEntryMatchCommentTarget(entry, normalizedTarget)
      ? (entry.comments ?? []).filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
      : []
  ));
}

function replaceCommentEntriesForTarget(commentEntries = [], target, comments = [], metadata = {}) {
  const normalizedTarget = normalizeCommentTarget(target);
  if (!normalizedTarget) {
    return Array.isArray(commentEntries) ? commentEntries : [];
  }

  const nextComments = Array.isArray(comments)
    ? comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
    : [];
  const existingEntries = Array.isArray(commentEntries) ? commentEntries : [];
  const existingEntry = existingEntries.find((entry) => doesEntryMatchCommentTarget(entry, normalizedTarget)) ?? null;
  const remainingEntries = existingEntries.filter((entry) => !doesEntryMatchCommentTarget(entry, normalizedTarget));
  const normalizedDiffComments =
    'diffComments' in metadata
      ? normalizeStoredDiffCommentsState(metadata.diffComments)
      : normalizeStoredDiffCommentsState(existingEntry?.diffComments);

  if (nextComments.length === 0) {
    return remainingEntries;
  }

  return [
    ...remainingEntries,
    {
      ...existingEntry,
      sectionTitle: metadata.sectionTitle ?? existingEntry?.sectionTitle ?? (normalizedTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria'),
      line: metadata.line ?? existingEntry?.line ?? '',
      rawIndex: metadata.rawIndex ?? existingEntry?.rawIndex,
      rowStableKey: metadata.rowStableKey ?? existingEntry?.rowStableKey,
      diffComments: Object.keys(normalizedDiffComments).length > 0 ? normalizedDiffComments : undefined,
      checkTarget: normalizedTarget,
      issueTarget: normalizedTarget,
      comments: nextComments,
    },
  ];
}

function buildPlanDiffInitialComments(commentEntries = [], diffData = null, target = null) {
  const existingEntry = (commentEntries ?? []).find((entry) => doesEntryMatchCommentTarget(entry, target)) ?? null;
  const storedDiffComments = normalizeStoredDiffCommentsState(existingEntry?.diffComments);
  if (Object.keys(storedDiffComments).length > 0) {
    return storedDiffComments;
  }

  const nextComments = getCommentsForCommentTarget(commentEntries, target);
  if (nextComments.length === 0) return {};

  const targetRowId =
    diffData?.focusRowId ??
    diffData?.rows?.find((row) => row.kind === 'added' || row.kind === 'context')?.id ??
    diffData?.rows?.[0]?.id ??
    null;

  if (!targetRowId) return {};

  return {
    [targetRowId]: nextComments,
  };
}

function mergeCommentEntriesWithExistingDiffAnchors(nextEntries = [], previousEntries = []) {
  const normalizedPreviousEntries = Array.isArray(previousEntries) ? previousEntries : [];

  return (Array.isArray(nextEntries) ? nextEntries : []).map((entry) => {
    const currentDiffComments = normalizeStoredDiffCommentsState(entry?.diffComments);
    if (Object.keys(currentDiffComments).length > 0) {
      return entry;
    }

    const entryTarget = normalizeCommentTarget(entry?.checkTarget) ?? normalizeCommentTarget(entry?.issueTarget);
    const entryStorageKey = getCommentEntryStorageKey(entry);
    const previousEntry = normalizedPreviousEntries.find((candidate) => {
      if (entryTarget && doesEntryMatchCommentTarget(candidate, entryTarget)) {
        return true;
      }

      return Boolean(entryStorageKey) && getCommentEntryStorageKey(candidate) === entryStorageKey;
    }) ?? null;
    const previousDiffComments = normalizeStoredDiffCommentsState(previousEntry?.diffComments);

    return Object.keys(previousDiffComments).length > 0
      ? { ...entry, diffComments: previousDiffComments }
      : entry;
  });
}

function getCommentEntryStorageKey(entry) {
  if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey) {
    return `row-key:${entry.rowStableKey}`;
  }

  const targetKey = getCommentTargetStorageKey(entry);
  if (targetKey) {
    return targetKey;
  }

  if (Number.isInteger(entry?.rawIndex)) {
    return `raw:${entry.rawIndex}:${entry?.line ?? ''}`;
  }

  const rowIndex = Number.isInteger(entry?.rowIndex) ? entry.rowIndex : 'unknown';
  const sectionTitle = entry?.sectionTitle ?? '';
  const line = entry?.line ?? '';
  return `row:${rowIndex}:${sectionTitle}:${line}`;
}

function getCommentEntryStorageCandidates(entry) {
  const candidates = [];

  if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey) {
    candidates.push(`row-key:${entry.rowStableKey}`);
  }

  const targetKey = getCommentTargetStorageKey(entry);
  if (targetKey && !candidates.includes(targetKey)) {
    candidates.push(targetKey);
  }

  if (Number.isInteger(entry?.rawIndex)) {
    const rawKey = `raw:${entry.rawIndex}:${entry?.line ?? ''}`;
    if (!candidates.includes(rawKey)) {
      candidates.push(rawKey);
    }
  }

  const rowIndex = Number.isInteger(entry?.rowIndex) ? entry.rowIndex : 'unknown';
  const sectionTitle = entry?.sectionTitle ?? '';
  const line = entry?.line ?? '';
  const fallbackKey = `row:${rowIndex}:${sectionTitle}:${line}`;
  if (!candidates.includes(fallbackKey)) {
    candidates.push(fallbackKey);
  }

  return candidates;
}

function getRowMetaCommentStorageKey(rowMeta) {
  if (typeof rowMeta?.stableKey === 'string' && rowMeta.stableKey) {
    return `row-key:${rowMeta.stableKey}`;
  }

  const targetKey = getCommentTargetStorageKey(rowMeta);
  if (targetKey) {
    return targetKey;
  }

  if (Number.isInteger(rowMeta?.rawIndex)) {
    return `raw:${rowMeta.rawIndex}:${rowMeta?.line ?? ''}`;
  }

  const rowIndex = Number.isInteger(rowMeta?.rowIndex) ? rowMeta.rowIndex : 'unknown';
  const sectionTitle = rowMeta?.currentSectionTitle ?? '';
  const line = rowMeta?.line ?? '';
  return `row:${rowIndex}:${sectionTitle}:${line}`;
}

function getRowMetaCommentStorageCandidates(rowMeta) {
  const candidates = [];
  const canonicalKey = getRowMetaCommentStorageKey(rowMeta);
  if (canonicalKey) {
    candidates.push(canonicalKey);
  }

  const targetKey = getCommentTargetStorageKey(rowMeta);
  if (targetKey && !candidates.includes(targetKey)) {
    candidates.push(targetKey);
  }

  if (Number.isInteger(rowMeta?.rawIndex)) {
    const rawKey = `raw:${rowMeta.rawIndex}:${rowMeta?.line ?? ''}`;
    if (!candidates.includes(rawKey)) {
      candidates.push(rawKey);
    }
  }

  const rowIndex = Number.isInteger(rowMeta?.rowIndex) ? rowMeta.rowIndex : 'unknown';
  const sectionTitle = rowMeta?.currentSectionTitle ?? '';
  const line = rowMeta?.line ?? '';
  const fallbackKey = `row:${rowIndex}:${sectionTitle}:${line}`;
  if (!candidates.includes(fallbackKey)) {
    candidates.push(fallbackKey);
  }

  return candidates;
}

function buildRowCommentsStateFromEntries(rowMetaList = [], commentEntries = []) {
  const canonicalKeysByCandidate = rowMetaList.reduce((lookup, rowMeta) => {
    const canonicalKey = getRowMetaCommentStorageKey(rowMeta);
    getRowMetaCommentStorageCandidates(rowMeta).forEach((candidateKey) => {
      if (!lookup.has(candidateKey)) {
        lookup.set(candidateKey, canonicalKey);
      }
    });
    return lookup;
  }, new Map());
  const nextState = {};

  (commentEntries ?? []).forEach((entry) => {
    const comments = Array.isArray(entry?.comments)
      ? entry.comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
      : [];
    if (comments.length === 0) return;

    const canonicalKey = getCommentEntryStorageCandidates(entry)
      .map((candidateKey) => canonicalKeysByCandidate.get(candidateKey))
      .find(Boolean);
    if (!canonicalKey) return;

    nextState[canonicalKey] = [
      ...(nextState[canonicalKey] ?? []),
      ...comments,
    ];
  });

  return nextState;
}

function buildRowCommentsSignature(rowComments = {}) {
  const normalizedState = Object.keys(rowComments)
    .sort()
    .reduce((signatureState, rowKey) => {
      signatureState[rowKey] = Array.isArray(rowComments[rowKey]) ? [...rowComments[rowKey]] : [];
      return signatureState;
    }, {});

  return JSON.stringify(normalizedState);
}

function buildSmoothSpecTransitionFrames(sourceText = '', targetText = '') {
  const normalizedSource = typeof sourceText === 'string' ? sourceText : '';
  const normalizedTarget = typeof targetText === 'string' ? targetText : '';

  if (normalizedSource === normalizedTarget) {
    return [];
  }

  const sourceLines = normalizedSource.split('\n');
  const targetLines = normalizedTarget.split('\n');
  let commonPrefixLength = 0;

  while (
    commonPrefixLength < sourceLines.length &&
    commonPrefixLength < targetLines.length &&
    sourceLines[commonPrefixLength] === targetLines[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let sourceSuffixIndex = sourceLines.length - 1;
  let targetSuffixIndex = targetLines.length - 1;

  while (
    sourceSuffixIndex >= commonPrefixLength &&
    targetSuffixIndex >= commonPrefixLength &&
    sourceLines[sourceSuffixIndex] === targetLines[targetSuffixIndex]
  ) {
    sourceSuffixIndex -= 1;
    targetSuffixIndex -= 1;
  }

  const leadingLines = sourceLines.slice(0, commonPrefixLength);
  const trailingLines = targetLines.slice(targetSuffixIndex + 1);
  const sourceChangedLines = sourceLines.slice(commonPrefixLength, sourceSuffixIndex + 1);
  const targetChangedLines = targetLines.slice(commonPrefixLength, targetSuffixIndex + 1);
  const maxChangedLineCount = Math.max(sourceChangedLines.length, targetChangedLines.length);

  if (maxChangedLineCount === 0) {
    return [normalizedTarget];
  }

  if (maxChangedLineCount === 1) {
    const inlineFrames = buildSmoothInlineTransitionFrames(
      sourceChangedLines[0] ?? '',
      targetChangedLines[0] ?? '',
    );

    return inlineFrames.map((nextLine, frameIndex) => {
      const frameLines = [...leadingLines];
      const shouldKeepPlaceholderLine =
        nextLine.length > 0 ||
        targetChangedLines.length > 0 ||
        frameIndex < inlineFrames.length - 1;

      if (shouldKeepPlaceholderLine) {
        frameLines.push(nextLine);
      }

      frameLines.push(...trailingLines);
      return frameLines.join('\n');
    });
  }

  const stepSize = Math.max(1, Math.ceil(maxChangedLineCount / AGENT_TASK_CONTENT_MORPH_MAX_FRAMES));
  const frames = [];

  for (
    let replaceCount = stepSize;
    replaceCount < maxChangedLineCount;
    replaceCount += stepSize
  ) {
    const frameLines = [...leadingLines];

    for (let lineIndex = 0; lineIndex < maxChangedLineCount; lineIndex += 1) {
      const nextLine =
        lineIndex < replaceCount
          ? targetChangedLines[lineIndex]
          : sourceChangedLines[lineIndex];

      if (typeof nextLine === 'string') {
        frameLines.push(nextLine);
      }
    }

    frameLines.push(...trailingLines);
    const frameText = frameLines.join('\n');

    if (frameText !== normalizedSource && frameText !== frames[frames.length - 1]) {
      frames.push(frameText);
    }
  }

  if (frames[frames.length - 1] !== normalizedTarget) {
    frames.push(normalizedTarget);
  }

  return frames;
}

function buildSmoothInlineTransitionFrames(sourceText = '', targetText = '') {
  const normalizedSource = typeof sourceText === 'string' ? sourceText : '';
  const normalizedTarget = typeof targetText === 'string' ? targetText : '';

  if (normalizedSource === normalizedTarget) {
    return [];
  }

  let commonPrefixLength = 0;

  while (
    commonPrefixLength < normalizedSource.length &&
    commonPrefixLength < normalizedTarget.length &&
    normalizedSource[commonPrefixLength] === normalizedTarget[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let sourceSuffixIndex = normalizedSource.length - 1;
  let targetSuffixIndex = normalizedTarget.length - 1;

  while (
    sourceSuffixIndex >= commonPrefixLength &&
    targetSuffixIndex >= commonPrefixLength &&
    normalizedSource[sourceSuffixIndex] === normalizedTarget[targetSuffixIndex]
  ) {
    sourceSuffixIndex -= 1;
    targetSuffixIndex -= 1;
  }

  const leadingText = normalizedSource.slice(0, commonPrefixLength);
  const trailingText = normalizedTarget.slice(targetSuffixIndex + 1);
  const sourceChangedText = normalizedSource.slice(commonPrefixLength, sourceSuffixIndex + 1);
  const targetChangedText = normalizedTarget.slice(commonPrefixLength, targetSuffixIndex + 1);
  const frames = [];
  const phaseFrameBudget = Math.max(1, Math.floor(AGENT_TASK_CONTENT_MORPH_INLINE_MAX_FRAMES / 2));
  const eraseStep = Math.max(1, Math.ceil(sourceChangedText.length / phaseFrameBudget));
  const appendStep = Math.max(1, Math.ceil(targetChangedText.length / phaseFrameBudget));

  for (
    let remainingCount = sourceChangedText.length - eraseStep;
    remainingCount > 0;
    remainingCount -= eraseStep
  ) {
    const frameText = `${leadingText}${sourceChangedText.slice(0, remainingCount)}${trailingText}`;
    if (frameText !== normalizedSource && frameText !== frames[frames.length - 1]) {
      frames.push(frameText);
    }
  }

  if (sourceChangedText.length > 0) {
    const collapsedFrame = `${leadingText}${trailingText}`;
    if (collapsedFrame !== normalizedSource && collapsedFrame !== frames[frames.length - 1]) {
      frames.push(collapsedFrame);
    }
  }

  for (
    let appendCount = appendStep;
    appendCount < targetChangedText.length;
    appendCount += appendStep
  ) {
    const frameText = `${leadingText}${targetChangedText.slice(0, appendCount)}${trailingText}`;
    if (frameText !== normalizedSource && frameText !== frames[frames.length - 1]) {
      frames.push(frameText);
    }
  }

  if (frames[frames.length - 1] !== normalizedTarget) {
    frames.push(normalizedTarget);
  }

  return frames;
}

function buildProblemsTreeForTab(tab, agentTaskIssuesOverride = null, commentEntries = []) {
  const meta = getProblemsMetaForTab(tab, agentTaskIssuesOverride);
  const isAgentTaskProblemsTab = tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md');
  const commentIssues = tab?.id?.startsWith('agent-task-') || tab?.label?.endsWith('.md')
    ? buildCommentIssuesFromEntries(commentEntries)
    : [];
  const problemsCount = meta.issues.length;
  const commentCount = commentIssues.length;
  const secondarySuffixParts = [];
  if (problemsCount > 0) secondarySuffixParts.push(`${problemsCount} problem${problemsCount === 1 ? '' : 's'}`);
  if (commentCount > 0) secondarySuffixParts.push(`${commentCount} comment${commentCount === 1 ? '' : 's'}`);
  const secondarySuffix = secondarySuffixParts.length > 0
    ? `${PROBLEMS_SECONDARY_GAP}${secondarySuffixParts.join(PROBLEMS_SECONDARY_GAP)}`
    : '';
  const fileIcon = renderProblemsFileIcon(tab);
  const treeIssues = [
    ...meta.issues,
    ...commentIssues,
  ];

  return [
    {
      id: 'active-problems-file',
      label: meta.label,
      icon: fileIcon,
      secondaryText: isAgentTaskProblemsTab
        ? secondarySuffixParts.join(PROBLEMS_SECONDARY_GAP)
        : `${meta.path}${secondarySuffix}`,
      isExpanded: treeIssues.length > 0,
      children: treeIssues.map((issue, index) => {
        const normalizedIssue = {
          ...issue,
          rawIndex: Number.isInteger(issue?.rawIndex)
            ? issue.rawIndex
            : parseProblemRawIndexFromSecondaryText(issue?.secondaryText),
        };

        return {
          id: buildProblemTreeNodeId(normalizedIssue, index),
          label: normalizedIssue.label,
          icon:
            normalizedIssue.severity === 'error'
              ? <ProblemsErrorNodeIcon />
              : normalizedIssue.severity === 'comment'
                ? <ProblemsCommentNodeIcon />
                : <ProblemsWarningNodeIcon />,
          secondaryText: isAgentTaskProblemsTab ? '' : normalizedIssue.secondaryText,
        };
      }),
    },
  ];
}

function extractRuntimeInspectionIssues(results = [], kind, documentSections = null) {
  const serialized = buildSerializedDocumentLines(documentSections ?? []);
  const lines = serialized?.lines ?? [];

  return results.reduce((issues, item, visibleIndex) => {
    if (item?.issue && item?.highlight) {
      const rawIndex = getDocumentCheckRawIndex(documentSections, kind, visibleIndex);
      const matchText = item.highlight?.match;
      if (
        typeof matchText === 'string'
        && matchText.length > 0
        && Number.isInteger(rawIndex)
        && rawIndex >= 0
        && typeof lines[rawIndex] === 'string'
        && !lines[rawIndex].includes(matchText)
      ) {
        return issues;
      }

      issues.push({
        ...item.issue,
        id: `${kind}-issue-${visibleIndex}`,
        rawIndex,
        secondaryText: Number.isInteger(rawIndex) && rawIndex >= 0
          ? `Line ${rawIndex + 1}`
          : item.issue.secondaryText,
      });
    }
    return issues;
  }, []);
}

function countIssuesBySeverity(issues = []) {
  return issues.reduce((summary, issue) => {
    if (issue?.severity === 'warning') summary.warningCount += 1;
    if (issue?.severity === 'error') summary.errorCount += 1;
    return summary;
  }, { warningCount: 0, errorCount: 0 });
}

function buildInspectionSummary({
  planRunResult = null,
  acRunResult = null,
  documentSections = null,
} = {}) {
  const runtimeIssues = [
    ...extractRuntimeInspectionIssues(planRunResult ?? [], 'plan', documentSections),
    ...extractRuntimeInspectionIssues(acRunResult ?? [], 'ac', documentSections),
  ];
  const issues = runtimeIssues;
  const { warningCount, errorCount } = countIssuesBySeverity(issues);

  return {
    issues,
    warningCount,
    errorCount,
  };
}

function resolveRuntimeInspectionItem(item) {
  if (!item) return item;

  return {
    ...item,
    status: 'passed',
    highlight: null,
    issue: null,
    checks: Array.isArray(item.checks)
      ? item.checks.map((check) => ({
          ...check,
          status: 'passed',
        }))
      : item.checks,
  };
}

const VISIT_BOOKING_FIXED_AC_RUN_STATUSES = AC_RUN_STATUSES.map((item) => resolveRuntimeInspectionItem(item));
const VISIT_BOOKING_FIXED_PLAN_RUN_STATUSES = PLAN_RUN_STATUSES.map((item) => resolveRuntimeInspectionItem(item));

function CompletionPopup({ trigger, query, selectedIdx, onSelect, onClose, style, selectedLabels = [] }) {
  const filtered = useMemo(() => {
    const items = getCompletionItemsForTrigger(trigger);
    return items.filter(item =>
      item.label.toLowerCase().includes(query.toLowerCase())
    ).slice(0, COMPLETION_POPUP_MAX_ITEMS);
  }, [query, trigger]);
  const selectedLabelSet = useMemo(() => new Set(selectedLabels), [selectedLabels]);

  if (filtered.length === 0) return null;

  return (
    <div className="cmp-popup-completion-root" style={style}>
      <div className="cmp-popup cmp-popup-completion-main">
        <div className="cmp-popup-completion-body">
          {filtered.map((item, i) => {
            const matchLen = query.length;
            const matchesStart = item.label.toLowerCase().startsWith(query.toLowerCase());
            const isAlreadySelected = selectedLabelSet.has(item.label);
            return (
              <div
                key={item.label}
                className="cmp-item"
              >
                <div
                  className={`cmp-cell${i === selectedIdx ? ' cmp-cell-selected' : ''}`}
                  onMouseDown={e => {
                    e.preventDefault();
                    onSelect(buildCompletionSelection(item));
                  }}
                >
                  <IconMdTask />
                  <div className="cmp-content">
                    <span className="cmp-label">
                      {matchesStart && matchLen > 0
                        ? <><span className="cmp-match">{item.label.slice(0, matchLen)}</span>{item.label.slice(matchLen)}</>
                        : item.label}
                    </span>
                    <span className="cmp-desc">{item.description}</span>
                  </div>
                  {isAlreadySelected ? <span className="cmp-selected-tag">Selected</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Add Popup ────────────────────────────────────────────────────────────────

const ADD_RECENT_FILES = [
  { label: 'Configuration.md',                    type: 'md', description: 'Agent Specifications' },
  { label: 'visit-booking.md',                    type: 'md', description: 'Agent Specifications' },
  { label: 'vet-schedules.md',                    type: 'md', description: 'Agent Specifications' },
  { label: 'visit-booking-inspections.md',        type: 'md', description: 'Agent Specifications' },
  { label: 'visit-booking-beat-3-execution.md',   type: 'md', description: 'Agent Specifications' },
  { label: 'visit-booking-code-review-moment.md', type: 'md', description: 'Agent Specifications' },
];

function getAddPopupFileType(label) {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.endsWith('.md')) return 'md';
  if (lowerLabel.endsWith('.py')) return 'py';
  if (lowerLabel.endsWith('.ipynb')) return 'ipynb';
  if (lowerLabel.endsWith('.txt')) return 'txt';
  return 'file';
}

function buildAddPopupFiles(agentTasks = []) {
  const taskFiles = agentTasks.map((task) => ({
    label: task.label,
    type: getAddPopupFileType(task.label),
    description: 'Agent Tasks',
  }));

  return [...taskFiles, ...ADD_RECENT_FILES].filter((item, index, items) =>
    items.findIndex((candidate) => candidate.label === item.label) === index
  );
}

function AddFileIcon({ type }) {
  if (type === 'md') return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5929 9.9438L12.5929 4.70001L13.7929 4.70002L13.7929 9.94379L15.0763 8.66037L15.9248 9.5089L13.1929 12.2409L10.4609 9.5089L11.3095 8.66037L12.5929 9.9438Z" fill="#9B6BDA"/>
      <path d="M0.5 4.70001H2.94558L4.65385 9.14463L4.76288 9.60155L4.85635 9.14463L6.51269 4.70001H8.98423V11.9692H7.14096V7.59732L7.17212 7.12482L5.34442 11.9692H4.08269L2.31212 7.17155L2.34327 7.59732V11.9692H0.5V4.70001Z" fill="#9B6BDA"/>
    </svg>
  );
  if (type === 'py') return <span style={{ fontSize: 14, lineHeight: '16px', flexShrink: 0 }}>🐍</span>;
  if (type === 'ipynb') return <span style={{ fontSize: 14, lineHeight: '16px', flexShrink: 0 }}>⟳</span>;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 4h12M2 8h12M2 12h8" stroke="#9FA2A8" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function AddPopup({ onClose, onSelectFile, style, files = ADD_RECENT_FILES }) {
  const [search, setSearch] = useState('');
  const filtered = files.filter(f =>
    f.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="add-popup" style={style} onMouseDown={e => e.stopPropagation()}>
      {/* Search */}
      <div className="add-popup-search">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="6.5" cy="6.5" r="4.5" stroke="#6F737A" strokeWidth="1.2"/>
          <path d="M10 10L13.5 13.5" stroke="#6F737A" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <input
          className="add-popup-search-input"
          placeholder="Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="add-popup-divider" />

      {/* Static items */}
      {!search && (
        <div className="popup-cell popup-cell-header">
          <div className="popup-cell-content">
            <div className="popup-cell-header-text text-ui-default-semibold">Recent files</div>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="add-popup-files">
        {filtered.map(f => (
          <div key={f.label} className="add-popup-item" onMouseDown={() => { onSelectFile?.(f); onClose(); }}>
            <AddFileIcon type={f.type} />
            <span className="add-popup-item-label">{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Walkthrough Spec ────────────────────────────────────────────────────────

const SPEC_LINES = [
  { text: 'Goal',                                                                                            type: 'heading' },
  { text: 'Add vet assignment and time slot selection to the visit creation flow.',                         type: 'text' },
  { text: 'When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).', type: 'text' },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Acceptance Criteria',                                                                             type: 'heading' },
  { text: '\u2610 Visit form shows a dropdown of available vets for the selected date/time.',                type: 'check'   },
  { text: '\u2610 Visit form includes a time slot picker with hourly slots from 09:00 to 16:00 (last bookable slot). Slot range is configurable.', type: 'check' },
  { text: '\u2610 A vet cannot be booked for the same date+time twice.',                                    type: 'check'   },
  { text: '\u2610 Vet and time are persisted with the visit.',                                               type: 'check'   },
  { text: '\u2610 Existing visit display (owner details page, visit history table) shows the assigned vet and time.', type: 'check' },
  { text: '\u2610 All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.',                  type: 'check'   },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Plan',                                                                                            type: 'heading' },
  { text: '\u2610 Schema changes',                                                                           type: 'check'   },
  { text: '\u2610 Visit entity \u2014 src/main/java/org/springframework/samples/petclinic/owner/Visit.java', type: 'check'   },
  { text: '\u2610 VisitRepository \u2014 add existsByVetIdAndDateAndTime for double-booking check',           type: 'check'   },
  { text: '\u2610 VisitController updates \u2014 src/main/java/org/springframework/samples/petclinic/owner/VisitController.java', type: 'check' },
  { text: '\u2610 Form template update \u2014 src/main/resources/templates/pets/createOrUpdateVisitForm.html', type: 'check' },
  { text: '\u2610 Owner details / visit history display \u2014 src/main/resources/templates/owners/ownerDetails.html', type: 'check' },
  { text: '\u2610 Tests',                                                                                    type: 'check'   },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Implementation Notes',                                                                            type: 'heading' },
  { text: '\u2022 Current Visit entity (Visit.java): Only has date (LocalDate) and description (String). Extends BaseEntity. No relationship to Vet.', type: 'note' },
  { text: '\u2022 Current visits table: Columns are id, pet_id, visit_date, description. No vet or time columns.', type: 'note' },
  { text: '\u2022 Vet entity (vet/Vet.java): Extends Person (firstName, lastName). Has ManyToMany specialties.', type: 'note' },
  { text: '\u2022 No existing VisitRepository: Visits are currently persisted entirely through cascade (Owner \u2192 Pet \u2192 Visit via CascadeType.ALL).', type: 'note' },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Decisions',                                                                                       type: 'heading' },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Other',                                                                                           type: 'heading' },
  { text: '// Dynamic availability (AJAX) \u2014 not in prompt, out of scope',                               type: 'comment' },
  { text: '// Vet specialties matching \u2014 not in prompt, out of scope',                                   type: 'comment' },
];

const VISIT_BOOKING_PLAN_ITEMS = [
  {
    id: 'plan-1',
    type: 'check',
    checked: false,
    text: '**1. Schema** - `db/h2/schema.sql`, `db/mysql/schema.sql`, `db/postgres/schema.sql`',
    children: [
      { id: 'plan-1-1', type: 'check', checked: false, text: 'Add `vet_id` (FK -> vets) and `visit_time` (TIME) columns to `visits`.' },
      { id: 'plan-1-2', type: 'check', checked: false, text: 'Add `UNIQUE(vet_id, visit_date, visit_time)` in all three schemas - DB-level double-booking guard.' },
      { id: 'plan-1-3', type: 'check', checked: false, text: 'Update seed data in each `db/*/data.sql` (same three databases) with vet and time for existing visits.' },
    ],
  },
  {
    id: 'plan-2',
    type: 'check',
    checked: false,
    text: '**2. Visit entity** - `owner/Visit.java`',
    children: [
      { id: 'plan-2-1', type: 'check', checked: false, text: 'Add `@ManyToOne vet` with `@JoinColumn(name = "vet_id")`.' },
      { id: 'plan-2-2', type: 'check', checked: false, text: 'Add `LocalTime time` with `@Column(name = "visit_time")` + `@DateTimeFormat(pattern = "HH:mm")`.' },
      { id: 'plan-2-3', type: 'check', checked: false, text: 'Add `@NotNull` on both new fields.' },
    ],
  },
  {
    id: 'plan-3',
    type: 'check',
    checked: false,
    text: '**3. VetFormatter** - `vet/VetFormatter.java`',
    children: [
      { id: 'plan-3-1', type: 'check', checked: false, text: 'New `@Component implements Formatter<Vet>`, following the `PetTypeFormatter` pattern: `print` returns the full name (`firstName + " " + lastName`), `parse` looks the vet up by name via `VetRepository.findAll()`.' },
      { id: 'plan-3-2', type: 'check', checked: false, text: 'Needed so Spring MVC converts the form select value into a `Vet` on POST.' },
    ],
  },
  {
    id: 'plan-4',
    type: 'check',
    checked: false,
    text: '**4. VisitRepository** - `owner/VisitRepository.java`',
    children: [
      { id: 'plan-4-1', type: 'check', checked: false, text: 'New Spring Data interface extending `Repository<Visit, Integer>`.' },
      { id: 'plan-4-2', type: 'check', checked: false, text: '`boolean existsByVetIdAndDateAndTime(Integer vetId, LocalDate date, LocalTime time)` - double-booking check (`VetId` resolves to the `vet.id` path).' },
      { id: 'plan-4-3', type: 'check', checked: false, text: '`List<Visit> findByDateAndTime(LocalDate date, LocalTime time)` - visits already booked in a slot; their vets are excluded from the dropdown.' },
    ],
  },
  {
    id: 'plan-5',
    type: 'check',
    checked: false,
    text: '**5. VisitController** - `owner/VisitController.java`',
    children: [
      { id: 'plan-5-1', type: 'check', checked: false, text: 'Inject `VetRepository` and `VisitRepository`.' },
      { id: 'plan-5-2', type: 'check', checked: false, text: '`@ModelAttribute("vets")` method `populateVets()`, params `@RequestParam(required=false) LocalDate date` and `@RequestParam(required=false) @DateTimeFormat(pattern = "HH:mm") LocalTime time`. On GET (both null) returns all vets via `findAll()`; on POST (both set) excludes already-booked vets via `findByDateAndTime`. (The `@DateTimeFormat` on the param is needed to parse the submitted time, since the entity-level annotation does not apply to request params.)' },
      { id: 'plan-5-3', type: 'check', checked: false, text: '`@ModelAttribute("timeSlots")` method `populateTimeSlots()`: read `petclinic.visit.start-hour` / `end-hour` (default 9 / 16), generate hourly `LocalTime` values start->end inclusive. Runs on every request (GET and POST).' },
      { id: 'plan-5-4', type: 'check', checked: false, text: 'In `processNewVisitForm` (already takes `@Valid Visit visit, BindingResult result`): run the double-booking check before save; on a blocked booking, `result.rejectValue("vet", ...)` and return `"pets/createOrUpdateVisitForm"`.' },
      { id: 'plan-5-5', type: 'check', checked: false, text: 'Wrap save in try/catch for `DataIntegrityViolationException` - concurrent requests that pass the app check but hit the DB constraint re-render with the same friendly error (the dual-layer defense in Decisions).' },
    ],
  },
  {
    id: 'plan-6',
    type: 'check',
    checked: false,
    text: '**6. Configuration** - `application.properties`',
    children: [
      { id: 'plan-6-1', type: 'check', checked: false, text: 'Add `petclinic.visit.start-hour=9` and `petclinic.visit.end-hour=16`.' },
      { id: 'plan-6-2', type: 'check', checked: false, text: 'Read via `@Value` in `VisitController`.' },
    ],
  },
  {
    id: 'plan-7',
    type: 'check',
    checked: false,
    text: '**7. Form template** - `pets/createOrUpdateVisitForm.html`',
    children: [
      { id: 'plan-7-1', type: 'check', checked: false, text: '`<select>` for vet via the existing `fragments/selectField` fragment (bound to `visit.vet`, from `${vets}`).' },
      { id: 'plan-7-2', type: 'check', checked: false, text: '`<select>` for time slot via the same fragment (bound to `visit.time`, from `${timeSlots}`).' },
      { id: 'plan-7-3', type: 'check', checked: false, text: 'The `selectField` fragment renders field errors automatically.' },
    ],
  },
  {
    id: 'plan-8',
    type: 'check',
    checked: false,
    text: '**8. Visit history display** - `owners/ownerDetails.html`',
    children: [
      { id: 'plan-8-1', type: 'check', checked: false, text: 'Add Vet and Time columns to the per-pet visits table.' },
    ],
  },
  {
    id: 'plan-9',
    type: 'check',
    checked: false,
    text: '**9. Tests** - `owner/VisitControllerTests.java`',
    children: [
      { id: 'plan-9-1', type: 'check', checked: false, text: '`processNewVisitFormSuccess` - booking with vet+time succeeds, redirects to owner page.' },
      { id: 'plan-9-2', type: 'check', checked: false, text: '`processNewVisitFormDoubleBookingRejected` - conflicting slot re-renders the form with a field error on `vet`.' },
      { id: 'plan-9-3', type: 'check', checked: false, text: 'Vets and time slots populated in the model.' },
    ],
  },
  {
    id: 'plan-10',
    type: 'check',
    checked: false,
    text: '**10. Vet.toString()** - `vet/Vet.java`',
    children: [
      { id: 'plan-10-1', type: 'check', checked: false, text: 'Override returning `firstName + " " + lastName` - the `selectField` fragment renders `${item}` via `toString()`.' },
    ],
  },
  {
    id: 'plan-11',
    type: 'check',
    checked: false,
    text: '**11. i18n keys** - `messages/messages.properties` + all locales',
    children: [
      { id: 'plan-11-1', type: 'check', checked: false, text: 'Add `vet=Vet` and `time=Time` - needed for labels and `I18nPropertiesSyncTest` (all locales must share keys).' },
    ],
  },
  {
    id: 'plan-12',
    type: 'check',
    checked: false,
    text: '**12. Test fixes**',
    children: [
      { id: 'plan-12-1', type: 'check', checked: false, text: '`VisitControllerTests` (`@WebMvcTest(VisitController.class)`): add `includeFilters = @ComponentScan.Filter(value = VetFormatter.class, type = FilterType.ASSIGNABLE_TYPE)` (like `PetControllerTests` for `PetTypeFormatter`); add `@MockitoBean` for `VetRepository` + `VisitRepository`.' },
      { id: 'plan-12-2', type: 'check', checked: false, text: '`ClinicServiceTests.shouldAddNewVisitForPet`: today builds a `Visit` with only `setDescription("test")` - also set `vet` + `time` before `owners.save(owner6)` to satisfy the new `@NotNull` fields.' },
    ],
  },
];

const VISIT_BOOKING_DECISION_ITEMS = [
  { id: 'decision-heading-1', type: 'paragraph', text: '**Blocked-booking UX**' },
  { id: 'decision-1', type: 'paragraph', text: "On a blocked booking, the form re-renders with an inline error on the vet field, matching existing Thymeleaf validation patterns. (Agent's call, per the AC3 refinement.)" },
];

function cloneDocumentItem(item) {
  if (!item || typeof item !== 'object') return item;

  return {
    ...item,
    children: Array.isArray(item.children)
      ? item.children.map((child) => cloneDocumentItem(child))
      : item.children,
  };
}

function cloneDocumentSection(section) {
  if (!section || typeof section !== 'object') return section;

  return {
    ...section,
    items: Array.isArray(section.items)
      ? section.items.map((item) => cloneDocumentItem(item))
      : section.items,
  };
}

function createVisitBookingPlanItems() {
  return withDerivedPlanChildren({
    id: 'plan',
    title: 'Plan',
    items: VISIT_BOOKING_PLAN_ITEMS.map((item) => cloneDocumentItem(item)),
  }).items;
}

const VISIT_BOOKING_GOAL_LINE_ONE = 'Today a visit records only a date and a free-text description, with no vet and nothing stopping two visits from landing on the same vet at the same time.';
const VISIT_BOOKING_GOAL_LINE_TWO = 'This adds vet and time-slot selection to the existing visit form, and enforces one visit per vet per slot.';
const LEGACY_VISIT_BOOKING_GOAL_TEXT = `${VISIT_BOOKING_GOAL_LINE_ONE} ${VISIT_BOOKING_GOAL_LINE_TWO}`;

function isLegacyVisitBookingGoalText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim() === LEGACY_VISIT_BOOKING_GOAL_TEXT;
}

function normalizeLegacyVisitBookingGoalCode(code = '') {
  if (typeof code !== 'string' || !code) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  let inGoalSection = false;
  let replaced = false;
  const nextLines = [];

  lines.forEach((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      inGoalSection = headingTitle.toLowerCase() === 'goal';
      nextLines.push(line);
      return;
    }

    if (inGoalSection && !replaced && isLegacyVisitBookingGoalText(line)) {
      nextLines.push(VISIT_BOOKING_GOAL_LINE_ONE, VISIT_BOOKING_GOAL_LINE_TWO);
      replaced = true;
      return;
    }

    nextLines.push(line);
  });

  return replaced ? nextLines.join('\n') : code;
}

function normalizeLegacyVisitBookingGoalDocumentSections(documentSections = []) {
  if (!Array.isArray(documentSections)) {
    return [];
  }

  let hasChanges = false;

  const nextSections = documentSections.map((section) => {
    if (section?.title?.toLowerCase() !== 'goal') {
      return section;
    }

    let sectionChanged = false;
    const nextItems = [];

    (section.items ?? []).forEach((item) => {
      if (item?.type === 'paragraph' && isLegacyVisitBookingGoalText(item.text)) {
        const baseId = item.id ?? 'goal-text';
        nextItems.push(
          {
            ...item,
            id: `${baseId}-1`,
            text: VISIT_BOOKING_GOAL_LINE_ONE,
          },
          {
            ...item,
            id: `${baseId}-2`,
            text: VISIT_BOOKING_GOAL_LINE_TWO,
          },
        );
        hasChanges = true;
        sectionChanged = true;
        return;
      }

      nextItems.push(item);
    });

    return sectionChanged ? { ...section, items: nextItems } : section;
  });

  return hasChanges ? nextSections : documentSections;
}

function normalizeLegacyDerivedPlanChildrenCode(code = '') {
  if (typeof code !== 'string' || !code) {
    return code;
  }

  const lines = code.split(/\r?\n/);
  let inPlanSection = false;
  let currentLegacyChildren = [];
  let currentScopedChildren = [];
  let currentChildIndex = 0;
  let changed = false;

  const nextLines = lines.map((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      inPlanSection = headingTitle.toLowerCase() === 'plan';
      currentLegacyChildren = [];
      currentScopedChildren = [];
      currentChildIndex = 0;
      return line;
    }

    if (!inPlanSection) {
      return line;
    }

    const parentMatch = line.match(/^- \[[ x]\]\s+(.*)$/i);
    if (parentMatch) {
      const parentText = parentMatch[1].trim();
      currentLegacyChildren = buildPlanContentSubitems({ text: parentText, includeScope: false }).map((item) => item.text);
      currentScopedChildren = buildPlanContentSubitems({ text: parentText, includeScope: true }).map((item) => item.text);
      currentChildIndex = 0;
      return line;
    }

    const childMatch = line.match(/^(\s{2,}- \[[ x]\]\s+)(.*)$/i);
    if (childMatch) {
      const currentChildText = childMatch[2].trim();
      const legacyText = currentLegacyChildren[currentChildIndex] ?? null;
      const scopedText = currentScopedChildren[currentChildIndex] ?? null;
      currentChildIndex += 1;

      if (legacyText && scopedText && currentChildText === legacyText && currentChildText !== scopedText) {
        changed = true;
        return `${childMatch[1]}${scopedText}`;
      }

      return line;
    }

    currentLegacyChildren = [];
    currentScopedChildren = [];
    currentChildIndex = 0;
    return line;
  });

  return changed ? nextLines.join('\n') : code;
}

function formatWalkthroughLine(line) {
  if (line.type === 'heading') return `## ${line.text}`;
  if (line.type === 'check') return `- [ ] ${line.text.replace(/^☐\s*/, '')}`;
  if (line.type === 'note') return line.text.replace(/^•\s*/, '- ');
  return line.text;
}

function WalkthroughSpec({ visible }) {
  return (
    <div className="walkthrough-content" data-overlay-scroll-body="true">
      <div className="walkthrough-text">
        {SPEC_LINES.slice(0, visible).map((line, i) => (
          <div key={i} className={`walkthrough-line walkthrough-line-${line.type}`}>
            {line.text ? formatWalkthroughLine(line) : '\u00A0'}
          </div>
        ))}
      </div>
    </div>
  );
}

function createSpecDocument() {
  return [
    {
      id: 'goal',
      title: 'Goal',
      items: [
        {
          id: 'goal-text-1',
          type: 'paragraph',
          text: VISIT_BOOKING_GOAL_LINE_ONE,
        },
        {
          id: 'goal-text-2',
          type: 'paragraph',
          text: VISIT_BOOKING_GOAL_LINE_TWO,
        },
      ],
    },
    {
      id: 'acceptance',
      title: 'Acceptance Criteria',
      items: [
        { id: 'ac-1', type: 'check', checked: false, text: 'Visit form shows a dropdown of available vets for the selected date/time.' },
        { id: 'ac-2', type: 'check', checked: false, text: 'Visit form includes a time slot picker with hourly slots from 09:00 to 16:00 (last bookable slot). Slot range is configurable.' },
        { id: 'ac-3', type: 'check', checked: false, text: 'A vet cannot be booked for the same date+time twice. On a blocked booking, the form re-renders with an inline error on the vet field.' },
        { id: 'ac-4', type: 'check', checked: false, text: 'Vet and time are persisted with the visit.' },
        { id: 'ac-5', type: 'check', checked: false, text: 'Existing visit display (owner details page, visit history table) shows the assigned vet and time.' },
        { id: 'ac-6', type: 'check', checked: false, text: 'All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.' },
      ],
    },
    {
      id: 'plan',
      title: 'Plan',
      items: VISIT_BOOKING_PLAN_ITEMS.map((item) => cloneDocumentItem(item)),
    },
    {
      id: 'implementation',
      title: 'Implementation Notes',
      items: [
        { id: 'impl-1', type: 'bullet', text: '**Visit entity** (`Visit.java`): today only `date` (LocalDate, `@Column("visit_date")` + `@DateTimeFormat("yyyy-MM-dd")`) + `description` (String, `@NotBlank`), extends `BaseEntity`, no link to Vet.' },
        { id: 'impl-2', type: 'bullet', text: '**visits table**: today `id`, `pet_id`, `visit_date`, `description` - no vet or time.' },
        { id: 'impl-3', type: 'bullet', text: '**Vet entity** (`vet/Vet.java`): extends `Person`, `ManyToMany` specialties. Lives in the `vet` package - `owner.Visit` needs a cross-package import.' },
        { id: 'impl-4', type: 'bullet', text: '**VetRepository** (`vet/VetRepository.java`): cached `findAll()`, returns `Collection<Vet>` / `Page<Vet>`.' },
        { id: 'impl-5', type: 'bullet', text: '**No VisitRepository yet**: visits persist via cascade (`Owner -> Pet -> Visit`, `CascadeType.ALL`). A new repo is needed for the double-booking query and availability filtering.' },
        { id: 'impl-6', type: 'bullet', text: '**VisitController** (`owner/VisitController.java`): package-private `class VisitController`. Builds the Visit in `@ModelAttribute("visit")` (`loadPetWithVisit`), and in `processNewVisitForm(@ModelAttribute Owner owner, @PathVariable int petId, @Valid Visit visit, BindingResult result, ...)` saves via `owner.addVisit(petId, visit)` + `this.owners.save(owner)` (cascade). Injects only `OwnerRepository` (field named `owners`) today. Already has a `@ModelAttribute("minVisitDate")` method.' },
        { id: 'impl-7', type: 'bullet', text: '**Form template** (`createOrUpdateVisitForm.html`): Thymeleaf form using the `fragments/inputField` fragment for date + description, plus a previous-visits table. A `fragments/selectField` fragment already exists (used by `createOrUpdatePetForm` for pet type) - the new vet/time selects reuse it.' },
        { id: 'impl-8', type: 'bullet', text: "**PetTypeFormatter pattern** (`owner/PetTypeFormatter.java`): a `@Component implements Formatter<PetType>` converting form strings <-> JPA entities (`print`/`parse(String, Locale)`). `VetFormatter` follows it, placed in `vet` next to `VetRepository`. Note `PetTypeFormatter` lives in the `owner` package - `VetFormatter` in `vet` is the spec's choice." },
        { id: 'impl-9', type: 'bullet', text: '**selectField fragment** (`fragments/selectField.html`): renders options as `th:value="${item}"` / `th:text="${item}"`, i.e. via `item.toString()` - which is why `Vet` needs a `toString()` override.' },
        { id: 'impl-10', type: 'bullet', text: '**`populateTimeSlots()`**: an `@ModelAttribute` method, so Spring re-invokes it on every request and it rebuilds the identical fixed `LocalTime` list each time. Functionally correct; a candidate for building the list once (constructor / cached field) since the bounds are config-fixed.' },
      ],
    },
    {
      id: 'decisions',
      title: 'Decisions',
      items: VISIT_BOOKING_DECISION_ITEMS.map((item) => cloneDocumentItem(item)),
    },
    {
      id: 'other',
      title: 'Other',
      items: [
        { id: 'other-heading-1', type: 'paragraph', text: '**Out of scope**' },
        { id: 'other-1', type: 'bullet', text: '**Vet specialties matching** - no filtering by pet type or specialty; all vets shown.' },
        { id: 'other-2', type: 'bullet', text: '**Dynamic availability (AJAX)** - dropdown static on load, no refresh on date change. Possible follow-up.' },
        { id: 'other-3', type: 'bullet', text: '**Multi-slot / duration booking** - one slot per visit, no duration.' },
        { id: 'other-4', type: 'bullet', text: '**Vet calendar view** - no schedule UI for vets.' },
        { id: 'other-5', type: 'bullet', text: '**VetRepository cache invalidation** - `findAll()` is `@Cacheable("vets")`; adding a vet won\'t auto-refresh the dropdown. Existing behavior, not introduced here.' },
      ],
    },
  ].map((section) => withDerivedPlanChildren(section));
}

function setPlanWorkflowMeta(documentSections = [], workflow = null) {
  if (!Array.isArray(documentSections)) {
    return [];
  }

  return documentSections.map((section) => {
    if (normalizeSpecSectionTitle(section?.title) !== 'plan') {
      return section;
    }

    const workflowLabel = typeof workflow?.label === 'string' ? workflow.label.trim() : '';

    if (!workflowLabel || workflow?.id === 'new-workflow') {
      const { meta: _removedMeta, ...restSection } = section;
      return restSection;
    }

    return {
      ...section,
      meta: {
        kind: 'chip',
        text: workflowLabel,
      },
    };
  });
}

function serializeSpecDocument(documentSections) {
  return buildSerializedDocumentLines(documentSections).code;
}

function findBaseSectionForParsedCode(baseDocumentSections = [], nextSections = [], title = '') {
  const normalizedTitle = title.trim().toLowerCase();
  const usedBaseSectionIds = new Set(nextSections.map((section) => section.baseSectionId).filter(Boolean));
  const unusedBaseSections = (baseDocumentSections ?? []).filter((section) => !usedBaseSectionIds.has(section?.id));

  return unusedBaseSections.find((section) => section?.title?.trim().toLowerCase() === normalizedTitle)
    ?? unusedBaseSections[0]
    ?? null;
}

function parseSpecCodeToDocumentSections(code, baseDocumentSections = []) {
  const baseSections = Array.isArray(baseDocumentSections) ? baseDocumentSections : [];
  const lines = typeof code === 'string' ? code.split(/\r?\n/) : [];
  const nextSections = [];
  let currentSection = null;
  let currentBaseSection = null;
  let itemIndex = 0;
  let activeParentCheckItem = null;
  let activeParentBaseItem = null;
  let activeParentChildIndex = 0;

  const startSection = (title) => {
    const nextTitle = typeof title === 'string' && title.trim().length > 0
      ? title.trim()
      : `Section ${nextSections.length + 1}`;
    currentBaseSection = findBaseSectionForParsedCode(baseSections, nextSections, nextTitle);
    const sectionId = currentBaseSection?.id ?? `section-${nextSections.length}`;
    currentSection = {
      id: sectionId,
      title: nextTitle,
      items: [],
      ...(currentBaseSection?.meta ? { meta: { ...currentBaseSection.meta } } : {}),
      baseSectionId: currentBaseSection?.id ?? null,
    };
    nextSections.push(currentSection);
    itemIndex = 0;
    activeParentCheckItem = null;
    activeParentBaseItem = null;
    activeParentChildIndex = 0;
  };

  const pushItem = (item) => {
    if (!currentSection || !item) return;

    const baseItem = currentBaseSection?.items?.[itemIndex] ?? null;
    const nextItem = {
      id: baseItem?.id ?? `${currentSection.id}:item-${itemIndex}`,
      ...item,
    };
    currentSection.items.push(nextItem);
    itemIndex += 1;

    if (item.type === 'check') {
      activeParentCheckItem = nextItem;
      activeParentBaseItem = baseItem;
      activeParentChildIndex = 0;
    } else {
      activeParentCheckItem = null;
      activeParentBaseItem = null;
      activeParentChildIndex = 0;
    }
  };

  const pushChildCheckItem = (item) => {
    if (!activeParentCheckItem || !item) return;

    const baseChildItem = activeParentBaseItem?.children?.[activeParentChildIndex] ?? null;
    const nextChildItem = {
      id: baseChildItem?.id ?? `${activeParentCheckItem.id}:child-${activeParentChildIndex + 1}`,
      ...item,
    };

    activeParentCheckItem.children = [
      ...(activeParentCheckItem.children ?? []),
      nextChildItem,
    ];
    activeParentChildIndex += 1;
  };

  lines.forEach((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      startSection(headingTitle);
      return;
    }

    if (!currentSection || line.trim().length === 0) {
      activeParentCheckItem = null;
      activeParentBaseItem = null;
      activeParentChildIndex = 0;
      return;
    }

    const refFileMatch = line.match(/^Reference file:\s+(.+)$/);
    if (refFileMatch) {
      currentSection.meta = {
        ...(currentSection.meta ?? {}),
        kind: 'chip',
        text: refFileMatch[1].trim(),
      };
      activeParentCheckItem = null;
      activeParentBaseItem = null;
      activeParentChildIndex = 0;
      return;
    }

    const childCheckMatch = line.match(/^\s{2,}-\s+\[([ x])\]\s+(.*)$/i);
    if (childCheckMatch && activeParentCheckItem?.type === 'check') {
      pushChildCheckItem({
        type: 'check',
        checked: childCheckMatch[1].toLowerCase() === 'x',
        text: childCheckMatch[2].trim(),
      });
      return;
    }

    const checkMatch = line.match(/^-\s+\[([ x])\]\s+(.*)$/i);
    if (checkMatch) {
      pushItem({
        type: 'check',
        checked: checkMatch[1].toLowerCase() === 'x',
        text: checkMatch[2].trim(),
      });
      return;
    }

    const bulletMatch = line.match(/^-\s+(.*)$/);
    if (bulletMatch) {
      pushItem({
        type: 'bullet',
        text: bulletMatch[1].trim(),
      });
      return;
    }

    const commentMatch = line.match(/^\/\/\s?(.*)$/);
    if (commentMatch) {
      pushItem({
        type: 'comment',
        text: commentMatch[1].trim(),
      });
      return;
    }

    pushItem({
      type: 'paragraph',
      text: line.trim(),
    });
  });

  if (nextSections.length === 0) {
    return baseSections;
  }

  return nextSections.map(({ baseSectionId, ...section }) => section);
}

function normalizeDoneEditableText(text = '') {
  return String(text)
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
}

function normalizeSpecCodeForComparison(code = '') {
  return String(code)
    .replace(/\u200B/g, '')
    .replace(/\u00A0/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trimEnd();
}

function normalizeSpecLineForComparison(line = '') {
  return normalizeSpecCodeForComparison(String(line)).trim();
}

function getVisibleDoneOverlayElement() {
  if (typeof document === 'undefined') {
    return null;
  }

  return Array.from(document.querySelectorAll('.spec-done-overlay')).find((node) => (
    node instanceof HTMLElement
    && node.getClientRects().length > 0
    && node.offsetParent !== null
  )) ?? null;
}

function extractSnapshotLineFromDoneRow(rowEl, originalLine = '') {
  // Row was deleted by the user — contribute an empty line to the snapshot
  if (rowEl instanceof HTMLElement && rowEl.dataset.deleted === 'true') return '';
  // Row's prefix (checkbox/bullet) was cleared — treat as empty line
  if (rowEl instanceof HTMLElement && rowEl.dataset.cleared === 'true') return '';

  const sourceLine = typeof originalLine === 'string' ? originalLine : '';
  const headingTitle = getDoneHeadingTitle(sourceLine);

  if (headingTitle !== null) {
    const headingEl = rowEl?.querySelector('.spec-done-heading[contenteditable]');
    const nextHeading = normalizeDoneEditableText(headingEl?.textContent ?? headingTitle);
    return `## ${nextHeading}`;
  }

  if (/^Reference file:\s+/i.test(sourceLine)) {
    const refLabel = Array.from(rowEl?.querySelectorAll('.attached-file-label') ?? [])
      .map((node) => normalizeDoneEditableText(node.textContent ?? ''))
      .find(Boolean)
      ?? normalizeDoneEditableText(sourceLine.replace(/^Reference file:\s+/i, ''));
    return refLabel ? `Reference file: ${refLabel}` : 'Reference file:';
  }

  if (!sourceLine.trim()) {
    return '';
  }

  const editableEl = rowEl?.querySelector('[contenteditable]');
  if (!(editableEl instanceof HTMLElement)) {
    return sourceLine;
  }

  const nextText = normalizeDoneEditableText(editableEl.textContent ?? sourceLine);
  const checkMatch = sourceLine.match(/^(\s*-\s+\[[ x]\]\s+)(.*)$/i);
  if (checkMatch) {
    return `${checkMatch[1]}${nextText}`;
  }

  const bulletMatch = sourceLine.match(/^(\s*-\s+)(.*)$/);
  if (bulletMatch) {
    return `${bulletMatch[1]}${nextText}`;
  }

  const commentMatch = sourceLine.match(/^(\s*\/\/\s?)(.*)$/);
  if (commentMatch) {
    return `${commentMatch[1]}${nextText}`;
  }

  return nextText;
}

function buildDoneOverlaySnapshotCode(sourceCode = '') {
  const overlayEl = getVisibleDoneOverlayElement();
  const normalizedSourceCode = typeof sourceCode === 'string' ? sourceCode : '';

  if (!(overlayEl instanceof HTMLElement)) {
    return normalizedSourceCode;
  }

  const sourceLines = normalizedSourceCode.split(/\r?\n/);
  const nextLines = [...sourceLines];

  overlayEl.querySelectorAll('.spec-done-row[data-raw-index]').forEach((rowNode) => {
    if (!(rowNode instanceof HTMLElement)) return;

    const rawIndex = Number(rowNode.dataset.rawIndex);
    if (!Number.isInteger(rawIndex) || rawIndex < 0 || rawIndex >= nextLines.length) {
      return;
    }

    nextLines[rawIndex] = extractSnapshotLineFromDoneRow(rowNode, sourceLines[rawIndex] ?? '');
  });

  return nextLines.join('\n');
}

function buildSpecVersionLabel(versionNumber = 1) {
  return `Version ${versionNumber}`;
}

function normalizeSpecVersionCommentEntries(commentEntries = []) {
  if (!Array.isArray(commentEntries)) {
    return [];
  }

  return commentEntries.reduce((entries, entry, entryIndex) => {
    const diffComments = normalizeStoredDiffCommentsState(entry?.diffComments);
    const directComments = Array.isArray(entry?.comments)
      ? entry.comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
      : [];
    const comments = directComments.length > 0
      ? directComments
      : flattenStoredDiffCommentsState(diffComments);

    if (comments.length === 0 && Object.keys(diffComments).length === 0) {
      return entries;
    }

    const normalizedEntry = {
      id: typeof entry?.id === 'string' && entry.id.length > 0
        ? entry.id
        : `spec-version-comment-${entryIndex}`,
      line: typeof entry?.line === 'string' ? entry.line : '',
      sectionTitle: typeof entry?.sectionTitle === 'string' ? entry.sectionTitle : '',
      comments,
    };

    if (typeof entry?.rowStableKey === 'string' && entry.rowStableKey.length > 0) {
      normalizedEntry.rowStableKey = entry.rowStableKey;
    }

    if (Number.isInteger(entry?.rowIndex) && entry.rowIndex >= 0) {
      normalizedEntry.rowIndex = entry.rowIndex;
    }

    if (Number.isInteger(entry?.rawIndex) && entry.rawIndex >= 0) {
      normalizedEntry.rawIndex = entry.rawIndex;
    }

    const normalizedCheckTarget = normalizeCommentTarget(entry?.checkTarget);
    if (normalizedCheckTarget) {
      normalizedEntry.checkTarget = normalizedCheckTarget;
    }

    const normalizedIssueTarget = normalizeCommentTarget(entry?.issueTarget);
    if (normalizedIssueTarget) {
      normalizedEntry.issueTarget = normalizedIssueTarget;
    }

    if (typeof entry?.issueSeverity === 'string' && entry.issueSeverity.length > 0) {
      normalizedEntry.issueSeverity = entry.issueSeverity;
    }

    if (Object.keys(diffComments).length > 0) {
      normalizedEntry.diffComments = diffComments;
    }

    entries.push(normalizedEntry);
    return entries;
  }, []);
}

function buildSpecVersionCommentEntriesSignature(commentEntries = []) {
  return JSON.stringify(normalizeSpecVersionCommentEntries(commentEntries));
}

function createSpecVersionEntry({
  number = 1,
  code = '',
  createdAt = Date.now(),
  id = null,
  commentEntries = [],
} = {}) {
  const normalizedNumber = Number.isInteger(number) && number > 0 ? number : 1;
  const normalizedCreatedAt = Number.isFinite(createdAt) ? createdAt : Date.now();

  return {
    id: id ?? `spec-version-${normalizedNumber}-${normalizedCreatedAt}`,
    number: normalizedNumber,
    label: buildSpecVersionLabel(normalizedNumber),
    code: typeof code === 'string' ? code : '',
    commentEntries: normalizeSpecVersionCommentEntries(commentEntries),
    createdAt: normalizedCreatedAt,
  };
}

function buildInitialSpecVersionHistory(code = '', commentEntries = []) {
  const initialEntry = createSpecVersionEntry({ number: 1, code, commentEntries });
  return {
    currentVersionId: initialEntry.id,
    versions: [initialEntry],
  };
}

function syncSpecVersionHistoryCurrentCode(history = null, currentCode = '', currentCommentEntries = undefined) {
  const normalizedCurrentCode = typeof currentCode === 'string' ? currentCode : '';

  if (!Array.isArray(history?.versions) || history.versions.length === 0) {
    return buildInitialSpecVersionHistory(
      normalizedCurrentCode,
      currentCommentEntries === undefined ? [] : currentCommentEntries,
    );
  }

  const currentEntry = history.versions[history.versions.length - 1];
  const nextCurrentCommentEntries = currentCommentEntries === undefined
    ? normalizeSpecVersionCommentEntries(currentEntry?.commentEntries ?? [])
    : normalizeSpecVersionCommentEntries(currentCommentEntries);
  const currentCommentSignature = buildSpecVersionCommentEntriesSignature(currentEntry?.commentEntries ?? []);
  const nextCommentSignature = buildSpecVersionCommentEntriesSignature(nextCurrentCommentEntries);
  if (
    normalizeSpecCodeForComparison(currentEntry?.code ?? '')
      === normalizeSpecCodeForComparison(normalizedCurrentCode)
    && currentCommentSignature === nextCommentSignature
  ) {
    return history;
  }

  const nextCurrentEntry = {
    ...currentEntry,
    code: normalizedCurrentCode,
    commentEntries: nextCurrentCommentEntries,
  };

  return {
    ...history,
    currentVersionId: nextCurrentEntry.id,
    versions: [
      ...history.versions.slice(0, -1),
      nextCurrentEntry,
    ],
  };
}

function appendSpecVersionHistoryEntry(history = null, {
  currentCode = '',
  nextCode = '',
  currentCommentEntries = undefined,
  nextCommentEntries = [],
} = {}) {
  const syncedHistory = syncSpecVersionHistoryCurrentCode(history, currentCode, currentCommentEntries);
  const currentEntry = syncedHistory.versions[syncedHistory.versions.length - 1] ?? null;

  if (
    normalizeSpecCodeForComparison(currentEntry?.code ?? '')
      === normalizeSpecCodeForComparison(nextCode)
  ) {
    return syncedHistory;
  }

  const nextEntry = createSpecVersionEntry({
    number: (currentEntry?.number ?? 0) + 1,
    code: nextCode,
    commentEntries: nextCommentEntries,
  });

  return {
    currentVersionId: nextEntry.id,
    versions: [...syncedHistory.versions, nextEntry],
  };
}

function buildSpecVersionCodeWithInlineComments(code = '', commentEntries = []) {
  const normalizedCode = typeof code === 'string' ? code : '';
  const normalizedEntries = normalizeSpecVersionCommentEntries(commentEntries);

  if (normalizedEntries.length === 0) {
    return normalizedCode;
  }

  const lines = normalizedCode.length > 0 ? normalizedCode.split('\n') : [];
  const commentsByLineIndex = new Map();
  const fallbackStartByLineText = new Map();

  normalizedEntries.forEach((entry) => {
    const comments = Array.isArray(entry?.comments)
      ? entry.comments
        .map((comment) => (typeof comment === 'string' ? comment.trim() : ''))
        .filter((comment) => comment.length > 0)
      : [];

    if (comments.length === 0) {
      return;
    }

    let lineIndex = Number.isInteger(entry?.rawIndex) && entry.rawIndex >= 0
      ? entry.rawIndex
      : null;

    if (lineIndex === null && typeof entry?.line === 'string' && entry.line.length > 0) {
      const searchStart = fallbackStartByLineText.get(entry.line) ?? 0;
      const nextOffset = lines.slice(searchStart).findIndex((line) => line === entry.line);
      if (nextOffset >= 0) {
        lineIndex = searchStart + nextOffset;
        fallbackStartByLineText.set(entry.line, lineIndex + 1);
      }
    }

    const normalizedLineIndex = lines.length === 0
      ? -1
      : (lineIndex === null
          ? lines.length - 1
          : Math.min(lineIndex, lines.length - 1));

    const existingCommentLines = commentsByLineIndex.get(normalizedLineIndex) ?? [];
    comments.forEach((comment) => {
      existingCommentLines.push(`//${comment}`);
    });
    commentsByLineIndex.set(normalizedLineIndex, existingCommentLines);
  });

  if (commentsByLineIndex.size === 0) {
    return normalizedCode;
  }

  if (lines.length === 0) {
    return (commentsByLineIndex.get(-1) ?? []).join('\n');
  }

  const nextLines = [];
  lines.forEach((line, lineIndex) => {
    nextLines.push(line);

    const inlineComments = commentsByLineIndex.get(lineIndex) ?? [];
    if (inlineComments.length > 0) {
      nextLines.push(...inlineComments);
    }
  });

  const orphanCommentLines = commentsByLineIndex.get(-1) ?? [];
  if (orphanCommentLines.length > 0) {
    nextLines.unshift(...orphanCommentLines);
  }

  return nextLines.join('\n');
}

function applyIssueQuickFixToCode(code, { kind, index, replacementText }) {
  if (typeof code !== 'string' || !replacementText || !Number.isInteger(index) || index < 0) {
    return code;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  const lines = code.split(/\r?\n/);
  let inTargetSection = false;
  let checkIndex = 0;
  let replaced = false;

  const nextLines = lines.map((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      inTargetSection = headingTitle.toLowerCase() === targetSectionTitle;
      if (!inTargetSection) {
        checkIndex = 0;
      }
      return line;
    }

    if (!inTargetSection) {
      return line;
    }

    const checkMatch = line.match(/^(- \[[ x]\]\s+)(.*)$/i);
    if (!checkMatch) {
      return line;
    }

    if (checkIndex === index) {
      replaced = true;
      checkIndex += 1;
      return `${checkMatch[1]}${replacementText}`;
    }

    checkIndex += 1;
    return line;
  });

  return replaced ? nextLines.join('\n') : code;
}

function extractGoalTitleFromMarkdown(code) {
  if (!code) return '';

  const lines = code.split('\n');
  const goalIndex = lines.findIndex((line) => line.trim().toLowerCase() === '## goal');
  if (goalIndex === -1) return '';

  for (let i = goalIndex + 1; i < lines.length; i += 1) {
    const nextLine = lines[i].trim();
    if (!nextLine) continue;
    if (nextLine.startsWith('## ')) break;
    return nextLine;
  }

  return '';
}

function renderDoneInlineText(text, keyPrefix = 'inline') {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) => {
    if (/^`[^`]+`$/.test(part)) {
      return <span key={`${keyPrefix}-${index}`} className="spec-ref">{part.slice(1, -1)}</span>;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

const INLINE_INSPECTION_TOOLTIP_WIDTH = 320;

function getInlineInspectionTooltipData(highlight = null, issue = null) {
  const title = typeof highlight?.tooltip?.title === 'string'
    ? highlight.tooltip.title.trim()
    : (typeof issue?.label === 'string' ? issue.label.trim() : '');

  if (!title) {
    return null;
  }

  const hint = typeof highlight?.tooltip?.hint === 'string'
    ? highlight.tooltip.hint.trim()
    : (typeof issue?.label === 'string' && issue.label.trim().length > 0
        ? issue.label.trim()
        : (issue?.severity === 'error'
            ? 'Inspection error'
            : issue?.severity === 'warning'
              ? 'Inspection warning'
              : 'Inspection issue'));

  return {
    title,
    hint,
  };
}

function InlineInspectionHoverTooltip({ rect, tooltip, onMouseEnter, onMouseLeave, onAccept, onReject }) {
  if (!rect || !tooltip?.title || typeof document === 'undefined' || typeof window === 'undefined') {
    return null;
  }

  const cornerMaskId = useId().replace(/:/g, '-');
  const left = Math.max(8, rect.left);
  const arrowLeft = Math.min(
    Math.max(16, Math.round(rect.left + rect.width / 2 - left)),
    400,
  );

  return createPortal(
    <div
      className="spec-inline-hover-tooltip"
      style={{
        top: rect.top - 8,
        left,
        '--spec-inline-hover-tooltip-arrow-left': `${arrowLeft}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="spec-inline-hover-tooltip-body" role="tooltip">
        <div className="spec-inline-hover-tooltip-top">
          {tooltip.hint ? (
            <span className="spec-inline-hover-tooltip-suggestion">{tooltip.hint}</span>
          ) : null}
          <button type="button" className="spec-inline-hover-tooltip-more" aria-label="More actions">
            <Icon name="general/moreVertical" size={16} />
          </button>
        </div>
        <div className="spec-inline-hover-tooltip-actions">
          <button type="button" className="spec-inline-hover-tooltip-btn" onClick={onAccept}>Accept</button>
          <button type="button" className="spec-inline-hover-tooltip-btn" onClick={onReject}>Reject</button>
        </div>
      </div>
      <svg
        className="spec-inline-hover-tooltip-corner"
        width="16"
        height="8"
        viewBox="0 0 16 8"
        fill="none"
        aria-hidden="true"
      >
        <path d="M8 8L16.5 -0.5L-0.5 -0.5L8 8Z" fill="#33353b" />
        <mask id={cornerMaskId} fill="white">
          <path d="M15.7929 -0.500001L16.5 -0.500001L8 8L-0.5 -0.499999L0.207108 -0.5L8 7.29289L15.7929 -0.500001Z" />
        </mask>
        <path
          d="M15.7929 -0.500001L16.5 -0.500001L8 8L-0.5 -0.499999L0.207108 -0.5L8 7.29289L15.7929 -0.500001Z"
          fill="#40434a"
        />
        <path
          d="M16.5 -0.500001L17.2071 0.207106L18.9142 -1.5L16.5 -1.5V-0.500001ZM15.7929 -0.500001V-1.5H15.3787L15.0858 -1.20711L15.7929 -0.500001ZM8 8L7.29289 8.70711L8 9.41421L8.70711 8.70711L8 8ZM-0.5 -0.499999L-0.5 -1.5L-2.91421 -1.5L-1.20711 0.207107L-0.5 -0.499999ZM0.207108 -0.5L0.914214 -1.20711L0.621321 -1.5L0.207107 -1.5L0.207108 -0.5ZM8 7.29289L7.29289 8L8 8.70711L8.70711 8L8 7.29289ZM16.5 -0.500001V-1.5L15.7929 -1.5V-0.500001V0.499999L16.5 0.499999V-0.500001ZM8 8L8.70711 8.70711L17.2071 0.207106L16.5 -0.500001L15.7929 -1.20711L7.29289 7.29289L8 8ZM-0.5 -0.499999L-1.20711 0.207107L7.29289 8.70711L8 8L8.70711 7.29289L0.207107 -1.20711L-0.5 -0.499999ZM0.207108 -0.5L0.207107 -1.5L-0.5 -1.5L-0.5 -0.499999L-0.5 0.5H0.207108L0.207108 -0.5ZM0.207108 -0.5L-0.499999 0.207107L7.29289 8L8 7.29289L8.70711 6.58579L0.914214 -1.20711L0.207108 -0.5ZM8 7.29289L8.70711 8L16.5 0.207107L15.7929 -0.500001L15.0858 -1.20711L7.2929 6.58578L8 7.29289Z"
          fill="black"
          mask={`url(#${cornerMaskId})`}
        />
      </svg>
    </div>,
    document.body
  );
}

function InlineInspectionHighlight({ className, tooltip = null, onAccept = null, onReject = null, children }) {
  return (
    <span className={className}>
      {children}
    </span>
  );
}

function renderDoneMarkdownInline(text, highlight = null, issue = null, onAccept = null, onReject = null) {
  if (!highlight?.match || !highlight?.className) {
    return renderDoneInlineText(text);
  }

  const start = text.indexOf(highlight.match);
  if (start === -1) {
    return renderDoneInlineText(text);
  }

  const end = start + highlight.match.length;
  const segments = [
    start > 0 ? { text: text.slice(0, start) } : null,
    { text: text.slice(start, end), className: highlight.className },
    end < text.length ? { text: text.slice(end) } : null,
  ].filter(Boolean);

  return segments.map((segment, index) => {
    const content = renderDoneInlineText(segment.text, `inline-${index}`);
    if (!segment.className) {
      return <Fragment key={`segment-${index}`}>{content}</Fragment>;
    }

    const tooltip = getInlineInspectionTooltipData(highlight, issue);

    return (
      <InlineInspectionHighlight
        key={`segment-${index}`}
        className={segment.className}
        tooltip={tooltip}
        onAccept={onAccept}
        onReject={onReject}
      >
        {content}
      </InlineInspectionHighlight>
    );
  });
}

function DoneFileChipGroup({ initialFiles = [], addPopupFiles, addButtonLabel = 'Add file', className = '', menuMode = 'files', onWorkflowSelect = null, onChipClick = null, onChipRemove = null, showAddButton = true, disableAddButton = false }) {
  const normalizedInitialFiles = useMemo(
    () => normalizeDoneFileEntries(initialFiles),
    [initialFiles]
  );
  const normalizedInitialFilesSignature = normalizedInitialFiles.map((file) => file.label).join('|');
  const [files, setFiles] = useState(() => normalizedInitialFiles);
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const addBtnRef = useRef(null);

  useEffect(() => {
    setFiles(normalizedInitialFiles);
  }, [normalizedInitialFilesSignature]);

  const removeFile = (labelToRemove) => {
    setFiles((prev) => prev.filter((file) => file.label !== labelToRemove));
  };

  const clearDoneEditorFocus = () => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest('.spec-done-overlay')) {
      activeElement.blur();
    }
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    window.dispatchEvent(new Event(SPEC_DONE_CLEAR_FOCUS_EVENT));
  };

  const openAddPopup = () => {
    clearDoneEditorFocus();
    if (!showAddPopup && addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setPopupPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShowAddPopup((prev) => !prev);
  };

  return (
    <>
      <div className={`attached-files-list spec-done-ref-chip-list${className ? ` ${className}` : ''}`}>
        {files.map((file) => (
          <AttachedFileChip
            key={file.label}
            label={file.label}
            className="spec-done-ref-chip"
            onClick={onChipClick ? ((event) => {
              event.preventDefault();
              event.stopPropagation();
              onChipClick(file);
            }) : undefined}
            onRemove={(onChipClick && onChipRemove) ? ((event) => {
                event.preventDefault();
                event.stopPropagation();
                removeFile(file.label);
                onChipRemove(file);
              }) : (onChipClick ? null : ((event) => {
                event.preventDefault();
                event.stopPropagation();
                removeFile(file.label);
              }))}
          />
        ))}
        {showAddButton && (
          <button
            type="button"
            className="at-icon-btn spec-done-ref-add-btn"
            ref={addBtnRef}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={disableAddButton ? undefined : ((event) => {
              event.preventDefault();
              event.stopPropagation();
              openAddPopup();
            })}
            aria-label={addButtonLabel}
            aria-disabled={disableAddButton ? 'true' : undefined}
            tabIndex={disableAddButton ? -1 : undefined}
          >
            <Icon name="general/settings" size={16} />
          </button>
        )}
      </div>
      {showAddPopup && popupPos && createPortal(
        <>
          <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
          {menuMode === 'workflow' ? (
            <WorkflowPopup
              onClose={() => setShowAddPopup(false)}
              onSelect={(workflow) => {
                clearDoneEditorFocus();
                setFiles([{ label: workflow.label }]);
                onWorkflowSelect?.(workflow);
                setShowAddPopup(false);
                window.requestAnimationFrame(clearDoneEditorFocus);
              }}
              style={{ position: 'fixed', ...popupPos }}
            />
          ) : (
            <AddPopup
              onClose={() => setShowAddPopup(false)}
              onSelectFile={(item) => {
                setFiles((prev) => prev.some((file) => file.label === item.label) ? prev : [...prev, { label: item.label }]);
              }}
              files={addPopupFiles}
              style={{ position: 'fixed', ...popupPos }}
            />
          )}
        </>,
        document.body
      )}
    </>
  );
}

const WORKFLOW_MENU_ITEMS = [
  { id: 'step-through', label: 'Step-through' },
  { id: 'autonomous', label: 'Autonomous' },
  { id: 'new-workflow', label: 'Create new workflow', separatorBefore: true },
];

function WorkflowPopup({ onClose, onSelect, style }) {
  return (
    <div className="add-popup workflow-popup" style={style}>
      <div className="add-popup-files">
        {WORKFLOW_MENU_ITEMS.map((item) => (
          <Fragment key={item.id}>
            {item.separatorBefore && <div className="workflow-popup-separator" aria-hidden="true" />}
            <div
              className="add-popup-item workflow-popup-item"
              onMouseDown={() => {
                onSelect?.(item);
                onClose?.();
            }}
          >
            <span className="workflow-popup-icon" aria-hidden="true">
                {item.id === 'new-workflow' ? <Icon name="general/add" size={16} /> : <WorkflowCheckIcon />}
            </span>
            <span className="add-popup-item-label">{item.label}</span>
          </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function WorkflowCheckIcon() {
  return (
    <svg className="workflow-popup-check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.3L6.2 11.5L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoneCommentButton({ commentCount = 0, isOpen = false, onOpen, demoId = null }) {
  const hasComments = commentCount > 0;

  return (
    <span className={`spec-done-comment-slot${hasComments ? ' has-comments' : ''}${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`spec-done-comment-btn${isOpen ? ' is-open' : ''}${hasComments ? ' has-comments' : ''}`}
        aria-label={hasComments ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : 'Add comment'}
        data-demo-id={demoId ?? undefined}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen?.(event.currentTarget.getBoundingClientRect());
        }}
      >
        {hasComments ? <DoneCommentCountIcon /> : <Icon name="general/balloon" size={16} />}
      </button>
      {commentCount > 0 && <span className="spec-done-comment-count">{commentCount}</span>}
    </span>
  );
}

function DoneInlineCommentPreview({ comment }) {
  if (!comment) return null;

  return (
    <span className="spec-done-inline-comment-preview spec-line-comment" title={comment}>
      <span className="spec-comment-prefix">//</span>
      <span className="spec-done-inline-comment-preview-text text-ui-default">{comment}</span>
    </span>
  );
}

function DoneCommentAdornment({ comments = [], isOpen = false, onOpen, demoId = null }) {
  const commentCount = comments.length;
  const latestComment = commentCount > 0 ? comments[commentCount - 1] : '';

  return (
    <span className={`spec-done-comment-adornment${commentCount > 0 ? ' has-comments' : ''}`}>
      <DoneCommentButton
        commentCount={commentCount}
        isOpen={isOpen}
        demoId={demoId}
        onOpen={onOpen}
      />
    </span>
  );
}

function DoneInlineRunButton({ onRun, demoId = null, title = 'Build item' }) {
  return (
    <button
      type="button"
      className="spec-done-gutter-line-number-run spec-done-gutter-item-run-btn"
      aria-label={title}
      title={title}
      data-demo-id={demoId ?? undefined}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onRun?.();
      }}
    >
      <Icon name="run/run" size={16} />
    </button>
  );
}

function DoneCommentCountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.14258 1.64307L12.8564 1.64307C13.6849 1.64307 14.3564 2.31464 14.3564 3.14307L14.3564 14.9595L9.45508 11.0386C9.38853 10.9853 9.30968 10.9502 9.22656 10.936L9.14258 10.9292L3.14258 10.9292C2.31429 10.9292 1.6428 10.2574 1.64258 9.4292L1.64258 3.14307C1.64258 2.31464 2.31415 1.64307 3.14258 1.64307Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DoneCommentPopup({
  comments = [],
  value,
  editingIndex = null,
  onChange,
  onCancel,
  onSubmit,
  onStartEdit,
  onDelete,
}) {
  const popupRef = useRef(null);
  const textareaRef = useRef(null);
  const hasComments = comments.length > 0;
  const isEditing = Number.isInteger(editingIndex);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  useEffect(() => {
    const input = textareaRef.current;
    if (input instanceof HTMLTextAreaElement) {
      input.focus();
      if (isEditing) {
        input.select();
      }
    }
  }, [hasComments, isEditing]);

  return (
    <div
      ref={popupRef}
      className={`cmp-popup spec-done-comment-popup${hasComments ? ' has-comments' : ''}`}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (!(event.target instanceof HTMLTextAreaElement)) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel?.();
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onSubmit?.();
        }
      }}
    >
      {hasComments && (
        <>
          <div className="spec-done-comment-popup-header">
            <span className="spec-done-comment-popup-title text-ui-default-semibold">Comments</span>
          </div>
          <div className="spec-done-comment-popup-list">
            {comments.map((comment, index) => (
              <div key={`comment-${index}`} className="spec-done-comment-popup-item">
                <div className="spec-done-comment-popup-item-body">
                  <div className="spec-done-comment-popup-item-text text-ui-default">{comment}</div>
                  <div className="spec-done-comment-popup-item-actions">
                    <button type="button" className="spec-done-comment-popup-link" onClick={() => onStartEdit?.(index)}>Change</button>
                    <button type="button" className="spec-done-comment-popup-link" onClick={() => onDelete?.(index)}>Delete</button>
                  </div>
                </div>
                <button type="button" className="spec-done-comment-popup-more-btn" aria-label="More actions">
                  <Icon name="general/moreVertical" size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="spec-done-comment-popup-compose">
        <div className="spec-done-comment-popup-input-wrap">
          <textarea
            ref={textareaRef}
            className="spec-done-comment-popup-textarea text-ui-default"
            value={value}
            placeholder="Write a comment"
            data-demo-id="spec-comment-input"
            onChange={(event) => onChange?.(event.target.value)}
            rows={1}
          />
        </div>
        <div className="spec-done-comment-popup-actions">
          <Button type="secondary" data-demo-id="spec-comment-cancel" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="primary" data-demo-id="spec-comment-submit" onClick={onSubmit}>
            {isEditing ? 'Save Comment' : 'Add a Comment'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DoneReferenceFileLine({ label, addPopupFiles, commentAdornment = null }) {
  return (
    <div className="spec-done-line spec-done-line-meta">
      <h2 className="spec-done-meta-label text-ui-h2" contentEditable suppressContentEditableWarning>Reference file</h2>
      <DoneFileChipGroup
        initialFiles={[label]}
        addPopupFiles={addPopupFiles}
        addButtonLabel="Add reference file"
      />
      {commentAdornment}
    </div>
  );
}

function DoneHeadingWithFiles({ title, initialFiles = [], addPopupFiles, commentAdornment = null, menuMode = 'files', onWorkflowSelect = null, onWorkflowOpen = null, onWorkflowRemove = null, showAddButton = true, disableAddButton = false }) {
  return (
    <div className="spec-done-heading-row">
      <h1 className="spec-done-heading text-ui-h1" contentEditable suppressContentEditableWarning>
        {renderDoneMarkdownInline(title)}
      </h1>
      <DoneFileChipGroup
        initialFiles={initialFiles}
        addPopupFiles={addPopupFiles}
        addButtonLabel={`Add file to ${title}`}
        className="spec-done-heading-files"
        menuMode={menuMode}
        onWorkflowSelect={onWorkflowSelect}
        onChipClick={onWorkflowOpen}
        onChipRemove={onWorkflowRemove}
        showAddButton={showAddButton}
        disableAddButton={disableAddButton}
      />
      {commentAdornment}
    </div>
  );
}

function getDoneHeadingTitle(line) {
  const headingMatch = line.match(/^\s*##\s+(.*)$/);
  return headingMatch ? headingMatch[1].trim() : null;
}

function shouldShowDoneRunIcon(line, { hidePlanRun = false, hideAcRun = false } = {}) {
  const headingTitle = getDoneHeadingTitle(line)?.toLowerCase();
  if (hidePlanRun && headingTitle === 'plan') {
    return false;
  }
  if (hideAcRun && headingTitle === 'acceptance criteria') {
    return false;
  }
  return headingTitle === 'plan' || headingTitle === 'acceptance criteria';
}

function CheckStatus({ status, outdated = false, isLoading = false }) {
  const normalizedStatus = typeof status === 'string' && status.trim().length > 0 ? status : 'pending';

  return (
    <span
      className={`spec-check-status spec-check-status-${normalizedStatus}${outdated ? ' is-outdated' : ''}`}
      aria-label={normalizedStatus}
      title={outdated ? `${normalizedStatus} (outdated)` : normalizedStatus}
    >
      {isLoading ? (
        <IconLoaderSpinner />
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          {normalizedStatus === 'pending'
            ? <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="2.75" stroke="currentColor" strokeWidth="1.5" />
            : <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
          }
          {normalizedStatus === 'passed'
            ? <path d="M5.5 8.5L7 10L10.5 6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            : normalizedStatus === 'pending'
              ? null
              : <rect x="4" y="7.25" width="8" height="1.5" rx="0.75" fill="#fff" />
          }
        </svg>
      )}
    </span>
  );
}

function AcSubcheckIcon({ status }) {
  if (status === 'passed') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ac-subcheck-icon ac-subcheck-icon-passed">
        <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="ac-subcheck-icon ac-subcheck-icon-failed">
      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AcCheckRow({
  checkItem,
  text,
  isIssueActive = false,
  commentAdornment = null,
  onProposalAccept = null,
  onProposalDecision = null,
  isRunning = false,
  useCheckbox = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [proposalAccepted, setProposalAccepted] = useState(false);
  const [proposalRejected, setProposalRejected] = useState(false);
  const checks = checkItem.checks || [];
  const problemCount = checks.filter(c => c.status === 'failed').length || checkItem.problemCount || 0;
  const hasChecks = checks.length > 0;
  const hasToggle = hasChecks || problemCount > 0;
  const isOutdated = isRunStatusItemOutdated(checkItem);

  const handleProposalAccept = () => {
    setProposalAccepted(true);
    onProposalDecision?.('accept');
    onProposalAccept?.();
  };

  const handleProposalReject = () => {
    setProposalRejected(true);
    onProposalDecision?.('reject');
  };

  const proposalOptions = Array.isArray(checkItem.proposalOptions) ? checkItem.proposalOptions : null;
  const showProposal = (Boolean(checkItem.proposal) || Boolean(proposalOptions)) && !proposalAccepted && !proposalRejected;

  const displayText = proposalAccepted && checkItem.highlight?.match && checkItem.proposal
    ? text.replace(checkItem.highlight.match, checkItem.proposal.replace(/^Proposal:\s*/i, ''))
    : text;
  const displayHighlight = proposalAccepted ? null : checkItem.highlight;
  const displayIssue = proposalAccepted ? null : checkItem.issue;

  const visualStatus = proposalAccepted
    ? 'pending'
    : ('checkboxStatus' in checkItem
        ? checkItem.checkboxStatus
        : (checkItem.status === 'passed'
            ? 'passed'
            : (checkItem.issue?.severity === 'warning'
                ? 'warning'
                : (checkItem.issue?.severity === 'error'
                    ? 'error'
                    : checkItem.status))));

  return (
    <div className={`spec-done-line spec-done-line-check ac-check-row${isOutdated ? ' is-outdated' : ''}`}>
      <div className={`ac-check-main spec-done-primary-line${isIssueActive && !proposalAccepted ? ' spec-done-active-issue-line' : ''}${isOutdated ? ' is-outdated' : ''}`}>
        {useCheckbox
          ? <Checkbox className="spec-done-checkbox" checked={false} onChange={() => {}} />
          : <CheckStatus status={visualStatus} outdated={isOutdated} isLoading={isRunning && visualStatus === 'pending'} />}
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(displayText, displayHighlight, displayIssue, handleProposalAccept, handleProposalReject)}</span>
        {hasToggle && (
          <button className="ac-checks-toggle" onClick={() => setExpanded(e => !e)}>
            {hasChecks ? `${checks.length} checks` : ''}{!proposalAccepted && problemCount > 0 ? `${hasChecks ? '/' : ''}${problemCount} problem` : ''}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`ac-checks-arrow${expanded ? ' expanded' : ''}`}>
              <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {commentAdornment}
      </div>
      {expanded && (
        <div className="ac-subcheck-list">
          {checks.map((check, i) => (
            <div key={i} className={`ac-subcheck-item${isOutdated ? ' is-outdated' : ''}`}>
              <AcSubcheckIcon status={check.status} />
              <span className="ac-subcheck-text">{check.text}</span>
              {check.chip && <span className="ac-subcheck-chip">{check.chip}</span>}
              {check.note && <span className="ac-subcheck-note">{check.note}</span>}
            </div>
          ))}
          {showProposal && (
            <div className={`ac-proposal-row${proposalOptions ? ' ac-proposal-row-options' : ''}`}>
              <span className="ac-proposal-icon">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 13.5H10M7 15H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M5.5 10.5C4.5 9.5 4 8.5 4 7.5C4 5.29086 5.79086 3.5 8 3.5C10.2091 3.5 12 5.29086 12 7.5C12 8.5 11.5 9.5 10.5 10.5V11.5C10.5 11.7761 10.2761 12 10 12H6C5.72386 12 5.5 11.7761 5.5 11.5V10.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
              </span>
              {proposalOptions ? (
                <div className="ac-proposal-options">
                  {proposalOptions.map((opt, i) =>
                    opt.type === 'text' ? (
                      <div key={i} className="ac-proposal-option-text-row">
                        <span className="ac-proposal-option-num">{i + 1}.</span>
                        <input type="text" className="ac-proposal-text-field" placeholder={opt.placeholder || 'Custom...'} />
                      </div>
                    ) : (
                      <button key={i} type="button" className="ac-proposal-option-btn" onClick={handleProposalAccept}>
                        <span className="ac-proposal-option-num">{i + 1}.</span>
                        {opt.label}
                      </button>
                    )
                  )}
                </div>
              ) : (
                <>
                  <span className="ac-proposal-text">{checkItem.proposal}</span>
                  <button type="button" className="ac-proposal-btn" onClick={handleProposalReject}>Reject</button>
                  <button type="button" className="ac-proposal-btn" onClick={handleProposalAccept}>Accept</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PLAN_DIFF_PREVIEW_REPLACEMENTS = {
  0: 'Schema changes — add vet_id (FK), visit_time (TIME), and UNIQUE(vet_id, visit_date, visit_time) constraint',
  1: 'Visit entity — add `ManyToOne` vet and `LocalTime` time with `NotNull`',
  2: 'VisitRepository — add double-booking query + UNIQUE(vet_id, visit_date, visit_time) constraint',
  3: 'VisitController — inject `VetRepository`, add `ModelAttribute("vets")` with `findAll()`',
  4: 'Form template — add <select> for vet with VetFormatter (per PetTypeFormatter pattern) and time slot',
  5: 'Owner details — add Vet and Time columns to visit history table',
  6: 'Tests — vet list in model, successful booking, double-booking rejected',
};

function getPlanDiffReplacementText({ text, issueTarget }) {
  if (issueTarget?.kind !== 'plan') {
    return typeof text === 'string' ? text : '';
  }

  const quickFixConfig = getIssueQuickFixConfig('plan', issueTarget.index);
  if (quickFixConfig?.replacementText) {
    return quickFixConfig.replacementText;
  }

  const previewReplacement = PLAN_DIFF_PREVIEW_REPLACEMENTS[issueTarget.index];
  if (typeof previewReplacement === 'string' && previewReplacement.trim().length > 0) {
    return previewReplacement;
  }

  return typeof text === 'string' ? text : '';
}

function buildPlanDiffInlineFragments(sourceText = '', targetText = '') {
  const normalizedSource = typeof sourceText === 'string' ? sourceText : '';
  const normalizedTarget = typeof targetText === 'string' ? targetText : '';

  if (normalizedSource === normalizedTarget) {
    return {
      removed: [{ text: normalizedSource || ' ', tone: 'removed' }],
      added: [{ text: normalizedTarget || ' ', tone: 'added' }],
    };
  }

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < normalizedSource.length &&
    commonPrefixLength < normalizedTarget.length &&
    normalizedSource[commonPrefixLength] === normalizedTarget[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let sourceSuffixIndex = normalizedSource.length - 1;
  let targetSuffixIndex = normalizedTarget.length - 1;

  while (
    sourceSuffixIndex >= commonPrefixLength &&
    targetSuffixIndex >= commonPrefixLength &&
    normalizedSource[sourceSuffixIndex] === normalizedTarget[targetSuffixIndex]
  ) {
    sourceSuffixIndex -= 1;
    targetSuffixIndex -= 1;
  }

  const leadingText = normalizedSource.slice(0, commonPrefixLength);
  const sourceChangedText = normalizedSource.slice(commonPrefixLength, sourceSuffixIndex + 1);
  const targetChangedText = normalizedTarget.slice(commonPrefixLength, targetSuffixIndex + 1);
  const trailingText = normalizedTarget.slice(targetSuffixIndex + 1);

  const buildFragments = (changedText, tone, fallbackText) => {
    const fragments = [];

    if (changedText) {
      if (leadingText) {
        fragments.push({ text: leadingText, tone: 'plain' });
      }
      fragments.push({ text: changedText, tone });
      if (trailingText) {
        fragments.push({ text: trailingText, tone: 'plain' });
      }
    } else {
      fragments.push({ text: fallbackText || ' ', tone });
    }

    return fragments;
  };

  return {
    removed: buildFragments(sourceChangedText, 'removed', normalizedSource),
    added: buildFragments(targetChangedText, 'added', normalizedTarget),
  };
}

function buildPlainDiffFragments(text = '') {
  return [{ text: text || ' ', tone: 'plain' }];
}

function normalizeDoneFileEntries(files = []) {
  const normalizedFiles = Array.isArray(files)
    ? files
      .map((file) => (typeof file === 'string' ? { label: file } : file))
      .filter((file) => typeof file?.label === 'string' && file.label.trim().length > 0)
    : [];

  return normalizedFiles.filter((file, index, items) => (
    items.findIndex((candidate) => candidate.label === file.label) === index
  ));
}

function getDonePlanHeadingFiles(sectionMeta = null, attachedFiles = []) {
  if (sectionMeta?.kind === 'chip' && typeof sectionMeta.text === 'string' && sectionMeta.text.trim().length > 0) {
    return normalizeDoneFileEntries([sectionMeta.text]);
  }

  return [];
}

function getDoneAcceptanceHeadingFiles(sectionMeta = null, attachedFiles = []) {
  const initialFiles = [];

  if (sectionMeta?.kind === 'chip' && typeof sectionMeta.text === 'string' && sectionMeta.text.trim().length > 0) {
    initialFiles.push(sectionMeta.text);
  }

  (attachedFiles ?? []).forEach((file) => {
    const label = typeof file === 'string' ? file : file?.label;
    initialFiles.push(label);
  });

  return normalizeDoneFileEntries(initialFiles);
}

function buildPlanDiffViewerData({
  documentSections = [],
  planRunResult = null,
  removedIssueIndices = null,
  diffData = null,
  diffTarget = null,
} = {}) {
  const planSection = (documentSections ?? []).find((section) => section?.title?.toLowerCase() === 'plan') ?? null;
  const removedPlanIndices = removedIssueIndices?.plan ?? {};
  const changedFiles = [
    diffData?.sourceTabLabel,
    ...((diffData?.rows ?? []).map((row) => row.file).filter((file) => typeof file === 'string' && file.trim().length > 0)),
  ].filter((file, index, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === index);

  if (!planSection) {
    return {
      planItems: [],
      changedFiles,
    };
  }

  const visiblePlanItemCount = (planSection.items ?? []).reduce((count, item, originalIndex) => (
    item?.type === 'check' && !removedPlanIndices[originalIndex] ? count + 1 : count
  ), 0);
  const presetFileLabels = Object.values(PLAN_CODE_DIFF_PRESETS).map((preset) => preset.fileLabel);
  const canUsePresetFileMapping =
    visiblePlanItemCount === presetFileLabels.length
    && changedFiles.some((file) => presetFileLabels.includes(file));

  let visibleIndex = 0;
  const planItems = (planSection.items ?? []).reduce((items, item, originalIndex) => {
    if (item?.type !== 'check' || removedPlanIndices[originalIndex]) {
      return items;
    }

    const isCurrent = diffTarget?.kind === 'plan' && diffTarget.index === originalIndex;
    const currentDiffFiles = isCurrent && diffData?.sourceTabLabel ? [diffData.sourceTabLabel] : [];
    const presetFile = canUsePresetFileMapping ? PLAN_CODE_DIFF_PRESETS[originalIndex]?.fileLabel ?? null : null;
    const statusItem = planRunResult?.[visibleIndex] ?? null;
    const status = statusItem?.status ?? null;

    items.push({
      id: item.id ?? `plan-viewer-item-${originalIndex}`,
      text: item.text ?? '',
      status,
      statusItem,
      isOutdated: isRunStatusItemOutdated(statusItem),
      files: [presetFile, ...currentDiffFiles].filter((file, index, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === index),
      isCurrent,
      originalIndex,
      visibleIndex,
    });

    visibleIndex += 1;
    return items;
  }, []);

  return {
    planItems,
    changedFiles,
  };
}

function getPlanCodeDiffPreset(issueTarget) {
  const planIndex = Number.isInteger(issueTarget?.index) ? issueTarget.index : 0;
  const presetIndexMap = {
    0: 0,
    1: 1,
    2: 2,
    3: 4,
    4: 5,
    5: 3,
    6: 6,
  };
  const presetIndex = presetIndexMap[planIndex] ?? planIndex;
  return PLAN_CODE_DIFF_PRESETS[presetIndex] ?? PLAN_CODE_DIFF_PRESETS[0];
}

function buildCodeDiffRows(beforeCode = '', afterCode = '', rowIdPrefix = 'code-diff', contextRadius = 4) {
  const beforeLines = typeof beforeCode === 'string' ? beforeCode.split(/\r?\n/) : [''];
  const afterLines = typeof afterCode === 'string' ? afterCode.split(/\r?\n/) : [''];

  let commonPrefixLength = 0;
  while (
    commonPrefixLength < beforeLines.length &&
    commonPrefixLength < afterLines.length &&
    beforeLines[commonPrefixLength] === afterLines[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }

  let beforeSuffixIndex = beforeLines.length - 1;
  let afterSuffixIndex = afterLines.length - 1;
  while (
    beforeSuffixIndex >= commonPrefixLength &&
    afterSuffixIndex >= commonPrefixLength &&
    beforeLines[beforeSuffixIndex] === afterLines[afterSuffixIndex]
  ) {
    beforeSuffixIndex -= 1;
    afterSuffixIndex -= 1;
  }

  const beforeChangedCount = Math.max(0, beforeSuffixIndex - commonPrefixLength + 1);
  const afterChangedCount = Math.max(0, afterSuffixIndex - commonPrefixLength + 1);
  const hasChanges = beforeChangedCount > 0 || afterChangedCount > 0;

  if (!hasChanges) {
    const rows = beforeLines.slice(0, Math.min(beforeLines.length, contextRadius * 2 + 1)).map((line, index) => ({
      id: `${rowIdPrefix}-context-${index}`,
      kind: 'context',
      oldNumber: index + 1,
      newNumber: index + 1,
      text: line,
      fragments: buildPlainDiffFragments(line),
    }));
    return {
      differenceCount: 0,
      rows,
      focusRowId: rows[0]?.id ?? null,
    };
  }

  const rows = [];
  let focusRowId = null;
  const contextStart = Math.max(0, commonPrefixLength - contextRadius);

  for (let lineIndex = contextStart; lineIndex < commonPrefixLength; lineIndex += 1) {
    const line = beforeLines[lineIndex] ?? '';
    rows.push({
      id: `${rowIdPrefix}-context-${lineIndex}`,
      kind: 'context',
      oldNumber: lineIndex + 1,
      newNumber: lineIndex + 1,
      text: line,
      fragments: buildPlainDiffFragments(line),
    });
  }

  const changedLineCount = Math.max(beforeChangedCount, afterChangedCount);
  const removedRows = [];
  const addedRows = [];

  for (let offset = 0; offset < changedLineCount; offset += 1) {
    const beforeLineIndex = commonPrefixLength + offset;
    const afterLineIndex = commonPrefixLength + offset;
    const beforeLineExists = offset < beforeChangedCount;
    const afterLineExists = offset < afterChangedCount;
    const beforeLine = beforeLineExists ? (beforeLines[beforeLineIndex] ?? '') : '';
    const afterLine = afterLineExists ? (afterLines[afterLineIndex] ?? '') : '';
    const inlineFragments = beforeLineExists && afterLineExists
      ? buildPlanDiffInlineFragments(beforeLine, afterLine)
      : null;

    if (beforeLineExists) {
      const rowId = `${rowIdPrefix}-removed-${beforeLineIndex}`;
      removedRows.push({
        id: rowId,
        kind: 'removed',
        oldNumber: beforeLineIndex + 1,
        newNumber: null,
        text: beforeLine,
        fragments: inlineFragments?.removed ?? [{ text: beforeLine || ' ', tone: 'removed' }],
      });
      if (!focusRowId) {
        focusRowId = rowId;
      }
    }

    if (afterLineExists) {
      const rowId = `${rowIdPrefix}-added-${afterLineIndex}`;
      addedRows.push({
        id: rowId,
        kind: 'added',
        oldNumber: null,
        newNumber: afterLineIndex + 1,
        text: afterLine,
        fragments: inlineFragments?.added ?? [{ text: afterLine || ' ', tone: 'added' }],
      });
      if (!focusRowId || beforeLineExists) {
        focusRowId = rowId;
      }
    }
  }

  rows.push(...removedRows, ...addedRows);

  const trailingContextCount = Math.min(
    contextRadius,
    Math.max(0, beforeLines.length - (beforeSuffixIndex + 1)),
    Math.max(0, afterLines.length - (afterSuffixIndex + 1))
  );

  for (let offset = 0; offset < trailingContextCount; offset += 1) {
    const beforeLineIndex = beforeSuffixIndex + 1 + offset;
    const afterLineIndex = afterSuffixIndex + 1 + offset;
    const line = beforeLines[beforeLineIndex] ?? afterLines[afterLineIndex] ?? '';
    rows.push({
      id: `${rowIdPrefix}-context-tail-${beforeLineIndex}-${afterLineIndex}`,
      kind: 'context',
      oldNumber: beforeLineIndex + 1,
      newNumber: afterLineIndex + 1,
      text: line,
      fragments: buildPlainDiffFragments(line),
    });
  }

  return {
    differenceCount: 1,
    rows,
    focusRowId,
  };
}

function getPlanDiffEntries({ text, statusItem, issueTarget }) {
  const quickFixConfig = issueTarget?.kind === 'plan' ? getIssueQuickFixConfig('plan', issueTarget.index) : null;

  if (quickFixConfig?.replacementText && quickFixConfig.replacementText !== text) {
    return [
      {
        kind: 'removed',
        text,
        highlight: statusItem.highlight ?? null,
      },
      {
        kind: 'added',
        text: quickFixConfig.replacementText,
        highlight: null,
      },
    ];
  }

  return [];
}

function findSectionCheckLineIndex(code, kind, index) {
  if (typeof code !== 'string' || !Number.isInteger(index) || index < 0) {
    return -1;
  }

  const targetSectionTitle = kind === 'plan' ? 'plan' : 'acceptance criteria';
  const lines = code.split(/\r?\n/);
  let inTargetSection = false;
  let checkIndex = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const headingTitle = getDoneHeadingTitle(line);

    if (headingTitle !== null) {
      inTargetSection = headingTitle.toLowerCase() === targetSectionTitle;
      if (!inTargetSection) {
        checkIndex = 0;
      }
      continue;
    }

    if (!inTargetSection) continue;
    if (!/^- \[[ x]\]\s+/i.test(line)) continue;

    if (checkIndex === index) {
      return lineIndex;
    }

    checkIndex += 1;
  }

  return -1;
}

function buildPlanDiffData({ sourceCode, text, statusItem, issueTarget, sourceTabLabel }) {
  if (issueTarget?.kind === 'plan') {
    const codeDiffPreset = getPlanCodeDiffPreset(issueTarget);
    const codeDiff = buildCodeDiffRows(
      codeDiffPreset.beforeCode,
      codeDiffPreset.afterCode,
      `plan-code-${issueTarget.index}`
    );

    return {
      sourceTabLabel: codeDiffPreset.fileLabel,
      title: `Diff ${codeDiffPreset.fileLabel}`,
      differenceCount: codeDiff.differenceCount,
      rows: codeDiff.rows,
      focusRowId: codeDiff.focusRowId,
      status: statusItem.status,
      lineText: text,
      language: codeDiffPreset.language,
    };
  }

  const resolvedSourceCode = typeof sourceCode === 'string' ? sourceCode : '';
  const lines = resolvedSourceCode.split(/\r?\n/);
  const replacementText = getPlanDiffReplacementText({ text, issueTarget });
  const targetLineIndex = issueTarget?.kind === 'plan'
    ? findSectionCheckLineIndex(resolvedSourceCode, 'plan', issueTarget.index)
    : lines.findIndex((line) => line.includes(text));
  const nextCode = replacementText && issueTarget?.kind === 'plan'
    ? applyIssueQuickFixToCode(resolvedSourceCode, {
        kind: 'plan',
        index: issueTarget.index,
        replacementText,
      })
    : resolvedSourceCode;
  const nextLines = nextCode.split(/\r?\n/);
  const hasChangedLine =
    targetLineIndex >= 0 &&
    targetLineIndex < lines.length &&
    targetLineIndex < nextLines.length &&
    lines[targetLineIndex] !== nextLines[targetLineIndex];
  const focusLineIndex = targetLineIndex >= 0
    ? targetLineIndex
    : Math.max(lines.findIndex((line) => line.includes(text)), 0);
  const contextStart = Math.max(0, focusLineIndex - 4);
  const contextEnd = Math.min(Math.max(lines.length, nextLines.length) - 1, focusLineIndex + 4);
  const rows = [];

  for (let lineIndex = contextStart; lineIndex <= contextEnd; lineIndex += 1) {
    const oldText = lines[lineIndex] ?? '';
    const newText = nextLines[lineIndex] ?? oldText;

    if (hasChangedLine && lineIndex === targetLineIndex) {
      const inlineDiff = buildPlanDiffInlineFragments(oldText, newText);
      rows.push({
        id: `removed-${lineIndex}`,
        kind: 'removed',
        oldNumber: lineIndex + 1,
        newNumber: null,
        text: oldText,
        fragments: inlineDiff.removed,
      });
      rows.push({
        id: `added-${lineIndex}`,
        kind: 'added',
        oldNumber: null,
        newNumber: lineIndex + 1,
        text: newText,
        fragments: inlineDiff.added,
      });
      continue;
    }

    rows.push({
      id: `context-${lineIndex}`,
      kind: 'context',
      oldNumber: lineIndex + 1,
      newNumber: lineIndex + 1,
      text: oldText,
      fragments: [{ text: oldText || ' ', tone: 'plain' }],
    });
  }

  return {
    sourceTabLabel,
    title: `Diff ${sourceTabLabel}`,
    differenceCount: hasChangedLine ? 1 : 0,
    rows,
    focusRowId: hasChangedLine ? `added-${targetLineIndex}` : (focusLineIndex >= 0 ? `context-${focusLineIndex}` : null),
    status: statusItem.status,
    lineText: text,
    language: 'text',
  };
}

function orderDiffRowsForDisplay(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const orderedRows = [];
  let index = 0;

  while (index < rows.length) {
    const row = rows[index];

    if (row?.kind !== 'removed' && row?.kind !== 'added') {
      orderedRows.push(row);
      index += 1;
      continue;
    }

    const changedRows = [];
    while (index < rows.length && (rows[index]?.kind === 'removed' || rows[index]?.kind === 'added')) {
      changedRows.push(rows[index]);
      index += 1;
    }

    orderedRows.push(
      ...changedRows.filter((changedRow) => changedRow.kind === 'removed'),
      ...changedRows.filter((changedRow) => changedRow.kind === 'added'),
    );
  }

  return orderedRows;
}

function buildPlanDiffTabContent({ sourceCode, text, statusItem, issueTarget, sourceTabLabel }) {
  const diffData = buildPlanDiffData({ sourceCode, text, statusItem, issueTarget, sourceTabLabel });

  if (diffData.rows.length > 0) {
    return orderDiffRowsForDisplay(diffData.rows).map((row) => {
      const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
      return `${prefix} ${row.text}`;
    }).join('\n');
  }

  return [
    `@@ plan step (${statusItem.status})`,
    `  ${text}`,
  ].join('\n');
}

function buildPlanDiffTabId(sourceTabId) {
  return `plan-diff-${sourceTabId}`;
}

function buildSpecVersionDiffTabId(sourceTabId, fromVersionId, toVersionId) {
  return `spec-version-diff-${sourceTabId}-${fromVersionId}-to-${toVersionId}`;
}

function mergeStoredDiffCommentsByRow(diffComments = {}, rowId = null, comments = []) {
  if (typeof rowId !== 'string' || rowId.length === 0) {
    return diffComments;
  }

  const nextComments = Array.isArray(comments)
    ? comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
    : [];
  if (nextComments.length === 0) {
    return diffComments;
  }

  const existingComments = Array.isArray(diffComments[rowId]) ? diffComments[rowId] : [];
  const seenComments = new Set(existingComments.map((comment) => comment.trim().toLowerCase()));
  const mergedComments = [...existingComments];

  nextComments.forEach((comment) => {
    const normalizedComment = comment.trim().toLowerCase();
    if (seenComments.has(normalizedComment)) {
      return;
    }

    seenComments.add(normalizedComment);
    mergedComments.push(comment);
  });

  if (mergedComments.length === existingComments.length) {
    return diffComments;
  }

  return {
    ...diffComments,
    [rowId]: mergedComments,
  };
}

function findSpecVersionDiffRowId(rows = [], lineNumber = null, side = 'old', lineText = '') {
  if (!Number.isInteger(lineNumber) || lineNumber <= 0) {
    return null;
  }

  const lineKey = side === 'new' ? 'newNumber' : 'oldNumber';
  const relevantRows = rows.filter((row) => row?.[lineKey] === lineNumber);
  if (relevantRows.length === 0) {
    return null;
  }

  const kindPriority = side === 'new'
    ? ['added', 'context', 'removed']
    : ['removed', 'context', 'added'];

  const exactTextMatch = typeof lineText === 'string' && lineText.length > 0
    ? relevantRows.find((row) => row.text === lineText)
    : null;
  if (exactTextMatch) {
    return exactTextMatch.id;
  }

  for (const kind of kindPriority) {
    const matchingRow = relevantRows.find((row) => row.kind === kind);
    if (matchingRow) {
      return matchingRow.id;
    }
  }

  return relevantRows[0]?.id ?? null;
}

function buildSpecVersionDiffInitialComments({
  diffData = null,
} = {}) {
  if (!Array.isArray(diffData?.rows) || diffData.rows.length === 0) {
    return {};
  }

  return {};
}

function buildSpecVersionDiffData({
  sourceCode = '',
  targetCode = '',
  sourceTabLabel = TERMINAL_TASK_TAB_BASE_LABEL,
  fromVersion = null,
  toVersion = null,
} = {}) {
  const diff = buildCodeDiffRows(
    sourceCode,
    buildSpecVersionCodeWithInlineComments(targetCode, toVersion?.commentEntries ?? []),
    `spec-version-${fromVersion?.id ?? 'from'}-${toVersion?.id ?? 'to'}`,
    6,
  );
  const fromLabel = fromVersion?.label ?? 'Previous Version';
  const toLabel = toVersion?.label ?? 'Current Version';

  return {
    sourceTabLabel,
    title: `Diff ${fromLabel} -> ${toLabel}`,
    differenceCount: diff.differenceCount,
    rows: diff.rows,
    focusRowId: diff.focusRowId,
    status: 'passed',
    lineText: `${fromLabel} -> ${toLabel}`,
    language: 'text',
  };
}

function buildDiffTabContentFromRows(diffData = null) {
  if (!Array.isArray(diffData?.rows) || diffData.rows.length === 0) {
    return diffData?.title ?? '';
  }

  return orderDiffRowsForDisplay(diffData.rows).map((row) => {
    const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
    return `${prefix} ${row.text}`;
  }).join('\n');
}

function normalizePlanSubitemPreviewText(text = '') {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function splitPlanParentText(text = '') {
  const normalizedText = normalizePlanSubitemPreviewText(text);
  const dashMatch = normalizedText.match(/^(.+?)\s+[—-]\s+(.+)$/);

  if (!dashMatch) {
    return {
      scope: '',
      detail: normalizedText,
    };
  }

  return {
    scope: dashMatch[1].trim(),
    detail: dashMatch[2].trim(),
  };
}

function capitalizePlanSubitemText(text = '') {
  const normalizedText = normalizePlanSubitemPreviewText(text).replace(/[.;:,\s]+$/g, '');
  if (!normalizedText) return '';
  return normalizedText.charAt(0).toUpperCase() + normalizedText.slice(1);
}

function normalizePlanSharedTail(tail = '') {
  const normalizedTail = normalizePlanSubitemPreviewText(tail);
  if (!normalizedTail) return '';
  return normalizedTail
    .replace(/^columns\b/i, 'column')
    .replace(/^fields\b/i, 'field');
}

function splitPlanSegmentByAnd(segment = '') {
  const normalizedSegment = normalizePlanSubitemPreviewText(segment);
  if (!normalizedSegment || !/\sand\s/i.test(normalizedSegment)) {
    return normalizedSegment ? [normalizedSegment] : [];
  }

  const repeatedSubjectMatch = normalizedSegment.match(
    /^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+?)\s+for\s+(.+?)\s+and\s+\2\s+for\s+(.+)$/i,
  );
  if (repeatedSubjectMatch) {
    return [
      `${repeatedSubjectMatch[1]} ${repeatedSubjectMatch[2]} for ${normalizePlanSubitemPreviewText(repeatedSubjectMatch[3])}`,
      `${repeatedSubjectMatch[1]} ${repeatedSubjectMatch[2]} for ${normalizePlanSubitemPreviewText(repeatedSubjectMatch[4])}`,
    ];
  }

  const actionMatch = normalizedSegment.match(/^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+)$/i);
  if (!actionMatch) {
    return [normalizedSegment];
  }

  const action = actionMatch[1];
  const remainder = actionMatch[2];
  const sharedTailMatch = remainder.match(/^(.+?)\s+and\s+(.+?)\s+((?:column|columns|field|fields|constraint|constraints|query|queries)?\s*(?:to|for|in|on|under|into)\s+.+)$/i);

  if (sharedTailMatch) {
    const leftPart = normalizePlanSubitemPreviewText(sharedTailMatch[1]);
    const rightPart = normalizePlanSubitemPreviewText(sharedTailMatch[2]);
    const sharedTail = normalizePlanSharedTail(sharedTailMatch[3]);

    if (/\b(to|for|in|on|under|into)\b/i.test(leftPart)) {
      return [normalizedSegment];
    }

    return [
      `${action} ${leftPart} ${sharedTail}`,
      `${action} ${rightPart} ${sharedTail}`,
    ];
  }

  return [normalizedSegment];
}

function expandSinglePlanSegment(segment = '') {
  const normalizedSegment = normalizePlanSubitemPreviewText(segment);
  if (!normalizedSegment) {
    return [];
  }

  const withAnnotationMatch = normalizedSegment.match(/^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+?)\s+with\s+(@[\w()."-]+.*)$/i);
  if (withAnnotationMatch) {
    return [
      `${withAnnotationMatch[1]} ${withAnnotationMatch[2]}`,
      `Apply ${withAnnotationMatch[3]}`,
    ];
  }

  const withCallMatch = normalizedSegment.match(/^(add|inject|seed|validate|show|store|reject|define|keep|persist|update|load|expose|populate|use|create|run)\s+(.+?)\s+with\s+([\w.]+\(\))$/i);
  if (withCallMatch) {
    return [
      `${withCallMatch[1]} ${withCallMatch[2]}`,
      `Use ${withCallMatch[3]}`,
    ];
  }

  return [normalizedSegment];
}

function dedupePlanSubitemTexts(items = []) {
  const seen = new Set();
  return items.reduce((result, item) => {
    const normalizedItem = capitalizePlanSubitemText(item);
    if (!normalizedItem) {
      return result;
    }

    const dedupeKey = normalizedItem.toLowerCase();
    if (seen.has(dedupeKey)) {
      return result;
    }

    seen.add(dedupeKey);
    result.push(normalizedItem);
    return result;
  }, []);
}

function buildScopedPlanSubitemText(scope = '', itemText = '') {
  const normalizedScope = normalizePlanSubitemPreviewText(scope);
  const normalizedItemText = capitalizePlanSubitemText(itemText);

  if (!normalizedItemText) {
    return '';
  }

  if (!normalizedScope) {
    return normalizedItemText;
  }

  if (normalizedItemText.toLowerCase().startsWith(`${normalizedScope.toLowerCase()}:`)) {
    return normalizedItemText;
  }

  if (/^tests?$/i.test(normalizedScope)) {
    if (/^verify\b/i.test(normalizedItemText)) {
      return `${normalizedScope}: ${lowercaseLeadingCharacter(normalizedItemText)}`;
    }

    return `${normalizedScope}: verify ${lowercaseLeadingCharacter(normalizedItemText)}`;
  }

  return `${normalizedScope}: ${lowercaseLeadingCharacter(normalizedItemText)}`;
}

function buildPlanContentSubitems({ text = '', includeScope = true } = {}) {
  const { scope, detail } = splitPlanParentText(text);
  if (!detail) {
    return [];
  }

  const commaParts = detail
    .split(/\s*,\s*/g)
    .map((part) => normalizePlanSubitemPreviewText(part))
    .filter(Boolean);
  const splitByAnd = (commaParts.length > 0 ? commaParts : [detail]).flatMap((part) => splitPlanSegmentByAnd(part));
  const expandedParts = (splitByAnd.length > 0 ? splitByAnd : [detail]).flatMap((part) => expandSinglePlanSegment(part));
  const finalItems = dedupePlanSubitemTexts(expandedParts).slice(0, 4);

  if (finalItems.length < 2) {
    return [];
  }

  return finalItems.map((itemText, index) => ({
    id: `parent-derived-${index}`,
    text: includeScope ? buildScopedPlanSubitemText(scope, itemText) : itemText,
  }));
}

function buildDerivedPlanCheckChildren(text = '', parentId = 'plan-item', { includeScope = true } = {}) {
  return buildPlanContentSubitems({ text, includeScope }).map((subitem, index) => ({
    id: `${parentId}:child-${index + 1}`,
    type: 'check',
    checked: false,
    text: subitem.text,
  }));
}

function arePlanCheckChildTextsEqual(children = [], candidateChildren = []) {
  if (!Array.isArray(children) || !Array.isArray(candidateChildren) || children.length !== candidateChildren.length) {
    return false;
  }

  return children.every((child, index) => (
    child?.type === 'check'
    && normalizePlanSubitemPreviewText(child?.text ?? '') === normalizePlanSubitemPreviewText(candidateChildren[index]?.text ?? '')
  ));
}

function withDerivedPlanChildren(section) {
  if (!section || section.title?.toLowerCase() !== 'plan') {
    return section;
  }

  return {
    ...section,
    items: (section.items ?? []).map((item) => {
      if (item?.type !== 'check') {
        return item;
      }

      const scopedDerivedChildren = buildDerivedPlanCheckChildren(item.text, item.id ?? 'plan-item');
      const legacyDerivedChildren = buildDerivedPlanCheckChildren(item.text, item.id ?? 'plan-item', { includeScope: false });
      const hasExplicitChildren = Array.isArray(item.children);
      const hasExistingChildren = hasExplicitChildren && item.children.length > 0;
      const shouldUpgradeLegacyChildren = hasExistingChildren && arePlanCheckChildTextsEqual(item.children, legacyDerivedChildren);

      return {
        ...item,
        children: shouldUpgradeLegacyChildren
          ? item.children.map((child, childIndex) => ({
              ...child,
              id: child?.id ?? scopedDerivedChildren[childIndex]?.id ?? `${item.id ?? 'plan-item'}:child-${childIndex + 1}`,
              text: scopedDerivedChildren[childIndex]?.text ?? child?.text ?? '',
            }))
          : (hasExplicitChildren
              ? item.children
              : scopedDerivedChildren),
      };
    }),
  };
}

function PlanCheckRow({ statusItem = null, text, issueTarget = null, checkTarget = null, isIssueActive = false, commentAdornment = null, onOpenDiffTab = null, nestingLevel = 0, hasPlanComment = false, isRunning = false }) {
  const diffTarget = issueTarget ?? checkTarget;
  const demoTargetId = formatDemoTargetId(diffTarget);
  const isOutdated = isRunStatusItemOutdated(statusItem);
  const canShowDiff = Boolean(statusItem) && statusItem?.status !== 'pending';
  const isNested = nestingLevel > 0;
  const planLineStyle = isNested
    ? { '--spec-plan-nesting-level': nestingLevel }
    : undefined;

  return (
    <div
      className={`spec-done-line spec-done-line-check spec-done-plan-main spec-done-primary-line${isIssueActive ? ' spec-done-active-issue-line' : ''}${isOutdated ? ' is-outdated' : ''}${isNested ? ' spec-done-plan-child-line' : ''}`}
      data-plan-nesting-level={isNested ? nestingLevel : undefined}
      style={planLineStyle}
    >
      {statusItem
        ? <CheckStatus status={hasPlanComment ? 'skipped' : statusItem.status} outdated={!hasPlanComment && isOutdated} isLoading={!hasPlanComment && statusItem.status === 'pending'} />
        : <Checkbox className="spec-done-checkbox" checked={false} onChange={() => {}} />
      }
      <span className="spec-done-plan-text" contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(text, statusItem?.highlight, statusItem?.issue)}</span>
      {commentAdornment}
      {canShowDiff && !isNested && (
        <button
          type="button"
          className="ac-checks-toggle spec-plan-diff-toggle"
          aria-label="Show diff"
          title="Show diff"
          data-demo-id={demoTargetId ? `plan-show-diff-${demoTargetId}` : undefined}
          onClick={() => onOpenDiffTab?.({ text, statusItem, issueTarget: diffTarget })}
        >
          <Icon name={DIFF_TAB_ICON_NAME} size={16} />
        </button>
      )}
    </div>
  );
}

function renderDoneLine(line, key, addPopupFiles, attachedFiles = [], checkStatus = null, sectionMeta = null, planStatus = null, isIssueActive = false, commentAdornment = null, issueTarget = null, onOpenDiffTab = null, checkTarget = null, currentSectionTitle = '', activeRunRequest = null, nestingLevel = 0, onProposalAccept = null, onProposalDecision = null, hasPlanComment = false, onPlanWorkflowSelect = null, onPlanWorkflowOpen = null, onPlanWorkflowRemove = null) {
  const headingTitle = getDoneHeadingTitle(line);
  if (headingTitle) {
    if (headingTitle.toLowerCase() === 'plan') {
      const initialFiles = getDonePlanHeadingFiles(sectionMeta, attachedFiles);
      return (
        <DoneHeadingWithFiles
          key={key}
          title={headingTitle}
          initialFiles={initialFiles}
          addPopupFiles={addPopupFiles}
          commentAdornment={commentAdornment}
          menuMode="workflow"
          onWorkflowSelect={onPlanWorkflowSelect}
          onWorkflowOpen={onPlanWorkflowOpen}
          onWorkflowRemove={onPlanWorkflowRemove}
        />
      );
    }
    if (headingTitle.toLowerCase() === 'acceptance criteria') {
      const initialFiles = getDoneAcceptanceHeadingFiles(sectionMeta, attachedFiles);
      return (
        <DoneHeadingWithFiles
          key={key}
          title={headingTitle}
          initialFiles={initialFiles}
          addPopupFiles={[]}
          commentAdornment={commentAdornment}
          disableAddButton
        />
      );
    }
    return (
      <div key={key} className="spec-done-heading-row">
        <h1 className="spec-done-heading text-ui-h1" contentEditable suppressContentEditableWarning>
          {renderDoneMarkdownInline(headingTitle)}
        </h1>
        {commentAdornment}
      </div>
    );
  }
  const refFileMatch = line.match(/^Reference file:\s+(.+)$/);
  if (refFileMatch) {
    return <DoneReferenceFileLine key={key} label={refFileMatch[1]} addPopupFiles={addPopupFiles} commentAdornment={commentAdornment} />;
  }
  const checkMatch = line.match(/^(\s*)- \[([ x])\]\s+(.*)$/i);
  if (checkMatch) {
    const checked = checkMatch[2].toLowerCase() === 'x';
    const normalizedRunTarget = normalizeCommentTarget(activeRunRequest?.checkTarget ?? null);
    const normalizedSectionTitle = typeof currentSectionTitle === 'string' ? currentSectionTitle.trim().toLowerCase() : '';
    const normalizedActiveRunSectionTitle = typeof activeRunRequest?.sectionTitle === 'string'
      ? activeRunRequest.sectionTitle.trim().toLowerCase()
      : '';
    const isRunning = Boolean(activeRunRequest) && (
      (normalizedRunTarget
        && checkTarget
        && normalizedRunTarget.kind === checkTarget.kind
        && normalizedRunTarget.index === checkTarget.index)
      || (!normalizedRunTarget
        && (normalizedActiveRunSectionTitle.length > 0
          ? normalizedActiveRunSectionTitle === normalizedSectionTitle
          : ((normalizedSectionTitle === 'acceptance criteria' && checkTarget?.kind === 'ac')
            || (normalizedSectionTitle === 'plan' && checkTarget?.kind === 'plan'))))
    );
    if (checkStatus != null) {
      if ('checkboxStatus' in checkStatus && checkStatus.checkboxStatus === null) {
        return <AcCheckRow key={key} checkItem={checkStatus} text={checkMatch[3]} isIssueActive={isIssueActive} commentAdornment={commentAdornment} onProposalAccept={onProposalAccept} onProposalDecision={onProposalDecision} isRunning={isRunning} useCheckbox />;
      }
      return <AcCheckRow key={key} checkItem={checkStatus} text={checkMatch[3]} isIssueActive={isIssueActive} commentAdornment={commentAdornment} onProposalAccept={onProposalAccept} onProposalDecision={onProposalDecision} isRunning={isRunning} />;
    }
    if (checkTarget?.kind === 'ac' && isRunning) {
      return <AcCheckRow key={key} checkItem={{ status: 'pending', checks: [] }} text={checkMatch[3]} isIssueActive={isIssueActive} commentAdornment={commentAdornment} onProposalAccept={onProposalAccept} onProposalDecision={onProposalDecision} isRunning />;
    }
    if (checkTarget?.kind === 'plan') {
      return (
        <PlanCheckRow
          key={key}
          statusItem={planStatus}
          text={checkMatch[3]}
          issueTarget={issueTarget}
          checkTarget={checkTarget}
          isIssueActive={isIssueActive}
          commentAdornment={commentAdornment}
          onOpenDiffTab={onOpenDiffTab}
          nestingLevel={nestingLevel}
          hasPlanComment={hasPlanComment}
          isRunning={isRunning}
        />
      );
    }
    return (
      <div key={key} className="spec-done-line spec-done-line-check">
        <Checkbox className="spec-done-checkbox" checked={checked} onChange={() => {}} />
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(checkMatch[3])}</span>
        {commentAdornment}
      </div>
    );
  }
  const bulletMatch = line.match(/^\s*-\s+(.*)$/);
  if (bulletMatch) {
    return (
      <div key={key} className="spec-done-line spec-done-line-bullet">
        <span className="spec-done-bullet">•</span>
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(bulletMatch[1])}</span>
        {commentAdornment}
      </div>
    );
  }
  const commentMatch = line.match(/^\/\/\s?(.*)$/);
  if (commentMatch) {
    return (
      <div key={key} className="spec-done-line spec-done-line-comment">
        <span className="spec-comment-prefix">//</span>
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(commentMatch[1])}</span>
        {commentAdornment}
      </div>
    );
  }
  if (!line.trim()) {
    return (
      <div key={key} className="spec-done-line spec-done-line-empty">
        <div className="spec-done-line-empty-editable" contentEditable suppressContentEditableWarning />
        {commentAdornment && (
          <span className="spec-done-empty-line-comment-icon">{commentAdornment}</span>
        )}
      </div>
    );
  }
  return (
    <div key={key} className="spec-done-line spec-done-line-text">
      <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(line)}</span>
      {commentAdornment}
    </div>
  );
}

function DoneInspectionWidget({
  onOpenProblems,
  onNavigatePreviousIssue,
  onNavigateNextIssue,
  warningCount = 0,
  errorCount = 0,
  commentCount = 0,
  versions = [],
  onVersionSelect = null,
}) {
  const [versionPopupRect, setVersionPopupRect] = useState(null);
  const versionEntries = Array.isArray(versions) && versions.length > 0
    ? versions
    : [{
        id: 'spec-version-fallback',
        number: 1,
        label: buildSpecVersionLabel(1),
        code: '',
      }];
  const currentVersion = versionEntries[versionEntries.length - 1] ?? versionEntries[0];
  const popupVersionEntries = [...versionEntries].reverse();
  const hasWarnings = warningCount > 0;
  const hasErrors = errorCount > 0;
  const hasComments = commentCount > 0;
  const hasIssues = hasWarnings || hasErrors || hasComments;
  const problemLabelParts = [
    hasWarnings ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : null,
    hasErrors ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : null,
    hasComments ? `${commentCount} comment${commentCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!versionPopupRect) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setVersionPopupRect(null);
    };

    const closePopup = () => setVersionPopupRect(null);

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closePopup);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', closePopup);
    };
  }, [versionPopupRect]);

  const toggleVersionPopup = (event) => {
    if (versionPopupRect) {
      setVersionPopupRect(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect) return;

    setVersionPopupRect(rect);
  };

  return (
    <>
    <div className="spec-done-inspection-widget">
      {hasIssues && (
        <>
          <button
            type="button"
            className="spec-done-inspection-counts-btn"
            aria-label={problemLabelParts.join(' and ')}
            data-demo-id="spec-inspection-counts"
            onClick={() => onOpenProblems?.()}
          >
            {hasWarnings && (
              <span className="spec-done-inspection-group">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M1.27603 10.8634L6.3028 1.98903C7.04977 0.670323 8.94893 0.670326 9.69589 1.98903L14.7227 10.8634C15.516 12.2639 14.5047 14 12.8956 14H3.10308C1.494 14 0.482737 12.2639 1.27603 10.8634Z" fill="#C7A450" />
                  <path d="M9 5C9 4.44772 8.55228 4 8 4C7.44772 4 7 4.44772 7 5V7.5C7 8.05229 7.44772 8.5 8 8.5C8.55229 8.5 9 8.05228 9 7.5L9 5Z" fill="#1E1F22" />
                  <path d="M8 12C8.55228 12 9 11.5523 9 11C9 10.4477 8.55228 10 8 10C7.44772 10 7 10.4477 7 11C7 11.5523 7.44772 12 8 12Z" fill="#1E1F22" />
                </svg>
                <span className="spec-done-inspection-text">{warningCount}</span>
              </span>
            )}
            {hasErrors && (
              <span className="spec-done-inspection-group">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8ZM7 5C7 4.44772 7.44772 4 8 4C8.55229 4 9 4.44772 9 5V8C9 8.55228 8.55229 9 8 9C7.44772 9 7 8.55228 7 8V5ZM9 11C9 11.5523 8.55229 12 8 12C7.44772 12 7 11.5523 7 11C7 10.4477 7.44772 10 8 10C8.55229 10 9 10.4477 9 11Z" fill="#DB5C5C" />
                </svg>
                <span className="spec-done-inspection-text">{errorCount}</span>
              </span>
            )}
            {hasComments && (
              <span className="spec-done-inspection-group">
                <DoneCommentCountIcon />
                <span className="spec-done-inspection-text">{commentCount}</span>
              </span>
            )}
          </button>
          {(hasWarnings || hasErrors) && (
            <div className="spec-done-inspection-nav">
              <Tooltip text="Previous Highlighted Error" shortcut="⇧F2" placement="bottom" delay={0}>
                <button
                  type="button"
                  className="spec-inspection-nav-btn spec-done-inspection-nav-btn"
                  aria-label="Previous highlighted error"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onNavigatePreviousIssue?.()}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4.5 9.75L8 6.25L11.5 9.75" stroke="currentColor" strokeLinecap="round" />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip text="Next Highlighted Error" shortcut="F2" placement="bottom" delay={0}>
                <button
                  type="button"
                  className="spec-inspection-nav-btn spec-done-inspection-nav-btn"
                  aria-label="Next highlighted error"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onNavigateNextIssue?.()}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 6.25L8 9.75L4.5 6.25" stroke="currentColor" strokeLinecap="round" />
                  </svg>
                </button>
              </Tooltip>
            </div>
          )}
        </>
      )}
    </div>
    {versionPopupRect && (
      <PositionedPopup triggerRect={versionPopupRect} onDismiss={() => setVersionPopupRect(null)} gap={4}>
        <div className="cmp-popup spec-done-version-popup">
          {popupVersionEntries.map((version) => {
            const isCurrentVersion = version.id === currentVersion?.id;
            return (
              <div
                key={version.id}
                className={`cmp-cell spec-done-version-popup-item${isCurrentVersion ? ' cmp-cell-selected' : ''}`}
                role="button"
                tabIndex={0}
                onMouseDown={(event) => {
                  event.preventDefault();
                  if (isCurrentVersion) {
                    setVersionPopupRect(null);
                    return;
                  }
                  onVersionSelect?.(version);
                  setVersionPopupRect(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    if (!isCurrentVersion) {
                      onVersionSelect?.(version);
                    }
                    setVersionPopupRect(null);
                  }
                }}
              >
                <svg className="spec-done-version-popup-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2ZM8 3C5.23858 3 3 5.23858 3 8C3 10.7614 5.23858 13 8 13C10.7614 13 13 10.7614 13 8C13 5.23858 10.7614 3 8 3ZM7.50153 5C7.74699 5 7.95114 5.17688 7.99347 5.41012L8.00153 5.5V8H9.5C9.77614 8 10 8.22386 10 8.5C10 8.74546 9.82312 8.94961 9.58988 8.99194L9.5 9H7.50153C7.25607 9 7.05192 8.82312 7.00958 8.58988L7.00153 8.5V5.5C7.00153 5.22386 7.22538 5 7.50153 5Z" fill="#CED0D6" />
                </svg>
                <div className="cmp-content">
                  <span className="cmp-label">{version.label}</span>
                  <span className="cmp-desc">{isCurrentVersion ? 'Current' : 'Show diff'}</span>
                </div>
              </div>
            );
          })}
          <div className="cmp-footer spec-done-version-popup-footer">
            <span className="cmp-footer-text">New versions appear after enhance.</span>
          </div>
        </div>
      </PositionedPopup>
    )}
    </>
  );
}

function getClientRectBounds(rects) {
  const filtered = Array.from(rects).filter((item) => item.width > 0 || item.height > 0);
  if (filtered.length === 0) return null;

  const bounds = filtered.reduce((acc, item) => ({
    top: Math.min(acc.top, item.top),
    right: Math.max(acc.right, item.right),
    bottom: Math.max(acc.bottom, item.bottom),
    left: Math.min(acc.left, item.left),
  }), {
    top: filtered[0].top,
    right: filtered[0].right,
    bottom: filtered[0].bottom,
    left: filtered[0].left,
  });

  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function getRangeViewportRect(range) {
  if (!range) return null;

  const rect = range.getBoundingClientRect();
  if (rect && (rect.width > 0 || rect.height > 0)) return rect;

  return getClientRectBounds(range.getClientRects());
}

function getVisibleAgentTaskTopBarBottom(rect) {
  if (!rect || typeof document === 'undefined') return null;

  const topBars = Array.from(document.querySelectorAll('.editor-top-bar')).filter((node) => {
    if (!(node instanceof HTMLElement)) return false;
    if (!node.querySelector('.agent-task-editor-area')) return false;

    const topBarRect = node.getBoundingClientRect();
    return (
      topBarRect.width > 0 &&
      topBarRect.height > 0 &&
      topBarRect.right > rect.left &&
      topBarRect.left < rect.right &&
      topBarRect.bottom <= rect.bottom
    );
  });

  if (topBars.length === 0) return null;

  return topBars.reduce((bottom, node) => {
    const nextBottom = node.getBoundingClientRect().bottom;
    return bottom === null ? nextBottom : Math.max(bottom, nextBottom);
  }, null);
}

function getSelectionToolbarPosition(rect) {
  if (!rect) return null;

  const TOOLBAR_SAFE_WIDTH = 304;
  const TOOLBAR_SAFE_HEIGHT = 44;
  const TOOLBAR_GAP = 10;
  const VIEWPORT_GUTTER = 8;
  const centerX = rect.left + rect.width / 2;
  const left = Math.min(
    Math.max(centerX, VIEWPORT_GUTTER + TOOLBAR_SAFE_WIDTH / 2),
    window.innerWidth - VIEWPORT_GUTTER - TOOLBAR_SAFE_WIDTH / 2
  );
  const topBarBottom = getVisibleAgentTaskTopBarBottom(rect);
  const minTop = Math.max(VIEWPORT_GUTTER, (topBarBottom ?? 0) + VIEWPORT_GUTTER);
  const spaceAbove = rect.top - minTop;
  const spaceBelow = window.innerHeight - VIEWPORT_GUTTER - rect.bottom;
  const canPlaceAbove = spaceAbove >= TOOLBAR_SAFE_HEIGHT + TOOLBAR_GAP;
  const canPlaceBelow = spaceBelow >= TOOLBAR_SAFE_HEIGHT + TOOLBAR_GAP;

  let placeBelow = false;

  if (!canPlaceAbove && canPlaceBelow) {
    placeBelow = true;
  } else if (!canPlaceAbove && !canPlaceBelow) {
    placeBelow = spaceBelow > spaceAbove;
  }

  return {
    left,
    top: placeBelow ? rect.bottom + TOOLBAR_GAP : rect.top - TOOLBAR_GAP,
    placement: placeBelow ? 'bottom' : 'top',
  };
}

function getTextareaSelectionViewportRect(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement)) return null;

  const selectionStart = textarea.selectionStart ?? 0;
  const selectionEnd = textarea.selectionEnd ?? 0;
  if (selectionStart === selectionEnd) return null;

  const mirror = document.createElement('div');
  const selectionNode = document.createElement('span');
  const textareaRect = textarea.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(textarea);

  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'fixed';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.boxSizing = 'border-box';
  mirror.style.width = `${textarea.offsetWidth}px`;
  mirror.style.minHeight = `${textarea.offsetHeight}px`;
  mirror.style.padding = computedStyle.padding;
  mirror.style.border = computedStyle.border;
  mirror.style.font = computedStyle.font;
  mirror.style.fontFamily = computedStyle.fontFamily;
  mirror.style.fontSize = computedStyle.fontSize;
  mirror.style.fontWeight = computedStyle.fontWeight;
  mirror.style.fontStyle = computedStyle.fontStyle;
  mirror.style.lineHeight = computedStyle.lineHeight;
  mirror.style.letterSpacing = computedStyle.letterSpacing;
  mirror.style.textTransform = computedStyle.textTransform;
  mirror.style.textIndent = computedStyle.textIndent;
  mirror.style.textAlign = computedStyle.textAlign;
  mirror.style.tabSize = computedStyle.tabSize;
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.overflow = 'hidden';

  mirror.append(document.createTextNode(textarea.value.slice(0, selectionStart)));
  selectionNode.textContent = textarea.value.slice(selectionStart, selectionEnd) || ' ';
  mirror.append(selectionNode);
  mirror.append(document.createTextNode(textarea.value.slice(selectionEnd) || ' '));
  document.body.append(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const selectionRect = getClientRectBounds(selectionNode.getClientRects());

  mirror.remove();

  if (!selectionRect) return null;

  return {
    top: textareaRect.top + (selectionRect.top - mirrorRect.top) - textarea.scrollTop,
    right: textareaRect.left + (selectionRect.right - mirrorRect.left) - textarea.scrollLeft,
    bottom: textareaRect.top + (selectionRect.bottom - mirrorRect.top) - textarea.scrollTop,
    left: textareaRect.left + (selectionRect.left - mirrorRect.left) - textarea.scrollLeft,
    width: selectionRect.width,
    height: selectionRect.height,
  };
}

const SPEC_SELECTION_TOOLBAR_ITEMS = [
  { id: 'suggest', label: 'Suggest action', accent: 'warning', iconName: 'codeInsight/intentionBulb' },
  { id: 'comment', label: 'Comment', iconName: 'general/balloon' },
  { id: 'separator-ai', type: 'separator' },
  { id: 'bold', label: 'Bold', text: 'B', textClassName: 'spec-done-selection-toolbar-text-bold' },
  { id: 'italic', label: 'Italic', text: 'I', textClassName: 'spec-done-selection-toolbar-text-italic' },
  { id: 'strike', label: 'Strikethrough', text: 'S', textClassName: 'spec-done-selection-toolbar-text-strike' },
  { id: 'code', label: 'Inline code', text: '<>', textClassName: 'spec-done-selection-toolbar-text-code' },
  { id: 'link', label: 'Insert link', iconName: 'actions/attach' },
  { id: 'separator-format', type: 'separator' },
  { id: 'list', label: 'List', iconName: 'general/menu' },
  { id: 'separator-more', type: 'separator' },
  { id: 'more', label: 'More actions', iconName: 'general/moreVertical' },
];

function getDoneIssueFixActionLabel(issueTarget) {
  if (!issueTarget) {
    return 'Apply fix and rebuild';
  }

  const fixConfig = getIssueQuickFixConfig(issueTarget.kind, issueTarget.index);
  if (typeof fixConfig?.actionLabel === 'string' && fixConfig.actionLabel.trim().length > 0) {
    return fixConfig.actionLabel.trim();
  }

  if (typeof fixConfig?.replacementText === 'string' && fixConfig.replacementText.trim().length > 0) {
    return fixConfig.replacementText.trim();
  }

  const issueKindLabel = issueTarget.kind === 'ac' ? 'AC' : issueTarget.kind === 'plan' ? 'Plan' : 'Issue';
  const itemNumber = Number.isInteger(issueTarget.index) ? issueTarget.index + 1 : null;
  return itemNumber ? `Fix ${issueKindLabel} item ${itemNumber} and rebuild` : 'Apply fix and rebuild';
}

function buildDoneIntentionPopupActions({ severity, canFixIssue = true, issueTarget = null }) {
  const fixActionLabel = getDoneIssueFixActionLabel(issueTarget);

  if (severity === 'failed') {
    return {
      primary: [
        canFixIssue ? { id: 'apply-fix', label: fixActionLabel, icon: 'codeInsight/intentionBulb', action: 'fix' } : null,
        { id: 'open-problems', label: 'Open Problems', icon: 'codeInsight/intentionBulb', action: 'problems' },
        { id: 'regenerate-spec', label: 'Specify spec', icon: 'codeInsight/intentionBulb', action: 'regenerate' },
      ].filter(Boolean),
      secondary: [
        { id: 'rewrite-item', label: 'Rewrite this item' },
        { id: 'explain-failure', label: 'Explain failure in notes' },
        { id: 'move-tradeoff', label: 'Move to Decisions' },
      ],
    };
  }

  return {
    primary: [
      canFixIssue ? { id: 'apply-fix', label: fixActionLabel, icon: 'codeInsight/intentionBulb', action: 'fix' } : null,
      { id: 'open-problems', label: 'Open Problems', icon: 'codeInsight/intentionBulb', action: 'problems' },
      { id: 'regenerate-spec', label: 'Specify spec', icon: 'codeInsight/intentionBulb', action: 'regenerate' },
    ].filter(Boolean),
    secondary: [
      { id: 'clarify-item', label: 'Clarify this requirement' },
      { id: 'attach-reference', label: 'Attach reference file' },
      { id: 'move-notes', label: 'Move to Implementation Notes' },
    ],
  };
}

function ProblemsQuickFixesMenu({ proposals = [], onSelect, onClose }) {
  const menuOptions = useMemo(
    () => (Array.isArray(proposals) ? proposals : []),
    [proposals],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIndexRef = useRef(0);
  const itemRefs = useRef([]);
  const lastHandledKeyRef = useRef({ key: null, time: 0 });

  const setActiveMenuIndex = (nextIndex, { focus = true } = {}) => {
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
    if (focus) {
      requestAnimationFrame(() => {
        itemRefs.current[nextIndex]?.focus({ preventScroll: true });
      });
    }
  };

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, menuOptions.length);
    activeIndexRef.current = 0;
    setActiveIndex(0);
    const focusFirstItem = () => {
      itemRefs.current[0]?.focus({ preventScroll: true });
    };
    requestAnimationFrame(focusFirstItem);
    const focusTimeoutId = window.setTimeout(focusFirstItem, 0);
    return () => window.clearTimeout(focusTimeoutId);
  }, [menuOptions]);

  const selectOption = (opt) => {
    if (!opt) return;
    onSelect?.(opt);
    onClose?.();
  };

  const moveSelection = (direction) => {
    const current = activeIndexRef.current;
    const next = (current + direction + menuOptions.length) % menuOptions.length;
    setActiveMenuIndex(next);
  };

  const handleKeyDown = (event) => {
    const isArrowDown = event.key === 'ArrowDown' || event.key === 'Down' || event.code === 'ArrowDown' || event.keyCode === 40;
    const isArrowUp = event.key === 'ArrowUp' || event.key === 'Up' || event.code === 'ArrowUp' || event.keyCode === 38;
    const isEnter = event.key === 'Enter' || event.code === 'Enter' || event.keyCode === 13;
    const isEscape = event.key === 'Escape' || event.key === 'Esc' || event.code === 'Escape' || event.keyCode === 27;

    if (isArrowDown) {
      lastHandledKeyRef.current = { key: 'ArrowDown', time: Date.now() };
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      moveSelection(1);
      return;
    }
    if (isArrowUp) {
      lastHandledKeyRef.current = { key: 'ArrowUp', time: Date.now() };
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      moveSelection(-1);
      return;
    }
    if (isEnter) {
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      lastHandledKeyRef.current = { key: 'Enter', time: Date.now() };
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      selectOption(menuOptions[activeIndexRef.current]);
      return;
    }
    if (isEscape) {
      lastHandledKeyRef.current = { key: 'Escape', time: Date.now() };
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onClose?.();
    }
  };

  useEffect(() => {
    if (menuOptions.length === 0) return undefined;

    const handleDocumentKeyDown = (event) => {
      if (event.defaultPrevented) return;
      handleKeyDown(event);
    };

    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => document.removeEventListener('keydown', handleDocumentKeyDown, true);
  }, [activeIndex, menuOptions]);

  if (menuOptions.length === 0) return null;

  return (
    <div className="popup-options" role="menu" onKeyDownCapture={handleKeyDown}>
      {menuOptions.map((opt, i) => (
        <button
          key={i}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          type="button"
          className={`popup-cell problems-quick-fix-menu-item${i === activeIndex ? ' problems-quick-fix-menu-item-active' : ''}`}
          role="menuitem"
          aria-selected={i === activeIndex}
          data-active={i === activeIndex ? 'true' : undefined}
          tabIndex={i === activeIndex ? 0 : -1}
          onFocus={() => setActiveMenuIndex(i, { focus: false })}
          onMouseEnter={() => setActiveMenuIndex(i, { focus: false })}
          onMouseDown={(event) => {
            event.preventDefault();
            selectOption(opt);
          }}
        >
          <span className="problems-quick-fix-menu-label text-ui-default">{opt.label}</span>
          <span className="problems-quick-fix-menu-actions" aria-hidden="true">
            <span className="problems-quick-fix-menu-separator" />
            <span className="problems-quick-fix-menu-more">
              <Icon name="general/moreVertical" size={16} />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function DoneIssueIntentionPopup({ severity, canFixIssue = true, issueTarget = null, proposalOptions = null, onOpenProblems, onRegenerateSpec, onFixIssue, onClose }) {
  const actions = buildDoneIntentionPopupActions({ severity, canFixIssue, issueTarget });
  const demoTargetId = formatDemoTargetId(issueTarget);
  const filteredProposalOptions = Array.isArray(proposalOptions)
    ? proposalOptions.filter((opt) => opt?.type !== 'text' && typeof opt?.label === 'string')
    : [];
  const hasProposalOptions = filteredProposalOptions.length > 0;

  const handleAction = (item) => {
    if (item.action === 'fix') {
      onFixIssue?.();
    } else if (item.action === 'problems') {
      onOpenProblems?.();
    } else if (item.action === 'regenerate') {
      onRegenerateSpec?.();
    }

    onClose?.();
  };

  const renderActionRow = (item, { key, primary = false }) => (
    <button
      key={key}
      type="button"
      className={`cmp-cell spec-done-intention-popup-item${primary ? ' spec-done-intention-popup-item-primary' : ''}`}
      data-demo-id={demoTargetId ? `issue-popup-${item.id}-${demoTargetId}` : undefined}
      onMouseDown={(event) => {
        event.preventDefault();
        handleAction(item);
      }}
    >
      <span className="spec-done-intention-popup-leading" aria-hidden="true">
        {item.icon ? <Icon name={item.icon} size={16} /> : null}
      </span>
      <div className="cmp-content">
        <span className="cmp-label">{item.label}</span>
      </div>
    </button>
  );

  const primaryItems = hasProposalOptions
    ? [
        ...filteredProposalOptions.map((opt, i) => ({
          id: `proposal-${i}`,
          label: opt.label,
          icon: 'codeInsight/intentionBulb',
          action: 'fix',
          demoId: demoTargetId ? `issue-popup-proposal-${i}-${demoTargetId}` : undefined,
        })),
        ...actions.primary.filter((item) => item.action !== 'fix'),
      ]
    : actions.primary;

  return (
    <div className="cmp-popup spec-done-intention-popup" onMouseDown={(event) => event.preventDefault()}>
      {primaryItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className="cmp-cell spec-done-intention-popup-item spec-done-intention-popup-item-primary"
          data-demo-id={item.demoId ?? (demoTargetId ? `issue-popup-${item.id}-${demoTargetId}` : undefined)}
          onMouseDown={(event) => {
            event.preventDefault();
            handleAction(item);
          }}
        >
          <span className="spec-done-intention-popup-leading" aria-hidden="true">
            {item.icon ? <Icon name={item.icon} size={16} /> : null}
          </span>
          <div className="cmp-content">
            <span className="cmp-label">{item.label}</span>
          </div>
        </button>
      ))}
      <div className="spec-done-intention-popup-divider" />
      {actions.secondary.map((item) => renderActionRow(item, { key: item.id }))}
      <div className="cmp-footer spec-done-intention-popup-footer">
        <span className="cmp-footer-text">Quick actions for the active issue.</span>
        <span className="cmp-footer-tip">Esc to close</span>
      </div>
    </div>
  );
}

function DoneEnhanceGuidePopup({ arrowPosition = 'top', dismissing = false }) {
  const arrow = (
    <svg width="16" height="8" viewBox="0 0 16 8" fill="none" aria-hidden="true">
      <path d="M0 8 L8 0 L16 8 Z" className="got-it-arrow-fill" />
      <path d="M0 8 L8 0 L16 8" className="got-it-arrow-stroke" />
    </svg>
  );
  return (
    <div className={`enhance-hint enhance-hint-${arrowPosition}${dismissing ? ' enhance-hint-dismissing' : ''}`}>
      {(arrowPosition === 'top' || arrowPosition === 'left') && (
        <div className={`enhance-hint-corner enhance-hint-corner-${arrowPosition}`}>{arrow}</div>
      )}
      <div className="enhance-hint-body">
        Changes made — click <strong>Specify</strong> to update the spec.
      </div>
      {(arrowPosition === 'bottom' || arrowPosition === 'right') && (
        <div className={`enhance-hint-corner enhance-hint-corner-${arrowPosition}`}>{arrow}</div>
      )}
    </div>
  );
}

function SpecSelectionToolbar({ position, onAction }) {
  if (!position) return null;

  const preventSelectionReset = (event) => {
    event.preventDefault();
  };

  return createPortal(
    <div
      className={`spec-done-selection-toolbar spec-done-selection-toolbar-${position.placement}`}
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={preventSelectionReset}
    >
      {SPEC_SELECTION_TOOLBAR_ITEMS.map((item) => {
        if (item.type === 'separator') {
          return <span key={item.id} className="spec-done-selection-toolbar-separator" aria-hidden="true" />;
        }

        return (
          <button
            key={item.id}
            type="button"
            className={`spec-done-selection-toolbar-btn${item.accent ? ` is-${item.accent}` : ''}`}
            aria-label={item.label}
            title={item.label}
            onMouseDown={preventSelectionReset}
            onClick={(event) => onAction?.(item.id, event.currentTarget.getBoundingClientRect())}
          >
            {item.iconName ? (
              <Icon name={item.iconName} size={16} />
            ) : (
              <span className={`spec-done-selection-toolbar-text ${item.textClassName ?? ''}`} aria-hidden="true">
                {item.text}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

function normalizeStoredBreakpointKeys(keys = []) {
  if (!Array.isArray(keys)) {
    return [];
  }

  return Array.from(new Set(keys.filter((key) => typeof key === 'string' && key.length > 0))).sort();
}

function areSortedStringArraysEqual(left = [], right = []) {
  if (left.length !== right.length) return false;

  return left.every((value, index) => value === right[index]);
}

function normalizeDoneOverlayUiState(uiState = null) {
  const normalizedUiState = uiState && typeof uiState === 'object'
    ? { ...uiState }
    : {};

  normalizedUiState.breakpointKeys = normalizeStoredBreakpointKeys(normalizedUiState.breakpointKeys);

  return normalizedUiState;
}

function areDoneOverlayUiStatesEqual(left = null, right = null) {
  const normalizedLeft = normalizeDoneOverlayUiState(left);
  const normalizedRight = normalizeDoneOverlayUiState(right);
  const leftKeys = Object.keys(normalizedLeft).sort();
  const rightKeys = Object.keys(normalizedRight).sort();

  if (!areSortedStringArraysEqual(leftKeys, rightKeys)) {
    return false;
  }

  return leftKeys.every((key) => (
    key === 'breakpointKeys'
      ? areSortedStringArraysEqual(normalizedLeft.breakpointKeys, normalizedRight.breakpointKeys)
      : normalizedLeft[key] === normalizedRight[key]
  ));
}

function DoneMarkdownOverlay({ code, onOpenProblems, onOpenTerminal, onRegenerateSpec, onFixIssue, onOpenDiffTab, addPopupFiles, attachedFiles = [], onAddToProjectContext, acRunResult, planRunResult, documentSections, acWarningBanner, inspectionSummary, versionHistory = null, onOpenVersionDiff = null, onCommentCountChange, onCommentsChange, commentEntries: persistedCommentEntries = [], removedIssueIndices, highlightedProblemLocation = null, updatedRowTarget = null, commentResetToken = 0, uiState = null, onUiStateChange = null, onPendingEnhanceStateChange = null, onUserInput = null, activeRunRequest = null, specSessionKey = null, specTabLabel = '', onPlanWorkflowSelect = null, onPlanWorkflowOpen = null, onPlanWorkflowRemove = null }) {
  const effectiveDocumentSections = useMemo(
    () => orderAcceptanceBeforePlanSections(
      normalizeLegacyVisitBookingGoalDocumentSections(documentSections).map((section) => withDerivedPlanChildren(section))
    ),
    [documentSections]
  );
  const effectiveCode = useMemo(
    () => orderAcceptanceBeforePlanCode(
      normalizeLegacyDerivedPlanChildrenCode(
        normalizeLegacyVisitBookingGoalCode(
          typeof code === 'string' ? code : serializeSpecDocument(effectiveDocumentSections)
        )
      )
    ),
    [code, effectiveDocumentSections]
  );
  const tradeoffCount = useMemo(
    () => countRecordedTradeoffs(effectiveDocumentSections),
    [effectiveDocumentSections]
  );
  const acceptanceCriteriaCount = Array.isArray(acRunResult) ? acRunResult.length : 0;
  const planItemCount = Array.isArray(planRunResult) ? planRunResult.length : 0;
  const projectContextFile = useMemo(
    () => getProjectContextFile(effectiveDocumentSections, addPopupFiles),
    [addPopupFiles, effectiveDocumentSections]
  );
  const [projectContextBannerDismissed, setProjectContextBannerDismissed] = useState(false);
  const successBannerMessage = useMemo(
    () => buildSuccessBannerMessage({
      acceptanceCriteriaCount,
      planItemCount,
      tradeoffCount,
    }),
    [acceptanceCriteriaCount, planItemCount, tradeoffCount]
  );
  const showSuccessBanner = useMemo(
    () => !acWarningBanner
      && areAllChecklistStatusesPassed(acRunResult)
      && areAllChecklistStatusesPassed(planRunResult),
    [acRunResult, acWarningBanner, planRunResult]
  );
  const shouldRenderSuccessBanner = showSuccessBanner && !projectContextBannerDismissed;
  const [draftCode, setDraftCode] = useState(() => effectiveCode);
  const draftCodeRef = useRef(draftCode);
  draftCodeRef.current = draftCode;

  useEffect(() => {
    setProjectContextBannerDismissed(false);
  }, [projectContextFile?.label, showSuccessBanner]);

  useEffect(() => {
    setDraftCode(effectiveCode);
  }, [commentResetToken, effectiveCode]);

  const displayRows = useMemo(() => {
    const rawLines = draftCode ? draftCode.split(/\r?\n/) : [];
    const nextRows = rawLines.reduce((rows, line, rawIndex) => {
      if (/^\s*##\s+/.test(line) && rows.length > 0 && rows[rows.length - 1].line.trim() !== '') {
        rows.push({ line: '', rawIndex: null, isVirtual: true });
      }

      rows.push({ line, rawIndex, isVirtual: false });
      return rows;
    }, []);

    nextRows.push(
      { line: '', rawIndex: null, isVirtual: true },
      { line: '', rawIndex: null, isVirtual: true },
    );

    return nextRows;
  }, [draftCode]);
  const serializedDocumentModel = useMemo(
    () => buildSerializedDocumentLines(effectiveDocumentSections),
    [effectiveDocumentSections]
  );
  const serializedDocumentLineMap = serializedDocumentModel.lineMap;
  const serializedDocumentLines = serializedDocumentModel.lines;
  const hasPlanWorkflowMeta = useMemo(() => (
    (effectiveDocumentSections ?? []).some((section) => (
      normalizeSpecSectionTitle(section?.title) === 'plan'
      && section?.meta?.kind === 'chip'
      && typeof section.meta.text === 'string'
      && section.meta.text.trim().length > 0
    ))
  ), [effectiveDocumentSections]);
  const matchedSerializedLineMetaByRow = useMemo(
    () => buildDisplayRowSerializedLineMatches(displayRows, serializedDocumentLines, serializedDocumentLineMap),
    [displayRows, serializedDocumentLineMap, serializedDocumentLines]
  );
  const storedBreakpointKeys = useMemo(
    () => normalizeStoredBreakpointKeys(uiState?.breakpointKeys),
    [uiState?.breakpointKeys]
  );
  const storedBreakpointKeysSignature = storedBreakpointKeys.join('|');
  const [breakpoints, setBreakpoints] = useState(() => new Set(storedBreakpointKeys));
  const breakpointKeys = useMemo(
    () => Array.from(breakpoints).sort(),
    [breakpoints]
  );
  const lastStoredBreakpointKeysSignatureRef = useRef(storedBreakpointKeysSignature);
  const [refPopupPos, setRefPopupPos] = useState(null);
  const [refCmpQuery, setRefCmpQuery] = useState('');
  const [refCmpSelectedIdx, setRefCmpSelectedIdx] = useState(0);
  const refSpanRef = useRef(null);
  const [doneCmpPos, setDoneCmpPos] = useState(null);
  const [doneCmpSelectedIdx, setDoneCmpSelectedIdx] = useState(0);
  const doneCmpEditableRef = useRef(null);
  const doneCmpRangeRef = useRef(null);
  const doneCmpQueryRef = useRef('');
  const [hasEditedLines, setHasEditedLines] = useState(false);
  const [deletedRowKeys, setDeletedRowKeys] = useState(() => new Set());
  const [clearedRowKeys, setClearedRowKeys] = useState(() => new Set());
  const pendingFocusRowKeyRef = useRef(null);
  const pendingFocusNextRowKeyRef = useRef(null);
  const scrollRef = useRef(null);
  const [selectionToolbarPos, setSelectionToolbarPos] = useState(null);
  const [activeIssueRowKey, setActiveIssueRowKey] = useState(null);
  const [navigatedIssueRowKey, setNavigatedIssueRowKey] = useState(null);
  const [focusedCommentRowKey, setFocusedCommentRowKey] = useState(null);
  const [suppressInlineCommentAdornment, setSuppressInlineCommentAdornment] = useState(false);
  const [hoveredRowKey, setHoveredRowKey] = useState(null);
  const [commentPopup, setCommentPopup] = useState(null);
  const [intentionPopup, setIntentionPopup] = useState(null);
  const intentionPopupRef = useRef(null);
  const intentionPopupTimerRef = useRef(0);
  const [problemsFixMenu, setProblemsFixMenu] = useState(null);
  const normalizedCode = useMemo(
    () => normalizeSpecCodeForComparison(effectiveCode),
    [effectiveCode]
  );
  const runStatusMetaByStableKey = useMemo(() => {
    const nextMeta = new Map();
    let acVisibleIndex = 0;
    let planParentVisibleIndex = 0;
    let planLineVisibleIndex = 0;
    let currentAcVisibleIndex = null;
    let currentPlanParentVisibleIndex = null;
    const planTopLevelCheckCount = serializedDocumentLineMap.filter((lineMeta) => {
      if (lineMeta?.type !== 'item' || lineMeta.itemType !== 'check' || (lineMeta.nestingLevel ?? 0) !== 0) {
        return false;
      }

      const sectionTitle = effectiveDocumentSections?.[lineMeta.sectionIndex]?.title ?? '';
      return sectionTitle.toLowerCase() === 'plan';
    }).length;
    const useLineBasedPlanStatuses = Array.isArray(planRunResult)
      && planRunResult.length > planTopLevelCheckCount;

    serializedDocumentLineMap.forEach((lineMeta) => {
      if (lineMeta?.type !== 'item' || lineMeta.itemType !== 'check') {
        return;
      }

      const sectionTitle = effectiveDocumentSections?.[lineMeta.sectionIndex]?.title ?? '';
      const normalizedSectionTitle = sectionTitle.toLowerCase();

      if (normalizedSectionTitle === 'acceptance criteria') {
        if ((lineMeta.nestingLevel ?? 0) === 0) {
          currentAcVisibleIndex = acVisibleIndex;
          acVisibleIndex += 1;
        }

        if (!Number.isInteger(currentAcVisibleIndex) || currentAcVisibleIndex < 0) {
          return;
        }

        const originalIndex = mapVisibleIssueIndexToOriginal('ac', currentAcVisibleIndex, removedIssueIndices);
        nextMeta.set(lineMeta.stableKey, {
          kind: 'ac',
          visibleIndex: currentAcVisibleIndex,
          originalIndex,
          statusItem: acRunResult?.[currentAcVisibleIndex] ?? null,
        });
        return;
      }

      if (normalizedSectionTitle === 'plan') {
        if ((lineMeta.nestingLevel ?? 0) === 0) {
          currentPlanParentVisibleIndex = planParentVisibleIndex;
          planParentVisibleIndex += 1;
        }

        if (!Number.isInteger(currentPlanParentVisibleIndex) || currentPlanParentVisibleIndex < 0) {
          return;
        }

        const statusVisibleIndex = useLineBasedPlanStatuses
          ? planLineVisibleIndex
          : currentPlanParentVisibleIndex;
        planLineVisibleIndex += 1;
        const originalIndex = mapVisibleIssueIndexToOriginal('plan', currentPlanParentVisibleIndex, removedIssueIndices);
        nextMeta.set(lineMeta.stableKey, {
          kind: 'plan',
          visibleIndex: statusVisibleIndex,
          originalIndex,
          statusItem: planRunResult?.[statusVisibleIndex] ?? null,
        });
      }
    });

    return nextMeta;
  }, [acRunResult, effectiveDocumentSections, planRunResult, removedIssueIndices, serializedDocumentLineMap]);
  useEffect(() => {
    intentionPopupRef.current = intentionPopup;
    if (intentionPopup && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ISSUE_INTENTION_POPUP_OPEN_EVENT));
    }
  }, [intentionPopup]);

  const closeIntentionPopup = useCallback(() => {
    if (intentionPopupTimerRef.current) {
      window.clearTimeout(intentionPopupTimerRef.current);
      intentionPopupTimerRef.current = 0;
    }
    intentionPopupRef.current = null;
    setIntentionPopup(null);
  }, []);

  const scheduleIntentionPopupOpen = useCallback((nextPopup) => {
    if (intentionPopupTimerRef.current) {
      window.clearTimeout(intentionPopupTimerRef.current);
      intentionPopupTimerRef.current = 0;
    }

    const currentPopup = intentionPopupRef.current;

    if (currentPopup?.rowKey === nextPopup.rowKey) {
      intentionPopupRef.current = null;
      setIntentionPopup(null);
      return;
    }

    if (currentPopup) {
      return;
    }

    intentionPopupTimerRef.current = window.setTimeout(() => {
      intentionPopupTimerRef.current = 0;
      if (intentionPopupRef.current) {
        return;
      }
      intentionPopupRef.current = nextPopup;
      setIntentionPopup(nextPopup);
    }, ISSUE_INTENTION_POPUP_OPEN_DELAY_MS);
  }, []);

  const intentionPopupPosition = useMemo(() => {
    if (!intentionPopup?.rect) return null;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || ISSUE_INTENTION_POPUP_WIDTH;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const maxLeft = Math.max(8, viewportWidth - ISSUE_INTENTION_POPUP_WIDTH - 8);
    const left = Math.min(Math.max(8, intentionPopup.rect.left), maxLeft);
    const belowTop = intentionPopup.rect.bottom + ISSUE_INTENTION_POPUP_GAP;
    const top = viewportHeight > 0 && belowTop > viewportHeight - 16
      ? Math.max(8, intentionPopup.rect.top - ISSUE_INTENTION_POPUP_GAP)
      : belowTop;

    return { top, left };
  }, [intentionPopup?.rect]);

  useEffect(() => () => {
    if (intentionPopupTimerRef.current) {
      window.clearTimeout(intentionPopupTimerRef.current);
      intentionPopupTimerRef.current = 0;
    }
  }, []);

  const rowMetaList = useMemo(() => {
    const sectionMetaByTitle = new Map(
      (effectiveDocumentSections ?? []).map((section) => [section.title.toLowerCase(), section.meta ?? null])
    );
    const hasNestedPlanChildren = matchedSerializedLineMetaByRow.some((lineMeta) => (
      lineMeta?.itemType === 'check'
      && (lineMeta?.nestingLevel ?? 0) > 0
      && (effectiveDocumentSections?.[lineMeta.sectionIndex]?.title ?? '').toLowerCase() === 'plan'
    ));
    let inAcSection = false;
    let inPlanSection = false;
    let currentSectionTitle = null;
    let acItemCount = 0;
    let planParentCount = 0;

    return displayRows.map((row, rowIndex) => {
      const line = row.line;
      const headingTitle = getDoneHeadingTitle(line);
      const sectionMeta = headingTitle ? sectionMetaByTitle.get(headingTitle.toLowerCase()) ?? null : null;
      const showRunIcon = shouldShowDoneRunIcon(line, { hidePlanRun: false, hideAcRun: false });
      const serializedLineMeta = matchedSerializedLineMetaByRow[rowIndex] ?? null;

      if (headingTitle !== null) {
        currentSectionTitle = headingTitle;
        inAcSection = headingTitle.toLowerCase() === 'acceptance criteria';
        inPlanSection = headingTitle.toLowerCase() === 'plan';
        if (inAcSection) {
          acItemCount = 0;
        }
        if (inPlanSection) {
          planParentCount = 0;
        }
      }

      const effectiveIsCheckLine = /^\s*-\s+\[([ x])\]\s+/i.test(line);
      const isTopLevelAcItem = Boolean(
        effectiveIsCheckLine
        && inAcSection
        && serializedLineMeta?.itemType === 'check'
        && (serializedLineMeta?.nestingLevel ?? 0) === 0
      );
      const isFirstTopLevelAcItem = isTopLevelAcItem && acItemCount === 0;
      if (isTopLevelAcItem) {
        acItemCount += 1;
      }
      const isTopLevelPlanParent = Boolean(
        effectiveIsCheckLine
        && inPlanSection
        && serializedLineMeta?.itemType === 'check'
        && (serializedLineMeta?.nestingLevel ?? 0) === 0
      );
      const isFirstTopLevelPlanParent = isTopLevelPlanParent && planParentCount === 0;
      if (isTopLevelPlanParent) {
        planParentCount += 1;
      }
      const isFlatTopLevelPlanParent = isTopLevelPlanParent && !hasNestedPlanChildren;
      const isNestedPlanChild = Boolean(
        effectiveIsCheckLine
        && inPlanSection
        && serializedLineMeta?.itemType === 'check'
        && (serializedLineMeta?.nestingLevel ?? 0) > 0
      );
      const isFirstNestedPlanChild = isNestedPlanChild && (
        Array.isArray(serializedLineMeta?.childPath)
          ? serializedLineMeta.childPath[serializedLineMeta.childPath.length - 1] === 0
          : false
      );
      let checkStatus = null;
      let planStatus = null;
      let checkTarget = null;
      let issueSeverity = null;
      let issueTarget = null;
      const statusMeta = serializedLineMeta?.stableKey
        ? (runStatusMetaByStableKey.get(serializedLineMeta.stableKey) ?? null)
        : null;
      const isDraftStatusOutdated = Boolean(
        effectiveIsCheckLine
        && statusMeta?.statusItem
        && normalizeSpecLineForComparison(line) !== normalizeSpecLineForComparison(serializedLineMeta?.sourceLine ?? line)
      );
      const displayStatusItem = statusMeta?.statusItem
        ? ((isDraftStatusOutdated || isRunStatusItemOutdated(statusMeta.statusItem))
            ? withRunStatusOutdated(statusMeta.statusItem)
            : statusMeta.statusItem)
        : null;
      const statusIssueSeverity = displayStatusItem?.issue?.severity ?? displayStatusItem?.status ?? null;

      if (effectiveIsCheckLine && inAcSection && statusMeta?.kind === 'ac') {
        const originalIndex = statusMeta.originalIndex;
        if (Number.isInteger(originalIndex)) {
          checkTarget = { kind: 'ac', index: originalIndex };
        }
        checkStatus = displayStatusItem;
        if (displayStatusItem && (statusIssueSeverity === 'warning' || statusIssueSeverity === 'failed' || statusIssueSeverity === 'error') && Number.isInteger(originalIndex)) {
          issueSeverity = statusIssueSeverity;
          issueTarget = { kind: 'ac', index: originalIndex };
        }
      }

      if (effectiveIsCheckLine && inPlanSection && statusMeta?.kind === 'plan') {
        const originalIndex = statusMeta.originalIndex;
        if (Number.isInteger(originalIndex)) {
          checkTarget = { kind: 'plan', index: originalIndex };
        }
        planStatus = displayStatusItem;
        if (displayStatusItem && (statusIssueSeverity === 'warning' || statusIssueSeverity === 'failed' || statusIssueSeverity === 'error') && Number.isInteger(originalIndex)) {
          issueSeverity = statusIssueSeverity;
          issueTarget = { kind: 'plan', index: originalIndex };
        }
      }

      const stableKey = serializedLineMeta?.stableKey
        ?? (row.isVirtual
          ? `virtual-row:${rowIndex}`
          : `raw-row:${row.rawIndex ?? rowIndex}`);

      return {
        rowIndex,
        stableKey,
        line,
        rawIndex: row.rawIndex,
        headingTitle,
        sectionMeta,
        showRunIcon,
        currentSectionTitle,
        nestingLevel: serializedLineMeta?.nestingLevel ?? 0,
        isTopLevelAcItem,
        isFirstTopLevelAcItem,
        isTopLevelPlanParent,
        isFirstTopLevelPlanParent,
        isFlatTopLevelPlanParent,
        isNestedPlanChild,
        isFirstNestedPlanChild,
        checkStatus,
        planStatus,
        checkTarget,
        issueSeverity,
        issueTarget,
        proposalOptions: Array.isArray(displayStatusItem?.proposalOptions) ? displayStatusItem.proposalOptions : null,
      };
    });
  }, [displayRows, effectiveDocumentSections, matchedSerializedLineMetaByRow, runStatusMetaByStableKey]);
  const rowMetaByKey = useMemo(
    () => new Map(rowMetaList.map((rowMeta) => [rowMeta.stableKey, rowMeta])),
    [rowMetaList]
  );
  const hydratedRowComments = useMemo(
    () => buildRowCommentsStateFromEntries(rowMetaList, persistedCommentEntries),
    [persistedCommentEntries, rowMetaList]
  );
  const hydratedRowCommentsSignature = useMemo(
    () => buildRowCommentsSignature(hydratedRowComments),
    [hydratedRowComments]
  );
  const [rowComments, setRowComments] = useState(() => hydratedRowComments);
  const rowCommentsSignature = useMemo(() => buildRowCommentsSignature(rowComments), [rowComments]);
  const lastHydratedCommentsSignatureRef = useRef(null);
  const baselineCommentSignatureRef = useRef(hydratedRowCommentsSignature);
  const baselineCommentSessionKeyRef = useRef(`${normalizedCode}::${commentResetToken}`);
  const highlightedProblemRowIndex = useMemo(() => {
    const rawIndex = highlightedProblemLocation?.rawIndex;
    if (!Number.isInteger(rawIndex)) return null;

    const matchingRow = rowMetaList.find((rowMeta) => rowMeta.rawIndex === rawIndex);
    return matchingRow?.rowIndex ?? null;
  }, [highlightedProblemLocation, rowMetaList]);
  const issueRowKeys = useMemo(() => (
    rowMetaList
      .filter((rowMeta) => (
        rowMeta.issueSeverity === 'warning'
        || rowMeta.issueSeverity === 'failed'
        || rowMeta.issueSeverity === 'error'
      ))
      .map((rowMeta) => rowMeta.stableKey)
  ), [rowMetaList]);

  useEffect(() => {
    if (lastStoredBreakpointKeysSignatureRef.current === storedBreakpointKeysSignature) {
      return;
    }

    lastStoredBreakpointKeysSignatureRef.current = storedBreakpointKeysSignature;

    setBreakpoints((prev) => {
      const previousKeys = Array.from(prev).sort();
      if (areSortedStringArraysEqual(previousKeys, storedBreakpointKeys)) {
        return prev;
      }

      return new Set(storedBreakpointKeys);
    });
  }, [storedBreakpointKeys, storedBreakpointKeysSignature]);

  const scrollDoneRowIntoView = useCallback((rowIndex, behavior = 'smooth') => {
    if (!Number.isInteger(rowIndex)) return;

    const rowEl = scrollRef.current?.querySelector(`.spec-done-row[data-row-index="${rowIndex}"]`);
    if (!(rowEl instanceof HTMLElement)) return;

    rowEl.scrollIntoView({
      block: 'center',
      behavior,
    });
  }, []);

  const focusDoneRowEditable = useCallback((rowIndex) => {
    if (!Number.isInteger(rowIndex)) return;

    const editable = scrollRef.current?.querySelector(`.spec-done-row[data-row-index="${rowIndex}"] [contenteditable]`);
    if (!(editable instanceof HTMLElement)) return;

    editable.focus({ preventScroll: true });

    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  const navigateInspectionIssue = useCallback((direction) => {
    if (issueRowKeys.length === 0) return;

    const currentIssueRowKey = navigatedIssueRowKey ?? activeIssueRowKey;
    const currentIssueIndex = issueRowKeys.indexOf(currentIssueRowKey);
    let nextIssueIndex = 0;

    if (direction < 0) {
      nextIssueIndex = currentIssueIndex >= 0
        ? (currentIssueIndex - 1 + issueRowKeys.length) % issueRowKeys.length
        : issueRowKeys.length - 1;
    } else {
      nextIssueIndex = currentIssueIndex >= 0
        ? (currentIssueIndex + 1) % issueRowKeys.length
        : 0;
    }

    const targetRowKey = issueRowKeys[nextIssueIndex];
    const targetRowIndex = rowMetaByKey.get(targetRowKey)?.rowIndex;
    if (!Number.isInteger(targetRowIndex)) return;

    setIntentionPopup(null);
    setSelectionToolbarPos(null);
    setNavigatedIssueRowKey(targetRowKey);
    setActiveIssueRowKey(targetRowKey);
    scrollDoneRowIntoView(targetRowIndex);
    requestAnimationFrame(() => focusDoneRowEditable(targetRowIndex));
  }, [activeIssueRowKey, focusDoneRowEditable, issueRowKeys, navigatedIssueRowKey, rowMetaByKey, scrollDoneRowIntoView]);

  const getSelectionToolbarRowMeta = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const anchorNode = selection.anchorNode;
    const anchorElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
    if (!(anchorElement instanceof Element) || !scrollRef.current?.contains(anchorElement)) {
      return null;
    }

    const rowEl = anchorElement.closest('.spec-done-row');
    if (!(rowEl instanceof HTMLElement)) return null;

    const rowKey = rowEl.dataset.rowKey;
    if (typeof rowKey !== 'string' || !rowKey) return null;

    return rowMetaByKey.get(rowKey) ?? null;
  }, [rowMetaByKey]);

  const handleSelectionToolbarAction = useCallback((actionId, triggerRect) => {
    if (!triggerRect) return;

    const rowMeta = getSelectionToolbarRowMeta();
    if (!rowMeta) return;

    if (actionId === 'comment') {
      closeIntentionPopup();
      setSelectionToolbarPos(null);
      setCommentPopup((prev) => (
        prev?.rowKey === rowMeta.stableKey
          ? null
          : {
              rowKey: rowMeta.stableKey,
              rowCommentKey: getRowMetaCommentStorageKey(rowMeta),
              rowIndex: rowMeta.rowIndex,
              rect: triggerRect,
              value: '',
              editingIndex: null,
            }
      ));
      return;
    }

    if (actionId === 'suggest') {
      setCommentPopup(null);
      setSelectionToolbarPos(null);
      setActiveIssueRowKey(rowMeta.stableKey);
      setNavigatedIssueRowKey(rowMeta.stableKey);
      scheduleIntentionPopupOpen({
        rowKey: rowMeta.stableKey,
        rowIndex: rowMeta.rowIndex,
        rect: triggerRect,
        severity: rowMeta.issueSeverity ?? 'warning',
        sectionTitle: rowMeta.currentSectionTitle,
        issueTarget: rowMeta.issueTarget,
      });
    }
  }, [closeIntentionPopup, getSelectionToolbarRowMeta, scheduleIntentionPopupOpen]);

  const closeCommentPopup = useCallback((rowIndex = null) => {
    setCommentPopup(null);
    if (Number.isInteger(rowIndex)) {
      requestAnimationFrame(() => focusDoneRowEditable(rowIndex));
    }
  }, [focusDoneRowEditable]);

  const updateRowComments = useCallback((rowCommentKey, updater) => {
    if (typeof rowCommentKey !== 'string' || !rowCommentKey) return;

    setRowComments((prev) => {
      const currentComments = prev[rowCommentKey] ?? [];
      const nextComments = updater([...currentComments]);

      if (!nextComments || nextComments.length === 0) {
        if (!(rowCommentKey in prev)) return prev;
        const nextState = { ...prev };
        delete nextState[rowCommentKey];
        return nextState;
      }

      return {
        ...prev,
        [rowCommentKey]: nextComments,
      };
    });
  }, []);

  const updateEditedLinesState = useCallback(() => {
    const hasPendingLineEdits = normalizeSpecCodeForComparison(buildDoneOverlaySnapshotCode(draftCodeRef.current)) !== normalizedCode;
    setHasEditedLines((prev) => (prev === hasPendingLineEdits ? prev : hasPendingLineEdits));
    return hasPendingLineEdits;
  }, [normalizedCode]);

  const handleCommentSubmit = useCallback(() => {
    if (!commentPopup) return;

    const nextValue = commentPopup.value.trim();
    if (!nextValue) return;

    const { rowCommentKey, editingIndex, rowIndex } = commentPopup;

    if (Number.isInteger(editingIndex)) {
      updateRowComments(rowCommentKey, (comments) => comments.map((comment, index) => (
        index === editingIndex ? nextValue : comment
      )));
    } else {
      updateRowComments(rowCommentKey, (comments) => [...comments, nextValue]);
    }

    closeCommentPopup(rowIndex);
  }, [closeCommentPopup, commentPopup, updateRowComments]);

  const handleCommentDelete = useCallback((rowKey, rowCommentKey, commentIndex) => {
    updateRowComments(rowCommentKey, (comments) => comments.filter((_, index) => index !== commentIndex));
    setCommentPopup((prev) => {
      if (!prev || prev.rowKey !== rowKey) return prev;
      if (prev.editingIndex === commentIndex) {
        return { ...prev, value: '', editingIndex: null };
      }
      if (Number.isInteger(prev.editingIndex) && prev.editingIndex > commentIndex) {
        return { ...prev, editingIndex: prev.editingIndex - 1 };
      }
      return prev;
    });
  }, [updateRowComments]);

  const handleCommentEditStart = useCallback((rowKey, rowCommentKey, commentIndex) => {
    setCommentPopup((prev) => {
      if (!prev || prev.rowKey !== rowKey) return prev;
      return {
        ...prev,
        value: rowComments[rowCommentKey]?.[commentIndex] ?? '',
        editingIndex: commentIndex,
      };
    });
  }, [rowComments]);

  const toggleBreakpoint = (rowKey) => {
    if (typeof rowKey !== 'string' || !rowKey) return;

    setBreakpoints(prev => {
      const next = new Set(prev);
      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
      return next;
    });
  };

  const applyDoneCompletion = (item) => {
    const editable = doneCmpEditableRef.current;
    const savedRange = doneCmpRangeRef.current;
    const query = doneCmpQueryRef.current;
    if (!editable || !savedRange) return;
    editable.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    const range = savedRange.cloneRange();
    const deleteLen = query.length + 1; // '@' + query chars
    if (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset >= deleteLen) {
      range.setStart(range.startContainer, range.startOffset - deleteLen);
    }
    range.deleteContents();
    const span = document.createElement('span');
    span.className = 'spec-ref';
    span.textContent = `@${getCompletionInsertText(item)}`;
    range.insertNode(span);
    const space = document.createTextNode(' ');
    span.after(space);
    const newRange = document.createRange();
    newRange.setStart(space, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    setDoneCmpPos(null);
    doneCmpEditableRef.current = null;
    doneCmpRangeRef.current = null;
    doneCmpQueryRef.current = '';
  };

  // Detect @ in contenteditable and show AddPopup
  useEffect(() => {
    if (lastHydratedCommentsSignatureRef.current === hydratedRowCommentsSignature) return;

    lastHydratedCommentsSignatureRef.current = hydratedRowCommentsSignature;

    if (hydratedRowCommentsSignature !== rowCommentsSignature) {
      setRowComments(hydratedRowComments);
    }
  }, [hydratedRowComments, hydratedRowCommentsSignature, rowCommentsSignature]);

  useEffect(() => {
    const nextBaselineSessionKey = `${normalizedCode}::${commentResetToken}`;
    if (baselineCommentSessionKeyRef.current === nextBaselineSessionKey) {
      return;
    }

    baselineCommentSessionKeyRef.current = nextBaselineSessionKey;
    baselineCommentSignatureRef.current = hydratedRowCommentsSignature;
  }, [commentResetToken, hydratedRowCommentsSignature, normalizedCode]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleInput = () => {
      // Notify parent that the user is genuinely typing so any post-enhance
      // badge suppression can be lifted immediately.
      onUserInput?.();

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) { setDoneCmpPos(null); return; }
      const anchor = sel.anchorNode;
      const node = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
      const editable = node?.closest?.('[contenteditable]');
      if (!editable || !el.contains(editable)) { setDoneCmpPos(null); return; }
      const range = sel.getRangeAt(0).cloneRange();
      range.setStart(editable, 0);
      const textBefore = range.toString();
      const match = textBefore.match(/@(\w*)$/);
      if (match) {
        const query = match[1];
        const cursorRect = sel.getRangeAt(0).getBoundingClientRect();
        const POPUP_WIDTH = 300;
        const overflows = cursorRect.left + POPUP_WIDTH > window.innerWidth - 8;
        doneCmpEditableRef.current = editable;
        doneCmpRangeRef.current = sel.getRangeAt(0).cloneRange();
        doneCmpQueryRef.current = query;
        setDoneCmpSelectedIdx(0);
        setDoneCmpPos(overflows
          ? { top: cursorRect.bottom + 4, right: window.innerWidth - cursorRect.right, query }
          : { top: cursorRect.bottom + 4, left: cursorRect.left, query }
        );
      } else {
        setDoneCmpPos(null);
        doneCmpEditableRef.current = null;
        doneCmpRangeRef.current = null;
        doneCmpQueryRef.current = '';
      }

      const nextDraftCode = buildDoneOverlaySnapshotCode(draftCodeRef.current);
      setDraftCode((prev) => (
        normalizeSpecCodeForComparison(prev) === normalizeSpecCodeForComparison(nextDraftCode)
          ? prev
          : nextDraftCode
      ));
      updateEditedLinesState();
    };
    el.addEventListener('input', handleInput);
    return () => el.removeEventListener('input', handleInput);
  }, [onUserInput, updateEditedLinesState]);

  // Keyboard support for refPopupPos CompletionPopup
  useEffect(() => {
    if (!refPopupPos) return;
    const filtered = AT_COMPLETIONS.filter(item => item.label.toLowerCase().includes(refCmpQuery.toLowerCase())).slice(0, COMPLETION_POPUP_MAX_ITEMS);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setRefPopupPos(null); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setRefCmpSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setRefCmpSelectedIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = filtered[refCmpSelectedIdx];
        const selection = buildCompletionSelection(item);
        if (selection) {
          if (refSpanRef.current) refSpanRef.current.textContent = `@${getCompletionInsertText(selection)}`;
          setRefPopupPos(null);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [refPopupPos, refCmpQuery, refCmpSelectedIdx]);

  // Keyboard support for doneCmpPos CompletionPopup
  useEffect(() => {
    if (!doneCmpPos) return;
    const filtered = AT_COMPLETIONS.filter(item => item.label.toLowerCase().includes((doneCmpPos.query ?? '').toLowerCase())).slice(0, COMPLETION_POPUP_MAX_ITEMS);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setDoneCmpPos(null); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setDoneCmpSelectedIdx(i => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setDoneCmpSelectedIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const item = filtered[doneCmpSelectedIdx];
        const selection = buildCompletionSelection(item);
        if (selection) { applyDoneCompletion(selection); setDoneCmpPos(null); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [doneCmpPos, doneCmpSelectedIdx]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleRefClick = (e) => {
      const ref = e.target.closest('.spec-ref');
      if (!ref) return;
      const r = ref.getBoundingClientRect();
      const POPUP_WIDTH = 300;
      const overflows = r.left + POPUP_WIDTH > window.innerWidth - 8;
      refSpanRef.current = ref;
      setRefCmpQuery('');
      setRefCmpSelectedIdx(0);
      setRefPopupPos(overflows
        ? { top: r.bottom + 6, right: window.innerWidth - r.right }
        : { top: r.bottom + 6, left: r.left }
      );
    };
    el.addEventListener('click', handleRefClick);
    return () => el.removeEventListener('click', handleRefClick);
  }, []);

  // When the spec changes (Enhance, fix, etc.) prune overrides for rows that no
  // longer exist, but KEEP overrides for rows that are still in the document so
  // that deletions/clears survive an Enhance cycle.
  useEffect(() => {
    const validKeys = new Set(rowMetaList.map((m) => m.stableKey));
    setDeletedRowKeys((prev) => {
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
    setClearedRowKeys((prev) => {
      const next = new Set([...prev].filter((k) => validKeys.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [rowMetaList]);


  // After deletedRowKeys changes, move focus to the next row
  useEffect(() => {
    const key = pendingFocusNextRowKeyRef.current;
    if (!key) return;
    pendingFocusNextRowKeyRef.current = null;
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const row = el.querySelector(`.spec-done-row[data-row-key="${CSS.escape(key)}"]`);
      const editable = row?.querySelector('[contenteditable]');
      if (editable instanceof HTMLElement) editable.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [deletedRowKeys]);

  // After clearedRowKeys changes (prefix stripped), restore focus to the now-empty editable
  useEffect(() => {
    const key = pendingFocusRowKeyRef.current;
    if (!key) return;
    pendingFocusRowKeyRef.current = null;
    // Wait one frame for React to finish painting the new empty-line element
    const frame = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const row = el.querySelector(`.spec-done-row[data-row-key="${CSS.escape(key)}"]`);
      const editable = row?.querySelector('[contenteditable]');
      if (editable instanceof HTMLElement) editable.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [clearedRowKeys]);

  // Backspace on empty row → delete row; clear content → strip prefix/checkbox
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleKeydown = (e) => {
      if (e.key !== 'Backspace') return;
      const editable = e.target instanceof HTMLElement ? e.target.closest('[contenteditable]') : null;
      if (!editable || !el.contains(editable)) return;
      if ((editable.textContent ?? '').length > 0) return; // still has content
      e.preventDefault();
      const row = editable.closest('.spec-done-row');
      const stableKey = typeof row?.dataset.rowKey === 'string' ? row.dataset.rowKey : null;
      if (stableKey) {
        // Find the next visible row to move focus to after deletion
        let next = row.nextElementSibling;
        while (next && (next.dataset.deleted === 'true' || getComputedStyle(next).display === 'none')) {
          next = next.nextElementSibling;
        }
        pendingFocusNextRowKeyRef.current = typeof next?.dataset.rowKey === 'string' ? next.dataset.rowKey : null;
        setDeletedRowKeys((prev) => { const s = new Set(prev); s.add(stableKey); return s; });
      }
    };

    const handleInput = (e) => {
      const editable = e.target instanceof HTMLElement ? e.target.closest('[contenteditable]') : null;
      if (!editable || !el.contains(editable)) return;
      if ((editable.textContent ?? '').length > 0) return; // not yet empty
      const row = editable.closest('.spec-done-row');
      const stableKey = typeof row?.dataset.rowKey === 'string' ? row.dataset.rowKey : null;
      if (!stableKey) return;
      // Only strip prefix from check/bullet rows (those with a status or checkbox element)
      const hasPrefixEl = Boolean(row.querySelector('.spec-check-status, .spec-done-checkbox, .plan-status-icon'));
      if (hasPrefixEl) {
        // Remember this row so we can restore focus after the re-render replaces the element
        pendingFocusRowKeyRef.current = stableKey;
        setClearedRowKeys((prev) => { const next = new Set(prev); next.add(stableKey); return next; });
      }
    };

    el.addEventListener('keydown', handleKeydown);
    el.addEventListener('input', handleInput);
    return () => {
      el.removeEventListener('keydown', handleKeydown);
      el.removeEventListener('input', handleInput);
    };
  }, [normalizedCode]);

  useEffect(() => {
    if (!intentionPopup) return;
    if (activeIssueRowKey === null || intentionPopup.rowKey !== activeIssueRowKey || !rowMetaByKey.has(intentionPopup.rowKey)) {
      setIntentionPopup(null);
    }
  }, [activeIssueRowKey, intentionPopup, rowMetaByKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frameId = 0;
    const clearHighlights = () => {
      el.querySelectorAll('.spec-done-active-line').forEach((node) => node.classList.remove('spec-done-active-line'));
    };
    const clearSelectionUi = ({ suppressComments = false } = {}) => {
      clearHighlights();
      setActiveIssueRowKey(null);
      setNavigatedIssueRowKey(null);
      setFocusedCommentRowKey(null);
      setSelectionToolbarPos(null);
      if (suppressComments) {
        setSuppressInlineCommentAdornment(true);
      }
    };
    const updateSelectionUi = () => {
      clearHighlights();

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        clearSelectionUi();
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
      const focusElement = focusNode?.nodeType === Node.TEXT_NODE ? focusNode.parentElement : focusNode;

      if (!anchorElement || !focusElement || !el.contains(anchorElement) || !el.contains(focusElement)) {
        clearSelectionUi();
        return;
      }

      const anchorEditable = anchorElement.closest('[contenteditable]');
      if (!anchorEditable) {
        clearSelectionUi();
        return;
      }

      const activeRow = anchorEditable.closest('.spec-done-row');
      activeRow?.classList.add('spec-done-active-line');
      const activeRowSeverity = activeRow?.dataset.issueSeverity;
      const activeRowKey = typeof activeRow?.dataset.rowKey === 'string' ? activeRow.dataset.rowKey : null;
      const nextActiveIssueRowKey =
        activeRowSeverity === 'warning'
        || activeRowSeverity === 'failed'
        || activeRowSeverity === 'error'
          ? activeRowKey
          : null;
      setActiveIssueRowKey(nextActiveIssueRowKey);
      setNavigatedIssueRowKey(null);
      const nextFocusedCommentRowKey =
        selection.isCollapsed &&
        anchorEditable instanceof HTMLElement &&
        anchorEditable.matches(':focus, :focus-within')
          ? activeRowKey
          : null;
      setFocusedCommentRowKey(nextFocusedCommentRowKey);

      if (selection.isCollapsed || !selection.toString().trim()) {
        setSelectionToolbarPos(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = getRangeViewportRect(range);
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight) {
        setSelectionToolbarPos(null);
        return;
      }

      setSelectionToolbarPos(getSelectionToolbarPosition(rect));
    };
    const scheduleSelectionUiUpdate = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(updateSelectionUi);
    };

    document.addEventListener('selectionchange', scheduleSelectionUiUpdate);
    el.addEventListener('scroll', scheduleSelectionUiUpdate, { passive: true });
    window.addEventListener('resize', scheduleSelectionUiUpdate);
    const clearWorkflowSelectionUi = () => clearSelectionUi({ suppressComments: true });

    window.addEventListener(SPEC_DONE_CLEAR_FOCUS_EVENT, clearWorkflowSelectionUi);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('selectionchange', scheduleSelectionUiUpdate);
      el.removeEventListener('scroll', scheduleSelectionUiUpdate);
      window.removeEventListener('resize', scheduleSelectionUiUpdate);
      window.removeEventListener(SPEC_DONE_CLEAR_FOCUS_EVENT, clearWorkflowSelectionUi);
      clearSelectionUi();
    };
  }, []);

  const totalCommentCount = Object.values(rowComments).reduce(
    (sum, comments) => sum + (Array.isArray(comments) ? comments.length : 0),
    0,
  );
  const hasPendingCommentChanges = rowCommentsSignature !== baselineCommentSignatureRef.current;
  const hasPendingEnhanceChanges = hasEditedLines || hasPendingCommentChanges;
  const commentEntries = useMemo(() => rowMetaList.reduce((entries, rowMeta) => {
    const rowCommentKey = getRowMetaCommentStorageKey(rowMeta);
    const comments = rowComments[rowCommentKey] ?? [];
    if (comments.length === 0) return entries;

    entries.push({
      rowStableKey: rowMeta.stableKey,
      rowIndex: rowMeta.rowIndex,
      rawIndex: rowMeta.rawIndex,
      line: rowMeta.line,
      sectionTitle: rowMeta.currentSectionTitle,
      checkTarget: rowMeta.checkTarget,
      issueSeverity: rowMeta.issueSeverity,
      issueTarget: rowMeta.issueTarget,
      comments: [...comments],
    });

    return entries;
  }, []), [rowComments, rowMetaList]);
  const commentedPlanOriginalIndices = useMemo(() => {
    const nextIndices = new Set();

    commentEntries.forEach((entry) => {
      const normalizedTarget = normalizeCommentTarget(entry?.checkTarget) ?? normalizeCommentTarget(entry?.issueTarget);
      if (normalizedTarget?.kind === 'plan' && Number.isInteger(normalizedTarget.index)) {
        nextIndices.add(normalizedTarget.index);
      }
    });

    return nextIndices;
  }, [commentEntries]);

  useEffect(() => {
    onCommentCountChange?.(totalCommentCount);
  }, [onCommentCountChange, totalCommentCount]);

  useEffect(() => {
    if (commentEntries.length === 0 && totalCommentCount === 0 && persistedCommentEntries.length > 0) {
      return;
    }
    onCommentsChange?.(commentEntries);
  }, [commentEntries, onCommentsChange, persistedCommentEntries.length, totalCommentCount]);

  useEffect(() => {
    let frameId = requestAnimationFrame(() => {
      updateEditedLinesState();
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [displayRows.length, updateEditedLinesState]);

  useEffect(() => {
    if (!hasPendingEnhanceChanges) {
      onPendingEnhanceStateChange?.(false);
      return;
    }
    // Debounce `true` to filter out transient firings from the morph animation.
    // Real user edits stay `true` for longer and will pass through.
    const timer = setTimeout(() => {
      onPendingEnhanceStateChange?.(true);
    }, 400);
    return () => clearTimeout(timer);
  }, [hasPendingEnhanceChanges, onPendingEnhanceStateChange]);

  useEffect(() => () => {
    onPendingEnhanceStateChange?.(false);
  }, [onPendingEnhanceStateChange]);

  useEffect(() => {
    onUiStateChange?.({
      breakpointKeys,
    });
  }, [breakpointKeys, onUiStateChange]);

  useEffect(() => {
    setBreakpoints((prev) => {
      const validKeys = new Set(rowMetaList.map((rowMeta) => rowMeta.stableKey));
      const next = new Set(Array.from(prev).filter((rowKey) => validKeys.has(rowKey)));
      if (next.size === prev.size && Array.from(prev).every((rowKey) => next.has(rowKey))) {
        return prev;
      }
      return next;
    });

    if (commentPopup?.rowKey && !rowMetaByKey.has(commentPopup.rowKey)) {
      setCommentPopup(null);
    }

    if (intentionPopup?.rowKey && !rowMetaByKey.has(intentionPopup.rowKey)) {
      setIntentionPopup(null);
    }

    if (activeIssueRowKey && !rowMetaByKey.has(activeIssueRowKey)) {
      setActiveIssueRowKey(null);
    }

    if (navigatedIssueRowKey && !rowMetaByKey.has(navigatedIssueRowKey)) {
      setNavigatedIssueRowKey(null);
    }

    if (focusedCommentRowKey && !rowMetaByKey.has(focusedCommentRowKey)) {
      setFocusedCommentRowKey(null);
    }
  }, [
    activeIssueRowKey,
    commentPopup?.rowKey,
    focusedCommentRowKey,
    intentionPopup?.rowKey,
    navigatedIssueRowKey,
    rowMetaByKey,
    rowMetaList,
  ]);

  useEffect(() => {
    setActiveIssueRowKey(null);
    setNavigatedIssueRowKey(null);
    setFocusedCommentRowKey(null);
    setCommentPopup(null);
    setIntentionPopup(null);
  }, [displayRows.length]);

  const previousCommentResetTokenRef = useRef(commentResetToken);
  useEffect(() => {
    if (previousCommentResetTokenRef.current === commentResetToken) {
      return;
    }

    previousCommentResetTokenRef.current = commentResetToken;

    baselineCommentSessionKeyRef.current = `${normalizedCode}::${commentResetToken}`;
    baselineCommentSignatureRef.current = buildRowCommentsSignature({});
    setRowComments({});
    setDeletedRowKeys(new Set());
    setClearedRowKeys(new Set());
    setHasEditedLines(false);
    setCommentPopup(null);
    setSelectionToolbarPos(null);
    setActiveIssueRowKey(null);
    setNavigatedIssueRowKey(null);
    setFocusedCommentRowKey(null);
    pendingFocusRowKeyRef.current = null;
    pendingFocusNextRowKeyRef.current = null;
  }, [commentResetToken, normalizedCode]);

  useEffect(() => {
    if (!Number.isInteger(highlightedProblemRowIndex)) return undefined;

    const matchingRow = rowMetaList.find((rowMeta) => rowMeta.rowIndex === highlightedProblemRowIndex);
    if (matchingRow?.stableKey) {
      setActiveIssueRowKey(matchingRow.stableKey);
      setNavigatedIssueRowKey(matchingRow.stableKey);
    }

    return undefined;
  }, [highlightedProblemRowIndex, highlightedProblemLocation?.requestKey, rowMetaList]);

  return (
    <>
    <div className={`spec-done-overlay${shouldRenderSuccessBanner ? ' has-top-banner has-success-banner' : ''}`}>
      {shouldRenderSuccessBanner && (
        <DoneSuccessBanner
          message={successBannerMessage}
          onAddToProjectContext={projectContextFile
            ? () => {
                onAddToProjectContext?.(projectContextFile);
                setProjectContextBannerDismissed(true);
              }
            : null}
        />
      )}
      <DoneInspectionWidget
        onOpenProblems={onOpenProblems}
        onNavigatePreviousIssue={() => navigateInspectionIssue(-1)}
        onNavigateNextIssue={() => navigateInspectionIssue(1)}
        warningCount={inspectionSummary?.warningCount ?? 0}
        errorCount={inspectionSummary?.errorCount ?? 0}
        commentCount={totalCommentCount}
        versions={versionHistory?.versions ?? []}
        onVersionSelect={onOpenVersionDiff}
      />
      <div className="spec-done-scroll" data-overlay-scroll-body="true" ref={scrollRef}>
        {rowMetaList.map((rowMeta) => {
            const {
              rowIndex,
              stableKey,
              line,
              headingTitle,
              sectionMeta,
              showRunIcon,
              currentSectionTitle,
              checkStatus,
              planStatus,
              checkTarget,
              issueSeverity,
              issueTarget,
              proposalOptions,
            } = rowMeta;
            // Row deleted by user — render invisible ghost so snapshot can record empty line
            if (deletedRowKeys.has(stableKey)) {
              return (
                <div
                  key={stableKey}
                  className="spec-done-row"
                  data-row-key={stableKey}
                  data-raw-index={Number.isInteger(rowMeta.rawIndex) ? rowMeta.rawIndex : undefined}
                  data-deleted="true"
                  style={{ display: 'none' }}
                />
              );
            }

            // Row cleared (prefix/checkbox stripped) — treat as empty line
            const effectiveLine = clearedRowKeys.has(stableKey) ? '' : rowMeta.line;
            const effectiveCheckStatus = clearedRowKeys.has(stableKey) ? null : checkStatus;
            const effectivePlanStatus = clearedRowKeys.has(stableKey) ? null : planStatus;
            const effectiveIssueSeverity = clearedRowKeys.has(stableKey) ? null : issueSeverity;
            const effectiveIssueTarget = clearedRowKeys.has(stableKey) ? null : issueTarget;
            const effectiveCheckTarget = clearedRowKeys.has(stableKey) ? null : checkTarget;
            const isRunOutdated = Boolean(effectiveCheckStatus?.isOutdated || effectivePlanStatus?.isOutdated);

            const rowCommentKey = getRowMetaCommentStorageKey(rowMeta);
            const isIssuePopupOpen = intentionPopup?.rowKey === stableKey;
            const isCommentPopupOpen = commentPopup?.rowKey === stableKey;
            const isNavigatedIssueRow = navigatedIssueRowKey === stableKey;
            const hasIssueBulb = Boolean(effectiveIssueSeverity);
            const isProblemHighlightedRow = highlightedProblemRowIndex === rowIndex;
            const showIssueBulb = hasIssueBulb && isProblemHighlightedRow;
            const hasRunnableGutterAction = showRunIcon;
            const showIssueLineHighlight = Boolean(effectiveIssueSeverity) && (activeIssueRowKey === stableKey || isNavigatedIssueRow || isIssuePopupOpen || isProblemHighlightedRow);
            const commentsForRow = rowComments[rowCommentKey] ?? getCommentsForCommentTarget(
              persistedCommentEntries,
              rowMeta.checkTarget ?? rowMeta.issueTarget,
            );
            const commentCount = commentsForRow.length;
            const hasPlanComment = effectiveCheckTarget?.kind === 'plan'
              && Number.isInteger(effectiveCheckTarget.index)
              && commentedPlanOriginalIndices.has(effectiveCheckTarget.index);
            const isUpdatedSpecRow = Boolean(
              updatedRowTarget?.kind
              && effectiveCheckTarget?.kind === updatedRowTarget.kind
              && effectiveCheckTarget?.index === updatedRowTarget.index
            );
            const isRestoringPlanRow = effectiveCheckTarget?.kind === 'plan'
              && effectivePlanStatus?.status === 'pending'
              && !hasPlanComment;
            const isEmptyLine = !effectiveLine.trim();
            const demoTargetId = formatDemoTargetId(effectiveIssueTarget ?? effectiveCheckTarget);
            const renderCommentAdornment = () => (
              <DoneCommentAdornment
                comments={commentsForRow}
                isOpen={isCommentPopupOpen}
                demoId={demoTargetId ? `spec-comment-${demoTargetId}` : null}
                onOpen={(rect) => {
                  setCommentPopup((prev) => (
                    prev?.rowKey === stableKey
                      ? null
                      : {
                          rowKey: stableKey,
                          rowCommentKey,
                          rowIndex,
                          rect,
                          value: '',
                          editingIndex: null,
                        }
                  ));
                }}
              />
            );
            const showGutterCommentAdornment = commentCount > 0;
            const showInlineCommentAdornment = !hasPlanWorkflowMeta && !suppressInlineCommentAdornment && !showGutterCommentAdornment && !isProblemHighlightedRow && (focusedCommentRowKey === stableKey || isCommentPopupOpen
              || (isEmptyLine && hoveredRowKey === stableKey)
              || activeIssueRowKey === stableKey
              || isNavigatedIssueRow);
            const commentAdornment = showInlineCommentAdornment ? renderCommentAdornment() : null;
            return (
            <Fragment key={stableKey}>
            <div
              className={`spec-done-row${rowMeta.isTopLevelAcItem ? ' spec-done-row-ac-item' : ''}${rowMeta.isFirstTopLevelAcItem ? ' spec-done-row-ac-item-first' : ''}${rowMeta.isTopLevelPlanParent ? ' spec-done-row-plan-parent' : ''}${rowMeta.isFirstTopLevelPlanParent ? ' spec-done-row-plan-parent-first' : ''}${rowMeta.isFlatTopLevelPlanParent ? ' spec-done-row-plan-parent-flat' : ''}${rowMeta.isNestedPlanChild ? ' spec-done-row-plan-child' : ''}${rowMeta.isFirstNestedPlanChild ? ' spec-done-row-plan-child-first' : ''}${isRestoringPlanRow ? ' spec-done-row-plan-restoring' : ''}${isUpdatedSpecRow && updatedRowTarget?.phase === 'fixing' ? ' spec-done-row-fixing' : ''}${isUpdatedSpecRow && updatedRowTarget?.phase !== 'fixing' ? ' spec-done-row-updated' : ''}${showIssueLineHighlight ? ' spec-done-issue-row' : ''}${isProblemHighlightedRow ? ' spec-done-problems-row' : ''}${isRunOutdated ? ' spec-done-run-outdated-row' : ''}`}
              data-row-index={rowIndex}
              data-row-key={stableKey}
              data-demo-id={demoTargetId ? `spec-row-${demoTargetId}` : undefined}
              data-raw-index={Number.isInteger(rowMeta.rawIndex) ? rowMeta.rawIndex : undefined}
              data-issue-severity={effectiveIssueSeverity ?? ''}
              data-run-outdated={isRunOutdated ? 'true' : undefined}
              data-cleared={clearedRowKeys.has(stableKey) ? 'true' : undefined}
              onMouseEnter={() => setHoveredRowKey(stableKey)}
              onMouseLeave={() => {
                setHoveredRowKey(null);
              }}
              onClick={(e) => {
                if (e.target.closest('.spec-done-comment-adornment') || e.target.closest('.spec-done-ref-chip-list') || e.target.closest('.spec-done-gutter-intention-btn') || e.target.closest('.spec-done-gutter-item-run-btn') || e.target.closest('.spec-done-gutter-breakpoint-btn')) {
                  return;
                }
                setSuppressInlineCommentAdornment(false);

                if (isEmptyLine) {
                  // Focus the caret editable when clicking anywhere in the empty row.
                  const editable = e.currentTarget.querySelector('.spec-done-line-empty-editable');
                  editable?.focus();
                  return;
                }

                const targetEditable = e.target instanceof Element
                  ? e.target.closest('[contenteditable]')
                  : null;
                if (targetEditable instanceof HTMLElement) {
                  targetEditable.focus({ preventScroll: true });
                } else {
                  focusDoneRowEditable(rowIndex);
                }

                if (effectiveIssueSeverity) {
                  setActiveIssueRowKey(stableKey);
                  setNavigatedIssueRowKey(stableKey);
                }
              }}
            >
              <div className={`editor-gutter-row spec-done-gutter-cell${showRunIcon ? ' spec-done-gutter-cell-section-run' : ''}`}>
                {hasRunnableGutterAction ? (
                  <DoneInlineRunButton
                    demoId={demoTargetId ? `spec-run-${demoTargetId}` : null}
                    title={showRunIcon ? 'Open Terminal' : (effectiveCheckTarget?.kind === 'ac' ? 'Build acceptance criterion' : 'Build plan item')}
                    onRun={() => onOpenTerminal?.(showRunIcon
                      ? {
                          sectionTitle: headingTitle,
                          commentEntries,
                        }
                      : {
                          sectionTitle: currentSectionTitle,
                          checkTarget: effectiveCheckTarget,
                        })}
                  />
                ) : showIssueBulb ? (
                  <span
                    className="spec-done-gutter-intention-btn spec-done-gutter-intention-indicator"
                    aria-label="Selected problem"
                    data-demo-id={demoTargetId ? `spec-issue-actions-${demoTargetId}` : undefined}
                  >
                    <Icon name="codeInsight/intentionBulb" size={16} />
                  </span>
                ) : showGutterCommentAdornment ? (
                  <span className="spec-done-gutter-comment-slot">
                    {renderCommentAdornment()}
                  </span>
                ) : (
                  <span className="spec-done-gutter-slot" aria-hidden="true" />
                )}
                <span className="spec-done-gutter-slot" aria-hidden="true" />
              </div>
              <div
                className="spec-done-row-content"
                data-cleared={clearedRowKeys.has(stableKey) ? 'true' : undefined}
              >
                {renderDoneLine(
                  effectiveLine,
                  `line-${stableKey}`,
                  addPopupFiles,
                  attachedFiles,
                  effectiveCheckStatus,
                  sectionMeta,
                  effectivePlanStatus,
                  showIssueLineHighlight,
                  commentAdornment,
                  effectiveIssueTarget,
                  onOpenDiffTab,
                  effectiveCheckTarget,
                  currentSectionTitle,
                  activeRunRequest,
                  rowMeta.nestingLevel ?? 0,
                  null,
                  () => {
                    if (effectiveCheckTarget?.kind === 'plan') {
                      onUserInput?.();
                    }
                  },
                  hasPlanComment,
                  onPlanWorkflowSelect,
                  onPlanWorkflowOpen,
                  onPlanWorkflowRemove,
                )}
              </div>
            </div>
          </Fragment>
        );
        })}
      </div>
    </div>
    {refPopupPos && createPortal(
      <>
        <div className="add-popup-overlay" onMouseDown={() => setRefPopupPos(null)} />
        <CompletionPopup
          trigger="@"
          query={refCmpQuery}
          selectedIdx={refCmpSelectedIdx}
          onSelect={(item) => {
            if (refSpanRef.current) refSpanRef.current.textContent = `@${getCompletionInsertText(item)}`;
            setRefPopupPos(null);
          }}
          onClose={() => setRefPopupPos(null)}
          style={{ position: 'fixed', top: refPopupPos.top, left: refPopupPos.left }}
        />
      </>,
      document.body
    )}
    {doneCmpPos && createPortal(
      <>
        <div className="add-popup-overlay" onMouseDown={() => setDoneCmpPos(null)} />
        <CompletionPopup
          trigger="@"
          query={doneCmpPos.query ?? ''}
          selectedIdx={doneCmpSelectedIdx}
          onSelect={(item) => { applyDoneCompletion(item); setDoneCmpPos(null); }}
          onClose={() => setDoneCmpPos(null)}
          style={{ position: 'fixed', top: doneCmpPos.top, left: doneCmpPos.left, right: doneCmpPos.right }}
        />
      </>,
      document.body
    )}
    {commentPopup && (
      <PositionedPopup triggerRect={commentPopup.rect} onDismiss={() => closeCommentPopup()} gap={8}>
        <DoneCommentPopup
          comments={rowComments[commentPopup.rowCommentKey] ?? []}
          value={commentPopup.value}
          editingIndex={commentPopup.editingIndex ?? null}
          onChange={(nextValue) => {
            setCommentPopup((prev) => (prev ? { ...prev, value: nextValue } : prev));
          }}
          onStartEdit={(commentIndex) => handleCommentEditStart(commentPopup.rowKey, commentPopup.rowCommentKey, commentIndex)}
          onDelete={(commentIndex) => handleCommentDelete(commentPopup.rowKey, commentPopup.rowCommentKey, commentIndex)}
          onCancel={() => closeCommentPopup(commentPopup.rowIndex)}
          onSubmit={handleCommentSubmit}
        />
      </PositionedPopup>
    )}
    <SpecSelectionToolbar position={selectionToolbarPos} onAction={handleSelectionToolbarAction} />
    {intentionPopup && intentionPopupPosition && createPortal(
      <>
        <div className="spec-done-intention-popup-overlay" onMouseDown={closeIntentionPopup} />
        <div
          className="spec-done-intention-popup-singleton"
          style={{ top: intentionPopupPosition.top, left: intentionPopupPosition.left }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <DoneIssueIntentionPopup
            severity={intentionPopup.severity}
            canFixIssue={Boolean(intentionPopup.issueTarget)}
            issueTarget={intentionPopup.issueTarget}
            proposalOptions={intentionPopup.proposalOptions}
            onOpenProblems={onOpenProblems}
            onRegenerateSpec={onRegenerateSpec}
            onFixIssue={() => {
              if (intentionPopup.issueTarget) {
                onFixIssue?.(intentionPopup.issueTarget);
              }
            }}
            onClose={closeIntentionPopup}
          />
        </div>
      </>,
      document.body
    )}
    </>
  );
}

function AgentTaskOverlayShell({
  toolbar,
  children,
  lineNumber = 1,
  hasBreakpoint = false,
  onToggleBreakpoint,
}) {
  const shellRef = useRef(null);
  const gutterScrollRef = useRef(null);
  const [trackHeight, setTrackHeight] = useState(0);

  useEffect(() => {
    const shellEl = shellRef.current;
    const gutterScrollEl = gutterScrollRef.current;
    if (!shellEl || !gutterScrollEl) return;

    const scrollBodyEl = shellEl.querySelector('[data-overlay-scroll-body="true"]');
    if (!scrollBodyEl) {
      setTrackHeight(gutterScrollEl.clientHeight);
      return;
    }

    const syncScroll = () => {
      gutterScrollEl.scrollTop = scrollBodyEl.scrollTop;
    };

    const measure = () => {
      const nextHeight = Math.max(scrollBodyEl.scrollHeight, gutterScrollEl.clientHeight);
      setTrackHeight(prev => (prev === nextHeight ? prev : nextHeight));
      syncScroll();
    };

    measure();
    scrollBodyEl.addEventListener('scroll', syncScroll, { passive: true });

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(scrollBodyEl);
      Array.from(scrollBodyEl.children).forEach(child => resizeObserver.observe(child));
    }

    window.addEventListener('resize', measure);

    return () => {
      scrollBodyEl.removeEventListener('scroll', syncScroll);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children]);

  return (
    <div className="agent-task-overlay-shell" ref={shellRef}>
      {toolbar}
      <div className="agent-task-overlay-editor-body">
        <div className="editor-gutter agent-task-overlay-gutter">
          <div className="agent-task-overlay-gutter-scroll" ref={gutterScrollRef}>
            <div
              className="editor-gutter-inner agent-task-overlay-gutter-track"
              style={trackHeight ? { minHeight: `${trackHeight}px` } : undefined}
            >
              <div className="editor-gutter-row">
                <div
                  className={`editor-gutter-line-number${hasBreakpoint ? ' breakpoint' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={hasBreakpoint ? 'Remove breakpoint' : 'Add breakpoint'}
                  onClick={onToggleBreakpoint}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onToggleBreakpoint?.();
                    }
                  }}
                >
                  {hasBreakpoint ? (
                    <span className="editor-breakpoint-dot" />
                  ) : (
                    <span className="editor-line-num">{lineNumber}</span>
                  )}
                </div>
              </div>
              <div className="agent-task-overlay-gutter-filler" />
            </div>
          </div>
        </div>
        <div className="agent-task-overlay-content">
          {children}
        </div>
      </div>
    </div>
  );
}

function FollowUpToolbar({ taskText, onRegenerate, onTaskTextChange }) {
  return (
    <div className="agent-task-toolbar">
      <div className="agent-task-toolbar-gradient" />
      <div className="agent-task-toolbar-content">
        <div className="agent-task-toolbar-left">
          <AgentTaskTopBarIcon style={{ flexShrink: 0 }} />
          <span className="at-task-text">{taskText || 'New Task.md'}</span>
        </div>
        <div className="agent-task-toolbar-right">
          {/* Restart icon button */}
          <button className="at-icon-btn" title="Restart">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7A5 5 0 0 0 7 12 5 5 0 0 0 12 7 5 5 0 0 0 7 2" stroke="#CED0D6" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M7 2L4.5 4.5 7 7" stroke="#CED0D6" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {/* Specify button */}
          <button className="fu-regenerate-btn" onClick={onRegenerate}>Specify</button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Task Editor Area ───────────────────────────────────────────────────

function AttachedFileChip({ label, onRemove, onClick = null, className = '' }) {
  return (
    <div
      className={`attached-file-chip${onClick ? ' is-clickable' : ''}${className ? ` ${className}` : ''}`}
      contentEditable={false}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ?? undefined}
      onKeyDown={onClick ? ((event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick(event);
        }
      }) : undefined}
    >
      <IconMdTask />
      <span className="attached-file-label">{label}</span>
      {onRemove && (
        <button type="button" className="attached-file-remove" onClick={onRemove}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function AgentTaskTopBarIcon({ style, animated = false }) {
  const gradientId = useId();

  return (
    <svg className={animated ? 'agent-task-topbar-icon is-animated' : 'agent-task-topbar-icon'} width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
      <path d="M13.2701 19.13C14.0501 19.13 14.6901 18.5 14.6901 17.71C14.6901 16.92 14.0601 16.29 13.2701 16.29C12.4801 16.29 11.8501 16.92 11.8501 17.71C11.8501 18.5 12.4801 19.13 13.2701 19.13Z" fill={`url(#${gradientId})`} />
      <path d="M10.4202 17.71C6.0202 17.71 2.4502 14.26 2.4502 10C2.4502 5.74004 6.0202 2.29004 10.4202 2.29004" stroke={`url(#${gradientId})`} strokeWidth="1.5" />
      <path d="M17.34 7.87004C17.34 10.86 14.35 13.45 10.43 13.45C6.51002 13.45 3.52002 10.86 3.52002 7.87004C3.52002 4.88004 6.51002 2.29004 10.43 2.29004C14.35 2.29004 17.34 4.88004 17.34 7.87004Z" stroke={`url(#${gradientId})`} strokeWidth="1.5" />
      <defs>
        <linearGradient id={gradientId} x1="3.11034" y1="4.46608" x2="21.2559" y2="17.3374" gradientUnits="userSpaceOnUse">
          <stop stopColor="#955AE0" />
          <stop offset="1" stopColor="#4D67F0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function AgentTaskEditorArea({ genState, genProgress, onSend, onStop, onRegenerate, onDoneRegenerate, onFixIssue, onOpenDiffTab, onOpenVersionDiff, attachedFiles, onRemoveAttached, onAddAttached, currentCode, documentSections, onOpenProblems, onOpenTerminal, addPopupFiles, acRunResult, planRunResult, acWarningBanner, inspectionSummary, versionHistory = null, removedIssueIndices, highlightedProblemLocation = null, updatedRowTarget = null, doneCommentEntries = [], onDoneCommentsChange, commentResetToken = 0, preserveDoneOverlayDuringBusy = false, runState = 'default', activeRunRequest = null, doneOverlayUiState = null, onDoneOverlayUiStateChange = null, specSessionKey = null, specTabLabel = '', pendingAcQuickFixCount = 0, onPlanWorkflowSelect = null, onPlanWorkflowOpen = null, onPlanWorkflowRemove = null }) {
  const [value, setValue] = useState('');
  const [taskText, setTaskText] = useState('');
  const [hasBreakpoint, setHasBreakpoint] = useState(false);
  const [completion, setCompletion] = useState(null); // { trigger, query, selectedIdx }
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [popupPos, setPopupPos] = useState(null);
  const [cmpPos, setCmpPos] = useState(null);
  const [doneOverlayHost, setDoneOverlayHost] = useState(null);
  const [hasPendingDoneEnhanceChanges, setHasPendingDoneEnhanceChanges] = useState(false);
  const [doneEnhanceLocksBySession, setDoneEnhanceLocksBySession] = useState({});
  const [doneEnhanceHintRect, setDoneEnhanceHintRect] = useState(null);
  const [isDoneEnhanceHintDismissing, setIsDoneEnhanceHintDismissing] = useState(false);
  const [doneEnhanceHintArrowPosition, setDoneEnhanceHintArrowPosition] = useState('top');
  const [isDoneToolbarInputFocused, setIsDoneToolbarInputFocused] = useState(false);
  const [isToolbarInputMultiline, setIsToolbarInputMultiline] = useState(false);
  const addBtnRef = useRef(null);
  const doneEnhanceBtnRef = useRef(null);
  const prevDoneCommentCountRef = useRef(0);
  const prevAttachedFileCountRef = useRef(Array.isArray(attachedFiles) ? attachedFiles.length : 0);
  const prevNullSlotCountRef = useRef(0);
  const doneEnhanceBadgeRef = useRef(null);
  const suppressEnhanceBadgeRef = useRef(false);
  const allowDoneEnhanceAttentionRef = useRef(false);
  const suppressEnhanceBadgeTimerRef = useRef(0);
  const skipNextDoneEnhanceBaselineResetCountRef = useRef(0);
  const doneEnhanceHintFrameRef = useRef(0);
  const previousDoneEnhanceHintVisibilityRef = useRef(false);
  const toolbarRef = useRef(null);
  const textareaRef = useRef(null);
  const doneTitleHydratedRef = useRef(false);
  const doneInputFocusFrameRef = useRef(0);
  const toolbarPlaceholder = 'Describe your task for an agent or create an .md file';
  const goalTitle = extractGoalTitleFromMarkdown(currentCode) || toolbarPlaceholder;
  const hasToolbarText = value.trim().length > 0;
  const collapsedDoneToolbarText = hasToolbarText ? value.replace(/\s+/g, ' ').trim() : toolbarPlaceholder;
  const isDoneToolbarInputCollapsed = genState === 'done' && (!TOOLBAR_INPUT_IS_EDITABLE || !isDoneToolbarInputFocused);
  const showLoadingState = AGENT_TASK_LOADING_STATE_ENABLED && genState === 'loading';
  const showGeneratingState = AGENT_TASK_GENERATING_STATE_ENABLED && genState === 'generating';
  const shouldRenderDoneOverlay = genState === 'done' || preserveDoneOverlayDuringBusy;
  const doneEnhanceSessionKey = specSessionKey ?? '__default__';
  const isDoneEnhanceLocked = Boolean(doneEnhanceLocksBySession[doneEnhanceSessionKey]);
  const hasPendingQuickFixRerun =
    (Array.isArray(planRunResult) && planRunResult.some((status) => status === null)) ||
    (pendingAcQuickFixCount > 0);
  const hasPendingSpecifyChanges = hasPendingDoneEnhanceChanges || hasPendingQuickFixRerun;
  const shouldShowDoneEnhanceHint = genState === 'done'
    && runState !== 'running'
    && hasPendingSpecifyChanges
    && !isDoneEnhanceLocked;
  const isDoneEnhanceEnabled = genState === 'done'
    && hasPendingSpecifyChanges
    && !isDoneEnhanceLocked;
  const setDoneEnhanceLockedForSession = useCallback((locked) => {
    setDoneEnhanceLocksBySession((prev) => {
      const isCurrentlyLocked = Boolean(prev[doneEnhanceSessionKey]);
      if (isCurrentlyLocked === locked) {
        return prev;
      }
      if (locked) {
        return {
          ...prev,
          [doneEnhanceSessionKey]: true,
        };
      }
      const next = { ...prev };
      delete next[doneEnhanceSessionKey];
      return next;
    });
  }, [doneEnhanceSessionKey]);
  const liftDoneEnhanceSuppression = useCallback(() => {
    if (!suppressEnhanceBadgeRef.current) return;
    if (suppressEnhanceBadgeTimerRef.current) {
      clearTimeout(suppressEnhanceBadgeTimerRef.current);
      suppressEnhanceBadgeTimerRef.current = 0;
    }
    suppressEnhanceBadgeRef.current = false;
  }, []);
  const resetDoneEnhanceAttention = useCallback((suppressMs = 2000) => {
    setHasPendingDoneEnhanceChanges(false);
    setDoneEnhanceHintRect(null);
    setIsDoneEnhanceHintDismissing(false);
    setDoneEnhanceHintArrowPosition('top');
    previousDoneEnhanceHintVisibilityRef.current = false;
    allowDoneEnhanceAttentionRef.current = false;

    if (suppressEnhanceBadgeTimerRef.current) {
      clearTimeout(suppressEnhanceBadgeTimerRef.current);
      suppressEnhanceBadgeTimerRef.current = 0;
    }

    suppressEnhanceBadgeRef.current = true;
    suppressEnhanceBadgeTimerRef.current = setTimeout(() => {
      suppressEnhanceBadgeRef.current = false;
      suppressEnhanceBadgeTimerRef.current = 0;
    }, suppressMs);
  }, []);

  useEffect(() => {
    if (genState === 'idle') {
      setValue('');
      setHasBreakpoint(false);
      setIsDoneToolbarInputFocused(false);
      setIsToolbarInputMultiline(false);
      doneTitleHydratedRef.current = false;
      return;
    }

    if (genState !== 'done') {
      setIsDoneToolbarInputFocused(false);
      doneTitleHydratedRef.current = false;
    }
  }, [genState]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const MAX_H = 160;

    if (isDoneToolbarInputCollapsed) {
      ta.style.height = '18px';
      ta.style.overflowY = 'hidden';
      setIsToolbarInputMultiline(false);
      return;
    }

    const LINE_H = 18;
    const lines = value ? value.split('\n').length : 1;
    const h = Math.min(lines * LINE_H, MAX_H);
    ta.style.height = h + 'px';
    ta.style.overflowY = lines * LINE_H > MAX_H ? 'auto' : 'hidden';
    setIsToolbarInputMultiline(h > LINE_H);
  }, [value, genState, isDoneToolbarInputCollapsed]);

  useEffect(() => {
    if (!TOOLBAR_INPUT_IS_EDITABLE) return;
    if (genState !== 'idle') return;
    if (doneInputFocusFrameRef.current) {
      cancelAnimationFrame(doneInputFocusFrameRef.current);
    }
    doneInputFocusFrameRef.current = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!(ta instanceof HTMLTextAreaElement)) return;
      ta.focus({ preventScroll: true });
      const nextCaretPos = ta.value.length;
      ta.setSelectionRange(nextCaretPos, nextCaretPos);
    });
  }, [genState]);

  useEffect(() => () => {
    if (doneInputFocusFrameRef.current) {
      cancelAnimationFrame(doneInputFocusFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (doneEnhanceHintFrameRef.current) {
      cancelAnimationFrame(doneEnhanceHintFrameRef.current);
    }
    if (suppressEnhanceBadgeTimerRef.current) {
      clearTimeout(suppressEnhanceBadgeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (genState !== 'done') return;
    doneTitleHydratedRef.current = false;
  }, [genState, currentCode]);

  useEffect(() => {
    prevAttachedFileCountRef.current = Array.isArray(attachedFiles) ? attachedFiles.length : 0;
  }, [genState, specSessionKey]);

  useEffect(() => {
    if (genState !== 'done' || doneTitleHydratedRef.current) return;
    doneTitleHydratedRef.current = true;
    if (!value.trim()) {
      setValue(VISIT_BOOKING_PROMPT_TEXT);
    }
  }, [genState, value]);

  useEffect(() => {
    if (completion && toolbarRef.current) {
      const r = toolbarRef.current.getBoundingClientRect();
      const left = r.left + 12;
      const width = Math.min(453, window.innerWidth - left - 8);
      setCmpPos({ top: r.bottom, left, width });
    } else {
      setCmpPos(null);
    }
  }, [!!completion]);

  useEffect(() => {
    if (!shouldRenderDoneOverlay || !toolbarRef.current) {
      setDoneOverlayHost(null);
      return undefined;
    }

    let frameId = 0;

    frameId = requestAnimationFrame(() => {
      const editorEl = toolbarRef.current?.closest('.editor');
      const nextHost = editorEl?.querySelector('.editor-body');
      setDoneOverlayHost(nextHost instanceof HTMLElement ? nextHost : null);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [shouldRenderDoneOverlay]);

  useEffect(() => {
    if (!shouldRenderDoneOverlay) {
      setHasPendingDoneEnhanceChanges(false);
    }
  }, [shouldRenderDoneOverlay]);

  useEffect(() => {
    if (doneEnhanceHintFrameRef.current) {
      cancelAnimationFrame(doneEnhanceHintFrameRef.current);
      doneEnhanceHintFrameRef.current = 0;
    }
    if (!shouldShowDoneEnhanceHint) {
      previousDoneEnhanceHintVisibilityRef.current = false;
      setDoneEnhanceHintRect(null);
      setDoneEnhanceHintArrowPosition('top');
      return;
    }

    if (previousDoneEnhanceHintVisibilityRef.current) {
      return;
    }

    previousDoneEnhanceHintVisibilityRef.current = true;

    const captureRect = () => {
      const triggerEl = doneEnhanceBadgeRef.current ?? doneEnhanceBtnRef.current;
      if (!(triggerEl instanceof HTMLElement)) return;
      const rect = triggerEl.getBoundingClientRect();
      setDoneEnhanceHintArrowPosition(
        rect.bottom + 156 > window.innerHeight ? 'bottom' : 'top'
      );
      const leftShift = 0;
      setDoneEnhanceHintRect({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left - leftShift,
        right: rect.right - leftShift,
      });
    };

    doneEnhanceHintFrameRef.current = requestAnimationFrame(() => {
      doneEnhanceHintFrameRef.current = 0;
      const triggerEl = doneEnhanceBadgeRef.current ?? doneEnhanceBtnRef.current;
      if (!(triggerEl instanceof HTMLElement)) return;
      const rect = triggerEl.getBoundingClientRect();

      // If the trigger is outside the viewport, scroll it into view first,
      // then capture its updated rect after the scroll settles.
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        triggerEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(captureRect, 400);
      } else {
        captureRect();
      }
    });
  }, [shouldShowDoneEnhanceHint]);

  useEffect(() => {
    if (!doneEnhanceHintRect) {
      setIsDoneEnhanceHintDismissing(false);
      return;
    }
    const outTimer = setTimeout(() => setIsDoneEnhanceHintDismissing(true), 7000);
    const clearTimer = setTimeout(() => setDoneEnhanceHintRect(null), 7200);
    return () => {
      clearTimeout(outTimer);
      clearTimeout(clearTimer);
    };
  }, [doneEnhanceHintRect]);

  useEffect(() => {
    if (skipNextDoneEnhanceBaselineResetCountRef.current > 0) {
      skipNextDoneEnhanceBaselineResetCountRef.current -= 1;
      return;
    }
    // Any freshly applied done-state spec becomes the new baseline. Wait for
    // new user edits before showing the Enhance badge/popup again.
    resetDoneEnhanceAttention(2000);
    // Re-snapshot the current null-slot count so that returning to this tab
    // (same nulls, new reference) doesn't re-trigger the badge.
    const currentNullCount =
      Array.isArray(planRunResult) ? planRunResult.filter((s) => s === null).length : 0;
    prevNullSlotCountRef.current = currentNullCount;
  }, [commentResetToken, currentCode, planRunResult, resetDoneEnhanceAttention, specSessionKey]);

  // When a plan quick fix is applied the affected run-result slot is set to null.
  // Treat that as a pending change so the Enhance badge + popup appear.
  // Track the null-slot count so that tab switches (same nulls, new reference)
  // don't re-trigger the badge — only genuinely new null slots do.
  useEffect(() => {
    const nullCount =
      Array.isArray(planRunResult) ? planRunResult.filter((s) => s === null).length : 0;
    if (nullCount > prevNullSlotCountRef.current) {
      setTimeout(() => {
        if (isDoneEnhanceLocked) {
          setDoneEnhanceLockedForSession(false);
        }
        liftDoneEnhanceSuppression();
        allowDoneEnhanceAttentionRef.current = true;
        setHasPendingDoneEnhanceChanges(true);
      }, 0);
    }
    prevNullSlotCountRef.current = nullCount;
  }, [isDoneEnhanceLocked, liftDoneEnhanceSuppression, planRunResult, setDoneEnhanceLockedForSession]);

  // When a comment arrives from outside (e.g. from the diff view) the baseline
  // inside DoneMarkdownOverlay already matches, so hasPendingCommentChanges
  // stays false. Detect the increase in total comment count here instead.
  useEffect(() => {
    const totalCount = Array.isArray(doneCommentEntries)
      ? doneCommentEntries.reduce((sum, e) => sum + (Array.isArray(e.comments) ? e.comments.length : 0), 0)
      : 0;
    if (totalCount > prevDoneCommentCountRef.current) {
      // New comment added - unlock session and trigger enhance
      // Use setTimeout to ensure state updates are processed
      setTimeout(() => {
        if (isDoneEnhanceLocked) {
          setDoneEnhanceLockedForSession(false);
        }
        liftDoneEnhanceSuppression();
        allowDoneEnhanceAttentionRef.current = true;
        setHasPendingDoneEnhanceChanges(true);
      }, 0);
    }
    prevDoneCommentCountRef.current = totalCount;
  }, [doneCommentEntries, isDoneEnhanceLocked, liftDoneEnhanceSuppression, setDoneEnhanceLockedForSession]);

  useEffect(() => {
    if (genState !== 'done') return;

    const attachedFileCount = Array.isArray(attachedFiles) ? attachedFiles.length : 0;
    if (attachedFileCount > prevAttachedFileCountRef.current) {
      setTimeout(() => {
        if (isDoneEnhanceLocked) {
          setDoneEnhanceLockedForSession(false);
        }
        liftDoneEnhanceSuppression();
        allowDoneEnhanceAttentionRef.current = true;
        setHasPendingDoneEnhanceChanges(true);
      }, 0);
    }
    prevAttachedFileCountRef.current = attachedFileCount;
  }, [attachedFiles, genState, isDoneEnhanceLocked, liftDoneEnhanceSuppression, setDoneEnhanceLockedForSession]);

  useEffect(() => {
    if (genState !== 'done' || pendingAcQuickFixCount <= 0) return;

    if (isDoneEnhanceLocked) {
      setDoneEnhanceLockedForSession(false);
    }
    liftDoneEnhanceSuppression();
    allowDoneEnhanceAttentionRef.current = true;
  }, [genState, isDoneEnhanceLocked, liftDoneEnhanceSuppression, pendingAcQuickFixCount, setDoneEnhanceLockedForSession]);

  const handlePendingEnhanceStateChange = useCallback((pending) => {
    if (!pending && hasPendingQuickFixRerun && !isDoneEnhanceLocked) {
      return;
    }
    if (pending && (isDoneEnhanceLocked || suppressEnhanceBadgeRef.current || !allowDoneEnhanceAttentionRef.current)) return;
    setHasPendingDoneEnhanceChanges(pending);
  }, [hasPendingQuickFixRerun, isDoneEnhanceLocked]);

  // Called when the user actually types in the overlay — lifts suppress immediately
  // so that edits made right after Enhance still trigger the badge.
  const handleOverlayUserInput = useCallback(() => {
    setDoneEnhanceLockedForSession(false);
    allowDoneEnhanceAttentionRef.current = true;
    liftDoneEnhanceSuppression();
    setHasPendingDoneEnhanceChanges(true);
  }, [liftDoneEnhanceSuppression, setDoneEnhanceLockedForSession]);
  const handleDoneOverlayFixIssue = useCallback((payload) => {
    if (payload?.kind !== 'plan') {
      resetDoneEnhanceAttention(2000);
      setDoneEnhanceLockedForSession(false);
      allowDoneEnhanceAttentionRef.current = true;
      liftDoneEnhanceSuppression();
      onFixIssue?.(payload);
      return;
    }

    // Quick fix updates `currentCode` and may also bump comment reset state in
    // separate renders. Skip both baseline-reset passes so Enhance stays active.
    skipNextDoneEnhanceBaselineResetCountRef.current = 2;
    setDoneEnhanceLockedForSession(false);
    allowDoneEnhanceAttentionRef.current = true;
    liftDoneEnhanceSuppression();
    setHasPendingDoneEnhanceChanges(true);
    onFixIssue?.(payload);
  }, [liftDoneEnhanceSuppression, onFixIssue, resetDoneEnhanceAttention, setDoneEnhanceLockedForSession]);

  function handleChange(e) {
    const v = e.target.value;
    setValue(v);
    const lastAt   = v.lastIndexOf('@');
    const lastHash = v.lastIndexOf('#');
    const triggerIdx = Math.max(lastAt, lastHash);
    if (triggerIdx >= 0) {
      const trigger = v[triggerIdx];
      const query   = v.slice(triggerIdx + 1);
      if (!query.includes(' ')) {
        setCompletion({ trigger, query, selectedIdx: 0 });
        return;
      }
    }
    setCompletion(null);
  }

  function getCurrentTaskQuestion() {
    const normalizeText = (nextValue) => (nextValue || '')
      .replace(/\u00A0/g, ' ')
      .trim();

    if (TOOLBAR_INPUT_IS_EDITABLE) {
      return normalizeText(value);
    }

    if (typeof document !== 'undefined') {
      const editorTextarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) => node instanceof HTMLTextAreaElement && !node.readOnly && node.getClientRects().length > 0
      );

      if (editorTextarea instanceof HTMLTextAreaElement) {
        return normalizeText(editorTextarea.value);
      }
    }

    return normalizeText(currentCode);
  }

  function getCurrentEditorContent() {
    if (TOOLBAR_INPUT_IS_EDITABLE) {
      return value || '';
    }

    if (typeof document !== 'undefined') {
      const editorTextarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) => node instanceof HTMLTextAreaElement && !node.readOnly && node.getClientRects().length > 0
      );

      if (editorTextarea instanceof HTMLTextAreaElement) {
        return editorTextarea.value || '';
      }
    }

    return currentCode || '';
  }

  function handleGenerate() {
    const question = getCurrentTaskQuestion();
    const sourceCode = getCurrentEditorContent();

    if (TOOLBAR_INPUT_IS_EDITABLE) {
      if (!question) return;
      setTaskText(question);
    } else {
      setTaskText(question);
    }
    onSend?.({ openTerminal: true, question, sourceCode });
  }

  function handleDoneEnhance() {
    if (!isDoneEnhanceEnabled) {
      return;
    }
    // Reset the done-state attention immediately so a completed Enhance cycle
    // doesn't reopen the popup/badge until the user makes fresh edits.
    setDoneEnhanceLockedForSession(true);
    resetDoneEnhanceAttention(4000);
    onDoneRegenerate?.({
      commentEntries: doneCommentEntries,
    });
  }

  function handleAddToolbarClick() {
    if (!showAddPopup && addBtnRef.current) {
      const r = addBtnRef.current.getBoundingClientRect();
      setPopupPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setShowAddPopup((prev) => !prev);
  }

  function handleKeyDown(e) {
    if (!completion) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
      return;
    }
    const items = completion.trigger === '@' ? AT_COMPLETIONS : HASH_COMPLETIONS;
    const filtered = items.filter(item =>
      item.label.toLowerCase().includes(completion.query.toLowerCase())
    ).slice(0, COMPLETION_POPUP_MAX_ITEMS);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCompletion(c => ({ ...c, selectedIdx: Math.min(c.selectedIdx + 1, filtered.length - 1) }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCompletion(c => ({ ...c, selectedIdx: Math.max(c.selectedIdx - 1, 0) }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const item = filtered[completion.selectedIdx];
      const selection = buildCompletionSelection(item);
      if (selection) applyCompletion(selection);
    } else if (e.key === 'Escape') {
      setCompletion(null);
    }
  }

  function applyCompletion(item) {
    const triggerIdx = Math.max(value.lastIndexOf('@'), value.lastIndexOf('#'));
    const before = value.slice(0, triggerIdx + 1);
    const insertText = getCompletionInsertText(item);
    setValue(before + insertText + ' ');
    setCompletion(null);
    const attachment = getCompletionAttachment(item);
    if (attachment) {
      onAddAttached?.(attachment);
    }
  }

  const focusDoneToolbarInput = useCallback(() => {
    if (!TOOLBAR_INPUT_IS_EDITABLE || genState !== 'done') return;
    setIsDoneToolbarInputFocused(true);
    if (doneInputFocusFrameRef.current) {
      cancelAnimationFrame(doneInputFocusFrameRef.current);
    }
    doneInputFocusFrameRef.current = requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!(ta instanceof HTMLTextAreaElement)) return;
      ta.focus({ preventScroll: true });
      const nextCaretPos = ta.value.length;
      ta.setSelectionRange(nextCaretPos, nextCaretPos);
    });
  }, [genState]);

  function renderToolbarInput({ collapsibleInDone = false } = {}) {
    const isCollapsed = collapsibleInDone && isDoneToolbarInputCollapsed;

    return (
      <div className={`at-input-shell${isCollapsed ? ' is-collapsed' : ''}`}>
        {isCollapsed && TOOLBAR_INPUT_IS_EDITABLE && (
          <div
            className="at-input-preview"
            role="button"
            tabIndex={0}
            aria-label="Edit agent task"
            onMouseDown={(e) => {
              e.preventDefault();
              focusDoneToolbarInput();
            }}
            onFocus={focusDoneToolbarInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                focusDoneToolbarInput();
              }
            }}
          >
            <span className={`at-input-preview-text${hasToolbarText ? '' : ' is-placeholder'}`}>
              {collapsedDoneToolbarText}
            </span>
          </div>
        )}
        {isCollapsed && !TOOLBAR_INPUT_IS_EDITABLE && (
          <div className="at-input-preview">
            <span className={`at-input-preview-text${hasToolbarText ? '' : ' is-placeholder'}`}>
              {collapsedDoneToolbarText}
            </span>
          </div>
        )}
        {/*
        Editable top bar input kept here for quick restore.
        <textarea
          ref={textareaRef}
          className={`at-input${isCollapsed ? ' at-input-collapsed' : ''}`}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (genState === 'done') {
              setIsDoneToolbarInputFocused(true);
            }
          }}
          onBlur={() => {
            if (genState === 'done') {
              setIsDoneToolbarInputFocused(false);
            }
          }}
          placeholder={toolbarPlaceholder}
          title="Shift+Enter for new line"
          aria-label="Agent task input"
          spellCheck={false}
        />
        */}
        <textarea
          ref={textareaRef}
          className={`at-input at-input-readonly${isCollapsed ? ' at-input-collapsed' : ''}`}
          rows={1}
          value={value}
          readOnly
          tabIndex={-1}
          placeholder={toolbarPlaceholder}
          aria-label="Agent task input"
          spellCheck={false}
        />
      </div>
    );
  }

  function renderBusyToolbar(title) {
    return (
      <div className="agent-task-toolbar" ref={toolbarRef}>
        <div className="agent-task-toolbar-gradient" />
        <div className="agent-task-toolbar-content">
          <div className="agent-task-toolbar-left">
            <AgentTaskTopBarIcon animated style={{ flexShrink: 0 }} />
            <span className="at-generating-label">{title}</span>
          </div>

          <div className="agent-task-toolbar-right">
            <button className="at-send-btn" onClick={() => onStop()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke="#C4C4C4" strokeWidth="1.6" />
              </svg>
              <span className="at-send-label">Stop</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderFloatingPopups() {
    return (
      <>
        {completion && cmpPos && createPortal(
          <CompletionPopup
            trigger={completion.trigger}
            query={completion.query}
            selectedIdx={completion.selectedIdx}
            onSelect={applyCompletion}
            onClose={() => setCompletion(null)}
            style={{ position: 'fixed', top: cmpPos.top, left: cmpPos.left, width: cmpPos.width }}
          />,
          document.body
        )}
        {showAddPopup && popupPos && createPortal(
          <>
            <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
            <AddPopup
              onClose={() => setShowAddPopup(false)}
              onSelectFile={(item) => onAddAttached?.(item)}
              files={addPopupFiles}
              style={{ position: 'fixed', ...popupPos }}
            />
          </>,
          document.body
        )}
      </>
    );
  }

  if (showLoadingState) {
    return (
      <>
        <div className="agent-task-editor-area" data-gen-state="loading">
          {renderBusyToolbar('Updating spec...')}
          {renderFloatingPopups()}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} updatedRowTarget={updatedRowTarget} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} activeRunRequest={activeRunRequest} specSessionKey={specSessionKey} specTabLabel={specTabLabel} onPlanWorkflowSelect={onPlanWorkflowSelect} onPlanWorkflowOpen={onPlanWorkflowOpen} onPlanWorkflowRemove={onPlanWorkflowRemove} />,
          doneOverlayHost
        )}
      </>
    );
  }

  if (showGeneratingState) {
    return (
      <>
        <div className="agent-task-editor-area" data-gen-state="generating">
          {renderBusyToolbar('Updating spec...')}
          {renderFloatingPopups()}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} updatedRowTarget={updatedRowTarget} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} activeRunRequest={activeRunRequest} specSessionKey={specSessionKey} specTabLabel={specTabLabel} onPlanWorkflowSelect={onPlanWorkflowSelect} onPlanWorkflowOpen={onPlanWorkflowOpen} onPlanWorkflowRemove={onPlanWorkflowRemove} />,
          doneOverlayHost
        )}
      </>
    );
  }

  if (genState === 'done') {
    return (
      <>
        <div className="agent-task-editor-area" data-gen-state="done">
          <div className="agent-task-toolbar" ref={toolbarRef}>
            <div className="agent-task-toolbar-gradient" />
            <div className="agent-task-toolbar-content">
              {/* Default state — left */}
              <div className={`agent-task-toolbar-left${isToolbarInputMultiline ? ' is-multiline' : ''}`}>
                {runState === 'running' ? (<>
                  <AgentTaskTopBarIcon animated style={{ flexShrink: 0 }} />
                  <span className="at-generating-label">Building...</span>
                </>) : (<>
                  <AgentTaskTopBarIcon style={{ flexShrink: 0 }} />
                  {renderToolbarInput({ collapsibleInDone: true })}
                </>)}
              </div>

              {/* Default state — right */}
              <div className="agent-task-toolbar-right">
                {runState === 'running' ? (
                  <button className="at-send-btn" onClick={() => onStop()}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" stroke="#C4C4C4" strokeWidth="1.6" />
                    </svg>
                    <span className="at-send-label">Stop</span>
                  </button>
                ) : (<>
                  {attachedFiles && attachedFiles.length > 0 && (
                    <div className="attached-files-list">
                      {attachedFiles.map((file, idx) => (
                        <AttachedFileChip
                          key={file.label + idx}
                          label={file.label}
                          onRemove={() => onRemoveAttached?.(idx)}
                        />
                      ))}
                    </div>
                  )}
                  <button className="at-send-btn" data-demo-id="agent-task-run" onClick={() => {
                    // Suppress badge during and after the run — the run itself
                    // will produce authoritative statuses, so pre-run pending
                    // changes are no longer relevant.
                    setHasPendingDoneEnhanceChanges(false);
                    if (suppressEnhanceBadgeTimerRef.current) {
                      clearTimeout(suppressEnhanceBadgeTimerRef.current);
                    }
                    suppressEnhanceBadgeRef.current = true;
                    suppressEnhanceBadgeTimerRef.current = setTimeout(() => {
                      suppressEnhanceBadgeRef.current = false;
                      suppressEnhanceBadgeTimerRef.current = 0;
                    }, 4000);
                    onOpenTerminal?.(null);
                  }}>
                    <Icon name="run/run" size={16} />
                    <span className="at-send-label">Build</span>
                  </button>

                  <div className="at-vsep" />

                  <button
                    className={`at-send-btn at-send-btn-enhance${shouldShowDoneEnhanceHint ? ' has-attention' : ''}`}
                    ref={doneEnhanceBtnRef}
                    data-demo-id="agent-task-enhance"
                    onClick={() => {
                      if (isDoneEnhanceEnabled) handleDoneEnhance();
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path d="M13.5 1.5V5.5H12.9003M9.5 5.5H12.9003M12.9003 5.5C11.9899 3.71916 10.1373 2.5 8 2.5C4.96243 2.5 2.5 4.96243 2.5 8C2.5 11.0376 4.96243 13.5 8 13.5C10.1373 13.5 11.9899 12.2808 12.9003 10.5" stroke="#CED0D6" strokeLinecap="round"/>
                    </svg>
                    <span className="at-send-label">Specify</span>
                    {shouldShowDoneEnhanceHint && (
                      <span className="at-enhance-attention-badge" ref={doneEnhanceBadgeRef} aria-hidden="true">
                        <IconWarning />
                      </span>
                    )}
                  </button>
                </>)}
              </div>
            </div>
          </div>
          {completion && cmpPos && createPortal(
            <CompletionPopup
              trigger={completion.trigger}
              query={completion.query}
              selectedIdx={completion.selectedIdx}
              onSelect={applyCompletion}
              onClose={() => setCompletion(null)}
              style={{ position: 'fixed', top: cmpPos.top, left: cmpPos.left, width: cmpPos.width }}
            />,
            document.body
          )}
          {showAddPopup && popupPos && createPortal(
            <>
              <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
              <AddPopup
                onClose={() => setShowAddPopup(false)}
                onSelectFile={(item) => onAddAttached?.(item)}
                files={addPopupFiles}
                style={{ position: 'fixed', ...popupPos }}
              />
            </>,
            document.body
          )}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} updatedRowTarget={updatedRowTarget} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} activeRunRequest={activeRunRequest} specSessionKey={specSessionKey} specTabLabel={specTabLabel} onPlanWorkflowSelect={onPlanWorkflowSelect} onPlanWorkflowOpen={onPlanWorkflowOpen} onPlanWorkflowRemove={onPlanWorkflowRemove} />,
          doneOverlayHost
        )}
      </>
    );
  }

  return (
    <div className="agent-task-editor-area">
      <div className="agent-task-toolbar" ref={toolbarRef}>
        <div className="agent-task-toolbar-gradient" />
        <div className="agent-task-toolbar-content">

          {showGeneratingState ? <>
            {/* Generating state — left */}
            <div className="agent-task-toolbar-left">
              <AgentTaskTopBarIcon animated style={{ flexShrink: 0 }} />
              <span className="at-generating-label">Updating spec...</span>
            </div>

            {/* Generating state — right */}
            <div className="agent-task-toolbar-right">
              <button className="at-send-btn" onClick={() => onStop()}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                  <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" />
                </svg>
                <span className="at-send-label">Stop</span>
              </button>
            </div>
          </> : <>
            {/* Default state — left */}
            <div className={`agent-task-toolbar-left${isToolbarInputMultiline ? ' is-multiline' : ''}`}>
              <AgentTaskTopBarIcon style={{ flexShrink: 0 }} />
              {renderToolbarInput()}
            </div>

            {/* Default state — right */}
            <div className="agent-task-toolbar-right">
              {attachedFiles && attachedFiles.length > 0 && (
                <div className="attached-files-list">
                  {attachedFiles.map((file, idx) => (
                    <AttachedFileChip
                      key={file.label + idx}
                      label={file.label}
                      onRemove={() => onRemoveAttached?.(idx)}
                    />
                  ))}
                </div>
              )}
		              <button className="at-send-btn" data-demo-id="agent-task-idle-run" onClick={handleGenerate}>
		                <Icon name="run/run" size={16} />
		                <span className="at-send-label">Build</span>
		              </button>
	              <div className="at-vsep" />
	              <button className="at-send-btn" data-demo-id="agent-task-generate" onClick={handleGenerate}>
	                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
	                  <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="#C4C4C4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
	                </svg>
	                <span className="at-send-label">Specify</span>
	              </button>
	            </div>
          </>}

        </div>
      </div>
      {completion && cmpPos && createPortal(
        <CompletionPopup
          trigger={completion.trigger}
          query={completion.query}
          selectedIdx={completion.selectedIdx}
          onSelect={applyCompletion}
          onClose={() => setCompletion(null)}
          style={{ position: 'fixed', top: cmpPos.top, left: cmpPos.left, width: cmpPos.width }}
        />,
        document.body
      )}
      {showAddPopup && popupPos && createPortal(
        <>
          <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
          <AddPopup onClose={() => setShowAddPopup(false)} onSelectFile={(item) => onAddAttached?.(item)} files={addPopupFiles} style={{ position: 'fixed', top: popupPos.top, right: popupPos.right }} />
        </>,
        document.body
      )}
    </div>
  );
}

// ─── Agent Tasks Panel ────────────────────────────────────────────────────────

const AGENT_TASKS = [
  { id: 'agent-task-new-0', label: 'New Task.md',      time: 'now', status: null },
  { id: 't1',               label: 'visit-booking.md', time: '2m',  status: null },
  { id: 't2',               label: 'vet-schedules.md', time: '15m', status: 'running' },
];

const VET_SCHEDULES_AC_RUN_STATUSES = [
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Working schedules stored by weekday', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Off-hours booking validation rejects unavailable slots', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Demo seed data includes schedule rows', chip: null },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'Visit-booking flow still uses static hourly slots', chip: null },
    ],
  },
];

const VET_SCHEDULES_PLAN_RUN_STATUSES = [
  { status: 'passed' },
  { status: 'passed' },
  { status: 'passed' },
  { status: 'passed' },
  { status: 'passed' },
];

function createVetSchedulesSpecDocument() {
  return [
    {
      id: 'goal',
      title: 'Goal',
      items: [
        {
          id: 'goal-text',
          type: 'paragraph',
          text: 'Define the parallel Vet Schedules track that enables real availability checks for visit booking without blocking the initial visit-booking rollout.',
        },
      ],
    },
    {
      id: 'acceptance',
      title: 'Acceptance Criteria',
      items: [
        { id: 'ac-1', type: 'check', checked: false, text: 'Vets can have working schedules stored by day of week.' },
        { id: 'ac-2', type: 'check', checked: false, text: 'Booking validation can reject slots outside a vet\'s working hours.' },
        { id: 'ac-3', type: 'check', checked: false, text: 'Demo seed data includes at least one schedule per vet.' },
        { id: 'ac-4', type: 'check', checked: false, text: 'Visit-booking can keep using static hourly slots while this task is in progress.' },
      ],
    },
    {
      id: 'plan',
      title: 'Plan',
      items: [
        { id: 'plan-1', type: 'check', checked: false, text: 'Add VetSchedule entity under the vet package' },
        { id: 'plan-2', type: 'check', checked: false, text: 'Add repository queries by vet and date' },
        { id: 'plan-3', type: 'check', checked: false, text: 'Validate requested visit_time against schedule windows' },
        { id: 'plan-4', type: 'check', checked: false, text: 'Seed sample schedules in H2 data.sql' },
        { id: 'plan-5', type: 'check', checked: false, text: 'Add tests for off-hours booking rejection' },
      ],
    },
    {
      id: 'notes',
      title: 'Notes',
      items: [
        { id: 'note-1', type: 'bullet', text: 'Parallel task from Beat 5 of the PetClinic demo scenario.' },
        { id: 'note-2', type: 'bullet', text: 'Does not change the current visit-booking acceptance criteria yet.' },
      ],
    },
  ].map((section) => withDerivedPlanChildren(section));
}

function createVetSchedulesTaskDraft() {
  return [
    'Define the parallel Vet Schedules track that enables real availability checks for visit booking without blocking the initial visit-booking rollout.',
    '',
    '- Model working hours per vet and weekday.',
    '- Reject bookings outside configured schedule windows.',
    '- Keep the current static hourly slots for the first visit-booking rollout.',
  ].join('\n');
}

function createInteractiveTaskState({
  documentSections,
  genState = 'idle',
  acBaseStatuses = null,
  planBaseStatuses = null,
  seedRunResults = false,
  appliedIssueFixes = null,
  removedIssueIndices = null,
  commentEntries = [],
} = {}) {
  const nextAppliedIssueFixes = cloneIssueStateMap(appliedIssueFixes);
  const nextRemovedIssueIndices = cloneIssueStateMap(removedIssueIndices);

  return {
    genState,
    genProgress: genState === 'done' ? 1 : 0,
    documentSections: Array.isArray(documentSections) ? documentSections : [],
    appliedIssueFixes: nextAppliedIssueFixes,
    removedIssueIndices: nextRemovedIssueIndices,
    acRunResult: seedRunResults && Array.isArray(acBaseStatuses)
      ? buildResolvedRunStatuses(acBaseStatuses, 'ac', nextAppliedIssueFixes, nextRemovedIssueIndices)
      : null,
    planRunResult: seedRunResults && Array.isArray(planBaseStatuses)
      ? buildResolvedRunStatuses(planBaseStatuses, 'plan', nextAppliedIssueFixes, nextRemovedIssueIndices)
      : null,
    commentEntries: Array.isArray(commentEntries) ? commentEntries : [],
  };
}

function getAgentTaskScenario({ tabId = '', label = '' } = {}) {
  const normalizedTabId = typeof tabId === 'string' ? tabId : '';
  const normalizedLabel = typeof label === 'string' ? label : '';

  if (normalizedTabId === 'agent-task-t2' || normalizedLabel === 'vet-schedules.md') {
    const documentSections = createVetSchedulesSpecDocument();
    return {
      initialCode: createVetSchedulesTaskDraft(),
      defaultDocument: documentSections,
      acBaseStatuses: VET_SCHEDULES_AC_RUN_STATUSES,
      planBaseStatuses: VET_SCHEDULES_PLAN_RUN_STATUSES,
      initialTaskState: createInteractiveTaskState({
        documentSections,
        genState: 'idle',
        acBaseStatuses: VET_SCHEDULES_AC_RUN_STATUSES,
        planBaseStatuses: VET_SCHEDULES_PLAN_RUN_STATUSES,
      }),
    };
  }

  const documentSections = createSpecDocument();
  const isVisitBookingPreset = normalizedTabId === 'agent-task-t1' || normalizedLabel === 'visit-booking.md';

  return {
    initialCode: isVisitBookingPreset ? serializeSpecDocument(documentSections) : ' ',
    defaultDocument: documentSections,
    acBaseStatuses: isVisitBookingPreset ? VISIT_BOOKING_FIXED_AC_RUN_STATUSES : AC_RUN_STATUSES,
    planBaseStatuses: isVisitBookingPreset ? VISIT_BOOKING_FIXED_PLAN_RUN_STATUSES : PLAN_RUN_STATUSES,
    initialTaskState: createInteractiveTaskState({
      documentSections,
      genState: isVisitBookingPreset ? 'done' : 'idle',
      planBaseStatuses: null,
      acBaseStatuses: null,
      seedRunResults: false,
    }),
  };
}

function getPresetAgentTaskDefinition(taskId) {
  if (taskId === 't1') {
    const scenario = getAgentTaskScenario({ tabId: 'agent-task-t1', label: 'visit-booking.md' });

    return {
      tab: { id: 'agent-task-t1', label: 'visit-booking.md', icon: 'fileTypes/markdown', closable: true },
      content: {
        language: 'markdown',
        code: scenario.initialCode,
      },
      kind: 'interactive',
      interactiveState: scenario.initialTaskState,
    };
  }

  if (taskId === 't2') {
    const scenario = getAgentTaskScenario({ tabId: 'agent-task-t2', label: 'vet-schedules.md' });

    return {
      tab: { id: 'agent-task-t2', label: 'vet-schedules.md', icon: 'fileTypes/markdown', closable: true },
      content: {
        language: 'markdown',
        code: scenario.initialCode,
      },
      kind: 'interactive',
      interactiveState: scenario.initialTaskState,
    };
  }

  return null;
}

function getAgentTaskTabId(taskId) {
  if (typeof taskId !== 'string' || taskId.length === 0) return null;
  if (taskId.startsWith('agent-task-')) return taskId;
  return getPresetAgentTaskDefinition(taskId)?.tab?.id ?? `agent-task-${taskId}`;
}

const AUTONOMOUS_WORKFLOW_TAB = {
  id: 'workflow-autonomous',
  label: 'autonomous.md',
  icon: 'fileTypes/markdown',
  closable: true,
};

const AUTONOMOUS_WORKFLOW_SETTINGS = [
  { key: 'max_consecutive_failures', value: '3', kind: 'scalar' },
  { key: 'token_constraint_total', value: '1M', kind: 'scalar' },
  { key: 'time_constraint_total', value: 'None', kind: 'editable-time' },
  { key: 'on_done', value: '/summarize-changes', kind: 'editable-skills' },
];

const AUTONOMOUS_WORKFLOW_CONTENT = [
  '# Autonomous',
  '',
  '> Runs the existing plan to completion. Continues through implementation work, verifies acceptance criteria at the end, and stops only when it is done or hits constraints.',
  '',
  '## Settings',
  '',
  ...AUTONOMOUS_WORKFLOW_SETTINGS.map((setting) => {
    const value = setting.value;
    return `| \`${setting.key}\` | \`${value}\` |`;
  }),
  '',
  '## Workflow',
  '',
  'You are running an existing plan to completion. Work within the spec',
  'permissions below and keep moving; pause only at the limits below or when',
  'a criterion is broken (see Spec permissions).',
  '',
  '### A run',
  '',
  'Work through the plan from the top, in order. Check off each step as you',
  'finish it. A step box means "done", not "verified", so a',
  'halfway-interrupted run still shows where you got to.',
  '',
  'At the end of the pass, verify the acceptance criteria using the',
  'verification configuration the spec defines for them. Check off a',
  'criterion only once it actually passes.',
  '',
  '### Done',
  '',
  'A run is done only when a single fresh pass leaves every plan step',
  'checked and every acceptance criterion passing. A pass inherited from an',
  'earlier run does not count.',
  '',
  'If a criterion fails, work out why before retrying:',
  '- if the criterion itself is wrong or unachievable, stop and surface it',
  '  (see Spec permissions) rather than starting another run;',
  '- if the plan is what fell short, uncheck every step and start a fresh',
  '  run from the top, re-verifying all criteria, not just the one that',
  '  failed.',
  '',
  '### Limits',
  '',
  'If one criterion fails `max_consecutive_failures` runs in a row, stop',
  'rather than burning more runs on the same failure. Treat',
  '`token_constraint_total` as a hard stop across the whole task. If',
  '`time_constraint_total` is set, treat that as a hard stop too; if it is',
  '`None`, keep going until the run is done or another limit is hit.',
  '',
  '### On done',
  '',
  'Once the run is done, run the skills in `on_done`, in order. These run',
  'on every task: reporting, hygiene, or checks you always want at the end.',
  'They must not affect whether the run passed; anything that modifies code',
  'belongs in a plan step, not here.',
  '',
  '### Spec permissions',
  '',
  "The plan is yours to revise: reorder, split, or add steps as you learn",
  "more, and record what you changed in the spec's Decisions log.",
  '',
  'The acceptance criteria are not. Treat them as fixed: never edit, soften,',
  'or drop one to make a run pass. If a criterion seems wrong or',
  'unachievable, stop and surface it instead of changing it.',
].join('\n');

function AutonomousInlineMarkdown({ text }) {
  const parts = String(text ?? '').split(/(`[^`]+`)/g);
  return parts.map((part, index) => (
    part.startsWith('`') && part.endsWith('`')
      ? <span key={`${part}-${index}`} className="spec-ref">{part.slice(1, -1)}</span>
      : <Fragment key={`${part}-${index}`}>{part}</Fragment>
  ));
}

function renderAutonomousTimeValue(value = '') {
  const normalizedValue = String(value ?? '');
  if (normalizedValue.trim().toLowerCase() === 'none') {
    return <span className="autonomous-md-none-value">{normalizedValue}</span>;
  }
  return <span className="autonomous-md-scalar-value">{normalizedValue}</span>;
}

function renderAutonomousSkillText(value = '') {
  const parts = String(value ?? '').split(/(\/[a-z0-9-]+)/gi);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^\/[a-z0-9-]+$/i.test(part)) {
      return <span key={`${part}-${index}`} className="autonomous-md-skill-item">{part}</span>;
    }
    return <span key={`${part}-${index}`} className="autonomous-md-skill-separator">{part}</span>;
  });
}

function AutonomousInlineEditor({
  value,
  onChange,
  onKeyDown = null,
  onFocus = null,
  onBlur = null,
  inputRef = null,
  className = '',
  minWidth = null,
  renderValue,
  ariaLabel,
}) {
  return (
    <span className={`autonomous-md-inline-editor ${className}`.trim()} style={minWidth ? { minWidth } : undefined}>
      <span className="autonomous-md-inline-editor-highlight" aria-hidden="true">
        {renderValue(value)}
        <span className="autonomous-md-inline-editor-trailing-space">&nbsp;</span>
      </span>
      <input
        ref={inputRef}
        type="text"
        className="autonomous-md-inline-editor-input"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown ?? undefined}
        onFocus={onFocus ?? undefined}
        onBlur={onBlur ?? undefined}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        aria-label={ariaLabel}
      />
    </span>
  );
}

function AutonomousSettingValue({ setting, valueOverride = null, onTimeChange = null, onSkillsChange = null, onSkillsKeyDown = null, skillsInputRef = null, timeInputRef = null }) {
  const value = valueOverride ?? setting.value;

  if (setting.kind === 'enum') {
    return (
      <span className="autonomous-md-enum-inline">
        <span className="autonomous-md-enum-text">{setting.value}</span>
        <span className="autonomous-md-enum-chevron" aria-hidden="true">⌄</span>
      </span>
    );
  }

  if (setting.kind === 'editable-skills') {
    return (
      <span className="autonomous-md-skill-list">
        <AutonomousInlineEditor
          value={String(value ?? '')}
          onChange={(event) => onSkillsChange?.(event.target.value, event.target.selectionStart ?? 0)}
          onKeyDown={onSkillsKeyDown}
          inputRef={skillsInputRef}
          className="autonomous-md-inline-editor-skills"
          minWidth="280px"
          renderValue={renderAutonomousSkillText}
          ariaLabel="on_done"
        />
      </span>
    );
  }

  if (setting.kind === 'editable-time') {
    return (
      <AutonomousInlineEditor
        value={String(value ?? '')}
        onChange={(event) => onTimeChange?.(event.target.value)}
        inputRef={timeInputRef}
        className="autonomous-md-inline-editor-time"
        minWidth="52px"
        renderValue={renderAutonomousTimeValue}
        ariaLabel="time_constraint_total"
      />
    );
  }

  return <span className="autonomous-md-scalar-value">{setting.value}</span>;
}

function AutonomousMarkdownEditor() {
  const [timeConstraintValue, setTimeConstraintValue] = useState('None');
  const [onDoneValue, setOnDoneValue] = useState('/summarize-changes');
  const [skillsCompletion, setSkillsCompletion] = useState(null);
  const [skillsCompletionPos, setSkillsCompletionPos] = useState(null);
  const skillsInputRef = useRef(null);

  const updateSkillsCompletionPosition = useCallback(() => {
    const input = skillsInputRef.current;
    if (!(input instanceof HTMLInputElement)) {
      setSkillsCompletionPos(null);
      return;
    }
    const rect = input.getBoundingClientRect();
    setSkillsCompletionPos({
      top: rect.bottom + 6,
      left: rect.left - 10,
      width: Math.min(453, Math.max(320, window.innerWidth - rect.left - 24)),
    });
  }, []);

  const updateSkillsCompletionState = useCallback((nextValue, cursorPos) => {
    const safeCursorPos = Number.isInteger(cursorPos) ? cursorPos : nextValue.length;
    const textBeforeCursor = nextValue.slice(0, safeCursorPos);
    const slashIndex = textBeforeCursor.lastIndexOf('/');

    if (slashIndex >= 0) {
      const query = textBeforeCursor.slice(slashIndex + 1);
      if (!query.includes(' ') && !query.includes(',') && !query.includes('\n')) {
        setSkillsCompletion((prev) => ({
          trigger: '/',
          query,
          selectedIdx: Math.min(prev?.selectedIdx ?? 0, Math.max(0, SLASH_COMPLETIONS.length - 1)),
        }));
        updateSkillsCompletionPosition();
        return;
      }
    }

    setSkillsCompletion(null);
    setSkillsCompletionPos(null);
  }, [updateSkillsCompletionPosition]);

  const handleOnDoneChange = useCallback((nextValue, cursorPos) => {
    setOnDoneValue(nextValue);
    updateSkillsCompletionState(nextValue, cursorPos);
  }, [updateSkillsCompletionState]);

  const applySkillsCompletion = useCallback((item) => {
    const input = skillsInputRef.current;
    if (!(input instanceof HTMLInputElement) || !item) return;

    const cursorPos = input.selectionStart ?? onDoneValue.length;
    const textBeforeCursor = onDoneValue.slice(0, cursorPos);
    const slashIndex = textBeforeCursor.lastIndexOf('/');
    if (slashIndex < 0) return;

    const insertText = getCompletionInsertText(item);
    const nextValue = `${onDoneValue.slice(0, slashIndex)}${insertText}${onDoneValue.slice(cursorPos)}`;
    const nextCursorPos = slashIndex + insertText.length;

    setOnDoneValue(nextValue);
    setSkillsCompletion(null);
    setSkillsCompletionPos(null);

    requestAnimationFrame(() => {
      const currentInput = skillsInputRef.current;
      if (!(currentInput instanceof HTMLInputElement)) return;
      currentInput.focus({ preventScroll: true });
      currentInput.setSelectionRange(nextCursorPos, nextCursorPos);
    });
  }, [onDoneValue]);

  const handleOnDoneKeyDown = useCallback((event) => {
    if (!skillsCompletion) return;

    const filtered = getCompletionItemsForTrigger('/')
      .filter((item) => item.label.toLowerCase().includes(skillsCompletion.query.toLowerCase()))
      .slice(0, COMPLETION_POPUP_MAX_ITEMS);

    if (filtered.length === 0) {
      if (event.key === 'Escape') {
        setSkillsCompletion(null);
        setSkillsCompletionPos(null);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSkillsCompletion((prev) => prev ? { ...prev, selectedIdx: Math.min(prev.selectedIdx + 1, filtered.length - 1) } : prev);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSkillsCompletion((prev) => prev ? { ...prev, selectedIdx: Math.max(prev.selectedIdx - 1, 0) } : prev);
      return;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      applySkillsCompletion(buildCompletionSelection(filtered[skillsCompletion.selectedIdx]));
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setSkillsCompletion(null);
      setSkillsCompletionPos(null);
    }
  }, [applySkillsCompletion, skillsCompletion]);

  const selectedSkillLabels = useMemo(() => {
    const matches = String(onDoneValue ?? '').match(/\/[a-z0-9-]+/gi);
    return matches ?? [];
  }, [onDoneValue]);

  useEffect(() => {
    if (!skillsCompletion) return undefined;

    updateSkillsCompletionPosition();
    window.addEventListener('resize', updateSkillsCompletionPosition);
    return () => {
      window.removeEventListener('resize', updateSkillsCompletionPosition);
    };
  }, [skillsCompletion, updateSkillsCompletionPosition]);

  return (
    <div className="autonomous-md-editor">
      <div className="autonomous-md-scroll">
        <article className="autonomous-md-document" contentEditable suppressContentEditableWarning spellCheck={false}>
          <h1>Autonomous</h1>

          <blockquote className="autonomous-md-description">
            Runs the existing plan to completion. Continues through implementation work,
            verifies acceptance criteria at the end, and stops only when it is done or hits constraints.
          </blockquote>

          <h2>Settings</h2>
          <table className="autonomous-md-table" contentEditable={false}>
            <tbody>
              {AUTONOMOUS_WORKFLOW_SETTINGS.map((setting) => (
                <tr key={setting.key}>
                  <td><span className="spec-ref autonomous-md-setting-key">{setting.key}</span></td>
                  <td>
                    <AutonomousSettingValue
                      setting={setting}
                      valueOverride={
                        setting.key === 'time_constraint_total'
                          ? timeConstraintValue
                          : setting.key === 'on_done'
                            ? onDoneValue
                            : setting.value
                      }
                      onTimeChange={setTimeConstraintValue}
                      onSkillsChange={handleOnDoneChange}
                      onSkillsKeyDown={handleOnDoneKeyDown}
                      skillsInputRef={skillsInputRef}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Workflow</h2>
          <p>
            You are running an existing plan to completion. Work within the spec
            permissions below and keep moving; pause only at the limits below or when
            a criterion is broken (see Spec permissions).
          </p>

          <h3>A run</h3>
          <p>
            Work through the plan from the top, in order. Check off each step as you
            finish it. A step box means "done", not "verified", so a
            halfway-interrupted run still shows where you got to.
          </p>
          <p>
            At the end of the pass, verify the acceptance criteria using the
            verification configuration the spec defines for them. Check off a
            criterion only once it actually passes.
          </p>

          <h3>Done</h3>
          <p>
            A run is done only when a single fresh pass leaves every plan step
            checked and every acceptance criterion passing. A pass inherited from an
            earlier run does not count.
          </p>
          <p>If a criterion fails, work out why before retrying:</p>
          <ul>
            <li>
              if the criterion itself is wrong or unachievable, stop and surface it
              (see Spec permissions) rather than starting another run;
            </li>
            <li>
              if the plan is what fell short, uncheck every step and start a fresh
              run from the top, re-verifying all criteria, not just the one that
              failed.
            </li>
          </ul>

          <h3>Limits</h3>
          <p>
            <AutonomousInlineMarkdown text="If one criterion fails `max_consecutive_failures` runs in a row, stop rather than burning more runs on the same failure. Treat `token_constraint_total` as a hard stop across the whole task. If `time_constraint_total` is set, treat that as a hard stop too; if it is `None`, keep going until the run is done or another limit is hit." />
          </p>

          <h3>On done</h3>
          <p>
            <AutonomousInlineMarkdown text="Once the run is done, run the skills in `on_done`, in order. These are end-of-run skills for reporting, hygiene, or checks you always want after implementation and verification are complete." />
          </p>
          <p>
            They must not affect whether the run passed; anything that modifies code
            belongs in a plan step, not here.
          </p>

          <h3>Spec permissions</h3>
          <p>
            The plan is yours to revise: reorder, split, or add steps as you learn
            more, and record what you changed in the spec's Decisions log.
          </p>
          <p>
            The acceptance criteria are not. Treat them as fixed: never edit, soften,
            or drop one to make a run pass. If a criterion seems wrong or
            unachievable, stop and surface it instead of changing it.
          </p>
        </article>
      </div>
      {skillsCompletion && skillsCompletionPos && createPortal(
        <CompletionPopup
          trigger={skillsCompletion.trigger}
          query={skillsCompletion.query}
          selectedIdx={skillsCompletion.selectedIdx}
          onSelect={applySkillsCompletion}
          selectedLabels={selectedSkillLabels}
          onClose={() => {
            setSkillsCompletion(null);
            setSkillsCompletionPos(null);
          }}
          style={{
            position: 'fixed',
            top: skillsCompletionPos.top,
            left: skillsCompletionPos.left,
            width: skillsCompletionPos.width,
          }}
        />,
        document.body
      )}
    </div>
  );
}

function buildInitialEditorTabs() {
  const visitBookingTab = getPresetAgentTaskDefinition('t1')?.tab;
  return visitBookingTab ? [visitBookingTab] : [];
}

function buildInitialEditorTabContents() {
  const preset = getPresetAgentTaskDefinition('t1');
  if (!preset?.tab?.id || !preset?.content) {
    return {};
  }

  return {
    [preset.tab.id]: preset.content,
    ...MY_EDITOR_TAB_CONTENTS,
  };
}

function buildInitialInteractiveTaskStates() {
  const preset = getPresetAgentTaskDefinition('t1');
  if (!preset?.tab?.id || !preset?.interactiveState) {
    return {};
  }

  return {
    [preset.tab.id]: preset.interactiveState,
  };
}

function createAgentTaskExecutionTiming() {
  return {
    activeStartedAt: null,
    lastDurationMs: null,
  };
}

function formatAgentTaskExecutionTime(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '';

  const totalSeconds = Math.max(1, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
}

function resolveAgentTaskExecutionTimeLabel(timing, now = Date.now()) {
  if (!timing) return '';

  if (Number.isFinite(timing.activeStartedAt)) {
    return formatAgentTaskExecutionTime(now - timing.activeStartedAt);
  }

  return formatAgentTaskExecutionTime(timing.lastDurationMs);
}

function IconMdTask() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5929 9.9438L12.5929 4.70001L13.7929 4.70002L13.7929 9.94379L15.0763 8.66037L15.9248 9.5089L13.1929 12.2409L10.4609 9.5089L11.3095 8.66037L12.5929 9.9438Z" fill="#9B6BDA"/>
      <path d="M0.5 4.70001H2.94558L4.65385 9.14463L4.76288 9.60155L4.85635 9.14463L6.51269 4.70001H8.98423V11.9692H7.14096V7.59732L7.17212 7.12482L5.34442 11.9692H4.08269L2.31212 7.17155L2.34327 7.59732V11.9692H0.5V4.70001Z" fill="#9B6BDA"/>
    </svg>
  );
}

function buildTerminalTaskTabs(tabs = []) {
  return tabs.map((tab, index) => ({
    ...tab,
    label: tab.label || (index === 0 ? TERMINAL_TASK_TAB_BASE_LABEL : `Task ${index + 1}.md`),
    icon: <IconMdTask />,
  }));
}

function buildTerminalSessionTabId(sourceTabId = 'current-file') {
  return `terminal-session-${sourceTabId}`;
}

function createTerminalSessionState({ sourceTabId = null, sourceTabLabel = TERMINAL_TASK_TAB_BASE_LABEL } = {}) {
  return {
    sourceTabId,
    sourceTabLabel,
    blocks: [],
    isStreaming: false,
    pendingRun: null,
    permissionPrompt: null,
    acWarningBanner: null,
    viewKey: 0,
  };
}

function removeTabStateEntry(stateMap, tabId) {
  if (!tabId || !stateMap || !(tabId in stateMap)) {
    return stateMap;
  }

  const { [tabId]: _removedState, ...rest } = stateMap;
  return rest;
}

function getAgentTaskIdForEditorTab(tab, tasks = []) {
  if (!tab || !Array.isArray(tasks) || tasks.length === 0) return null;

  const normalizedTabId = typeof tab.id === 'string' ? tab.id : '';
  const normalizedTabLabel = typeof tab.label === 'string' ? tab.label : '';
  const sourceTabId = (typeof tab.sourceTabId === 'string' && tab.sourceTabId)
    ? tab.sourceTabId
    : normalizedTabId.startsWith('plan-diff-')
    ? normalizedTabId.slice('plan-diff-'.length)
    : normalizedTabId;

  const matchingTask = tasks.find((task) => {
    if (!task) return false;

    const candidateIds = new Set([
      typeof task.id === 'string' ? task.id : '',
      typeof task.id === 'string' ? `agent-task-${task.id}` : '',
    ]);

    return (
      candidateIds.has(sourceTabId) ||
      (normalizedTabLabel.length > 0 && task.label === normalizedTabLabel)
    );
  });

  return matchingTask?.id ?? null;
}

function IconWarning() {
  return (
    <svg className="agent-task-status-warning" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle className="agent-task-status-warning-outer" cx="8" cy="8" r="8" fill="#44321D" />
      <circle className="agent-task-status-warning-middle" cx="8" cy="8" r="5" fill="#875817" />
      <circle className="agent-task-status-warning-core" cx="8" cy="8" r="3" fill="#C7A450" />
    </svg>
  );
}

function IconDone() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 8.25L6 11.75L13.5 4.25" stroke="#868A91" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLoaderSpinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="icon loader-spinner at-loader" aria-label="Loading" role="status">
      <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91" />
      <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91" />
      <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91" />
      <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91" />
      <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91" />
      <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91" />
      <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91" />
      <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91" />
    </svg>
  );
}

function IconChevron({ expanded }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" fill="none"
      style={{ flexShrink: 0, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <path d="M4 6L8 10L12 6" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function resolveAgentTaskPlanFileIcon(fileName = '') {
  const normalized = String(fileName).toLowerCase();
  const candidateIconIds = [];

  if (normalized.endsWith('.java')) candidateIconIds.push('fileTypes/java');
  if (normalized.endsWith('.html')) candidateIconIds.push('fileTypes/html');
  if (normalized.endsWith('.md')) candidateIconIds.push('fileTypes/markdown');
  if (normalized.endsWith('.py')) candidateIconIds.push('fileTypes/python');
  if (normalized.endsWith('.js')) candidateIconIds.push('fileTypes/javaScript');

  candidateIconIds.push('fileTypes/text');

  return candidateIconIds.find((iconId) => Boolean(getIcon(iconId))) ?? 'fileTypes/text';
}

function AgentTaskPlanFileChanges({ added = 0, removed = 0 }) {
  return (
    <span className="agent-task-plan-file-changes">
      {added > 0 && <span className="agent-task-plan-file-added">+{added}</span>}
      {removed > 0 && <span className="agent-task-plan-file-removed">-{removed}</span>}
    </span>
  );
}

const AGENT_TASK_TREE_ROOT_NODE_ID = 'agent-task-tree-root';

function buildAgentTaskTreeTaskNodeId(taskId) {
  return `agent-task-tree-task:${taskId}`;
}

function buildAgentTaskPlanTreeModel({
  task = null,
  sourceTabId = null,
  sourceCode = '',
  documentSections = [],
  planRunResult = null,
  removedIssueIndices = null,
} = {}) {
  if (!task?.id || !sourceTabId) {
    return {
      treeData: [],
      navigationByNodeId: {},
    };
  }

  const viewerData = buildPlanDiffViewerData({
    documentSections,
    planRunResult,
    removedIssueIndices,
  });

  if (!Array.isArray(viewerData.planItems) || viewerData.planItems.length === 0) {
    return {
      treeData: [],
      navigationByNodeId: {},
    };
  }

  const navigationByNodeId = {};
  const fileNodes = viewerData.planItems.flatMap((item, itemIndex) => {
    const originalIndex = Number.isInteger(item?.originalIndex) ? item.originalIndex : itemIndex;
    const visibleIndex = Number.isInteger(item?.visibleIndex) ? item.visibleIndex : itemIndex;
    const issueTarget = { kind: 'plan', index: originalIndex };
    const statusItem = item?.statusItem ?? planRunResult?.[visibleIndex] ?? { status: item?.status ?? 'pending' };
    const diffData = buildPlanDiffData({
      sourceCode,
      text: item?.text ?? '',
      statusItem,
      issueTarget,
      sourceTabLabel: task.label,
    });
    const changedRows = (diffData?.rows ?? []).filter((row) => row?.kind === 'added' || row?.kind === 'removed');
    const rowsByFile = changedRows.reduce((groups, row) => {
      const fileName = row?.file ?? diffData?.sourceTabLabel ?? task.label;
      if (!groups.has(fileName)) {
        groups.set(fileName, {
          rows: [],
          added: 0,
          removed: 0,
        });
      }
      const bucket = groups.get(fileName);
      bucket.rows.push(row);
      if (row?.kind === 'added') bucket.added += 1;
      if (row?.kind === 'removed') bucket.removed += 1;
      return groups;
    }, new Map());

    const orderedFileNames = Array.from(new Set([
      ...(Array.isArray(item?.files) ? item.files : []),
      ...Array.from(rowsByFile.keys()),
    ])).filter((fileName) => typeof fileName === 'string' && fileName.trim().length > 0);

    return orderedFileNames.map((fileName, fileIndex) => {
      const fileMeta = rowsByFile.get(fileName) ?? { rows: [], added: 0, removed: 0 };
      const fileRows = Array.isArray(fileMeta?.rows) ? fileMeta.rows : [];
      const fileNodeId = `agent-task-tree-file:${task.id}:${originalIndex}:${fileIndex}`;
      navigationByNodeId[fileNodeId] = {
        type: 'file',
        taskId: task.id,
        sourceTabId,
        sourceLabel: task.label,
        text: item?.text ?? '',
        statusItem,
        issueTarget,
        activeRowId: fileRows[0]?.id ?? diffData?.focusRowId ?? null,
      };

      return {
        id: fileNodeId,
        label: (
          <span className="agent-task-plan-file-label">
            <span className="agent-task-plan-file-name">{fileName}</span>
            <AgentTaskPlanFileChanges added={fileMeta?.added ?? 0} removed={fileMeta?.removed ?? 0} />
          </span>
          ),
        icon: resolveAgentTaskPlanFileIcon(fileName),
      };
    });
  });

  return {
    treeData: fileNodes,
    navigationByNodeId,
  };
}

function AgentTasksPanel({
  ctx,
  tasks,
  selected,
  onAdd,
  onTaskSelect,
  dismissedSuccessTaskIds = [],
  onDismissSuccess = null,
  planTreesByTaskId = {},
  onPlanTreeNodeSelect = null,
  focusedNodeId = null,
}) {
  const [treeSelectionResetKey, setTreeSelectionResetKey] = useState(0);
  const [selectedTreeNodeId, setSelectedTreeNodeId] = useState(
    () => (selected ? buildAgentTaskTreeTaskNodeId(selected) : AGENT_TASK_TREE_ROOT_NODE_ID),
  );
  const lastTreeDrivenTaskIdRef = useRef(selected ?? null);
  const dismissedSuccessTaskIdSet = useMemo(
    () => new Set(Array.isArray(dismissedSuccessTaskIds) ? dismissedSuccessTaskIds : []),
    [dismissedSuccessTaskIds]
  );
  const { treeData, navigationByNodeId, defaultSelectedNodeId } = useMemo(() => {
    const nextNavigationByNodeId = {};
    const taskNodes = tasks.map((task) => {
      const taskNodeId = buildAgentTaskTreeTaskNodeId(task.id);
      const taskTree = planTreesByTaskId?.[task.id] ?? null;
      const hasChanges = Array.isArray(taskTree?.treeData) && taskTree.treeData.length > 0;
      const isTaskSelected = selected === task.id;
      const shouldExpandByDefault = false;

      nextNavigationByNodeId[taskNodeId] = {
        type: 'task',
        taskId: task.id,
      };

      if (taskTree?.navigationByNodeId) {
        Object.assign(nextNavigationByNodeId, taskTree.navigationByNodeId);
      }

      const hasSelectedChild = hasChanges && Array.isArray(taskTree.treeData)
        && taskTree.treeData.some((fileNode) => fileNode.id === selectedTreeNodeId);

      return {
        id: taskNodeId,
        label: (
          <span
            className="agent-task-tree-task-label"
            data-demo-id={`agent-task-row-${toDemoSlug(task.label || task.id)}`}
          >
            <span className="agent-task-tree-task-name">{task.label}</span>
            {task.indicator === 'loading' && (
              <span className="agent-task-tree-task-meta">
                <IconLoaderSpinner />
              </span>
            )}
            {task.indicator === 'warning' && !isTaskSelected && (
              <span className="agent-task-tree-task-meta">
                <IconWarning />
              </span>
            )}
          </span>
        ),
        icon: <IconMdTask />,
        secondaryText: task.time || undefined,
        isExpanded: (hasSelectedChild || (shouldExpandByDefault && hasChanges)) || undefined,
        children: hasChanges ? taskTree.treeData : undefined,
      };
    });

    return {
      treeData: [{
        id: AGENT_TASK_TREE_ROOT_NODE_ID,
        label: PROJECT_NAME,
        icon: 'nodes/folder',
        isExpanded: true,
        children: taskNodes,
      }],
      navigationByNodeId: nextNavigationByNodeId,
      defaultSelectedNodeId:
        selectedTreeNodeId === AGENT_TASK_TREE_ROOT_NODE_ID || nextNavigationByNodeId[selectedTreeNodeId]
          ? selectedTreeNodeId
          : (selected ? buildAgentTaskTreeTaskNodeId(selected) : AGENT_TASK_TREE_ROOT_NODE_ID),
    };
  }, [dismissedSuccessTaskIdSet, planTreesByTaskId, selected, selectedTreeNodeId, tasks]);
  useEffect(() => {
    if (!selected) return;

    const nextTaskNodeId = buildAgentTaskTreeTaskNodeId(selected);

    if (lastTreeDrivenTaskIdRef.current === selected) {
      lastTreeDrivenTaskIdRef.current = null;
      setSelectedTreeNodeId((prev) => (prev === nextTaskNodeId ? prev : nextTaskNodeId));
      return;
    }

    setSelectedTreeNodeId(nextTaskNodeId);
    setTreeSelectionResetKey((prev) => prev + 1);
  }, [selected]);
  useEffect(() => {
    if (!focusedNodeId) return;
    setSelectedTreeNodeId(focusedNodeId);
    setTreeSelectionResetKey((prev) => prev + 1);
  }, [focusedNodeId]);
  const handleTreeNodeSelect = useCallback((nodeId, isSelected) => {
    const navigationEntry = navigationByNodeId[nodeId] ?? null;
    if (!navigationEntry) return;

    setSelectedTreeNodeId((prev) => (prev === nodeId ? prev : nodeId));

    if (!isSelected) {
      setTreeSelectionResetKey((prev) => prev + 1);
    }

    if (navigationEntry.type === 'task') {
      const task = tasks.find((item) => item?.id === navigationEntry.taskId) ?? null;
      if (!task) return;

      lastTreeDrivenTaskIdRef.current = task.id;
      if (task.indicator === 'success') {
        onDismissSuccess?.(task.id);
      }
      onTaskSelect?.(task);
      return;
    }

    lastTreeDrivenTaskIdRef.current = navigationEntry.taskId ?? null;
    onPlanTreeNodeSelect?.(navigationEntry.taskId, nodeId);
  }, [navigationByNodeId, onDismissSuccess, onPlanTreeNodeSelect, onTaskSelect, tasks]);

  return (
    <ToolWindow
      title="Agent Tasks"
      width="100%"
      height="auto"
      actions={['add', 'more', 'minimize']}
      focused={ctx.focusedPanel === 'left'}
      onFocus={() => ctx.setFocusedPanel('left')}
      onActionClick={(action) => {
        if (action === 'minimize') ctx.setShowLeftPanel(false);
        if (action === 'add' && onAdd) onAdd();
      }}
      className="agent-tasks-window main-window-tool-window main-window-tool-window-left"
    >
      <div className="agent-task-tree">
        <Tree
          key={`agent-task-tree-${treeSelectionResetKey}`}
          data={treeData}
          defaultSelectedId={defaultSelectedNodeId}
          onNodeSelect={handleTreeNodeSelect}
        />
      </div>
    </ToolWindow>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('ide'); // 'welcome' | 'ide' | 'settings'
  const [ideTabs, setIdeTabs] = useState(() => buildInitialEditorTabs());
  const [ideTabContents, setIdeTabContents] = useState(() => buildInitialEditorTabContents());
  const [interactiveTaskStates, setInteractiveTaskStates] = useState(() => buildInitialInteractiveTaskStates());
  const [activeEditorTab, setActiveEditorTab] = useState(0);
  const [agentTasks, setAgentTasks] = useState(AGENT_TASKS);
  const [agentTasksFocusedNodeId, setAgentTasksFocusedNodeId] = useState(null);
  const [dismissedAgentTaskSuccessIds, setDismissedAgentTaskSuccessIds] = useState([]);
  const [agentTaskExecutionTimings, setAgentTaskExecutionTimings] = useState({});
  const [agentTaskTimeTick, setAgentTaskTimeTick] = useState(() => Date.now());
  const [selectedTask, setSelectedTask] = useState('t1');
  const [ideOpenWindows, setIdeOpenWindows] = useState([]);
  const [editorTabsHost, setEditorTabsHost] = useState(null);
  const [terminalTabsState, setTerminalTabsState] = useState([]);
  const [activeTerminalTabId, setActiveTerminalTabId] = useState(null);
  const [terminalSessions, setTerminalSessions] = useState({});
  const [terminalBlocks, setTerminalBlocks] = useState([]);
  const [terminalViewKey, setTerminalViewKey] = useState(0);
  const [isTerminalStreaming, setIsTerminalStreaming] = useState(false);
  const [pendingTerminalRun, setPendingTerminalRun] = useState(null);
  const [terminalPermissionPrompt, setTerminalPermissionPrompt] = useState(null);
  const [terminalPermissionScope, setTerminalPermissionScope] = useState(null);
  const [acWarningPermissionScope, setAcWarningPermissionScope] = useState(null);
  const initialVisitBookingTaskState = useMemo(
    () => getPresetAgentTaskDefinition('t1')?.interactiveState ?? createInteractiveTaskState({
      documentSections: createSpecDocument(),
      genState: 'done',
    }),
    [],
  );
  const [runStatesByTab, setRunStatesByTab] = useState({});
  const [acRunResult, setAcRunResult] = useState(() => initialVisitBookingTaskState.acRunResult ?? null); // null | string[] — statuses per AC checkbox
  const [pendingAcQuickFixCount, setPendingAcQuickFixCount] = useState(0);
  const [planRunResult, setPlanRunResult] = useState(() => initialVisitBookingTaskState.planRunResult ?? null);
  const [acWarningBanner, setAcWarningBanner] = useState(null);
  const lastRunSectionRef = useRef(null);
  const lastTerminalRunRequestRef = useRef(null);
  const queueTerminalRunRef = useRef(null);
  const currentTerminalRunTabIdRef = useRef(null);
  const currentRunSourceTabIdRef = useRef(null);
  const statusRevealTimeoutsRef = useRef({ ac: [], plan: [] });
  const chainedRunTimeoutRef = useRef(null);
  const acWarningFlowRef = useRef(null);
  const [genState, setGenState] = useState(() => initialVisitBookingTaskState.genState ?? 'done'); // 'idle' | 'done' in the current flow; loading/generating are kept behind a flag
  const [genProgress, setGenProgress] = useState(() => initialVisitBookingTaskState.genProgress ?? 1);
  const [generatedDocument, setGeneratedDocument] = useState(() => initialVisitBookingTaskState.documentSections ?? createSpecDocument());
  const [appliedIssueFixes, setAppliedIssueFixes] = useState(() => initialVisitBookingTaskState.appliedIssueFixes ?? { ac: {}, plan: {} });
  const [removedIssueIndices, setRemovedIssueIndices] = useState(() => initialVisitBookingTaskState.removedIssueIndices ?? { ac: {}, plan: {} });
  const [agentTaskCommentEntries, setAgentTaskCommentEntries] = useState(() => initialVisitBookingTaskState.commentEntries ?? []);
  const [doneCommentResetToken, setDoneCommentResetToken] = useState(0);
  const [highlightedProblemLocation, setHighlightedProblemLocation] = useState(null);
  const [updatedSpecRowTarget, setUpdatedSpecRowTarget] = useState(null);
  const [isVisitBookingProblemCommentFading, setIsVisitBookingProblemCommentFading] = useState(false);
  const [problemsFixMenu, setProblemsFixMenu] = useState(null);
  const [visitBookingProblemExpanded, setVisitBookingProblemExpanded] = useState(false);
  const [generationTabId, setGenerationTabId] = useState('agent-task-t1');
  const doneEnhanceFlowRef = useRef(null);
  const seededPresetTaskRef = useRef(false);
  const genTimerRef = useRef(null);
  const terminalDrivenGenerationRef = useRef(false);
  const terminalRunTimeoutsRef = useRef([]);
  const updatedSpecRowTimeoutRef = useRef(null);
  const visitBookingProblemCommentFadeTimeoutRef = useRef(null);
  const suppressDoneCommentsSyncRef = useRef(false);
  const suppressDoneCommentsSyncTimeoutRef = useRef(null);
  const specDoneScrollSnapshotsRef = useRef({});

  // Editor completion state
  const [editorCompletion, setEditorCompletion] = useState(null); // { trigger, query, selectedIdx, pos }
  const editorCompletionRef = useRef(null);
  const [idleSelectionToolbarPos, setIdleSelectionToolbarPos] = useState(null);

  // Attached files for editor toolbar
  const [attachedFilesByTab, setAttachedFilesByTab] = useState({});
  const [doneOverlayUiStates, setDoneOverlayUiStates] = useState({});
  const [specVersionsByTab, setSpecVersionsByTab] = useState({});
  const [planDiffUiStates, setPlanDiffUiStates] = useState({});
  const addPopupFiles = buildAddPopupFiles(agentTasks);
  const ideWindowKey = ideOpenWindows.join('|');
  const activeEditorTabMeta = ideTabs[activeEditorTab ?? 0] ?? null;
  const activeEditorTabId = activeEditorTabMeta?.id ?? null;
  const activeEditorTabContentEntry = activeEditorTabId ? (ideTabContents[activeEditorTabId] ?? null) : null;
  const activeSourceEditorTabId = activeEditorTabMeta?.sourceTabId
    ?? activeEditorTabContentEntry?.diffSourceTabId
    ?? (activeEditorTabId?.startsWith('plan-diff-')
      ? activeEditorTabId.slice('plan-diff-'.length)
      : activeEditorTabId);
  const visibleEditorStateTabId = activeSourceEditorTabId ?? activeEditorTabId;
  const runState = visibleEditorStateTabId ? (runStatesByTab[visibleEditorStateTabId] ?? 'default') : 'default';
  const attachedFiles = visibleEditorStateTabId && Array.isArray(attachedFilesByTab[visibleEditorStateTabId])
    ? attachedFilesByTab[visibleEditorStateTabId]
    : [];

  const resolveEditorStateTabId = useCallback((tabId = null) => (
    tabId ?? activeSourceEditorTabId ?? activeEditorTabId ?? generationTabId
  ), [activeEditorTabId, activeSourceEditorTabId, generationTabId]);

  const updateAttachedFilesForTab = useCallback((updater, tabId = null) => {
    const resolvedTabId = resolveEditorStateTabId(tabId);
    if (!resolvedTabId) return;

    setAttachedFilesByTab((prev) => {
      const previousFiles = Array.isArray(prev[resolvedTabId]) ? prev[resolvedTabId] : [];
      const nextFiles = typeof updater === 'function' ? updater(previousFiles) : updater;
      const normalizedNextFiles = Array.isArray(nextFiles) ? nextFiles : [];

      if (normalizedNextFiles === previousFiles) {
        return prev;
      }

      return {
        ...prev,
        [resolvedTabId]: normalizedNextFiles,
      };
    });
  }, [resolveEditorStateTabId]);

  const updateDoneOverlayUiStateForTab = useCallback((uiState, tabId = null) => {
    const resolvedTabId = resolveEditorStateTabId(tabId);
    if (!resolvedTabId) return;

    const normalizedNextUiState = normalizeDoneOverlayUiState(uiState);

    setDoneOverlayUiStates((prev) => {
      const previousUiState = prev[resolvedTabId] ?? null;

      if (areDoneOverlayUiStatesEqual(previousUiState, normalizedNextUiState)) {
        return prev;
      }

      if (Object.keys(normalizedNextUiState).length === 1 && normalizedNextUiState.breakpointKeys.length === 0) {
        if (!(resolvedTabId in prev)) {
          return prev;
        }

        const { [resolvedTabId]: _removedUiState, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [resolvedTabId]: normalizedNextUiState,
      };
    });
  }, [resolveEditorStateTabId]);

  const updateSpecVersionsForTab = useCallback((updater, tabId = null) => {
    const resolvedTabId = resolveEditorStateTabId(tabId);
    if (!resolvedTabId) return;

    setSpecVersionsByTab((prev) => {
      const previousHistory = prev[resolvedTabId] ?? null;
      const nextHistory = typeof updater === 'function'
        ? updater(previousHistory)
        : updater;

      if (nextHistory === previousHistory) {
        return prev;
      }

      if (!nextHistory) {
        if (!(resolvedTabId in prev)) {
          return prev;
        }

        const { [resolvedTabId]: _removedHistory, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [resolvedTabId]: nextHistory,
      };
    });
  }, [resolveEditorStateTabId]);

  const updatePlanDiffUiStateForTab = useCallback((uiState, tabId = null) => {
    const resolvedTabId = tabId ?? activeEditorTabId;
    if (!resolvedTabId) return;

    const normalizedNextUiState = normalizePlanDiffUiState(uiState);

    setPlanDiffUiStates((prev) => {
      const previousUiState = prev[resolvedTabId] ?? null;

      if (arePlanDiffUiStatesEqual(previousUiState, normalizedNextUiState)) {
        return prev;
      }

      if (arePlanDiffUiStatesEqual(normalizedNextUiState, null)) {
        if (!(resolvedTabId in prev)) {
          return prev;
        }

        const { [resolvedTabId]: _removedUiState, ...rest } = prev;
        return rest;
      }

      return {
        ...prev,
        [resolvedTabId]: normalizedNextUiState,
      };
    });
  }, [activeEditorTabId]);

  const restoreSpecDoneScrollForTab = useCallback((tabId) => {
    if (!tabId) return;

    scheduleSpecDoneScrollRestore(specDoneScrollSnapshotsRef.current[tabId] ?? null);
  }, []);

  const resolveRunStateTabId = useCallback((tabId = null) => (
    tabId ?? currentRunSourceTabIdRef.current ?? activeSourceEditorTabId ?? activeEditorTabId ?? generationTabId
  ), [activeEditorTabId, activeSourceEditorTabId, generationTabId]);

  const setRunStateForTab = useCallback((value, tabId = null) => {
    const resolvedTabId = resolveRunStateTabId(tabId);
    if (!resolvedTabId) return;

    setRunStatesByTab((prev) => {
      const previousState = prev[resolvedTabId] ?? 'default';
      const nextState = typeof value === 'function' ? value(previousState) : value;

      if (nextState === previousState) {
        return prev;
      }

      return {
        ...prev,
        [resolvedTabId]: nextState,
      };
    });
  }, [resolveRunStateTabId]);

  const updateTerminalSession = useCallback((tabId, updater) => {
    if (!tabId) return;

    setTerminalSessions((prev) => {
      const previousState = prev[tabId] ?? createTerminalSessionState();
      const nextState = typeof updater === 'function'
        ? updater(previousState)
        : { ...previousState, ...updater };

      if (nextState === previousState) {
        return prev;
      }

      return {
        ...prev,
        [tabId]: nextState,
      };
    });
  }, []);

  const resolveTerminalSessionMeta = useCallback((runRequest = null) => {
    const explicitSourceTabId =
      typeof runRequest?.sourceTabId === 'string' && runRequest.sourceTabId.length > 0
        ? runRequest.sourceTabId
        : null;
    const fallbackTab = ideTabs[activeEditorTab ?? 0] ?? null;
    const sourceTab = explicitSourceTabId
      ? (ideTabs.find((tab) => tab.id === explicitSourceTabId) ?? null)
      : (generationTabId
          ? (ideTabs.find((tab) => tab.id === generationTabId) ?? fallbackTab)
          : fallbackTab);
    const sourceTabId = explicitSourceTabId ?? sourceTab?.id ?? 'current-file';
    const label = runRequest?.taskLabel ?? sourceTab?.label ?? TERMINAL_TASK_TAB_BASE_LABEL;

    return {
      terminalTabId: buildTerminalSessionTabId(sourceTabId),
      sourceTabId: explicitSourceTabId ?? sourceTab?.id ?? null,
      label,
    };
  }, [activeEditorTab, generationTabId, ideTabs]);

  const ensureTerminalSession = useCallback((meta, options = {}) => {
    const { activate = true } = options;
    const tabId = meta?.terminalTabId;
    if (!tabId) return null;

    const nextTab = {
      id: tabId,
      label: meta?.label ?? TERMINAL_TASK_TAB_BASE_LABEL,
      closable: true,
      sourceTabId: meta?.sourceTabId ?? null,
    };

    setTerminalTabsState((prev) => {
      const existingIndex = prev.findIndex((tab) => tab.id === tabId);

      if (existingIndex >= 0) {
        const currentTab = prev[existingIndex];
        if (
          currentTab.label === nextTab.label &&
          currentTab.sourceTabId === nextTab.sourceTabId &&
          currentTab.closable === nextTab.closable
        ) {
          return prev;
        }

        const nextTabs = [...prev];
        nextTabs[existingIndex] = { ...currentTab, ...nextTab };
        return nextTabs;
      }

      return [...prev, nextTab];
    });

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      sourceTabId: meta?.sourceTabId ?? prev.sourceTabId ?? null,
      sourceTabLabel: meta?.label ?? prev.sourceTabLabel ?? TERMINAL_TASK_TAB_BASE_LABEL,
    }));

    if (activate) {
      setActiveTerminalTabId(tabId);
    }

    return tabId;
  }, [updateTerminalSession]);

  const setTerminalBlocksForTab = useCallback((blocks, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setTerminalBlocks(blocks);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      blocks: typeof blocks === 'function' ? blocks(prev.blocks) : blocks,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setTerminalStreamingForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setIsTerminalStreaming(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      isStreaming: typeof value === 'function' ? value(prev.isStreaming) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setPendingTerminalRunForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setPendingTerminalRun(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      pendingRun: typeof value === 'function' ? value(prev.pendingRun) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setTerminalPermissionPromptForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setTerminalPermissionPrompt(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      permissionPrompt: typeof value === 'function' ? value(prev.permissionPrompt) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const setAcWarningBannerForTab = useCallback((value, tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setAcWarningBanner(value);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      acWarningBanner: typeof value === 'function' ? value(prev.acWarningBanner) : value,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  const bumpTerminalViewKeyForTab = useCallback((tabId = currentTerminalRunTabIdRef.current ?? activeTerminalTabId) => {
    setTerminalViewKey((prev) => prev + 1);

    if (!tabId) return;

    updateTerminalSession(tabId, (prev) => ({
      ...prev,
      viewKey: (prev.viewKey ?? 0) + 1,
    }));
  }, [activeTerminalTabId, updateTerminalSession]);

  useEffect(() => {
    if (terminalTabsState.length === 0) {
      if (activeTerminalTabId !== null) {
        setActiveTerminalTabId(null);
      }
      return;
    }

    if (!activeTerminalTabId || !terminalTabsState.some((tab) => tab.id === activeTerminalTabId)) {
      setActiveTerminalTabId(terminalTabsState[0].id);
    }
  }, [activeTerminalTabId, terminalTabsState]);

  useEffect(() => {
    if (terminalTabsState.length === 0) return;

    setTerminalTabsState((prev) => {
      let didChange = false;
      const nextTabs = prev.map((tab) => {
        if (!tab.sourceTabId) return tab;

        const matchingEditorTab = ideTabs.find((editorTab) => editorTab.id === tab.sourceTabId);
        if (!matchingEditorTab || matchingEditorTab.label === tab.label) {
          return tab;
        }

        didChange = true;
        return {
          ...tab,
          label: matchingEditorTab.label,
        };
      });

      return didChange ? nextTabs : prev;
    });

    setTerminalSessions((prev) => {
      let didChange = false;
      const nextSessions = { ...prev };

      Object.entries(prev).forEach(([tabId, session]) => {
        const matchingTab = terminalTabsState.find((tab) => tab.id === tabId);
        if (!matchingTab?.sourceTabId) return;

        const matchingEditorTab = ideTabs.find((editorTab) => editorTab.id === matchingTab.sourceTabId);
        if (!matchingEditorTab || matchingEditorTab.label === session.sourceTabLabel) {
          return;
        }

        didChange = true;
        nextSessions[tabId] = {
          ...session,
          sourceTabLabel: matchingEditorTab.label,
        };
      });

      return didChange ? nextSessions : prev;
    });
  }, [ideTabs, terminalTabsState]);

  const clearTerminalRunAnimation = useCallback(() => {
    terminalRunTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    terminalRunTimeoutsRef.current = [];
    setTerminalStreamingForTab(false);
  }, [setTerminalStreamingForTab]);

  const clearStatusReveal = useCallback((kind) => {
    statusRevealTimeoutsRef.current[kind].forEach((timeoutId) => window.clearTimeout(timeoutId));
    statusRevealTimeoutsRef.current[kind] = [];
  }, []);

  const clearChainedRunTimeout = useCallback(() => {
    if (!chainedRunTimeoutRef.current) return;
    window.clearTimeout(chainedRunTimeoutRef.current);
    chainedRunTimeoutRef.current = null;
  }, []);

  const clearAcWarningFlow = useCallback(() => {
    acWarningFlowRef.current = null;
    setAcWarningBannerForTab(null);
  }, [setAcWarningBannerForTab]);

  const resetRunUiForTab = useCallback((sourceTabId) => {
    if (!sourceTabId) return;
    const terminalTabId = buildTerminalSessionTabId(sourceTabId);
    setRunStateForTab('default', sourceTabId);
    setPendingTerminalRunForTab(null, terminalTabId);
    setTerminalPermissionPromptForTab(null, terminalTabId);
    setAcWarningBannerForTab(null, terminalTabId);
    if (currentRunSourceTabIdRef.current === sourceTabId) {
      currentRunSourceTabIdRef.current = null;
    }
  }, [
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const resetDoneComments = useCallback(() => {
    if (visitBookingProblemCommentFadeTimeoutRef.current) {
      window.clearTimeout(visitBookingProblemCommentFadeTimeoutRef.current);
      visitBookingProblemCommentFadeTimeoutRef.current = null;
    }
    if (suppressDoneCommentsSyncTimeoutRef.current) {
      window.clearTimeout(suppressDoneCommentsSyncTimeoutRef.current);
      suppressDoneCommentsSyncTimeoutRef.current = null;
    }
    suppressDoneCommentsSyncRef.current = false;
    setIsVisitBookingProblemCommentFading(false);
    setAgentTaskCommentEntries([]);
    setDoneCommentResetToken((prev) => prev + 1);
  }, []);

  const fadeOutDoneComments = useCallback(() => {
    if (visitBookingProblemCommentFadeTimeoutRef.current) {
      return;
    }

    const tabIdToClear = generationTabId ?? activeSourceEditorTabId ?? activeEditorTabId;
    suppressDoneCommentsSyncRef.current = true;
    if (suppressDoneCommentsSyncTimeoutRef.current) {
      window.clearTimeout(suppressDoneCommentsSyncTimeoutRef.current);
      suppressDoneCommentsSyncTimeoutRef.current = null;
    }
    setIsVisitBookingProblemCommentFading(true);
    visitBookingProblemCommentFadeTimeoutRef.current = window.setTimeout(() => {
      visitBookingProblemCommentFadeTimeoutRef.current = null;
      setIsVisitBookingProblemCommentFading(false);
      setAgentTaskCommentEntries([]);
      if (tabIdToClear) {
        setInteractiveTaskStates((prev) => {
          const currentTaskState = prev[tabIdToClear];
          if (!currentTaskState || !Array.isArray(currentTaskState.commentEntries) || currentTaskState.commentEntries.length === 0) {
            return prev;
          }

          return {
            ...prev,
            [tabIdToClear]: {
              ...currentTaskState,
              commentEntries: [],
            },
          };
        });
      }
      setDoneCommentResetToken((prev) => prev + 1);
      suppressDoneCommentsSyncTimeoutRef.current = window.setTimeout(() => {
        suppressDoneCommentsSyncRef.current = false;
        suppressDoneCommentsSyncTimeoutRef.current = null;
      }, 900);
    }, 520);
  }, [activeEditorTabId, activeSourceEditorTabId, generationTabId]);

  const clearAgentTaskRuntime = useCallback(() => {
    if (genTimerRef.current) {
      clearTimeout(genTimerRef.current);
      genTimerRef.current = null;
    }

    doneEnhanceFlowRef.current = null;
    terminalDrivenGenerationRef.current = false;
    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');
    clearAcWarningFlow();
    clearTerminalRunAnimation();
    setPendingTerminalRunForTab(null);
    setTerminalPermissionPromptForTab(null);
    currentTerminalRunTabIdRef.current = null;
    setGenerationTabId(null);
    setGenProgress(0);
    setGenState('idle');
    setRunStateForTab('default');
    currentRunSourceTabIdRef.current = null;
    setAcRunResult(null);
    setPlanRunResult(null);
    resetDoneComments();
  }, [
    clearAcWarningFlow,
    clearChainedRunTimeout,
    clearStatusReveal,
    clearTerminalRunAnimation,
    resetDoneComments,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const applyInteractiveTaskState = useCallback((tabId, taskState) => {
    if (!tabId) return;

    const nextTaskState = taskState ?? getAgentTaskScenario({ tabId }).initialTaskState;
    const nextGenState = nextTaskState?.genState ?? 'idle';

    setGeneratedDocument(nextTaskState?.documentSections ?? []);
    setAppliedIssueFixes(nextTaskState?.appliedIssueFixes ?? cloneIssueStateMap());
    setRemovedIssueIndices(nextTaskState?.removedIssueIndices ?? cloneIssueStateMap());
    setAcRunResult(nextTaskState?.acRunResult ?? null);
    setPlanRunResult(nextTaskState?.planRunResult ?? null);
    setGenerationTabId(nextGenState === 'idle' ? null : tabId);
    setGenProgress(nextTaskState?.genProgress ?? (nextGenState === 'done' ? 1 : 0));
    setGenState(nextGenState);
    setAgentTaskCommentEntries(nextTaskState?.commentEntries ?? []);
    setDoneCommentResetToken((prev) => prev + 1);
  }, []);

  const getCurrentAgentTaskScenario = useCallback((tabId = null) => {
    const fallbackTab = ideTabs[activeEditorTab ?? 0] ?? null;
    const resolvedTab = tabId
      ? (ideTabs.find((tab) => tab.id === tabId) ?? fallbackTab)
      : (generationTabId
          ? (ideTabs.find((tab) => tab.id === generationTabId) ?? fallbackTab)
          : fallbackTab);

    return getAgentTaskScenario({
      tabId: resolvedTab?.id ?? '',
      label: resolvedTab?.label ?? '',
    });
  }, [activeEditorTab, generationTabId, ideTabs]);

  const getTaskRuntimeState = useCallback((tabId) => {
    if (!tabId) return null;

    const matchingTab = ideTabs.find((tab) => tab.id === tabId) ?? null;
    const scenario = getAgentTaskScenario({
      tabId,
      label: matchingTab?.label ?? '',
    });
    const isLiveTaskTab = tabId === activeSourceEditorTabId || tabId === generationTabId;
    const taskState = isLiveTaskTab
      ? {
          genState,
          genProgress,
          documentSections: generatedDocument,
          appliedIssueFixes,
          removedIssueIndices,
          acRunResult,
          planRunResult,
          commentEntries: agentTaskCommentEntries,
        }
      : (interactiveTaskStates[tabId] ?? scenario.initialTaskState);
    const persistedCode = ideTabContents[tabId]?.code;
    const baseCode =
      typeof persistedCode === 'string' && persistedCode.length > 0
        ? persistedCode
        : serializeSpecDocument(taskState?.documentSections ?? scenario.defaultDocument ?? []);

    return {
      tab: matchingTab,
      scenario,
      taskState,
      baseCode,
    };
  }, [
    activeSourceEditorTabId,
    acRunResult,
    agentTaskCommentEntries,
    appliedIssueFixes,
    genProgress,
    genState,
    generatedDocument,
    generationTabId,
    ideTabContents,
    ideTabs,
    interactiveTaskStates,
    planRunResult,
    removedIssueIndices,
  ]);

  const clearTaskCommentsForTab = useCallback((tabId) => {
    if (!tabId) return;

    setAgentTaskCommentEntries((prev) => (Array.isArray(prev) && prev.length > 0 ? [] : prev));
    setInteractiveTaskStates((prev) => {
      const currentTaskState = prev[tabId];
      if (!currentTaskState || !Array.isArray(currentTaskState.commentEntries) || currentTaskState.commentEntries.length === 0) {
        return prev;
      }

      return {
        ...prev,
        [tabId]: {
          ...currentTaskState,
          commentEntries: [],
        },
      };
    });
    setDoneCommentResetToken((prev) => prev + 1);
  }, []);

  const clearTaskCommentTargetForTab = useCallback((tabId, target) => {
    const normalizedTarget = normalizeCommentTarget(target);
    if (!tabId || !normalizedTarget) return;

    setAgentTaskCommentEntries((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const nextEntries = prev.filter((entry) => !doesEntryMatchCommentTarget(entry, normalizedTarget));
      return nextEntries.length === prev.length ? prev : nextEntries;
    });
    setInteractiveTaskStates((prev) => {
      const currentTaskState = prev[tabId];
      if (!currentTaskState || !Array.isArray(currentTaskState.commentEntries) || currentTaskState.commentEntries.length === 0) {
        return prev;
      }

      const nextEntries = currentTaskState.commentEntries.filter((entry) => !doesEntryMatchCommentTarget(entry, normalizedTarget));
      if (nextEntries.length === currentTaskState.commentEntries.length) {
        return prev;
      }

      return {
        ...prev,
        [tabId]: {
          ...currentTaskState,
          commentEntries: nextEntries,
        },
      };
    });
  }, []);

  const getCommentEntriesForTaskTab = useCallback((tabId) => {
    if (!tabId) return [];

    if (doneEnhanceFlowRef.current?.commentsAlreadyCleared && doneEnhanceFlowRef.current?.sourceTabId === tabId) {
      return [];
    }

    if (tabId === activeSourceEditorTabId || tabId === generationTabId) {
      return Array.isArray(agentTaskCommentEntries) ? agentTaskCommentEntries : [];
    }

    const storedTaskState = interactiveTaskStates[tabId];
    if (Array.isArray(storedTaskState?.commentEntries)) {
      return storedTaskState.commentEntries;
    }

    const matchingTab = ideTabs.find((tab) => tab.id === tabId) ?? null;
    const fallbackScenario = getAgentTaskScenario({
      tabId,
      label: matchingTab?.label ?? '',
    });

    return Array.isArray(fallbackScenario.initialTaskState?.commentEntries)
      ? fallbackScenario.initialTaskState.commentEntries
      : [];
  }, [
    activeSourceEditorTabId,
    agentTaskCommentEntries,
    generationTabId,
    ideTabs,
    interactiveTaskStates,
  ]);

  const getCommentDrivenViewStateForTaskTab = useCallback((tabId, options = {}) => {
    const runtimeState = getTaskRuntimeState(tabId);
    if (!runtimeState) return null;

    const { applyPendingComments = false } = options ?? {};
    const { scenario, taskState, baseCode } = runtimeState;
    const isTaskRunActive = (runStatesByTab[tabId] ?? 'default') === 'running';
    const baseDocumentSections = taskState?.documentSections ?? scenario.defaultDocument ?? [];
    let resolvedCode = baseCode;
    let resolvedDocumentSections = baseDocumentSections;
    let resolvedAppliedIssueFixes = cloneIssueStateMap(taskState?.appliedIssueFixes);
    let resolvedRemovedIssueIndices = cloneIssueStateMap(taskState?.removedIssueIndices);
    let commentResolution = null;

    if (applyPendingComments) {
      commentResolution = applyCommentCommandsToSpec({
        code: baseCode,
        documentSections: baseDocumentSections,
        commentEntries: taskState?.commentEntries ?? [],
        appliedIssueFixes: taskState?.appliedIssueFixes,
        removedIssueIndices: taskState?.removedIssueIndices,
      });
      resolvedCode = commentResolution.sourceCode;
      resolvedDocumentSections = commentResolution.nextDocument;
      resolvedAppliedIssueFixes = commentResolution.nextAppliedIssueFixes;
      resolvedRemovedIssueIndices = commentResolution.nextRemovedIssueIndices;
    }

    // Stored run results are authoritative after quick fixes / enhance reruns.
    // Rebuilding them from scenario defaults would resurrect resolved issues.
    const resolvedAcRunResult = taskState?.acRunResult ?? null;
    const resolvedPlanRunResult = taskState?.planRunResult ?? null;

    return {
      commentResolution,
      code: resolvedCode,
      documentSections: resolvedDocumentSections,
      appliedIssueFixes: resolvedAppliedIssueFixes,
      removedIssueIndices: resolvedRemovedIssueIndices,
      acRunResult: isTaskRunActive && Array.isArray(taskState?.acRunResult)
        ? taskState.acRunResult
        : resolvedAcRunResult,
      planRunResult: isTaskRunActive && Array.isArray(taskState?.planRunResult)
        ? taskState.planRunResult
        : resolvedPlanRunResult,
    };
  }, [getTaskRuntimeState, runStatesByTab]);

  const syncDiffCommentsToTaskTarget = useCallback(({
    sourceTabId,
    target,
    comments,
    sectionTitle = null,
    line = '',
  }) => {
    const normalizedTarget = normalizeCommentTarget(target);
    if (!sourceTabId || !normalizedTarget) return;

    const runtimeState = getTaskRuntimeState(sourceTabId);
    const taskLabel = runtimeState?.tab?.label ?? '';
    const nextDiffComments = Array.isArray(comments)
      ? undefined
      : normalizeStoredDiffCommentsState(comments);
    const nextComments = Array.isArray(comments)
      ? comments.filter((comment) => typeof comment === 'string' && comment.trim().length > 0)
      : flattenStoredDiffCommentsState(nextDiffComments);
    const targetMetadata = buildCommentTargetEntryMetadata(
      runtimeState?.taskState?.documentSections ?? runtimeState?.scenario?.defaultDocument ?? [],
      normalizedTarget,
      runtimeState?.taskState?.removedIssueIndices ?? cloneIssueStateMap(),
    );
    const metadata = {
      sectionTitle: sectionTitle ?? (normalizedTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria'),
      line: targetMetadata.line || line,
      rawIndex: targetMetadata.rawIndex,
      rowStableKey: targetMetadata.rowStableKey,
      diffComments: nextDiffComments,
    };

    setInteractiveTaskStates((prev) => {
      const currentTaskState = prev[sourceTabId] ?? getAgentTaskScenario({
        tabId: sourceTabId,
        label: taskLabel,
      }).initialTaskState;
      const nextCommentEntries = replaceCommentEntriesForTarget(
        currentTaskState?.commentEntries ?? [],
        normalizedTarget,
        nextComments,
        metadata,
      );

      if (JSON.stringify(currentTaskState?.commentEntries ?? []) === JSON.stringify(nextCommentEntries)) {
        return prev;
      }

      return {
        ...prev,
        [sourceTabId]: {
          ...currentTaskState,
          commentEntries: nextCommentEntries,
        },
      };
    });

    if (sourceTabId === activeSourceEditorTabId || sourceTabId === generationTabId) {
      setAgentTaskCommentEntries((prev) => replaceCommentEntriesForTarget(
        prev,
        normalizedTarget,
        nextComments,
        metadata,
      ));
    }
  }, [activeSourceEditorTabId, generationTabId, getTaskRuntimeState]);

  const handleAgentTaskSelect = useCallback((task) => {
    const resolvedTask = typeof task === 'string'
      ? (agentTasks.find((item) => item?.id === task) ?? null)
      : task;
    const taskId = typeof task === 'string' ? task : resolvedTask?.id;
    if (!taskId) return;

    const preset = getPresetAgentTaskDefinition(taskId);
    const resolvedTabId = preset?.tab?.id ?? getAgentTaskTabId(taskId) ?? taskId;
    const taskLabel = resolvedTask?.label ?? preset?.tab?.label ?? 'New Task.md';
    const scenario = getAgentTaskScenario({
      tabId: resolvedTabId,
      label: taskLabel,
    });
    const nextTab = preset?.tab ?? {
      id: resolvedTabId,
      label: taskLabel,
      icon: 'fileTypes/markdown',
      closable: true,
    };
    const nextContent = preset?.content ?? {
      language: 'text',
      code: scenario.initialCode,
    };
    const nextTaskState = interactiveTaskStates[resolvedTabId] ?? preset?.interactiveState ?? scenario.initialTaskState;

    setSelectedTask(taskId);
    setScreen('ide');

    const existingTabIndex = ideTabs.findIndex((tabItem) => tabItem.id === resolvedTabId);
    const nextTabs = existingTabIndex >= 0 ? ideTabs : [nextTab, ...ideTabs];
    const nextActiveTabIndex = existingTabIndex >= 0 ? existingTabIndex : 0;

    if (existingTabIndex < 0) {
      setIdeTabs(nextTabs);
    }

    setIdeTabContents((prev) => {
      if (prev[resolvedTabId]) return prev;

      return {
        ...prev,
        [resolvedTabId]: {
          ...(prev[resolvedTabId] ?? {}),
          ...nextContent,
        },
      };
    });
    setActiveEditorTab(nextActiveTabIndex);

    if (preset?.kind && preset.kind !== 'interactive') {
      return;
    }

    setInteractiveTaskStates((prev) => (
      prev[resolvedTabId]
        ? prev
        : { ...prev, [resolvedTabId]: nextTaskState }
    ));

    applyInteractiveTaskState(resolvedTabId, nextTaskState);
    setRunStateForTab('default', resolvedTabId);
    setPendingTerminalRunForTab(null, buildTerminalSessionTabId(resolvedTabId));
    setTerminalPermissionPromptForTab(null, buildTerminalSessionTabId(resolvedTabId));
    setAcWarningBannerForTab(null, buildTerminalSessionTabId(resolvedTabId));
  }, [
    agentTasks,
    applyInteractiveTaskState,
    ideTabs,
    interactiveTaskStates,
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const handleEditorTabChange = useCallback((nextIndex) => {
    setActiveEditorTab(nextIndex);

    const nextTab = ideTabs[nextIndex];
    if (!nextTab) return;

    restoreSpecDoneScrollForTab(nextTab.id);

    const matchingTask = agentTasks.find((task) => task.label === nextTab.label || task.id === nextTab.id);
    if (matchingTask && matchingTask.id !== selectedTask) {
      setSelectedTask(matchingTask.id);
    }

    if (!nextTab.id?.startsWith('agent-task-')) {
      return;
    }

    const nextTaskState = interactiveTaskStates[nextTab.id] ?? getAgentTaskScenario({
      tabId: nextTab.id,
      label: nextTab.label,
    }).initialTaskState;

    setInteractiveTaskStates((prev) => (
      prev[nextTab.id]
        ? prev
        : { ...prev, [nextTab.id]: nextTaskState }
    ));

    applyInteractiveTaskState(nextTab.id, nextTaskState);
  }, [agentTasks, applyInteractiveTaskState, ideTabs, interactiveTaskStates, restoreSpecDoneScrollForTab, selectedTask]);

  const requestProblemHighlight = useCallback((rawIndex) => {
    if (!Number.isInteger(rawIndex) || rawIndex < 0) return;

    const issueTarget = getDocumentCheckTargetAtRawIndex(generatedDocument, rawIndex, removedIssueIndices);

    setHighlightedProblemLocation((prev) => ({
      rawIndex,
      kind: issueTarget?.kind ?? null,
      index: issueTarget?.index ?? null,
      tabId: activeEditorTabId,
      requestKey: (prev?.requestKey ?? 0) + 1,
    }));
  }, [activeEditorTabId, generatedDocument, removedIssueIndices]);

  const triggerUpdatedSpecRowAnimation = useCallback((target) => {
    const normalizedTarget = normalizeCommentTarget(target);
    if (!normalizedTarget) return;

    if (updatedSpecRowTimeoutRef.current) {
      window.clearTimeout(updatedSpecRowTimeoutRef.current);
      updatedSpecRowTimeoutRef.current = null;
    }

    setUpdatedSpecRowTarget({
      ...normalizedTarget,
      phase: 'updated',
      requestKey: Date.now(),
    });
    updatedSpecRowTimeoutRef.current = window.setTimeout(() => {
      setUpdatedSpecRowTarget(null);
      updatedSpecRowTimeoutRef.current = null;
    }, 950);
  }, []);

  useEffect(() => {
    if (!activeEditorTabId?.startsWith('agent-task-')) return;

    setInteractiveTaskStates((prev) => {
      const nextTaskState = {
        genState,
        genProgress,
        documentSections: generatedDocument,
        appliedIssueFixes,
        removedIssueIndices,
        acRunResult,
        planRunResult,
        commentEntries: agentTaskCommentEntries,
      };
      const previousTaskState = prev[activeEditorTabId];

      if (
        previousTaskState &&
        previousTaskState.genState === nextTaskState.genState &&
        previousTaskState.genProgress === nextTaskState.genProgress &&
        previousTaskState.documentSections === nextTaskState.documentSections &&
        previousTaskState.appliedIssueFixes === nextTaskState.appliedIssueFixes &&
        previousTaskState.removedIssueIndices === nextTaskState.removedIssueIndices &&
        previousTaskState.acRunResult === nextTaskState.acRunResult &&
        previousTaskState.planRunResult === nextTaskState.planRunResult &&
        previousTaskState.commentEntries === nextTaskState.commentEntries
      ) {
        return prev;
      }

      return {
        ...prev,
        [activeEditorTabId]: nextTaskState,
      };
    });
  }, [
    acRunResult,
    activeEditorTabId,
    agentTaskCommentEntries,
    appliedIssueFixes,
    genProgress,
    genState,
    generatedDocument,
    planRunResult,
    removedIssueIndices,
  ]);

  const handleProblemsNodeSelect = useCallback((nodeId, selected) => {
    if (!selected) return;

    if (typeof nodeId === 'string' && nodeId.includes('visit-conflict-diagnostic')) {
      setVisitBookingProblemExpanded(true);
    }

    const rawIndex = getProblemRawIndexFromTreeNodeId(nodeId);
    if (!Number.isInteger(rawIndex)) return;

    requestProblemHighlight(rawIndex);
  }, [requestProblemHighlight]);

  const buildDoneCommentResolution = useCallback((commentEntriesOverride = null) => {
    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;
    const currentCode = currentTabId ? (ideTabContents[currentTabId]?.code ?? '') : '';

    return applyCommentCommandsToSpec({
      code: currentCode,
      documentSections: generatedDocument,
      commentEntries: commentEntriesOverride ?? agentTaskCommentEntries,
      appliedIssueFixes,
      removedIssueIndices,
    });
  }, [activeEditorTab, agentTaskCommentEntries, appliedIssueFixes, generatedDocument, generationTabId, ideTabContents, ideTabs, removedIssueIndices]);

  const applyDoneCommentResolution = useCallback((commentResolution) => {
    if (!commentResolution?.hasActionableComments) return false;

    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;
    const currentScenario = getCurrentAgentTaskScenario(currentTabId);
    const nextAcStatuses = acRunResult
      ? buildResolvedRunStatuses(
          currentScenario.acBaseStatuses,
          'ac',
          commentResolution.nextAppliedIssueFixes,
          commentResolution.nextRemovedIssueIndices,
        )
      : null;
    const nextPlanStatuses = planRunResult
      ? buildResolvedRunStatuses(
          currentScenario.planBaseStatuses,
          'plan',
          commentResolution.nextAppliedIssueFixes,
          commentResolution.nextRemovedIssueIndices,
        )
      : null;

    if (currentTabId) {
      setIdeTabContents((prev) => {
        const currentEntry = prev[currentTabId] ?? { language: 'markdown', code: '' };
        return {
          ...prev,
          [currentTabId]: {
            ...currentEntry,
            language: 'markdown',
            code: commentResolution.sourceCode,
          },
        };
      });
    }

    setGeneratedDocument(commentResolution.nextDocument);
    setAppliedIssueFixes(commentResolution.nextAppliedIssueFixes);
    setRemovedIssueIndices(commentResolution.nextRemovedIssueIndices);
    setAcRunResult(nextAcStatuses);
    setPlanRunResult(nextPlanStatuses);

    return true;
  }, [acRunResult, activeEditorTab, generationTabId, getCurrentAgentTaskScenario, ideTabs, planRunResult]);

  const buildPendingDoneSpecState = useCallback((options = {}) => {
    const {
      tabId: tabIdOverride = null,
      commentEntries: commentEntriesOverride = null,
      applyPendingComments = true,
    } = options ?? {};
    const sourceTabId = tabIdOverride ?? generationTabId ?? activeEditorTabId;
    if (!sourceTabId) return null;

    const runtimeState = getTaskRuntimeState(sourceTabId);
    const currentViewState = getCommentDrivenViewStateForTaskTab(sourceTabId);
    const currentCode =
      typeof ideTabContents[sourceTabId]?.code === 'string'
        ? ideTabContents[sourceTabId].code
        : (runtimeState?.baseCode ?? '');
    const displayCode = currentViewState?.code ?? currentCode;
    const baseDocumentSections =
      currentViewState?.documentSections
      ?? runtimeState?.taskState?.documentSections
      ?? runtimeState?.scenario?.defaultDocument
      ?? generatedDocument;
    const snapshotCode = buildDoneOverlaySnapshotCode(displayCode);
    const snapshotDocument = parseSpecCodeToDocumentSections(snapshotCode, baseDocumentSections);
    const normalizedCommentEntries = Array.isArray(commentEntriesOverride)
      ? commentEntriesOverride
      : (Array.isArray(agentTaskCommentEntries) ? agentTaskCommentEntries : []);
    const hasPlanSectionComment = applyPendingComments && normalizedCommentEntries.some((entry) => {
      const target = entry.issueTarget ?? entry.checkTarget;
      const hasNoPlanItemTarget = !target || target.kind !== 'plan';
      const isPlanSection = (entry.sectionTitle ?? '').toLowerCase() === 'plan';
      return hasNoPlanItemTarget && isPlanSection;
    });
    const currentAppliedIssueFixes = cloneIssueStateMap(
      currentViewState?.appliedIssueFixes
      ?? runtimeState?.taskState?.appliedIssueFixes
      ?? appliedIssueFixes,
    );
    const currentRemovedIssueIndices = cloneIssueStateMap(
      currentViewState?.removedIssueIndices
      ?? runtimeState?.taskState?.removedIssueIndices
      ?? removedIssueIndices,
    );
    let targetCode = snapshotCode;
    let nextDocument = snapshotDocument;
    let nextPendingAppliedIssueFixes = cloneIssueStateMap(currentAppliedIssueFixes);
    let nextRemovedIssueIndices = cloneIssueStateMap(currentRemovedIssueIndices);
    let commentResolution = null;
    let restoredPlanItemsFromEmptyPlan = false;
    let restoredPlanFrames = [];

    if (applyPendingComments && normalizedCommentEntries.length > 0) {
      commentResolution = applyCommentCommandsToSpec({
        code: snapshotCode,
        documentSections: snapshotDocument,
        commentEntries: normalizedCommentEntries,
        appliedIssueFixes: nextPendingAppliedIssueFixes,
        removedIssueIndices: nextRemovedIssueIndices,
      });
      targetCode = commentResolution.sourceCode;
      nextDocument = commentResolution.nextDocument;
      nextPendingAppliedIssueFixes = commentResolution.nextAppliedIssueFixes;
      nextRemovedIssueIndices = commentResolution.nextRemovedIssueIndices;
    }

    if (hasPlanSectionComment && getSectionCheckItemCount(nextDocument, 'Plan') === 0) {
      const scenarioPlanSection = (runtimeState?.scenario?.defaultDocument ?? []).find((section) => (
        typeof section?.title === 'string' && section.title.toLowerCase() === 'plan'
      ));
      const fallbackPlanItems = (scenarioPlanSection?.items ?? []).some((item) => item?.type === 'check')
        ? scenarioPlanSection.items
        : createVisitBookingPlanItems();
      restoredPlanFrames = buildPlanRestoreFrames(nextDocument, fallbackPlanItems);
      const restoredDocument = restorePlanItemsIfEmpty(nextDocument, fallbackPlanItems);
      if (restoredDocument !== nextDocument) {
        nextDocument = restoredDocument;
        targetCode = serializeSpecDocument(nextDocument);
        restoredPlanItemsFromEmptyPlan = true;
      }
    }

    const documentWithPendingFixes = applyPendingIssueFixesToSpec({
      code: targetCode,
      documentSections: nextDocument,
      appliedIssueFixes: nextPendingAppliedIssueFixes,
      removedIssueIndices: nextRemovedIssueIndices,
    });
    targetCode = documentWithPendingFixes.code;
    nextDocument = documentWithPendingFixes.documentSections;

    const documentWithQuickFixDecisions = addVisitBookingDecisionsAfterQuickFixes(
      nextDocument,
      nextPendingAppliedIssueFixes,
    );
    if (documentWithQuickFixDecisions !== nextDocument) {
      nextDocument = documentWithQuickFixDecisions;
      targetCode = serializeSpecDocument(nextDocument);
    }

    const currentAcRunResult =
      currentViewState?.acRunResult
      ?? runtimeState?.taskState?.acRunResult
      ?? acRunResult;
    const currentPlanRunResult =
      currentViewState?.planRunResult
      ?? runtimeState?.taskState?.planRunResult
      ?? planRunResult;
    // Status carry-over after Enhance follows the current draft edits only.
    // Comment-driven rewrites do not introduce new outdated items by themselves.
    const nextAcRunResult = Array.isArray(currentAcRunResult)
      ? remapRunStatusesForRemovedIssueIndices(
          'ac',
          currentAcRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
        )
      : (currentAcRunResult ?? null);
    const nextPlanRunResult = Array.isArray(currentPlanRunResult)
      ? remapRunStatusesForRemovedIssueIndices(
          'plan',
          currentPlanRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
        )
      : (currentPlanRunResult ?? null);
    const rerunAcOriginalIndices = collectRunRerunOriginalIndices({
      kind: 'ac',
      currentDocumentSections: baseDocumentSections,
      nextDocumentSections: nextDocument,
      currentStatuses: currentAcRunResult,
      nextStatuses: nextAcRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
    });
    let rerunPlanOriginalIndices = collectRunRerunOriginalIndices({
      kind: 'plan',
      currentDocumentSections: baseDocumentSections,
      nextDocumentSections: nextDocument,
      currentStatuses: currentPlanRunResult,
      nextStatuses: nextPlanRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
    });
    // If there are comments on plan items (or on the Plan section heading/separator),
    // include those items in rerun so plan is regenerated.
    // A comment on the Plan heading (no specific item target, sectionTitle === 'Plan')
    // triggers a full-plan rerun — all items are regenerated.
    if (applyPendingComments && Array.isArray(normalizedCommentEntries) && normalizedCommentEntries.length > 0) {
      let planCommentIndices = normalizedCommentEntries
        .map((entry) => {
          const target = entry.issueTarget ?? entry.checkTarget;
          return (target?.kind === 'plan') ? target.index : null;
        })
        .filter((idx) => Number.isInteger(idx) && idx >= 0);

      if (hasPlanSectionComment) {
        // Schedule all currently visible plan items for rerun, including specs whose
        // plan count differs from the default scenario status list.
        const allPlanIndices = getVisibleDocumentCheckOriginalIndices('plan', nextDocument, nextRemovedIssueIndices);
        planCommentIndices = mergeOriginalIssueIndices(planCommentIndices, allPlanIndices);
      }

      if (planCommentIndices.length > 0) {
        rerunPlanOriginalIndices = mergeOriginalIssueIndices(rerunPlanOriginalIndices, planCommentIndices);
      }
    }
    const hasPendingReruns = rerunAcOriginalIndices.length > 0 || rerunPlanOriginalIndices.length > 0;

    return {
      sourceTabId,
      currentCode,
      snapshotCode,
      targetCode,
      pendingCommentEntriesSnapshot: normalizeSpecVersionCommentEntries(normalizedCommentEntries),
      nextDocument,
      nextAppliedIssueFixes: cloneIssueStateMap(nextPendingAppliedIssueFixes),
      nextRemovedIssueIndices,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      restoredPlanItemsFromEmptyPlan,
      restoredPlanFrames,
      hasPendingReruns,
      commentResolution,
      hasPendingComments: applyPendingComments && normalizedCommentEntries.length > 0,
      hasSpecChanges:
        normalizeSpecCodeForComparison(targetCode) !== normalizeSpecCodeForComparison(currentCode),
    };
  }, [
    acRunResult,
    activeEditorTabId,
    agentTaskCommentEntries,
    appliedIssueFixes,
    generatedDocument,
    generationTabId,
    getCommentDrivenViewStateForTaskTab,
    getTaskRuntimeState,
    ideTabContents,
    planRunResult,
    removedIssueIndices,
  ]);

  const openPlanDiffTab = useCallback(({ text, statusItem, issueTarget, source = null, navigation = null }) => {
    const sourceTab = source?.tabId
      ? (ideTabs.find((tab) => tab.id === source.tabId) ?? null)
      : (ideTabs[activeEditorTab ?? 0] ?? null);
    const sourceTabId = source?.tabId ?? sourceTab?.id ?? null;
    const sourceTabLabel = source?.label ?? sourceTab?.label ?? null;
    if (!sourceTabId || !sourceTabLabel) return;

    if (sourceTabId === activeSourceEditorTabId || sourceTabId === activeEditorTabId) {
      const scrollSnapshot = captureSpecDoneScrollSnapshot();
      if (scrollSnapshot) {
        specDoneScrollSnapshotsRef.current[sourceTabId] = scrollSnapshot;
      }
    }

    const diffTarget = normalizeCommentTarget(issueTarget);
    const sourceViewState = getCommentDrivenViewStateForTaskTab(sourceTabId);
    const sourceCode = typeof source?.code === 'string'
      ? source.code
      : (sourceViewState?.code ?? ideTabContents[sourceTabId]?.code ?? '');
    const diffTabId = buildPlanDiffTabId(sourceTabId);
    const diffData = buildPlanDiffData({
      sourceCode,
      text,
      statusItem,
      issueTarget,
      sourceTabLabel,
    });
    const diffCode = buildPlanDiffTabContent({
      sourceCode,
      text,
      statusItem,
      issueTarget,
      sourceTabLabel,
    });
    const diffTabLabel = diffData.title || `Diff ${diffData.sourceTabLabel || sourceTabLabel}`;
    const currentTaskCommentEntries = getCommentEntriesForTaskTab(sourceTabId);
    const initialDiffComments = buildPlanDiffInitialComments(
      currentTaskCommentEntries,
      diffData,
      diffTarget,
    );

    const sourceTabIndex = ideTabs.findIndex((tab) => tab.id === sourceTabId);
    const existingDiffTabIndex = ideTabs.findIndex((tab) => tab.id === diffTabId);
    const insertIndex = sourceTabIndex >= 0
      ? sourceTabIndex + 1
      : Math.min(Math.max(activeEditorTab ?? 0, 0) + 1, ideTabs.length);
    const nextActiveTabIndex = existingDiffTabIndex >= 0 ? existingDiffTabIndex : insertIndex;
    const diffTab = {
      id: diffTabId,
      label: diffTabLabel,
      icon: DIFF_TAB_ICON_NAME,
      closable: true,
      sourceTabId,
    };

    setIdeTabs(existingDiffTabIndex >= 0
      ? ideTabs.map((tab, index) => (index === existingDiffTabIndex ? diffTab : tab))
      : [
          ...ideTabs.slice(0, insertIndex),
          diffTab,
          ...ideTabs.slice(insertIndex),
        ]);
    setIdeTabContents((prev) => ({
      ...prev,
      [diffTabId]: {
        language: diffData.language || 'text',
        code: diffCode,
        diffData,
        diffSourceTabId: sourceTabId,
        diffTarget,
        diffLineText: text,
        initialDiffComments,
      },
    }));
    if (navigation?.activeRowId) {
      updatePlanDiffUiStateForTab(
        {
          activeRowId: navigation.activeRowId,
          commentRowId: null,
          commentValue: '',
          commentEditingIndex: null,
          caretState: {
            rowId: navigation.activeRowId,
            left: 12,
          },
        },
        diffTabId,
      );
    }
    const resolvedTaskId = source?.taskId
      ?? getAgentTaskIdForEditorTab({ id: sourceTabId, label: sourceTabLabel }, agentTasks);
    if (resolvedTaskId) {
      setSelectedTask(resolvedTaskId);
      if (issueTarget?.kind === 'plan' && Number.isInteger(issueTarget.index)) {
        setAgentTasksFocusedNodeId(`agent-task-tree-file:${resolvedTaskId}:${issueTarget.index}:0`);
      }
    }
    setScreen('ide');
    setActiveEditorTab(nextActiveTabIndex);
  }, [
    activeEditorTab,
    activeEditorTabId,
    activeSourceEditorTabId,
    agentTasks,
    getCommentDrivenViewStateForTaskTab,
    getCommentEntriesForTaskTab,
    ideTabContents,
    ideTabs,
    updatePlanDiffUiStateForTab,
  ]);

  const openSpecVersionDiffTab = useCallback(({
    sourceTabId,
    fromVersion,
    toVersion,
  }) => {
    if (!sourceTabId || !fromVersion?.id || !toVersion?.id || fromVersion.id === toVersion.id) {
      return;
    }

    const sourceTab = ideTabs.find((tab) => tab.id === sourceTabId) ?? null;
    const sourceTabIndex = Math.max(ideTabs.findIndex((tab) => tab.id === sourceTabId), 0);
    const diffTabId = buildSpecVersionDiffTabId(sourceTabId, fromVersion.id, toVersion.id);
  const diffData = buildSpecVersionDiffData({
      sourceCode: fromVersion.code,
      targetCode: toVersion.code,
      sourceTabLabel: sourceTab?.label ?? TERMINAL_TASK_TAB_BASE_LABEL,
      fromVersion,
      toVersion,
    });
    const diffCode = buildDiffTabContentFromRows(diffData);
    const initialDiffComments = buildSpecVersionDiffInitialComments({
      diffData,
      fromVersion,
      toVersion,
    });
    const existingDiffTabIndex = ideTabs.findIndex((tab) => tab.id === diffTabId);
    const nextActiveTabIndex = existingDiffTabIndex >= 0 ? existingDiffTabIndex : sourceTabIndex + 1;
    const diffTab = {
      id: diffTabId,
      label: diffData.title,
      icon: DIFF_TAB_ICON_NAME,
      closable: true,
      sourceTabId,
    };

    setIdeTabs(existingDiffTabIndex >= 0
      ? ideTabs.map((tab, index) => (index === existingDiffTabIndex ? diffTab : tab))
      : [
          ...ideTabs.slice(0, sourceTabIndex + 1),
          diffTab,
          ...ideTabs.slice(sourceTabIndex + 1),
        ]);
    setIdeTabContents((prev) => ({
      ...prev,
      [diffTabId]: {
        language: diffData.language || 'text',
        code: diffCode,
        diffData,
        diffSourceTabId: sourceTabId,
        diffTarget: null,
        diffLineText: diffData.lineText,
        initialDiffComments,
      },
    }));
    setActiveEditorTab(nextActiveTabIndex);
  }, [ideTabs]);

  const revealRunStatuses = useCallback((kind, statuses, options = {}) => {
    const {
      initialResult = [],
      startIndex = 0,
      initialDelay = 0,
      indices = null,
      pausePredicate = null,
      onPause,
      onComplete,
    } = options;
    const setResult = kind === 'ac' ? setAcRunResult : setPlanRunResult;
    clearStatusReveal(kind);

    if (!statuses?.length) {
      setResult(null);
      onComplete?.([]);
      return;
    }

    const seedResult = Array.isArray(initialResult) ? [...initialResult] : [];
    let latestResult = seedResult;
    setResult(seedResult);

    const revealIndices = Array.isArray(indices)
      ? indices.filter((index) => Number.isInteger(index) && index >= 0 && index < statuses.length)
      : null;

    if (revealIndices && revealIndices.length === 0) {
      onComplete?.(latestResult);
      return;
    }

    if (revealIndices) {
      const scheduleIndexedStep = (listIndex, delay) => {
        const statusIndex = revealIndices[listIndex];
        const timeoutId = window.setTimeout(() => {
          latestResult = ((prev) => {
            const next = Array.isArray(prev) ? [...prev] : [...latestResult];
            next[statusIndex] = statuses[statusIndex];
            return next;
          })(latestResult);
          setResult(latestResult);
          statusRevealTimeoutsRef.current[kind] = statusRevealTimeoutsRef.current[kind].filter((id) => id !== timeoutId);

          if (pausePredicate?.(statuses[statusIndex], statusIndex, latestResult)) {
            onPause?.(latestResult, statusIndex);
            return;
          }

          if (listIndex >= revealIndices.length - 1) {
            onComplete?.(latestResult);
            return;
          }

          scheduleIndexedStep(listIndex + 1, RUN_STATUS_REVEAL_STEP_DELAY_MS);
        }, delay);

        statusRevealTimeoutsRef.current[kind].push(timeoutId);
      };

      scheduleIndexedStep(0, initialDelay);
      return;
    }

    if (startIndex >= statuses.length) {
      onComplete?.(latestResult);
      return;
    }

    const scheduleStep = (idx, delay) => {
      const timeoutId = window.setTimeout(() => {
        latestResult = ((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [...latestResult];
          next[idx] = statuses[idx];
          return next;
        })(latestResult);
        setResult(latestResult);
        statusRevealTimeoutsRef.current[kind] = statusRevealTimeoutsRef.current[kind].filter((id) => id !== timeoutId);

        if (pausePredicate?.(statuses[idx], idx, latestResult)) {
          onPause?.(latestResult, idx);
          return;
        }

        if (idx >= statuses.length - 1) {
          onComplete?.(latestResult);
          return;
        }

        scheduleStep(idx + 1, RUN_STATUS_REVEAL_STEP_DELAY_MS);
      }, delay);

      statusRevealTimeoutsRef.current[kind].push(timeoutId);
    };

    scheduleStep(startIndex, initialDelay);
  }, [clearStatusReveal]);

  const startDoneEnhanceStatusReveal = useCallback((nextPlanStatuses = null, nextAcStatuses = null, options = {}) => {
    const {
      currentPlanStatuses = null,
      currentAcStatuses = null,
      currentRemovedIssueIndices = null,
      nextRemovedIssueIndices = null,
      rerunPlanOriginalIndices = [],
      rerunAcOriginalIndices = [],
      allowPendingOutdated = true,
    } = options ?? {};
    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');

    const applySelectiveStatuses = ({
      kind,
      nextStatuses,
      currentStatuses,
      rerunOriginalIndices,
      onComplete = null,
    }) => {
      const setResult = kind === 'ac' ? setAcRunResult : setPlanRunResult;
      if (!Array.isArray(nextStatuses)) {
        setResult(nextStatuses);
        onComplete?.(nextStatuses);
        return;
      }

      const initialResult = buildRunStatusesRevealSeed({
        kind,
        currentStatuses,
        nextStatuses,
        currentRemovedIssueIndices,
        nextRemovedIssueIndices,
        rerunOriginalIndices,
        allowPendingOutdated,
      });

      // If there are rerun items, animate them from the outdated seed to their final status.
      if (Array.isArray(rerunOriginalIndices) && rerunOriginalIndices.length > 0) {
        const visibleRerunIndices = rerunOriginalIndices
          .map((origIdx) => mapOriginalIssueIndexToVisible(kind, origIdx, nextRemovedIssueIndices))
          .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < nextStatuses.length);

        if (visibleRerunIndices.length > 0) {
          revealRunStatuses(kind, nextStatuses, {
            initialResult: Array.isArray(initialResult) ? initialResult : [],
            indices: visibleRerunIndices,
            initialDelay: RUN_STATUS_REVEAL_STEP_DELAY_MS,
            onComplete,
          });
          return;
        }
      }

      setResult(initialResult);
      onComplete?.(initialResult);
    };

    const revealAcceptanceCriteria = () => {
      applySelectiveStatuses({
        kind: 'ac',
        nextStatuses: nextAcStatuses,
        currentStatuses: currentAcStatuses,
        rerunOriginalIndices: rerunAcOriginalIndices,
      });
    };

    if (Array.isArray(nextPlanStatuses) && nextPlanStatuses.length > 0) {
      applySelectiveStatuses({
        kind: 'plan',
        nextStatuses: nextPlanStatuses,
        currentStatuses: currentPlanStatuses,
        rerunOriginalIndices: rerunPlanOriginalIndices,
        onComplete: () => {
          if (Array.isArray(nextAcStatuses) && nextAcStatuses.length > 0) {
            clearChainedRunTimeout();
            chainedRunTimeoutRef.current = window.setTimeout(() => {
              chainedRunTimeoutRef.current = null;
              revealAcceptanceCriteria();
            }, CHAINED_SECTION_START_DELAY_MS);
            return;
          }

          setAcRunResult(nextAcStatuses);
        },
      });
      return;
    }

    applySelectiveStatuses({
      kind: 'plan',
      nextStatuses: nextPlanStatuses,
      currentStatuses: currentPlanStatuses,
      rerunOriginalIndices: rerunPlanOriginalIndices,
    });
    revealAcceptanceCriteria();
  }, [clearChainedRunTimeout, clearStatusReveal, revealRunStatuses]);

  const finishTerminalRun = useCallback((options = {}) => {
    const { advanceGeneration = false, cancelGeneration = false } = options;
    const currentScenario = getCurrentAgentTaskScenario();
    const lastRunRequest = lastTerminalRunRequestRef.current;
    const runCompleteOpts = { runComplete: true };
    const nextAcRunStatuses = buildResolvedRunStatuses(
      currentScenario.acBaseStatuses,
      'ac',
      appliedIssueFixes,
      removedIssueIndices,
      runCompleteOpts,
    );
    const nextPlanRunStatuses = buildResolvedRunStatuses(
      currentScenario.planBaseStatuses,
      'plan',
      appliedIssueFixes,
      removedIssueIndices,
      runCompleteOpts,
    );
    setTerminalStreamingForTab(false);
    setRunStateForTab('default', currentRunSourceTabIdRef.current);
    currentRunSourceTabIdRef.current = null;
    terminalDrivenGenerationRef.current = false;
    if (advanceGeneration && AGENT_TASK_GENERATING_STATE_ENABLED) {
      setGenState('generating');
      return;
    }
    const section = (lastRunSectionRef.current || '').toLowerCase();
    if (section === 'acceptance criteria') {
      const acRevealOptions = buildSelectiveRunRevealOptions({
        kind: 'ac',
        runRequest: lastRunRequest,
        currentStatuses: acRunResult,
        removedIssueIndices,
      });
      // Clear applied AC fixes — run result is now authoritative
      setAppliedIssueFixes((prev) => ({ ...prev, ac: {} }));
      setPendingAcQuickFixCount(0);
      revealRunStatuses('ac', nextAcRunStatuses, {
        initialResult: acRevealOptions.initialResult,
        ...(acRevealOptions.hasSelectiveRerun
          ? { indices: acRevealOptions.indices }
          : {}),
      });
    } else if (section === 'plan') {
      const planRevealOptions = buildSelectiveRunRevealOptions({
        kind: 'plan',
        runRequest: lastRunRequest,
        currentStatuses: planRunResult,
        removedIssueIndices,
      });
      // Clear applied plan fixes — run result is now authoritative
      setAppliedIssueFixes((prev) => ({ ...prev, plan: {} }));
      revealRunStatuses('plan', nextPlanRunStatuses, {
        initialResult: planRevealOptions.initialResult,
        ...(planRevealOptions.hasSelectiveRerun
          ? { indices: planRevealOptions.indices }
          : {}),
      });
      if (!cancelGeneration && lastRunRequest?.mode === 'section') {
        clearChainedRunTimeout();
        const revealSteps = planRevealOptions.hasSelectiveRerun
          ? planRevealOptions.indices.length
          : nextPlanRunStatuses.length;
        const revealDuration = RUN_STATUS_REVEAL_STEP_DELAY_MS * Math.max(revealSteps - 1, 0);
        chainedRunTimeoutRef.current = window.setTimeout(() => {
          chainedRunTimeoutRef.current = null;
          queueTerminalRunRef.current?.({
            ...lastRunRequest,
            sectionTitle: 'Acceptance Criteria',
          }, {
            preserveAcRunResult: true,
            preservePlanRunResult: true,
          });
        }, revealDuration + CHAINED_SECTION_START_DELAY_MS);
        return;
      }
    }
    if (cancelGeneration) {
      clearChainedRunTimeout();
      clearAcWarningFlow();
      setGenerationTabId(null);
      setGenState('idle');
    }
  }, [
    appliedIssueFixes,
    clearAcWarningFlow,
    clearChainedRunTimeout,
    getCurrentAgentTaskScenario,
    removedIssueIndices,
    revealRunStatuses,
    acRunResult,
    planRunResult,
    setAppliedIssueFixes,
    setRunStateForTab,
    setTerminalStreamingForTab,
  ]);

  const resetTerminalOutput = useCallback(() => {
    clearTerminalRunAnimation();
    setTerminalBlocksForTab([]);
    setTerminalPermissionPromptForTab(null);
    bumpTerminalViewKeyForTab();
  }, [
    bumpTerminalViewKeyForTab,
    clearTerminalRunAnimation,
    setTerminalBlocksForTab,
    setTerminalPermissionPromptForTab,
  ]);

  const handleEditorTabClose = useCallback((indexToClose) => {
    if (!Number.isInteger(indexToClose) || indexToClose < 0 || indexToClose >= ideTabs.length) {
      return;
    }

    const closingTab = ideTabs[indexToClose];
    const resolvedActiveTab = Number.isInteger(activeEditorTab) ? activeEditorTab : 0;
    const wasClosingActiveTab = resolvedActiveTab === indexToClose;
    const nextTabs = ideTabs.filter((_, index) => index !== indexToClose);
    const nextActiveTabIndex = (() => {
      if (nextTabs.length === 0) {
        return null;
      }
      if (resolvedActiveTab === indexToClose) {
        return Math.min(indexToClose, nextTabs.length - 1);
      }
      if (resolvedActiveTab > indexToClose) {
        return resolvedActiveTab - 1;
      }
      return Math.min(resolvedActiveTab, nextTabs.length - 1);
    })();
    const nextActiveTab = nextActiveTabIndex === null ? null : (nextTabs[nextActiveTabIndex] ?? null);
    const nextInteractiveTaskState = nextActiveTab?.id?.startsWith('agent-task-')
      ? (interactiveTaskStates[nextActiveTab.id] ?? getAgentTaskScenario({
          tabId: nextActiveTab.id,
          label: nextActiveTab.label,
        }).initialTaskState)
      : null;

    setIdeTabs(nextTabs);
    setActiveEditorTab(nextActiveTabIndex);
    setIdeTabContents((prev) => {
      if (!closingTab?.id || !(closingTab.id in prev)) {
        return prev;
      }

      const { [closingTab.id]: _removedContent, ...rest } = prev;
      return rest;
    });
    setInteractiveTaskStates((prev) => {
      if (!closingTab?.id || !(closingTab.id in prev)) {
        return prev;
      }

      const { [closingTab.id]: _removedTaskState, ...rest } = prev;
      return rest;
    });
    setAttachedFilesByTab((prev) => removeTabStateEntry(prev, closingTab?.id));
    setDoneOverlayUiStates((prev) => removeTabStateEntry(prev, closingTab?.id));
    setSpecVersionsByTab((prev) => removeTabStateEntry(prev, closingTab?.id));
    setPlanDiffUiStates((prev) => removeTabStateEntry(prev, closingTab?.id));
    setRunStatesByTab((prev) => removeTabStateEntry(prev, closingTab?.id));

    if (highlightedProblemLocation?.tabId === closingTab.id) {
      setHighlightedProblemLocation(null);
    }

    if (wasClosingActiveTab && nextInteractiveTaskState && nextActiveTab) {
      const matchingTask = agentTasks.find((task) => task.label === nextActiveTab.label || task.id === nextActiveTab.id);

      if (closingTab.id === generationTabId || closingTab.id?.startsWith('agent-task-')) {
        clearAgentTaskRuntime();
      }

      if (matchingTask && matchingTask.id !== selectedTask) {
        setSelectedTask(matchingTask.id);
      }

      applyInteractiveTaskState(nextActiveTab.id, nextInteractiveTaskState);
      return;
    }

    if (closingTab.id === generationTabId || (wasClosingActiveTab && closingTab.id?.startsWith('agent-task-'))) {
      clearAgentTaskRuntime();
    }
  }, [
    activeEditorTab,
    agentTasks,
    applyInteractiveTaskState,
    clearAgentTaskRuntime,
    generationTabId,
    highlightedProblemLocation,
    ideTabs,
    interactiveTaskStates,
    selectedTask,
    setRunStateForTab,
  ]);

  const runTerminalLineAnimation = useCallback((lines, options = {}) => {
    const { baseLines = [], onComplete, stepDelay = TERMINAL_RUN_STEP_DELAY_MS } = options;
    const frames = buildTerminalFrames(lines, baseLines);
    if (frames.length === 0) {
      onComplete?.();
      return;
    }

    setTerminalStreamingForTab(true);

    frames.forEach((frame, idx) => {
      const timeoutId = window.setTimeout(() => {
        setTerminalBlocksForTab(frame);
      }, TERMINAL_RUN_INITIAL_DELAY_MS + stepDelay * idx);
      terminalRunTimeoutsRef.current.push(timeoutId);
    });

    const finalTimeoutId = window.setTimeout(() => {
      setTerminalStreamingForTab(false);
      onComplete?.();
    }, TERMINAL_RUN_INITIAL_DELAY_MS + stepDelay * frames.length + TERMINAL_RUN_END_DELAY_MS);
    terminalRunTimeoutsRef.current.push(finalTimeoutId);
  }, [setTerminalBlocksForTab, setTerminalStreamingForTab]);

  const continueAcceptanceCriteriaRun = useCallback((choiceId) => {
    const flow = acWarningFlowRef.current;
    const currentScenario = getCurrentAgentTaskScenario();
    const nextAcRunStatuses = buildResolvedRunStatuses(
      currentScenario.acBaseStatuses,
      'ac',
      appliedIssueFixes,
      removedIssueIndices,
    );
    const selectedOption = TERMINAL_PERMISSION_OPTIONS.find((option) => option.id === choiceId) ?? null;
    if (!flow || !selectedOption) return;

    const committedLines = [
      ...flow.baseLines,
      { type: 'output', text: AC_WARNING_PROMPT },
      { type: 'output', text: `> ${selectedOption.label}` },
    ];
    const continuationLines = buildAcceptanceCriteriaContinuationLines(choiceId);

    clearTerminalRunAnimation();
    clearAcWarningFlow();
    setTerminalBlocksForTab(buildTerminalBlocks(committedLines));

    if (choiceId === 'allow-session') {
      setAcWarningPermissionScope('session');
    } else if (choiceId === 'reject') {
      setAcWarningPermissionScope(null);
    }

    if (choiceId !== 'reject') {
      const remainingRevealIndices = Array.isArray(flow.revealIndices)
        ? flow.revealIndices.filter((visibleIndex) => visibleIndex > (flow.nextStatusIndex - 1))
        : null;
      revealRunStatuses('ac', nextAcRunStatuses, Array.isArray(remainingRevealIndices)
        ? {
            initialResult: flow.revealedStatuses,
            indices: remainingRevealIndices,
            initialDelay: RUN_STATUS_REVEAL_STEP_DELAY_MS,
          }
        : {
            initialResult: flow.revealedStatuses,
            startIndex: flow.nextStatusIndex,
            initialDelay: RUN_STATUS_REVEAL_STEP_DELAY_MS,
          });
    }

    if (continuationLines.length === 0) {
      setRunStateForTab('default', currentRunSourceTabIdRef.current);
      currentRunSourceTabIdRef.current = null;
      return;
    }

    runTerminalLineAnimation(continuationLines, {
      baseLines: committedLines,
      onComplete: () => {
        setRunStateForTab('default', currentRunSourceTabIdRef.current);
        currentRunSourceTabIdRef.current = null;
      },
    });
  }, [
    appliedIssueFixes,
    clearAcWarningFlow,
    clearTerminalRunAnimation,
    getCurrentAgentTaskScenario,
    removedIssueIndices,
    revealRunStatuses,
    runTerminalLineAnimation,
    setRunStateForTab,
    setTerminalBlocksForTab,
  ]);

  const startAcceptanceCriteriaRunAnimation = useCallback((runRequest) => {
    resetTerminalOutput();
    clearAcWarningFlow();

    const introLines = buildAcceptanceCriteriaIntroLines(runRequest);
    const currentScenario = getCurrentAgentTaskScenario();
    const nextAcRunStatuses = buildResolvedRunStatuses(
      currentScenario.acBaseStatuses,
      'ac',
      appliedIssueFixes,
      removedIssueIndices,
      { runComplete: true },
    );
    const acRevealOptions = buildSelectiveRunRevealOptions({
      kind: 'ac',
      runRequest,
      currentStatuses: acRunResult,
      removedIssueIndices,
    });
    const warningStatusIndex = mapOriginalIssueIndexToVisible(
      'ac',
      AC_WARNING_TARGET_ORIGINAL_INDEX,
      removedIssueIndices,
    );
    const hasPausableWarning =
      Number.isInteger(warningStatusIndex)
      && warningStatusIndex >= 0
      && nextAcRunStatuses[warningStatusIndex]?.status === 'warning';
    const shouldPauseOnWarning = acWarningPermissionScope !== 'session'
      && (
        acRevealOptions.hasSelectiveRerun
          ? hasPausableWarning && acRevealOptions.indices.includes(warningStatusIndex)
          : hasPausableWarning
      );

    runTerminalLineAnimation(introLines, {
      onComplete: () => {
        if (!shouldPauseOnWarning) {
          // Clear applied AC fixes — run result is now authoritative
          setAppliedIssueFixes((prev) => ({ ...prev, ac: {} }));
          revealRunStatuses('ac', nextAcRunStatuses, {
            initialResult: acRevealOptions.initialResult,
            ...(acRevealOptions.hasSelectiveRerun
              ? { indices: acRevealOptions.indices }
              : {}),
          });
          runTerminalLineAnimation(buildAcceptanceCriteriaContinuationLines('allow-session'), {
            baseLines: introLines,
            onComplete: () => {
              setRunStateForTab('default', currentRunSourceTabIdRef.current);
              currentRunSourceTabIdRef.current = null;
            },
          });
          return;
        }

        // Clear applied AC fixes — run result is now authoritative
        setAppliedIssueFixes((prev) => ({ ...prev, ac: {} }));
        revealRunStatuses('ac', nextAcRunStatuses, {
          initialResult: acRevealOptions.initialResult,
          ...(acRevealOptions.hasSelectiveRerun
            ? {
                indices: acRevealOptions.indices,
              }
            : {}),
          pausePredicate: (_, idx) => hasPausableWarning && idx === warningStatusIndex,
          onPause: (revealedStatuses, idx) => {
            acWarningFlowRef.current = {
              baseLines: introLines,
              revealedStatuses,
              nextStatusIndex: idx + 1,
              revealIndices: acRevealOptions.hasSelectiveRerun ? acRevealOptions.indices : null,
            };
            setAcWarningBannerForTab({
              question: AC_WARNING_PROMPT,
            });
          },
        });
      },
    });
  }, [
    appliedIssueFixes,
    acWarningPermissionScope,
    acRunResult,
    clearAcWarningFlow,
    getCurrentAgentTaskScenario,
    resetTerminalOutput,
    removedIssueIndices,
    revealRunStatuses,
    runTerminalLineAnimation,
    setRunStateForTab,
    setAcWarningBannerForTab,
  ]);

  const startTerminalRunAnimation = useCallback((runRequest) => {
    const resolvedSectionTitle = (runRequest?.sectionTitle || '').toLowerCase();
    if (runRequest?.mode === 'section' && resolvedSectionTitle === 'acceptance criteria') {
      startAcceptanceCriteriaRunAnimation(runRequest);
      return;
    }

    resetTerminalOutput();

    const effectiveRunRequest =
      runRequest?.mode === 'generate' && terminalPermissionScope === 'session'
        ? { ...runRequest, permissionChoice: 'allow-session' }
        : runRequest;
    const runSequence = buildTerminalRunSequence(effectiveRunRequest);
    const { initialLines, permissionPrompt } = runSequence;

    if (initialLines.length === 0) {
      finishTerminalRun();
      return;
    }

    runTerminalLineAnimation(initialLines, {
      stepDelay: effectiveRunRequest?.mode === 'update-spec'
        ? TERMINAL_UPDATE_SPEC_STEP_DELAY_MS
        : TERMINAL_RUN_STEP_DELAY_MS,
      onComplete: () => {
        if (permissionPrompt) {
          setTerminalBlocksForTab(buildTerminalBlocks(initialLines));
          setTerminalPermissionPromptForTab({
            ...permissionPrompt,
            baseLines: initialLines,
            selectedIdx: 0,
          });
          return;
        }

        finishTerminalRun({
          advanceGeneration: effectiveRunRequest?.mode === 'generate',
        });
      },
    });
  }, [
    finishTerminalRun,
    resetTerminalOutput,
    runTerminalLineAnimation,
    setTerminalBlocksForTab,
    setTerminalPermissionPromptForTab,
    startAcceptanceCriteriaRunAnimation,
    terminalPermissionScope,
  ]);

  const problemsPanelActiveRef = useRef(false);
  const problemsSelectedLeafIdxRef = useRef(-1);

  const setActiveIdeBottomToolWindow = (id) => {
    setIdeOpenWindows((prev) => {
      const nonBottomWindows = prev.filter((windowId) => !BOTTOM_TOOL_WINDOW_IDS.has(windowId));
      return id ? [...nonBottomWindows, id] : nonBottomWindows;
    });
  };

  const findIdeBottomToolWindowButton = (id) => {
    const title = BOTTOM_TOOL_WINDOW_TITLES[id];
    if (!title || typeof document === 'undefined') return null;
    const button = document.querySelector(`.main-window .stripe[title="${title}"]`);
    return button instanceof HTMLElement ? button : null;
  };

  const isIdeBottomToolWindowVisible = (id) => {
    if (typeof document === 'undefined') return false;

    if (id === 'terminal') {
      const terminalPanel = document.querySelector('.main-window .terminal-window');
      return terminalPanel instanceof HTMLElement && terminalPanel.getClientRects().length > 0;
    }

    return false;
  };

  const focusIdeProblemsPanel = () => {
    if (typeof document === 'undefined') return;

    const focusPanel = () => {
      const panelEl = document.querySelector('.main-window .problems-window');
      if (!(panelEl instanceof HTMLElement)) return false;

      const target =
        panelEl.querySelector('.tree-node-selected') ??
        panelEl.querySelector('.tree-node-children .tree-node') ??
        panelEl;
      if (!(target instanceof HTMLElement)) return false;

      panelEl.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
      }));
      if (target.tabIndex < 0) target.tabIndex = -1;
      target.focus({ preventScroll: true });
      problemsPanelActiveRef.current = true;
      return true;
    };

    requestAnimationFrame(() => {
      if (focusPanel()) return;
      requestAnimationFrame(focusPanel);
    });
  };

  const openIdeBottomToolWindow = (id) => {
    const stripe = findIdeBottomToolWindowButton(id);
    const alreadyOpen =
      ideOpenWindows.includes(id) ||
      stripe?.getAttribute('aria-pressed') === 'true' ||
      isIdeBottomToolWindowVisible(id);

    if (alreadyOpen) {
      setActiveIdeBottomToolWindow(id);
      if (id !== 'problems') {
        problemsPanelActiveRef.current = false;
      }
      if (stripe?.getAttribute('aria-pressed') !== 'true') {
        requestAnimationFrame(() => stripe.click());
      }
      if (id === 'problems') focusIdeProblemsPanel();
      return;
    }

    setActiveIdeBottomToolWindow(id);
    if (stripe) {
      requestAnimationFrame(() => {
        if (stripe.getAttribute('aria-pressed') !== 'true') {
          stripe.click();
        }
      });
    }
    if (id === 'problems') focusIdeProblemsPanel();
    if (id !== 'problems') {
      problemsPanelActiveRef.current = false;
    }
  };

  const openAndFocusIdeProblemsToolWindow = () => {
    setVisitBookingProblemExpanded(false);
    setHighlightedProblemLocation(null);
    openIdeBottomToolWindow('problems');
    focusIdeProblemsPanel();
  };

  const toggleIdeBottomToolWindow = (id) => {
    const stripe = findIdeBottomToolWindowButton(id);
    if (stripe) {
      const isSelected = stripe.getAttribute('aria-pressed') === 'true';
      setActiveIdeBottomToolWindow(isSelected ? null : id);
      stripe.click();
      return;
    }
    setIdeOpenWindows((prev) => {
      const nonBottomWindows = prev.filter((windowId) => !BOTTOM_TOOL_WINDOW_IDS.has(windowId));
      return prev.includes(id) ? nonBottomWindows : [...nonBottomWindows, id];
    });
  };

  const queueTerminalRun = (runRequest, options = {}) => {
    const {
      preserveAcRunResult = false,
      preservePlanRunResult = false,
      preserveWarningBanner = false,
    } = options;
    const resolvedRunRequest =
      runRequest?.mode === 'section' && !runRequest?.sectionTitle
        ? { ...runRequest, sectionTitle: 'Plan' }
        : runRequest;
    const previousTerminalTabId = currentTerminalRunTabIdRef.current;
    const sessionMeta = resolveTerminalSessionMeta(resolvedRunRequest);
    const nextTerminalTabId = ensureTerminalSession(sessionMeta);
    const nextRunRequest = {
      ...resolvedRunRequest,
      sourceTabId: sessionMeta.sourceTabId ?? resolvedRunRequest?.sourceTabId ?? null,
      taskLabel: sessionMeta.label,
    };
    const isTerminalAlreadyOpen = ideOpenWindows.includes('terminal');
    clearChainedRunTimeout();
    lastRunSectionRef.current = nextRunRequest?.sectionTitle || null;
    lastTerminalRunRequestRef.current = nextRunRequest;
    if (!preserveWarningBanner) {
      clearAcWarningFlow();
    }
    currentRunSourceTabIdRef.current = sessionMeta.sourceTabId ?? activeSourceEditorTabId ?? activeEditorTabId;
    setRunStateForTab('running', currentRunSourceTabIdRef.current);
    clearTerminalRunAnimation();
    setPendingTerminalRunForTab(null, previousTerminalTabId);
    setTerminalPermissionPromptForTab(null, previousTerminalTabId);
    currentTerminalRunTabIdRef.current = nextTerminalTabId;
    setTerminalBlocksForTab([], nextTerminalTabId);
    setTerminalPermissionPromptForTab(null, nextTerminalTabId);
    if (!preserveAcRunResult) {
      clearStatusReveal('ac');
      setAcRunResult(null);
    }
    if (!preservePlanRunResult) {
      clearStatusReveal('plan');
      setPlanRunResult(null);
    }
    if (!isTerminalAlreadyOpen) {
      bumpTerminalViewKeyForTab(nextTerminalTabId);
    }
    if (nextRunRequest?.mode === 'update-spec') {
      requestAnimationFrame(() => {
        startTerminalRunAnimation(nextRunRequest);
      });
      return;
    }

    setPendingTerminalRunForTab(nextRunRequest, nextTerminalTabId);
  };
  queueTerminalRunRef.current = queueTerminalRun;

  const moveTerminalPermissionSelection = useCallback((delta) => {
    setTerminalPermissionPromptForTab((prev) => {
      if (!prev || prev.options.length === 0) return prev;
      const nextIdx = (prev.selectedIdx + delta + prev.options.length) % prev.options.length;
      return { ...prev, selectedIdx: nextIdx };
    });
  }, [setTerminalPermissionPromptForTab]);

  const hoverTerminalPermissionSelection = useCallback((idx) => {
    setTerminalPermissionPromptForTab((prev) => {
      if (!prev || idx < 0 || idx >= prev.options.length) return prev;
      return { ...prev, selectedIdx: idx };
    });
  }, [setTerminalPermissionPromptForTab]);

  const handleTerminalPermissionSelect = useCallback((choiceId) => {
    if (!terminalPermissionPrompt) return;

    const selectedOption =
      terminalPermissionPrompt.options.find((option) => option.id === choiceId) ??
      terminalPermissionPrompt.options[terminalPermissionPrompt.selectedIdx] ??
      null;

    if (!selectedOption) return;

    const committedLines = [
      ...terminalPermissionPrompt.baseLines,
      { type: 'output', text: terminalPermissionPrompt.question },
      { type: 'output', text: `> ${selectedOption.label}` },
    ];
    const continuationLines = buildTerminalPermissionContinuationLines(selectedOption.id);

    clearTerminalRunAnimation();
    setTerminalPermissionPromptForTab(null);
    setTerminalBlocksForTab(buildTerminalBlocks(committedLines));

    if (selectedOption.id === 'allow-session') {
      setTerminalPermissionScope('session');
    } else if (selectedOption.id === 'reject') {
      setTerminalPermissionScope(null);
    }

    if (continuationLines.length === 0) {
      finishTerminalRun({
        advanceGeneration: selectedOption.id !== 'reject',
        cancelGeneration: selectedOption.id === 'reject',
      });
      return;
    }

    runTerminalLineAnimation(continuationLines, {
      baseLines: committedLines,
      onComplete: () => finishTerminalRun({
        advanceGeneration: selectedOption.id !== 'reject',
        cancelGeneration: selectedOption.id === 'reject',
      }),
    });
  }, [
    clearTerminalRunAnimation,
    finishTerminalRun,
    runTerminalLineAnimation,
    setTerminalBlocksForTab,
    setTerminalPermissionPromptForTab,
    terminalPermissionPrompt,
  ]);

  const closeIdeBottomToolWindows = () => {
    clearTerminalRunAnimation();
    setPendingTerminalRunForTab(null);
    setTerminalPermissionPromptForTab(null);
    clearAcWarningFlow();
    setActiveIdeBottomToolWindow(null);
    BOTTOM_TOOL_WINDOW_IDS.forEach((id) => {
      const stripe = findIdeBottomToolWindowButton(id);
      if (stripe?.getAttribute('aria-pressed') === 'true') {
        stripe.click();
      }
    });
  };

  const handleDoneRegenerate = (payload = {}) => {
    const commentEntries = payload?.commentEntries?.length
      ? payload.commentEntries
      : agentTaskCommentEntries;
    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;

    if (!currentTabId) return;

    const pendingDoneSpecState = buildPendingDoneSpecState({
      tabId: currentTabId,
      commentEntries,
    });
    if (!pendingDoneSpecState) return;

    const {
      currentCode,
      targetCode,
      nextDocument,
      nextAppliedIssueFixes,
      nextRemovedIssueIndices,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      restoredPlanItemsFromEmptyPlan,
      restoredPlanFrames,
      pendingCommentEntriesSnapshot,
      hasPendingComments,
      hasSpecChanges,
    } = pendingDoneSpecState;
    const effectiveRerunAcOriginalIndices = [];
    const effectiveHasPendingReruns = rerunPlanOriginalIndices.length > 0;
    const shouldClearDoneCommentsAfterUpdate =
      hasPendingComments ||
      (Array.isArray(commentEntries) && commentEntries.length > 0) ||
      pendingAcQuickFixCount > 0;
    const updatedRowTargetForSpecRegeneration =
      pendingAcQuickFixCount > 0 ? VISIT_BOOKING_CONFLICT_PROBLEM_TARGET : null;
    if (!hasSpecChanges && !hasPendingComments && !effectiveHasPendingReruns) {
      return;
    }
    if (updatedRowTargetForSpecRegeneration) {
      if (updatedSpecRowTimeoutRef.current) {
        window.clearTimeout(updatedSpecRowTimeoutRef.current);
        updatedSpecRowTimeoutRef.current = null;
      }
      setUpdatedSpecRowTarget({
        ...updatedRowTargetForSpecRegeneration,
        phase: 'fixing',
        requestKey: Date.now(),
      });
    }

    // Confirm any pending AC quick fixes — counter reset deactivates the Specify
    // button after the animation without touching acRunResult (avoids checkmarks).
    setPendingAcQuickFixCount(0);

    if (restoredPlanItemsFromEmptyPlan) {
      clearChainedRunTimeout();
      clearStatusReveal('plan');
      clearStatusReveal('ac');
      resetRunUiForTab(currentTabId);
      terminalDrivenGenerationRef.current = false;
      doneEnhanceFlowRef.current = {
        mode: 'restore-plan-progressive',
        sourceTabId: currentTabId,
        initialCode: currentCode,
        targetCode,
        nextDocument,
        nextAppliedIssueFixes,
        nextRemovedIssueIndices,
        nextAcRunResult,
        nextPlanRunResult: null,
        currentAcRunResult,
        currentPlanRunResult,
        currentRemovedIssueIndices,
        rerunAcOriginalIndices: [],
        rerunPlanOriginalIndices: [],
        restorePlanFrames: restoredPlanFrames?.length ? restoredPlanFrames : [{
          code: targetCode,
          documentSections: nextDocument,
          planRunResult: [{ status: 'pending' }],
        }],
        updatedRowTarget: updatedRowTargetForSpecRegeneration,
        commentsAlreadyCleared: !shouldClearDoneCommentsAfterUpdate,
        versionCommit: hasSpecChanges
          ? {
              sourceTabId: currentTabId,
              currentCode: (() => {
                const history = specVersionsByTab[currentTabId];
                const lastVersion = Array.isArray(history?.versions) && history.versions.length > 0
                  ? history.versions[history.versions.length - 1]
                  : null;
                return lastVersion?.code ?? currentCode;
              })(),
              currentCommentEntries: pendingCommentEntriesSnapshot,
              nextCode: targetCode,
            }
          : null,
      };
      setGenerationTabId(currentTabId);
      setGenProgress(0);
      queueTerminalRun({
        mode: 'update-spec',
        sourceTabId: currentTabId,
        taskLabel: ideTabs.find((tab) => tab.id === currentTabId)?.label ?? TERMINAL_TASK_TAB_BASE_LABEL,
        question: getTaskRuntimeState(currentTabId)?.taskState?.prompt ?? '',
        permissionChoice: 'allow-once',
      }, {
        preserveAcRunResult: true,
        preservePlanRunResult: true,
        preserveWarningBanner: true,
      });
      setGenState('generating');
      return;
    }

    const resolveVisibleRunResults = (currentResults, fallbackResults) => {
      const sourceResults = Array.isArray(currentResults)
        ? currentResults
        : (Array.isArray(fallbackResults) ? fallbackResults : null);

      return Array.isArray(sourceResults)
        ? sourceResults.map((statusItem) => resolveRuntimeInspectionItem(statusItem))
        : sourceResults;
    };
    const resolvedNextAcRunResult = resolveVisibleRunResults(currentAcRunResult, nextAcRunResult);
    const resolvedNextPlanRunResult = resolveVisibleRunResults(currentPlanRunResult, nextPlanRunResult);

    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');
    resetRunUiForTab(currentTabId);

    doneEnhanceFlowRef.current = {
      sourceTabId: currentTabId,
      initialCode: currentCode,
      targetCode,
      nextDocument,
      nextAppliedIssueFixes,
      nextRemovedIssueIndices,
      nextAcRunResult: resolvedNextAcRunResult,
      nextPlanRunResult: resolvedNextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices: effectiveRerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      updatedRowTarget: updatedRowTargetForSpecRegeneration,
      commentsAlreadyCleared: !shouldClearDoneCommentsAfterUpdate,
      versionCommit: (hasSpecChanges || effectiveHasPendingReruns)
        ? {
            sourceTabId: currentTabId,
            // Use the version history's latest code as the "before" snapshot so
            // that quick-fix changes (which already updated ideTabContents)
            // still produce a new version entry.
            currentCode: (() => {
              const history = specVersionsByTab[currentTabId];
              const lastVersion = Array.isArray(history?.versions) && history.versions.length > 0
                ? history.versions[history.versions.length - 1]
                : null;
              return lastVersion?.code ?? currentCode;
            })(),
            currentCommentEntries: pendingCommentEntriesSnapshot,
            nextCode: targetCode,
          }
        : null,
    };

    setGenerationTabId(currentTabId);
    setGenProgress(0);
    terminalDrivenGenerationRef.current = false;
    setGenState(AGENT_TASK_LOADING_STATE_ENABLED ? 'loading' : 'generating');
  };

  const handleDoneIssueFix = useCallback(({ kind, index, replacementText: replacementTextOverride = null, commentText: commentTextOverride = null }) => {
    if (!Number.isInteger(index) || index < 0) return;
    const fixConfig = getIssueQuickFixConfig(kind, index);
    if (!fixConfig) return;

    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;
    const terminalTabId = currentTabId ? buildTerminalSessionTabId(currentTabId) : null;
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, index, removedIssueIndices);
    if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return;
    const selectedReplacementText =
      typeof replacementTextOverride === 'string' && replacementTextOverride.trim().length > 0
        ? replacementTextOverride
        : fixConfig.replacementText;

    // A quick fix invalidates any in-flight run/reveal state for this spec.
    clearChainedRunTimeout();
    clearStatusReveal('plan');
    clearStatusReveal('ac');
    clearTerminalRunAnimation();
    clearAcWarningFlow();
    lastRunSectionRef.current = null;
    lastTerminalRunRequestRef.current = null;
    if (currentRunSourceTabIdRef.current) {
      setRunStateForTab('default', currentRunSourceTabIdRef.current);
    }
    if (currentTabId && currentRunSourceTabIdRef.current !== currentTabId) {
      setRunStateForTab('default', currentTabId);
    }
    currentRunSourceTabIdRef.current = null;
    if (terminalTabId) {
      setPendingTerminalRunForTab(null, terminalTabId);
      setTerminalPermissionPromptForTab(null, terminalTabId);
    }

    setAppliedIssueFixes((prev) => ({
      ...prev,
      [kind]: {
        ...(prev[kind] ?? {}),
        [index]: createAppliedIssueFixValue(selectedReplacementText),
      },
    }));

    if (kind === 'ac') {
      setPendingAcQuickFixCount((c) => c + 1);
    }

    setHighlightedProblemLocation(null);

    if (currentTabId) {
      const targetMetadata = buildCommentTargetEntryMetadata(
        generatedDocument,
        { kind, index },
        removedIssueIndices,
      );
      const quickFixComment = (
        typeof commentTextOverride === 'string' && commentTextOverride.trim().length > 0
          ? commentTextOverride.trim()
          : fixConfig.actionLabel
      );
      const commentMetadata = {
        sectionTitle: kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
        line: targetMetadata.line ?? '',
        rawIndex: targetMetadata.rawIndex,
        rowStableKey: targetMetadata.rowStableKey,
      };
      const nextAcRunResult = kind === 'ac' && Array.isArray(acRunResult)
        ? acRunResult.map((statusItem, statusIndex) => (statusIndex === visibleIndex ? null : statusItem))
        : acRunResult;
      const nextPlanRunResult = kind === 'plan' && Array.isArray(planRunResult)
        ? planRunResult.map((statusItem, statusIndex) => (statusIndex === visibleIndex ? null : statusItem))
        : planRunResult;

      setAgentTaskCommentEntries((prev) => replaceCommentEntriesForTarget(
        prev,
        { kind, index },
        quickFixComment ? [quickFixComment] : [],
        commentMetadata,
      ));
      if (kind === 'ac' && Array.isArray(nextAcRunResult)) {
        setAcRunResult(nextAcRunResult);
      }
      if (kind === 'plan' && Array.isArray(nextPlanRunResult)) {
        setPlanRunResult(nextPlanRunResult);
      }

      setInteractiveTaskStates((prev) => {
        const previousTaskState = prev[currentTabId] ?? {};
        const baseAcRunResult = previousTaskState.acRunResult ?? acRunResult;
        const basePlanRunResult = previousTaskState.planRunResult ?? planRunResult;
        const storedAcRunResult = kind === 'ac' && Array.isArray(baseAcRunResult)
          ? baseAcRunResult.map((statusItem, statusIndex) => (statusIndex === visibleIndex ? null : statusItem))
          : baseAcRunResult;
        const storedPlanRunResult = kind === 'plan' && Array.isArray(basePlanRunResult)
          ? basePlanRunResult.map((statusItem, statusIndex) => (statusIndex === visibleIndex ? null : statusItem))
          : basePlanRunResult;
        const storedCommentEntries = replaceCommentEntriesForTarget(
          previousTaskState.commentEntries ?? agentTaskCommentEntries,
          { kind, index },
          quickFixComment ? [quickFixComment] : [],
          commentMetadata,
        );

        return {
          ...prev,
          [currentTabId]: {
            ...previousTaskState,
            genState,
            genProgress,
            documentSections: previousTaskState.documentSections ?? generatedDocument,
            appliedIssueFixes: {
              ...cloneIssueStateMap(previousTaskState.appliedIssueFixes ?? appliedIssueFixes),
              [kind]: {
                ...(previousTaskState.appliedIssueFixes?.[kind] ?? appliedIssueFixes?.[kind] ?? {}),
                [index]: createAppliedIssueFixValue(selectedReplacementText),
              },
            },
            removedIssueIndices: previousTaskState.removedIssueIndices ?? removedIssueIndices,
            acRunResult: storedAcRunResult,
            planRunResult: storedPlanRunResult,
            commentEntries: storedCommentEntries,
          },
        };
      });
    }

    // Keep the existing Problems list visible until Specify regenerates the spec.
    // Reset only keyboard tracking so navigation starts from the first row.
    problemsSelectedLeafIdxRef.current = -1;

  }, [
    activeEditorTab,
    clearAcWarningFlow,
    clearTaskCommentTargetForTab,
    clearChainedRunTimeout,
    clearStatusReveal,
    clearTerminalRunAnimation,
    acRunResult,
    agentTaskCommentEntries,
    appliedIssueFixes,
    generationTabId,
    generatedDocument,
    genProgress,
    genState,
    ideTabs,
    planRunResult,
    removedIssueIndices,
    setAcRunResult,
    setAgentTaskCommentEntries,
    setPendingAcQuickFixCount,
    setPendingTerminalRunForTab,
    setPlanRunResult,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
  ]);

  useEffect(() => () => {
    terminalRunTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    terminalRunTimeoutsRef.current = [];
    statusRevealTimeoutsRef.current.ac.forEach((timeoutId) => window.clearTimeout(timeoutId));
    statusRevealTimeoutsRef.current.plan.forEach((timeoutId) => window.clearTimeout(timeoutId));
    statusRevealTimeoutsRef.current = { ac: [], plan: [] };
    if (chainedRunTimeoutRef.current) {
      window.clearTimeout(chainedRunTimeoutRef.current);
      chainedRunTimeoutRef.current = null;
    }
    if (updatedSpecRowTimeoutRef.current) {
      window.clearTimeout(updatedSpecRowTimeoutRef.current);
      updatedSpecRowTimeoutRef.current = null;
    }
    if (visitBookingProblemCommentFadeTimeoutRef.current) {
      window.clearTimeout(visitBookingProblemCommentFadeTimeoutRef.current);
      visitBookingProblemCommentFadeTimeoutRef.current = null;
    }
    if (suppressDoneCommentsSyncTimeoutRef.current) {
      window.clearTimeout(suppressDoneCommentsSyncTimeoutRef.current);
      suppressDoneCommentsSyncTimeoutRef.current = null;
    }
    acWarningFlowRef.current = null;
  }, []);

  useEffect(() => {
    if (!pendingTerminalRun || !ideOpenWindows.includes('terminal') || typeof document === 'undefined') return undefined;

    let timeoutId = 0;
    let pollId = 0;
    let cancelled = false;
    let attempts = 0;

    const startWhenVisible = () => {
      if (cancelled) return;

      const terminalOutputEl = document.querySelector('.main-window .terminal-window .terminal-output-area');
      const isTerminalVisible =
        terminalOutputEl instanceof HTMLElement &&
        terminalOutputEl.getClientRects().length > 0 &&
        terminalOutputEl.offsetHeight > 0;

      if (isTerminalVisible) {
        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          startTerminalRunAnimation(pendingTerminalRun);
          setPendingTerminalRunForTab(null);
        }, TERMINAL_RUN_VISIBLE_DELAY_MS);
        return;
      }

      attempts += 1;
      if (attempts >= 60) {
        startTerminalRunAnimation(pendingTerminalRun);
        setPendingTerminalRunForTab(null);
        return;
      }

      pollId = window.setTimeout(startWhenVisible, 16);
    };

    pollId = window.setTimeout(startWhenVisible, 16);

    return () => {
      cancelled = true;
      if (pollId) window.clearTimeout(pollId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [ideOpenWindows, pendingTerminalRun, setPendingTerminalRunForTab, startTerminalRunAnimation]);

  useEffect(() => {
    if (screen !== 'ide') return;
    if (activeEditorTab !== null || ideTabs.length === 0) return;
    setActiveEditorTab(0);
  }, [screen, activeEditorTab, ideTabs.length]);

  const handleProblemsQuickFixesClick = useCallback((buttonElement) => {
    let resolvedIssueTarget = null;
    let resolvedProposals = null;
    let resolvedStatusItem = null;
    const hasPendingFixForIssue = (target) => (
      Boolean(target?.kind)
      && Number.isInteger(target?.index)
      && Boolean(appliedIssueFixes?.[target.kind]?.[target.index])
    );

    const currentIssues = buildInspectionSummary({
      planRunResult,
      acRunResult,
      documentSections: generatedDocument,
    }).issues;
    const selectedProblemNode = typeof document !== 'undefined'
      ? document.querySelector('.problems-window .tree-node-children .tree-node-selected')
      : null;
    const selectedProblemLabel = selectedProblemNode instanceof HTMLElement
      ? (selectedProblemNode.textContent ?? '').replace(/\s+/g, ' ').trim()
      : '';
    const selectedIssue = selectedProblemLabel
      ? (currentIssues.find((issue) => selectedProblemLabel.includes(issue?.label ?? '')) ?? null)
      : null;

    if (selectedIssue) {
      const issueTarget = getDocumentCheckTargetAtRawIndex(
        generatedDocument,
        selectedIssue.rawIndex,
        removedIssueIndices,
      );
      if (issueTarget && !hasPendingFixForIssue(issueTarget)) {
        const visibleIndex = mapOriginalIssueIndexToVisible(issueTarget.kind, issueTarget.index, removedIssueIndices);
        if (Number.isInteger(visibleIndex) && visibleIndex >= 0) {
          const statusItem = issueTarget.kind === 'ac'
            ? acRunResult?.[visibleIndex]
            : planRunResult?.[visibleIndex];
          resolvedStatusItem = statusItem ?? null;
          resolvedIssueTarget = issueTarget;
          if (Array.isArray(statusItem?.proposalOptions)) {
            resolvedProposals = statusItem.proposalOptions.filter(opt => opt?.type !== 'text' && typeof opt?.label === 'string');
          } else if (typeof statusItem?.proposal === 'string' && statusItem.proposal) {
            resolvedProposals = [{ label: statusItem.proposal }];
          }
        }
      }
    } else if (highlightedProblemLocation?.kind) {
      // A specific problem is selected — resolve proposals only for that problem.
      const rawIndex = highlightedProblemLocation.rawIndex;
      const issueTarget = normalizeCommentTarget({
        kind: highlightedProblemLocation.kind,
        index: highlightedProblemLocation.index,
      }) ?? getDocumentCheckTargetAtRawIndex(generatedDocument, rawIndex, removedIssueIndices);

      if (issueTarget && !hasPendingFixForIssue(issueTarget)) {
        const visibleIndex = mapOriginalIssueIndexToVisible(issueTarget.kind, issueTarget.index, removedIssueIndices);
        if (Number.isInteger(visibleIndex) && visibleIndex >= 0) {
          const statusItem = issueTarget.kind === 'ac'
            ? acRunResult?.[visibleIndex]
            : planRunResult?.[visibleIndex];
          resolvedStatusItem = statusItem ?? null;
          resolvedIssueTarget = issueTarget;
          if (Array.isArray(statusItem?.proposalOptions)) {
            // Multi-option proposals (e.g. "Inline field error", "Modal with conflict details")
            resolvedProposals = statusItem.proposalOptions.filter(opt => opt?.type !== 'text' && typeof opt?.label === 'string');
          } else if (typeof statusItem?.proposal === 'string' && statusItem.proposal) {
            // Single string proposal — treat as a one-item list
            resolvedProposals = [{ label: statusItem.proposal }];
          }
        }
      }
    } else {
      // Nothing highlighted — fall back to first issue with any proposals
      const sources = [
        ...(Array.isArray(acRunResult) ? acRunResult.map((item, i) => ({ item, kind: 'ac', index: i })) : []),
        ...(Array.isArray(planRunResult) ? planRunResult.map((item, i) => ({ item, kind: 'plan', index: i })) : []),
      ];
      for (const { item, kind, index } of sources) {
        let proposals = null;
        if (appliedIssueFixes?.[kind]?.[index]) {
          continue;
        }
        if (Array.isArray(item?.proposalOptions)) {
          proposals = item.proposalOptions.filter(opt => opt?.type !== 'text' && typeof opt?.label === 'string');
        } else if (typeof item?.proposal === 'string' && item.proposal) {
          proposals = [{ label: item.proposal }];
        }
        if (proposals && proposals.length > 0) {
          resolvedProposals = proposals;
          resolvedStatusItem = item;
          resolvedIssueTarget = { kind, index };
          break;
        }
      }
    }

    const rect = buttonElement?.getBoundingClientRect?.();
    setProblemsFixMenu({
      proposals: resolvedProposals ?? [],
      rect: rect,
      issueTarget: resolvedIssueTarget,
      severity: resolvedStatusItem?.issue?.severity ?? 'warning',
      canFixIssue: resolvedIssueTarget ? Boolean(getIssueQuickFixConfig(resolvedIssueTarget.kind, resolvedIssueTarget.index)) : false,
    });
  }, [acRunResult, appliedIssueFixes, generatedDocument, highlightedProblemLocation, planRunResult, removedIssueIndices]);

  useEffect(() => {
    if (screen !== 'ide' || seededPresetTaskRef.current) return;
    seededPresetTaskRef.current = true;
    handleAgentTaskSelect('t1');
  }, [screen, handleAgentTaskSelect]);

  useEffect(() => {
    const handleProblemsToolbarMouseDown = (e) => {
      const btn = e.target.closest?.('button[title="Show Quick-Fixes"]');
      if (!btn) return;
      // Defer to next tick so PositionedPopup's dismiss listener (added after render)
      // does not fire on the same mousedown event that opens the menu.
      const btnSnapshot = btn;
      setTimeout(() => handleProblemsQuickFixesClick(btnSnapshot), 0);
    };
    document.addEventListener('mousedown', handleProblemsToolbarMouseDown, true);
    return () => {
      document.removeEventListener('mousedown', handleProblemsToolbarMouseDown, true);
    };
  }, [handleProblemsQuickFixesClick]);

  // Focus the Problems panel whenever it transitions from closed → open,
  // regardless of how it was opened (widget button, stripe button, keyboard shortcut, etc.)
  const prevIdeOpenWindowsRef = useRef(ideOpenWindows);
  useEffect(() => {
    const prev = prevIdeOpenWindowsRef.current;
    prevIdeOpenWindowsRef.current = ideOpenWindows;
    const justOpened = ideOpenWindows.includes('problems') && !prev.includes('problems');
    if (!justOpened) return;
    const panelEl = document.querySelector('.problems-window');
    if (!panelEl) return;
    const target =
      panelEl.querySelector('.tree-node-selected') ??
      panelEl.querySelector('.tree-node-children .tree-node') ??
      panelEl;
    if (target.tabIndex < 0) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    problemsPanelActiveRef.current = true;
  }, [ideOpenWindows]);

  // Track whether the Problems panel is the "active" panel for keyboard navigation,
  // and which leaf index is currently selected (avoids relying on tree-node-selected CSS class
  // which the UI kit resets on re-renders).
  useEffect(() => {
    const onMouseDown = (e) => {
      const panelEl = e.target.closest?.('.problems-window');
      if (panelEl) {
        problemsPanelActiveRef.current = true;
        // Track which leaf node was clicked so arrow nav starts from the right position
        const clickedLeaf = e.target.closest?.('.tree-node');
        if (clickedLeaf) {
          const leaves = Array.from(panelEl.querySelectorAll('.tree-node-children .tree-node'));
          const idx = leaves.indexOf(clickedLeaf);
          if (idx >= 0) problemsSelectedLeafIdxRef.current = idx;
        }
      } else {
        problemsPanelActiveRef.current = false;
      }
    };
    document.addEventListener('mousedown', onMouseDown, true);
    return () => document.removeEventListener('mousedown', onMouseDown, true);
  }, []);

  useEffect(() => {
    if (screen !== 'ide') return undefined;

    const handleProblemsArrowNav = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      if (document.querySelector('.problems-quick-fix-menu-item')) return;
      // Don't intercept when an input/textarea has focus
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.contentEditable === 'true')) return;

      // Use DOM check instead of stale-closure ideOpenWindows check
      const panelEl = document.querySelector('.problems-window');
      if (!panelEl) return;
      // Handle if focus is inside the panel OR user previously clicked it
      if (!panelEl.contains(document.activeElement) && !problemsPanelActiveRef.current) return;
      // Leaf nodes are rendered in the same order as treeData children
      const leafNodes = Array.from(panelEl.querySelectorAll('.tree-node-children .tree-node'));
      if (leafNodes.length === 0) return;

      // Use the ref-tracked index (reliable across re-renders) with CSS class as fallback
      let currentIdx = problemsSelectedLeafIdxRef.current;
      if (currentIdx < 0 || currentIdx >= leafNodes.length) {
        currentIdx = leafNodes.findIndex((n) => n.classList.contains('tree-node-selected'));
      }

      // Nothing selected yet — first arrow key always lands on the first item.
      if (currentIdx < 0) {
        currentIdx = -1;
      }

      const nextIdx = currentIdx < 0
        ? 0
        : e.key === 'ArrowDown'
          ? (currentIdx < leafNodes.length - 1 ? currentIdx + 1 : 0)
          : (currentIdx > 0 ? currentIdx - 1 : leafNodes.length - 1);

      const targetNode = leafNodes[nextIdx];
      if (!targetNode) return;

      e.preventDefault();
      e.stopPropagation();
      problemsSelectedLeafIdxRef.current = nextIdx;
      // Click triggers both UI kit visual selection and our onNodeSelect callback
      targetNode.click();
      targetNode.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    };

    document.addEventListener('keydown', handleProblemsArrowNav, true);
    return () => document.removeEventListener('keydown', handleProblemsArrowNav, true);
  }, [screen]);

  useEffect(() => {
    if (typeof document === 'undefined' || screen !== 'ide') return undefined;

    const handleProblemsQuickFixesShortcut = (event) => {
      if (!event.altKey || event.key !== 'Enter' || event.isComposing) return;

      const button = document.querySelector('button[title="Show Quick-Fixes"]');
      if (!(button instanceof HTMLElement)) return;

      event.preventDefault();
      event.stopPropagation();
      handleProblemsQuickFixesClick(button);
    };

    document.addEventListener('keydown', handleProblemsQuickFixesShortcut, true);
    return () => {
      document.removeEventListener('keydown', handleProblemsQuickFixesShortcut, true);
    };
  }, [screen, handleProblemsQuickFixesClick]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let frameId = 0;
    let nestedFrameId = 0;

    setEditorTabsHost(null);

    const resolveEditorTabsHost = () => {
      const nextHost = document.querySelector('.main-window .main-window-editor-tabs');
      setEditorTabsHost(nextHost instanceof HTMLElement ? nextHost : null);
    };

    frameId = requestAnimationFrame(() => {
      nestedFrameId = requestAnimationFrame(resolveEditorTabsHost);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      if (nestedFrameId) cancelAnimationFrame(nestedFrameId);
    };
  }, [screen, ideWindowKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let frameId = null;

    const syncEditorCaretVisibility = () => {
      frameId = null;
      document.querySelectorAll('.editor .pce-textarea').forEach((node) => {
        if (!(node instanceof HTMLTextAreaElement)) return;

        const editorEl = node.closest('.editor');
        if (!editorEl) return;

        const hasVisibleCaret =
          document.activeElement === node &&
          node.selectionStart === node.selectionEnd;

        editorEl.classList.toggle('editor-caret-visible', hasVisibleCaret);
      });
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(syncEditorCaretVisibility);
    };

    document.addEventListener('focusin', scheduleSync);
    document.addEventListener('focusout', scheduleSync);
    document.addEventListener('selectionchange', scheduleSync);
    window.addEventListener('mouseup', scheduleSync);
    window.addEventListener('keyup', scheduleSync);

    scheduleSync();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      document.removeEventListener('focusin', scheduleSync);
      document.removeEventListener('focusout', scheduleSync);
      document.removeEventListener('selectionchange', scheduleSync);
      window.removeEventListener('mouseup', scheduleSync);
      window.removeEventListener('keyup', scheduleSync);

      document.querySelectorAll('.editor.editor-caret-visible').forEach((editorEl) => {
        editorEl.classList.remove('editor-caret-visible');
      });
    };
  }, []);

  // Editor @ completion listener
  useEffect(() => {
    if (screen !== 'ide') return;

    const handleEditorInput = (e) => {
      const textarea = e.target;
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      if (!textarea.classList.contains('pce-textarea')) return;
      if (!textarea.closest('.main-window-editor-content .editor-code')) return;

      const value = textarea.value;

      // Disabled for now: attached file chips are controlled explicitly via popup/remove actions.
      // Restore this block if chips should again follow @/# mentions typed in the editor.
      if (ATTACHED_FILES_SYNC_WITH_EDITOR) {
        updateAttachedFilesForTab(files => files.filter(file => {
          for (const prefix of ['@', '#']) {
            const idx = value.indexOf(prefix + file.label);
            if (idx !== -1) {
              const after = value[idx + 1 + file.label.length];
              if (after === undefined || after === ' ' || after === '\n' || after === '\r') {
                return true;
              }
            }
          }
          return false;
        }));
      }

      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPos);

      const lastAt = textBeforeCursor.lastIndexOf('@');
      const lastHash = textBeforeCursor.lastIndexOf('#');
      const triggerIdx = Math.max(lastAt, lastHash);

      if (triggerIdx >= 0) {
        const trigger = textBeforeCursor[triggerIdx];
        const query = textBeforeCursor.slice(triggerIdx + 1);
        if (!query.includes(' ') && !query.includes('\n')) {
          const rect = textarea.getBoundingClientRect();
          setEditorCompletion({
            trigger,
            query,
            selectedIdx: 0,
            pos: { top: rect.top + 24, left: rect.left + 40 }
          });
          return;
        }
      }
      setEditorCompletion(null);
    };

    const handleEditorKeyDown = (e) => {
      const textarea = e.target;
      if (!(textarea instanceof HTMLTextAreaElement)) return;
      if (!textarea.classList.contains('pce-textarea')) return;
      if (!textarea.closest('.main-window-editor-content .editor-code')) return;
      if (!editorCompletionRef.current) return;

      const completion = editorCompletionRef.current;
      const items = completion.trigger === '@' ? AT_COMPLETIONS : HASH_COMPLETIONS;
      const filtered = items.filter(item =>
        item.label.toLowerCase().includes(completion.query.toLowerCase())
      ).slice(0, COMPLETION_POPUP_MAX_ITEMS);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEditorCompletion(c => c ? { ...c, selectedIdx: Math.min(c.selectedIdx + 1, filtered.length - 1) } : null);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEditorCompletion(c => c ? { ...c, selectedIdx: Math.max(c.selectedIdx - 1, 0) } : null);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (filtered.length > 0) {
          e.preventDefault();
          const item = filtered[completion.selectedIdx];
          const selection = buildCompletionSelection(item);
          if (selection) {
            const value = textarea.value;
            const cursorPos = textarea.selectionStart;
            const textBeforeCursor = value.slice(0, cursorPos);
            const triggerIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('#'));
            const before = value.slice(0, triggerIdx + 1);
            const after = value.slice(cursorPos);
            const insertText = getCompletionInsertText(selection);
            const newValue = before + insertText + ' ' + after;
            textarea.value = newValue;
            const newPos = triggerIdx + 1 + insertText.length + 1;
            textarea.setSelectionRange(newPos, newPos);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            const attachment = getCompletionAttachment(selection);
            if (attachment) {
              updateAttachedFilesForTab(files => {
                if (files.some(f => f.label === attachment.label)) return files;
                return [...files, attachment];
              });
            }
            setEditorCompletion(null);
          }
        }
      } else if (e.key === 'Escape') {
        if (problemsFixMenu) {
          setProblemsFixMenu(null);
        } else {
          setEditorCompletion(null);
        }
      }
    };

    document.addEventListener('input', handleEditorInput, true);
    document.addEventListener('keydown', handleEditorKeyDown, true);

    return () => {
      document.removeEventListener('input', handleEditorInput, true);
      document.removeEventListener('keydown', handleEditorKeyDown, true);
    };
  }, [screen, updateAttachedFilesForTab, problemsFixMenu]);

  // Keep ref in sync with state
  useEffect(() => {
    editorCompletionRef.current = editorCompletion;
  }, [editorCompletion]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    let frameId = null;

    const syncIdleSelectionToolbar = () => {
      frameId = null;

      if (screen !== 'ide') {
        setIdleSelectionToolbarPos(null);
        return;
      }

      const activeTab = ideTabs[activeEditorTab ?? 0];
      const isIdleAgentTaskTab = activeTab?.id?.startsWith('agent-task-') && genState === 'idle';
      if (!isIdleAgentTaskTab) {
        setIdleSelectionToolbarPos(null);
        return;
      }

      const textarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) => node instanceof HTMLTextAreaElement && !node.readOnly && node.getClientRects().length > 0
      );

      if (!(textarea instanceof HTMLTextAreaElement)) {
        setIdleSelectionToolbarPos(null);
        return;
      }

      const rect = getTextareaSelectionViewportRect(textarea);
      if (!rect || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
        setIdleSelectionToolbarPos(null);
        return;
      }

      setIdleSelectionToolbarPos(getSelectionToolbarPosition(rect));
    };

    const scheduleSync = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(syncIdleSelectionToolbar);
    };

    document.addEventListener('selectionchange', scheduleSync);
    document.addEventListener('select', scheduleSync, true);
    document.addEventListener('input', scheduleSync, true);
    document.addEventListener('focusin', scheduleSync);
    document.addEventListener('focusout', scheduleSync);
    document.addEventListener('scroll', scheduleSync, true);
    window.addEventListener('mouseup', scheduleSync);
    window.addEventListener('keyup', scheduleSync);
    window.addEventListener('resize', scheduleSync);

    scheduleSync();

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      document.removeEventListener('selectionchange', scheduleSync);
      document.removeEventListener('select', scheduleSync, true);
      document.removeEventListener('input', scheduleSync, true);
      document.removeEventListener('focusin', scheduleSync);
      document.removeEventListener('focusout', scheduleSync);
      document.removeEventListener('scroll', scheduleSync, true);
      window.removeEventListener('mouseup', scheduleSync);
      window.removeEventListener('keyup', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      setIdleSelectionToolbarPos(null);
    };
  }, [screen, ideTabs, activeEditorTab, genState]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const handleProblemsNodeClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const treeNode = target.closest('.tree-node');
      if (!(treeNode instanceof HTMLElement)) return;
      if (!treeNode.closest('.problems-window')) return;
      const isVisitConflictDiagnosticNode =
        (typeof treeNode.id === 'string' && treeNode.id.includes('visit-conflict-diagnostic'))
        || (treeNode.textContent ?? '').includes(VISIT_BOOKING_CONFLICT_PROBLEM_TITLE);

      const rawIndexMarker = target.closest('[data-problem-raw-index]');
      let rawIndex = rawIndexMarker instanceof HTMLElement
        ? Number(rawIndexMarker.dataset.problemRawIndex)
        : null;

      const secondary = treeNode.querySelector('.tree-node-secondary');
      rawIndex = Number.isInteger(rawIndex)
        ? rawIndex
        : secondary instanceof HTMLElement
        ? parseProblemRawIndexFromSecondaryText(secondary.textContent ?? '')
        : null;
      if (!Number.isInteger(rawIndex)) {
        const leafNodes = Array.from(document.querySelectorAll('.problems-window .tree-node-children .tree-node'));
        const leafIndex = leafNodes.indexOf(treeNode);
        const currentIssues = buildInspectionSummary({
          planRunResult,
          acRunResult,
          documentSections: generatedDocument,
        }).issues;
        const issue = leafIndex >= 0 ? currentIssues[leafIndex] : null;
        rawIndex = Number.isInteger(issue?.rawIndex) ? issue.rawIndex : null;
      }
      if (!Number.isInteger(rawIndex) && isVisitConflictDiagnosticNode) {
        rawIndex = getDocumentCheckRawIndex(generatedDocument, 'ac', VISIT_BOOKING_CONFLICT_PROBLEM_TARGET.index);
      }
      if (!Number.isInteger(rawIndex)) return;

      if (isVisitConflictDiagnosticNode) {
        setVisitBookingProblemExpanded(true);
      }
      requestProblemHighlight(rawIndex);
    };

    document.addEventListener('click', handleProblemsNodeClick, true);

    return () => {
      document.removeEventListener('click', handleProblemsNodeClick, true);
    };
  }, [acRunResult, generatedDocument, planRunResult, requestProblemHighlight]);

  useEffect(() => {
    if (screen !== 'ide') return;

    const nextTabIndex = activeEditorTab ?? 0;
    const activeTab = ideTabs[nextTabIndex];
    if (activeTab?.id === 'welcome') return;
    const shouldFocusAgentTaskToolbar = TOOLBAR_INPUT_IS_EDITABLE && activeTab?.id?.startsWith('agent-task-') && genState === 'idle';

    let rafId1 = 0;
    let rafId2 = 0;
    let timeoutId = 0;
    let attempts = 0;

    const focusAgentTaskToolbarInput = () => {
      const textarea = Array.from(document.querySelectorAll('.editor-top-bar .agent-task-editor-area .at-input')).find(
        (node) =>
          node instanceof HTMLTextAreaElement &&
          !node.readOnly &&
          !node.classList.contains('at-input-collapsed') &&
          node.getClientRects().length > 0
      );

      if (!(textarea instanceof HTMLTextAreaElement)) return false;

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }

      if (document.activeElement !== textarea) {
        return false;
      }

      const caretPosition = Math.min(textarea.value.length, textarea.selectionEnd ?? textarea.value.length);
      textarea.setSelectionRange(caretPosition, caretPosition, 'none');
      return true;
    };

    const focusVisibleEditor = () => {
      const textarea = Array.from(document.querySelectorAll('.main-window-editor-content .editor .pce-textarea')).find(
        (node) =>
          node instanceof HTMLTextAreaElement &&
          !node.readOnly &&
          node.getClientRects().length > 0
      );

      if (!(textarea instanceof HTMLTextAreaElement)) return false;

      if (document.activeElement !== textarea) {
        textarea.focus({ preventScroll: true });
      }

      if (document.activeElement !== textarea) {
        return false;
      }

      const caretPosition = Math.min(textarea.value.length, textarea.selectionEnd ?? 0);
      textarea.setSelectionRange(caretPosition, caretPosition, 'none');
      textarea.closest('.editor')?.classList.add('editor-caret-visible');
      return true;
    };

    const runFocusAttempt = () => {
      const didFocus = shouldFocusAgentTaskToolbar
        ? focusAgentTaskToolbarInput()
        : focusVisibleEditor();

      if (didFocus || attempts >= 20) return;

      attempts += 1;
      timeoutId = window.setTimeout(() => {
        rafId2 = requestAnimationFrame(runFocusAttempt);
      }, 50);
    };

    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(runFocusAttempt);
    });

    return () => {
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
      window.clearTimeout(timeoutId);
    };
  }, [screen, activeEditorTab, ideTabs, genState]);

  const openNewAgentTask = useCallback(() => {
    seededPresetTaskRef.current = true;

    const id = `agent-task-${Date.now()}`;
    const newTask = { id, label: 'New Task.md', time: 'now', status: null };
    const scenario = getAgentTaskScenario({
      tabId: id,
      label: newTask.label,
    });
    const nextTab = {
      id,
      label: newTask.label,
      icon: 'fileTypes/markdown',
      closable: true,
    };
    const nextContent = {
      language: 'markdown',
      code: scenario.initialCode,
    };

    setAgentTasks((tasks) => [newTask, ...tasks]);
    setSelectedTask(id);
    setScreen('ide');
    setIdeTabs((prev) => (
      prev.some((tab) => tab.id === id) ? prev : [nextTab, ...prev]
    ));
    setIdeTabContents((prev) => (
      prev[id]
        ? prev
        : {
            ...prev,
            [id]: nextContent,
          }
    ));
    setInteractiveTaskStates((prev) => (
      prev[id]
        ? prev
        : {
            ...prev,
            [id]: scenario.initialTaskState,
          }
    ));
    applyInteractiveTaskState(id, scenario.initialTaskState);
    setActiveEditorTab(0);
  }, [applyInteractiveTaskState]);

  const activeTabIdForGen = generationTabId ?? ideTabs[activeEditorTab]?.id;

  function startAgentTaskGeneration(options = {}) {
    const {
      openTerminal = false,
      question = '',
      sourceCode = null,
      nextDocument: providedDocument = null,
      nextAppliedIssueFixes = null,
      nextRemovedIssueIndices = null,
    } = options;
    const nextGenerationTabId = ideTabs[activeEditorTab]?.id;
    if (!nextGenerationTabId) return;
    doneEnhanceFlowRef.current = null;
    const nextTaskLabel = ideTabs[activeEditorTab]?.label ?? TERMINAL_TASK_TAB_BASE_LABEL;
    const nextScenario = getCurrentAgentTaskScenario(nextGenerationTabId);
    const nextDocument = Array.isArray(providedDocument) ? providedDocument : nextScenario.defaultDocument;
    setAppliedIssueFixes(nextAppliedIssueFixes ?? { ac: {}, plan: {} });
    setRemovedIssueIndices(nextRemovedIssueIndices ?? { ac: {}, plan: {} });
    setGenerationTabId(nextGenerationTabId);
    setGeneratedDocument(nextDocument);

    if (typeof sourceCode === 'string') {
      setIdeTabContents((prev) => ({
        ...prev,
        [nextGenerationTabId]: {
          ...(prev[nextGenerationTabId] ?? {}),
          language: 'markdown',
          code: sourceCode,
        },
      }));
    }

    terminalDrivenGenerationRef.current = openTerminal;

    if (openTerminal) {
      queueTerminalRun({
        mode: 'generate',
        sourceTabId: nextGenerationTabId,
        taskLabel: nextTaskLabel,
        question,
      });
    }

    if (!AGENT_TASK_USES_INTERMEDIATE_STATES) {
      const serializedDocument = serializeSpecDocument(nextDocument);
      setIdeTabContents(prev => ({ ...prev, [nextGenerationTabId]: { language: 'markdown', code: serializedDocument } }));
      setGenProgress(1);
      setGenState('done');
      return;
    }

    // Keep the idle editor content visible while the loading state is active.
    setGenState(AGENT_TASK_LOADING_STATE_ENABLED ? 'loading' : 'generating');
  }

  useEffect(() => {
    if (genTimerRef.current) {
      clearTimeout(genTimerRef.current);
      genTimerRef.current = null;
    }

    if (!AGENT_TASK_USES_INTERMEDIATE_STATES) {
      if (genState === 'idle' && activeTabIdForGen) {
        setIdeTabContents(prev => ({ ...prev, [activeTabIdForGen]: { language: 'markdown', code: '' } }));
        setGenProgress(0);
        setGenerationTabId(null);
      }
      return undefined;
    }

    if (genState === 'loading') {
      setGenProgress(0);
      if (!AGENT_TASK_GENERATING_STATE_ENABLED) {
        return undefined;
      }
      if (terminalDrivenGenerationRef.current || pendingTerminalRun || isTerminalStreaming || terminalPermissionPrompt) {
        return undefined;
      }
      genTimerRef.current = setTimeout(() => {
        setGenState('generating');
      }, AGENT_TASK_LOADING_STEP_DELAY_MS);

      return () => {
        if (genTimerRef.current) {
          clearTimeout(genTimerRef.current);
          genTimerRef.current = null;
        }
      };
    }

    if (genState === 'generating' && activeTabIdForGen) {
      if (!AGENT_TASK_GENERATING_STATE_ENABLED) {
        return undefined;
      }

      const doneEnhanceFlow = doneEnhanceFlowRef.current;
      if (doneEnhanceFlow) {
        const {
          mode = 'apply',
          sourceTabId = activeTabIdForGen,
          initialCode,
          targetCode,
          nextDocument,
          nextAppliedIssueFixes,
          nextRemovedIssueIndices,
          nextAcRunResult,
          nextPlanRunResult,
          currentAcRunResult,
          currentPlanRunResult,
          currentRemovedIssueIndices,
          rerunAcOriginalIndices,
          rerunPlanOriginalIndices,
          updatedRowTarget,
          commentsAlreadyCleared = false,
          usesDirectSwap = false,
          restorePlanFrames = null,
          versionCommit = null,
        } = doneEnhanceFlow;
        setGenProgress(0);
        resetRunUiForTab(sourceTabId);

        if (mode === 'preview-only') {
          let cancelled = false;

          genTimerRef.current = setTimeout(() => {
            if (cancelled) return;
            doneEnhanceFlowRef.current = null;
            setGenProgress(1);
            setGenState('done');
          }, Math.max(AGENT_TASK_LOADING_STEP_DELAY_MS, 180));

          return () => {
            cancelled = true;
            if (genTimerRef.current) {
              clearTimeout(genTimerRef.current);
              genTimerRef.current = null;
            }
          };
        }

        let commentsCleared = commentsAlreadyCleared;

        const clearDoneCommentsOnce = () => {
          if (commentsCleared) return;
          commentsCleared = true;
          fadeOutDoneComments();
          if (doneEnhanceFlowRef.current) {
            doneEnhanceFlowRef.current = {
              ...doneEnhanceFlowRef.current,
              commentsAlreadyCleared: true,
            };
          }
        };
        const persistDoneEnhanceTaskState = () => {
          if (!sourceTabId) return;

          setInteractiveTaskStates((prev) => ({
            ...prev,
            [sourceTabId]: {
              ...(prev[sourceTabId] ?? {}),
              genState: 'done',
              genProgress: 1,
              documentSections: nextDocument,
              appliedIssueFixes: nextAppliedIssueFixes,
              removedIssueIndices: nextRemovedIssueIndices,
              acRunResult: nextAcRunResult,
              planRunResult: nextPlanRunResult,
              commentEntries: [],
              pendingRerunAcOriginalIndices: Array.isArray(rerunAcOriginalIndices) && rerunAcOriginalIndices.length > 0 ? rerunAcOriginalIndices : undefined,
              pendingRerunPlanOriginalIndices: Array.isArray(rerunPlanOriginalIndices) && rerunPlanOriginalIndices.length > 0 ? rerunPlanOriginalIndices : undefined,
            },
          }));
        };

        if (mode === 'restore-plan-progressive') {
          const frames = Array.isArray(restorePlanFrames) ? restorePlanFrames : [];
          let frameIndex = 0;
          let cancelled = false;

          const finishRestore = () => {
            if (cancelled) return;
            doneEnhanceFlowRef.current = null;
            clearDoneCommentsOnce();
            if (versionCommit?.sourceTabId) {
              updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
                currentCode: versionCommit.currentCode,
                currentCommentEntries: versionCommit.currentCommentEntries,
                nextCode: versionCommit.nextCode,
              }), versionCommit.sourceTabId);
            }
            setIdeTabContents((prev) => ({
              ...prev,
              [activeTabIdForGen]: {
                ...(prev[activeTabIdForGen] ?? {}),
                language: 'markdown',
                code: targetCode,
              },
            }));
            setGeneratedDocument(nextDocument);
            triggerUpdatedSpecRowAnimation(updatedRowTarget);
            setAppliedIssueFixes(nextAppliedIssueFixes);
            setRemovedIssueIndices(nextRemovedIssueIndices);
            setAcRunResult(nextAcRunResult);
            setPlanRunResult(null);
            persistDoneEnhanceTaskState();
            setGenProgress(1);
            setGenState('done');
          };

          const showNextRestoreFrame = () => {
            if (cancelled) return;
            if (frameIndex >= frames.length) {
              finishRestore();
              return;
            }

            const frame = frames[frameIndex];
            frameIndex += 1;
            setIdeTabContents((prev) => ({
              ...prev,
              [activeTabIdForGen]: {
                ...(prev[activeTabIdForGen] ?? {}),
                language: 'markdown',
                code: frame.code,
              },
            }));
            setGeneratedDocument(frame.documentSections);
            setPlanRunResult(frame.planRunResult);
            setGenProgress(frameIndex / Math.max(frames.length, 1));
            genTimerRef.current = setTimeout(showNextRestoreFrame, RESTORE_PLAN_FRAME_STEP_DELAY_MS);
          };

          genTimerRef.current = setTimeout(showNextRestoreFrame, RESTORE_PLAN_FRAME_INITIAL_DELAY_MS);

          return () => {
            cancelled = true;
            if (genTimerRef.current) {
              clearTimeout(genTimerRef.current);
              genTimerRef.current = null;
            }
          };
        }

        if (usesDirectSwap) {
          clearDoneCommentsOnce();
          setIdeTabContents((prev) => ({
            ...prev,
            [activeTabIdForGen]: {
              ...(prev[activeTabIdForGen] ?? {}),
              language: 'markdown',
              code: targetCode,
            },
          }));
          if (versionCommit?.sourceTabId) {
            updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
              currentCode: versionCommit.currentCode,
              currentCommentEntries: versionCommit.currentCommentEntries,
              nextCode: versionCommit.nextCode,
            }), versionCommit.sourceTabId);
          }
          doneEnhanceFlowRef.current = null;
          setGeneratedDocument(nextDocument);
          triggerUpdatedSpecRowAnimation(updatedRowTarget);
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
            allowPendingOutdated: false,
          });
          persistDoneEnhanceTaskState();
          setGenProgress(1);
          setGenState('done');
          return undefined;
        }

        const frames = buildSmoothSpecTransitionFrames(initialCode, targetCode);

        if (frames.length === 0) {
          if (versionCommit?.sourceTabId) {
            updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
              currentCode: versionCommit.currentCode,
              currentCommentEntries: versionCommit.currentCommentEntries,
              nextCode: versionCommit.nextCode,
            }), versionCommit.sourceTabId);
          }
          doneEnhanceFlowRef.current = null;
          persistDoneEnhanceTaskState();
          clearDoneCommentsOnce();
          setGeneratedDocument(nextDocument);
          triggerUpdatedSpecRowAnimation(updatedRowTarget);
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
            allowPendingOutdated: false,
          });
          setGenProgress(1);
          setGenState('done');
          return undefined;
        }

        let frameIndex = 0;
        let cancelled = false;

        function streamEnhancedContentFrame() {
          if (cancelled) return;

          if (frameIndex < frames.length) {
            const nextFrame = frames[frameIndex];
            frameIndex += 1;

            setIdeTabContents((prev) => ({
              ...prev,
              [activeTabIdForGen]: {
                ...(prev[activeTabIdForGen] ?? {}),
                language: 'markdown',
                code: nextFrame,
              },
            }));
            setGenProgress(frameIndex / frames.length);

            genTimerRef.current = setTimeout(
              streamEnhancedContentFrame,
              AGENT_TASK_CONTENT_MORPH_STEP_DELAY_MS,
            );
            return;
          }

          doneEnhanceFlowRef.current = null;
          clearDoneCommentsOnce();
          if (versionCommit?.sourceTabId) {
            updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
              currentCode: versionCommit.currentCode,
              currentCommentEntries: versionCommit.currentCommentEntries,
              nextCode: versionCommit.nextCode,
            }), versionCommit.sourceTabId);
          }
          setGeneratedDocument(nextDocument);
          triggerUpdatedSpecRowAnimation(updatedRowTarget);
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
            allowPendingOutdated: false,
          });
          persistDoneEnhanceTaskState();
          setGenProgress(1);
          setGenState('done');
        }

        streamEnhancedContentFrame();

        return () => {
          cancelled = true;
          if (genTimerRef.current) {
            clearTimeout(genTimerRef.current);
            genTimerRef.current = null;
          }
        };
      }

      const fullText = serializeSpecDocument(generatedDocument);
      setGenProgress(0);

      let index = 0;
      let cancelled = false;

      function streamChunk() {
        if (cancelled) return;

        if (index < fullText.length) {
          // Larger chunks + tighter cadence for faster visible streaming.
          const chunkSize = Math.floor(Math.random() * 9) + 8;
          index = Math.min(fullText.length, index + chunkSize);
          const chunk = fullText.slice(0, index);

          setIdeTabContents(prev => ({ ...prev, [activeTabIdForGen]: { language: 'markdown', code: chunk } }));
          setGenProgress(index / fullText.length);

          genTimerRef.current = setTimeout(streamChunk, 6 + Math.random() * 10);
          return;
        }

        setGenState('done');
      }

      streamChunk();

      return () => {
        cancelled = true;
        if (genTimerRef.current) {
          clearTimeout(genTimerRef.current);
          genTimerRef.current = null;
        }
      };
    }

    if (genState === 'idle' && generationTabId && activeTabIdForGen) {
      const cancelledDoneEnhanceFlow = doneEnhanceFlowRef.current;
      const restoredCode = cancelledDoneEnhanceFlow?.initialCode ?? '';
      doneEnhanceFlowRef.current = null;
      setIdeTabContents(prev => ({
        ...prev,
        [activeTabIdForGen]: {
          ...(prev[activeTabIdForGen] ?? {}),
          language: 'markdown',
          code: restoredCode,
        },
      }));
      setGenProgress(0);
      setGenerationTabId(null);
    }
  }, [
    activeTabIdForGen,
    fadeOutDoneComments,
    genState,
    generationTabId,
    isTerminalStreaming,
    pendingTerminalRun,
    resetDoneComments,
    resetRunUiForTab,
    startDoneEnhanceStatusReveal,
    terminalPermissionPrompt,
    triggerUpdatedSpecRowAnimation,
    updateSpecVersionsForTab,
  ]);

  useEffect(() => {
    if (genState !== 'done' || !activeTabIdForGen) return;
    const serializedDocument = serializeSpecDocument(generatedDocument);
    setIdeTabContents(prev => ({ ...prev, [activeTabIdForGen]: { language: 'markdown', code: serializedDocument } }));
  }, [generatedDocument, genState, activeTabIdForGen]);

  useEffect(() => {
    if (screen !== 'ide' || genState !== 'done') return;

    let rafId = 0;

    rafId = requestAnimationFrame(() => {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }

      document.querySelectorAll('.main-window-editor-content .editor').forEach((node) => {
        if (node instanceof HTMLElement) {
          node.classList.remove('editor-caret-visible');
        }
      });
    });

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [screen, genState]);

  const currentProblemsTab = screen === 'welcome'
    ? null
    : (ideTabs[activeEditorTab ?? 0] ?? null);
  const handleActiveDoneOverlayUiStateChange = useCallback((uiState) => {
    updateDoneOverlayUiStateForTab(uiState, visibleEditorStateTabId);
  }, [updateDoneOverlayUiStateForTab, visibleEditorStateTabId]);
  const handleDoneCommentsChange = useCallback((nextEntries) => {
    if (
      doneEnhanceFlowRef.current?.commentsAlreadyCleared
      || isVisitBookingProblemCommentFading
      || suppressDoneCommentsSyncRef.current
    ) {
      return;
    }

    const normalizedNextEntries = Array.isArray(nextEntries) ? nextEntries : [];

    setAgentTaskCommentEntries((prev) => {
      const mergedNextEntries = mergeCommentEntriesWithExistingDiffAnchors(normalizedNextEntries, prev);
      const nextSignature = buildSpecVersionCommentEntriesSignature(mergedNextEntries);

      return buildSpecVersionCommentEntriesSignature(prev) === nextSignature
        ? prev
        : mergedNextEntries;
    });
  }, [isVisitBookingProblemCommentFading]);
  const activeAgentTaskViewState = useMemo(
    () => (
      activeEditorTabId?.startsWith('agent-task-') && (genState === 'done' || Boolean(doneEnhanceFlowRef.current))
        ? getCommentDrivenViewStateForTaskTab(activeEditorTabId)
        : null
    ),
    [activeEditorTabId, genState, getCommentDrivenViewStateForTaskTab],
  );
  const activeAgentTaskDocumentSections = activeAgentTaskViewState?.documentSections ?? generatedDocument;
  const activeAgentTaskAcRunResult = activeAgentTaskViewState?.acRunResult ?? acRunResult;
  const activeAgentTaskPlanRunResult = activeAgentTaskViewState?.planRunResult ?? planRunResult;
  const activeAgentTaskRemovedIssueIndices = activeAgentTaskViewState?.removedIssueIndices ?? removedIssueIndices;
  const agentTaskPanelRuntimeStates = useMemo(
    () => agentTasks.map((task) => {
      const taskTabId = getAgentTaskTabId(task?.id);
      if (!taskTabId) {
        return {
          ...task,
          taskTabId: null,
          indicator: null,
        };
      }

      const runtimeState = getTaskRuntimeState(taskTabId);
      const viewState = getCommentDrivenViewStateForTaskTab(taskTabId);
      const taskState = runtimeState?.taskState ?? null;
      const documentSections =
        viewState?.documentSections
        ?? taskState?.documentSections
        ?? runtimeState?.scenario?.defaultDocument
        ?? [];
      const planStatuses = viewState?.planRunResult ?? taskState?.planRunResult ?? null;
      const acStatuses = viewState?.acRunResult ?? taskState?.acRunResult ?? null;
      const inspectionSummary = buildInspectionSummary({
        planRunResult: planStatuses,
        acRunResult: acStatuses,
        documentSections,
      });
      const hasWarningIndicator =
        hasChecklistWarningOrError(planStatuses)
        || hasChecklistWarningOrError(acStatuses)
        || inspectionSummary.warningCount > 0
        || inspectionSummary.errorCount > 0;
      const isLoading =
        runStatesByTab[taskTabId] === 'running'
        || taskState?.genState === 'loading'
        || (AGENT_TASK_GENERATING_STATE_ENABLED && taskState?.genState === 'generating');
      const hasSuccessfulRun =
        !hasWarningIndicator
        && (hasChecklistStatuses(planStatuses) || hasChecklistStatuses(acStatuses))
        && (!hasChecklistStatuses(planStatuses) || areAllChecklistStatusesPassed(planStatuses))
        && (!hasChecklistStatuses(acStatuses) || areAllChecklistStatusesPassed(acStatuses));
      const isSuccess =
        !hasWarningIndicator
        && (taskState?.genState === 'done' || hasSuccessfulRun);

      return {
        ...task,
        taskTabId,
        indicator: isLoading
          ? 'loading'
          : hasWarningIndicator
            ? 'warning'
            : isSuccess
              ? 'success'
              : null,
      };
    }),
    [agentTasks, getCommentDrivenViewStateForTaskTab, getTaskRuntimeState, runStatesByTab],
  );
  const hasActiveAgentTaskExecution = useMemo(
    () => agentTaskPanelRuntimeStates.some((task) => task?.indicator === 'loading'),
    [agentTaskPanelRuntimeStates],
  );
  const agentTaskPanelTasks = useMemo(
    () => agentTaskPanelRuntimeStates.map((task) => ({
      ...task,
      time:
        resolveAgentTaskExecutionTimeLabel(
          task?.taskTabId ? agentTaskExecutionTimings[task.taskTabId] : null,
          agentTaskTimeTick,
        )
        || task.time
        || '',
    })),
    [agentTaskExecutionTimings, agentTaskPanelRuntimeStates, agentTaskTimeTick],
  );
  const navigatedAgentTaskId = useMemo(
    () => getAgentTaskIdForEditorTab(currentProblemsTab, agentTasks),
    [agentTasks, currentProblemsTab],
  );
  const activeAgentTaskPanelSelectionId = navigatedAgentTaskId ?? selectedTask ?? agentTaskPanelTasks[0]?.id ?? null;
  const agentTaskPlanTreesByTaskId = useMemo(() => (
    agentTaskPanelTasks.reduce((nextTrees, task) => {
      if (!task?.id) return nextTrees;

      const sourceTabId = task?.taskTabId ?? getAgentTaskTabId(task.id);
      if (!sourceTabId) return nextTrees;

      const viewState = getCommentDrivenViewStateForTaskTab(sourceTabId);
      const runtimeState = getTaskRuntimeState(sourceTabId);
      const resolvedPlanRunResult =
        viewState?.planRunResult
        ?? runtimeState?.taskState?.planRunResult
        ?? null;
      const shouldShowPlanTree =
        runtimeState?.taskState?.genState === 'done'
        && Array.isArray(resolvedPlanRunResult)
        && resolvedPlanRunResult.length > 0;

      if (!shouldShowPlanTree) {
        return nextTrees;
      }

      nextTrees[task.id] = buildAgentTaskPlanTreeModel({
        task,
        sourceTabId,
        sourceCode: viewState?.code ?? runtimeState?.baseCode ?? '',
        documentSections:
          viewState?.documentSections
          ?? runtimeState?.taskState?.documentSections
          ?? runtimeState?.scenario?.defaultDocument
          ?? [],
        planRunResult: resolvedPlanRunResult,
        removedIssueIndices:
          viewState?.removedIssueIndices
          ?? runtimeState?.taskState?.removedIssueIndices
          ?? null,
      });

      return nextTrees;
    }, {})
  ), [
    agentTaskPanelTasks,
    getCommentDrivenViewStateForTaskTab,
    getTaskRuntimeState,
  ]);
  const handleAgentTaskPlanTreeNodeSelect = useCallback((taskId, nodeId) => {
    const navigationEntry = agentTaskPlanTreesByTaskId?.[taskId]?.navigationByNodeId?.[nodeId] ?? null;
    if (!navigationEntry) return;

    openPlanDiffTab({
      text: navigationEntry.text,
      statusItem: navigationEntry.statusItem,
      issueTarget: navigationEntry.issueTarget,
      source: {
        taskId: navigationEntry.taskId,
        tabId: navigationEntry.sourceTabId,
        label: navigationEntry.sourceLabel,
      },
      navigation: {
        activeRowId: navigationEntry.activeRowId,
      },
    });
  }, [agentTaskPlanTreesByTaskId, openPlanDiffTab]);
  useEffect(() => {
    const now = Date.now();

    setAgentTaskExecutionTimings((prev) => {
      let didChange = false;
      const next = { ...prev };

      agentTaskPanelRuntimeStates.forEach((task) => {
        const taskTabId = task?.taskTabId;
        if (!taskTabId) return;

        const currentTiming = next[taskTabId] ?? createAgentTaskExecutionTiming();
        const isActive = task.indicator === 'loading';

        if (isActive && !Number.isFinite(currentTiming.activeStartedAt)) {
          next[taskTabId] = {
            ...currentTiming,
            activeStartedAt: now,
          };
          didChange = true;
          return;
        }

        if (!isActive && Number.isFinite(currentTiming.activeStartedAt)) {
          next[taskTabId] = {
            ...currentTiming,
            activeStartedAt: null,
            lastDurationMs: Math.max(1000, now - currentTiming.activeStartedAt),
          };
          didChange = true;
        }
      });

      return didChange ? next : prev;
    });
  }, [agentTaskPanelRuntimeStates]);
  useEffect(() => {
    if (!hasActiveAgentTaskExecution) return undefined;

    setAgentTaskTimeTick(Date.now());
    const intervalId = window.setInterval(() => {
      setAgentTaskTimeTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasActiveAgentTaskExecution]);
  useEffect(() => {
    setDismissedAgentTaskSuccessIds((prev) => {
      const activeDoneTaskIds = new Set(
        agentTaskPanelTasks
          .filter((task) => task?.indicator === 'success')
          .map((task) => task.id)
      );
      const next = prev.filter((taskId) => activeDoneTaskIds.has(taskId));
      return next.length === prev.length ? prev : next;
    });
  }, [agentTaskPanelTasks]);
  const agentTaskInspectionSummary = buildInspectionSummary({
    planRunResult: activeAgentTaskPlanRunResult,
    acRunResult: activeAgentTaskAcRunResult,
    documentSections: activeAgentTaskDocumentSections,
  });
  const currentAgentTaskLabel = ideTabs[activeEditorTab ?? 0]?.label ?? TERMINAL_TASK_TAB_BASE_LABEL;
  const activeDoneSourceTabId = generationTabId ?? activeEditorTabId;
  const activeDoneDisplayCode = activeAgentTaskViewState?.code
    ?? (activeDoneSourceTabId ? (ideTabContents[activeDoneSourceTabId]?.code ?? '') : '');
  const hasLocalTerminalTabs = terminalTabsState.length > 0;
  const activeLocalTerminalTabIndex = hasLocalTerminalTabs
    ? Math.max(terminalTabsState.findIndex((tab) => tab.id === activeTerminalTabId), 0)
    : 0;
  const resolvedLocalTerminalTabId = hasLocalTerminalTabs
    ? (terminalTabsState[activeLocalTerminalTabIndex]?.id ?? null)
    : null;
  const activeTerminalSession = resolvedLocalTerminalTabId
    ? (terminalSessions[resolvedLocalTerminalTabId] ?? null)
    : null;
  const visibleTerminalBlocks = hasLocalTerminalTabs ? (activeTerminalSession?.blocks ?? []) : terminalBlocks;
  const visibleTerminalViewKey = hasLocalTerminalTabs ? (activeTerminalSession?.viewKey ?? 0) : terminalViewKey;
  const visibleTerminalIsStreaming = hasLocalTerminalTabs ? Boolean(activeTerminalSession?.isStreaming) : isTerminalStreaming;
  const visiblePendingTerminalRun = hasLocalTerminalTabs ? (activeTerminalSession?.pendingRun ?? null) : pendingTerminalRun;
  const visibleTerminalPermissionPrompt = hasLocalTerminalTabs ? (activeTerminalSession?.permissionPrompt ?? null) : terminalPermissionPrompt;
  const visibleAcWarningBanner = hasLocalTerminalTabs ? (activeTerminalSession?.acWarningBanner ?? null) : acWarningBanner;
  const handleTerminalTabChange = useCallback((nextIndex) => {
    const nextTab = terminalTabsState[nextIndex];
    if (!nextTab) return;
    setActiveTerminalTabId(nextTab.id);
  }, [terminalTabsState]);
  const handleTerminalTabClose = useCallback((indexToClose) => {
    if (!Number.isInteger(indexToClose) || indexToClose < 0 || indexToClose >= terminalTabsState.length) {
      return;
    }

    const closingTab = terminalTabsState[indexToClose];
    if (!closingTab) return;

    const nextTabs = terminalTabsState.filter((_, index) => index !== indexToClose);
    const nextActiveTabId = activeTerminalTabId === closingTab.id
      ? (nextTabs[Math.max(0, Math.min(indexToClose, nextTabs.length - 1))]?.id ?? null)
      : activeTerminalTabId;

    if (currentTerminalRunTabIdRef.current === closingTab.id) {
      const closingSourceTabId = terminalSessions[closingTab.id]?.sourceTabId ?? null;
      clearTerminalRunAnimation();
      setPendingTerminalRunForTab(null, closingTab.id);
      setTerminalPermissionPromptForTab(null, closingTab.id);
      setAcWarningBannerForTab(null, closingTab.id);
      currentTerminalRunTabIdRef.current = null;
      setRunStateForTab('default', closingSourceTabId);
      if (currentRunSourceTabIdRef.current === closingSourceTabId) {
        currentRunSourceTabIdRef.current = null;
      }
    }

    setTerminalTabsState(nextTabs);
    setActiveTerminalTabId(nextActiveTabId);
    setTerminalSessions((prev) => {
      if (!(closingTab.id in prev)) return prev;
      const { [closingTab.id]: _removedSession, ...rest } = prev;
      return rest;
    });
  }, [
    activeTerminalTabId,
    clearTerminalRunAnimation,
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
    terminalSessions,
    terminalTabsState,
  ]);
  const handleTerminalTabAdd = useCallback(() => {
    const meta = resolveTerminalSessionMeta();
    ensureTerminalSession(meta);
  }, [ensureTerminalSession, resolveTerminalSessionMeta]);
  const editorTabsMorePortal = editorTabsHost ? createPortal(
    <div className="editor-tabs-more-slot">
      <IconButton
        icon="general/moreVertical"
        aria-label="More"
        className="editor-tabs-more-button"
      />
    </div>,
        editorTabsHost
  ) : null;
  const terminalOutputHost = typeof document !== 'undefined'
    ? document.querySelector('.main-window .terminal-window .terminal-output-area')
    : null;
  const terminalPermissionPortal =
    visibleTerminalPermissionPrompt && terminalOutputHost instanceof HTMLElement
      ? createPortal(
          <TerminalPermissionPrompt
            question={visibleTerminalPermissionPrompt.question}
            options={visibleTerminalPermissionPrompt.options}
            selectedIdx={visibleTerminalPermissionPrompt.selectedIdx}
            onMoveSelection={moveTerminalPermissionSelection}
            onSelect={handleTerminalPermissionSelect}
            onHover={hoverTerminalPermissionSelection}
          />,
          terminalOutputHost
        )
      : null;

  useEffect(() => {
    const isDoneAgentTaskTab =
      currentProblemsTab?.id?.startsWith('agent-task-') &&
      genState === 'done';

    if (isDoneAgentTaskTab) return;

    setHighlightedProblemLocation(null);
  }, [currentProblemsTab?.id, genState]);

  const commitDoneSpecUpdate = useCallback((options = {}) => {
    const pendingDoneSpecState = buildPendingDoneSpecState(options);
    const sourceTabId = pendingDoneSpecState?.sourceTabId ?? generationTabId ?? activeEditorTabId;
    if (!sourceTabId || !pendingDoneSpecState) {
      return {
        didCommit: false,
        sourceTabId,
      };
    }

    const {
      currentCode,
      targetCode: nextCode,
      nextDocument,
      nextAppliedIssueFixes,
      nextRemovedIssueIndices,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      pendingCommentEntriesSnapshot,
      hasPendingReruns,
      hasSpecChanges,
      hasPendingComments,
    } = pendingDoneSpecState;
    const normalizedRunSectionTitle = typeof options?.runSectionTitle === 'string'
      ? options.runSectionTitle.trim().toLowerCase()
      : '';
    const normalizedRunTarget = normalizeCommentTarget(options?.runTarget);
    const allVisibleAcOriginalIndices = getVisibleIssueOriginalIndices('ac', nextRemovedIssueIndices);
    const allVisiblePlanOriginalIndices = getVisibleIssueOriginalIndices('plan', nextRemovedIssueIndices);
    let requestAcRerunOriginalIndices = [];
    let requestPlanRerunOriginalIndices = [];
    let seededAcRerunOriginalIndices = rerunAcOriginalIndices;
    let seededPlanRerunOriginalIndices = rerunPlanOriginalIndices;

    if (normalizedRunTarget?.kind === 'ac') {
      requestAcRerunOriginalIndices = [normalizedRunTarget.index];
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, requestAcRerunOriginalIndices);
    } else if (normalizedRunTarget?.kind === 'plan') {
      requestPlanRerunOriginalIndices = [normalizedRunTarget.index];
      requestAcRerunOriginalIndices = allVisibleAcOriginalIndices;
      seededPlanRerunOriginalIndices = mergeOriginalIssueIndices(rerunPlanOriginalIndices, allVisiblePlanOriginalIndices);
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, allVisibleAcOriginalIndices);
    } else if (normalizedRunSectionTitle === 'acceptance criteria') {
      requestAcRerunOriginalIndices = allVisibleAcOriginalIndices;
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, allVisibleAcOriginalIndices);
    } else if (normalizedRunSectionTitle === 'plan') {
      requestAcRerunOriginalIndices = allVisibleAcOriginalIndices;
      requestPlanRerunOriginalIndices = allVisiblePlanOriginalIndices;
      seededAcRerunOriginalIndices = mergeOriginalIssueIndices(rerunAcOriginalIndices, allVisibleAcOriginalIndices);
      seededPlanRerunOriginalIndices = mergeOriginalIssueIndices(rerunPlanOriginalIndices, allVisiblePlanOriginalIndices);
    }
    const committedAcRunResult = buildRunStatusesRevealSeed({
      kind: 'ac',
      currentStatuses: currentAcRunResult,
      nextStatuses: nextAcRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
      rerunOriginalIndices: seededAcRerunOriginalIndices,
    });
    const committedPlanRunResult = normalizedRunTarget?.kind === 'plan'
      ? buildRunStatusesSeedWithPendingOriginalIndices({
          kind: 'plan',
          currentStatuses: currentPlanRunResult,
          nextStatuses: nextPlanRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
          rerunOriginalIndices: seededPlanRerunOriginalIndices,
          pendingOriginalIndices: [normalizedRunTarget.index],
        })
      : buildRunStatusesRevealSeed({
          kind: 'plan',
          currentStatuses: currentPlanRunResult,
          nextStatuses: nextPlanRunResult,
          currentRemovedIssueIndices,
          nextRemovedIssueIndices,
          rerunOriginalIndices: seededPlanRerunOriginalIndices,
        });
    const shouldApplyContentChanges = hasSpecChanges || hasPendingComments;
    const shouldApplyStatusSeed =
      normalizedRunSectionTitle.length > 0
      || !areComparableValuesEqual(currentAcRunResult, committedAcRunResult)
      || !areComparableValuesEqual(currentPlanRunResult, committedPlanRunResult);
    const terminalTabId = buildTerminalSessionTabId(sourceTabId);

    if (shouldApplyContentChanges) {
      setIdeTabContents((prev) => ({
        ...prev,
        [sourceTabId]: {
          ...(prev[sourceTabId] ?? {}),
          language: 'markdown',
          code: nextCode,
        },
      }));
      setGeneratedDocument(nextDocument);
      setAppliedIssueFixes(cloneIssueStateMap(nextAppliedIssueFixes));
      setRemovedIssueIndices(cloneIssueStateMap(nextRemovedIssueIndices));
      if (options?.applyPendingComments !== false) {
        resetDoneComments();
      }
      if (hasSpecChanges) {
        updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
          currentCode,
          nextCode,
          currentCommentEntries: pendingCommentEntriesSnapshot,
        }), sourceTabId);
      }
    }

    if (shouldApplyStatusSeed) {
      setAcRunResult(committedAcRunResult);
      setPlanRunResult(committedPlanRunResult);
      setAcWarningBannerForTab(null, terminalTabId);
      setPendingTerminalRunForTab(null, terminalTabId);
      setTerminalPermissionPromptForTab(null, terminalTabId);
      setRunStateForTab('default', sourceTabId);
      currentRunSourceTabIdRef.current = null;
    }

    return {
      didCommit: shouldApplyContentChanges || shouldApplyStatusSeed,
      sourceTabId,
      nextAcRunResult,
      nextPlanRunResult,
      committedAcRunResult,
      committedPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
      rerunAcOriginalIndices: requestAcRerunOriginalIndices,
      rerunPlanOriginalIndices: requestPlanRerunOriginalIndices,
      hasPendingReruns,
    };
  }, [
    activeEditorTabId,
    buildPendingDoneSpecState,
    generationTabId,
    resetDoneComments,
    setAcWarningBannerForTab,
    setPendingTerminalRunForTab,
    setRunStateForTab,
    setTerminalPermissionPromptForTab,
    updateSpecVersionsForTab,
  ]);

  const handleDoneOpenTerminal = (input) => {
    const runTarget = normalizeCommentTarget(typeof input === 'object' ? input?.runTarget ?? input?.checkTarget : null);
    const sectionTitle = typeof input === 'string'
      ? input
      : (input?.sectionTitle
          ?? (runTarget?.kind === 'ac'
            ? 'Acceptance Criteria'
            : runTarget?.kind === 'plan'
              ? 'Plan'
              : null));
    const resolvedRunSectionTitle = typeof sectionTitle === 'string' && sectionTitle.trim().length > 0
      ? sectionTitle
      : 'Plan';
    const commitResult = commitDoneSpecUpdate({
      applyPendingComments: false,
      runSectionTitle: resolvedRunSectionTitle,
      runTarget,
    });
    const sourceTabId = commitResult?.sourceTabId ?? generationTabId ?? activeEditorTabId;
    const terminalTabId = sourceTabId ? buildTerminalSessionTabId(sourceTabId) : null;
    const taskState = sourceTabId ? interactiveTaskStates[sourceTabId] : null;
    const initialAcRunResult =
      commitResult?.committedAcRunResult
      ?? activeAgentTaskAcRunResult
      ?? null;
    const initialPlanRunResult =
      commitResult?.committedPlanRunResult
      ?? activeAgentTaskPlanRunResult
      ?? null;
    if (terminalTabId) {
      setAcWarningBannerForTab(null, terminalTabId);
    }

    if (sourceTabId && (taskState?.pendingRerunAcOriginalIndices || taskState?.pendingRerunPlanOriginalIndices)) {
      setInteractiveTaskStates((prev) => ({
        ...prev,
        [sourceTabId]: {
          ...(prev[sourceTabId] ?? {}),
          pendingRerunAcOriginalIndices: undefined,
          pendingRerunPlanOriginalIndices: undefined,
        },
      }));
    }

    queueTerminalRun({
      mode: 'section',
      sourceTabId,
      sectionTitle,
      checkTarget: runTarget,
      taskLabel: currentAgentTaskLabel,
      initialAcRunResult,
      initialPlanRunResult,
      rerunAcOriginalIndices: commitResult?.rerunAcOriginalIndices ?? [],
      rerunPlanOriginalIndices: commitResult?.rerunPlanOriginalIndices ?? [],
    }, {
      preserveAcRunResult: true,
      preservePlanRunResult: true,
    });
  };

  function renderBottomPanelContent(id, ctx) {
    const patchedCtx = id === 'terminal' ? {
      ...ctx,
      setShowBottomPanel: (show) => {
        if (!show) setRunStateForTab('default');
        ctx.setShowBottomPanel(show);
      },
    } : ctx;
    const panel = defaultBottomPanelContent(id, patchedCtx);
    if (!isValidElement(panel)) return panel;
    if (id === 'terminal') {
      const terminalTabs = hasLocalTerminalTabs
        ? buildTerminalTaskTabs(terminalTabsState)
        : buildTerminalTaskTabs(ctx.terminalTabs);
      const terminalInput = visibleTerminalIsStreaming || visiblePendingTerminalRun || visibleTerminalPermissionPrompt
        ? null
        : TERMINAL_RUN_INPUT;
      return cloneElement(panel, {
        key: hasLocalTerminalTabs
          ? `terminal-view-${resolvedLocalTerminalTabId ?? 'default'}-${visibleTerminalViewKey}`
          : `terminal-view-${terminalViewKey}`,
        tabs: terminalTabs,
        activeTab: hasLocalTerminalTabs ? activeLocalTerminalTabIndex : ctx.activeTerminalTab,
        onTabChange: hasLocalTerminalTabs ? handleTerminalTabChange : ctx.setActiveTerminalTab,
        onTabAdd: hasLocalTerminalTabs ? handleTerminalTabAdd : ctx.handleTerminalTabAdd,
        onTabClose: hasLocalTerminalTabs ? handleTerminalTabClose : ctx.handleTerminalTabClose,
        blocks: visibleTerminalBlocks,
        input: terminalInput,
        className: [
          visibleTerminalIsStreaming ? 'terminal-window-streaming' : '',
          visibleTerminalPermissionPrompt ? 'terminal-window-awaiting-permission' : '',
        ].filter(Boolean).join(' ') || undefined,
      });
    }
    if (id === 'problems') {
      const isAgentTaskProblemsTab =
        currentProblemsTab?.id?.startsWith('agent-task-') || currentProblemsTab?.label?.endsWith('.md');
      const baseProblemsTreeData = buildProblemsTreeForTab(
        currentProblemsTab,
        isAgentTaskProblemsTab
          ? agentTaskInspectionSummary.issues
          : null,
        isAgentTaskProblemsTab
          ? agentTaskCommentEntries
          : []
      );
      const visitConflictIssue = isAgentTaskProblemsTab
        ? agentTaskInspectionSummary.issues.find((issue) => issue?.label === VISIT_BOOKING_CONFLICT_PROBLEM_TITLE)
        : null;
      const visitConflictComments = isAgentTaskProblemsTab
        ? getCommentsForCommentTarget(agentTaskCommentEntries, VISIT_BOOKING_CONFLICT_PROBLEM_TARGET)
        : [];
      const shouldUseVisitBookingProblemsView =
        isAgentTaskProblemsTab && (Boolean(visitConflictIssue) || visitConflictComments.length > 0);
      const visitConflictRawIndex = Number.isInteger(visitConflictIssue?.rawIndex)
        ? visitConflictIssue.rawIndex
        : getDocumentCheckRawIndex(activeAgentTaskDocumentSections, 'ac', VISIT_BOOKING_CONFLICT_PROBLEM_TARGET.index);
      const visitConflictCommentText = visitConflictComments[0] ?? null;
      const visitConflictChildren = shouldUseVisitBookingProblemsView
        ? (
          visitConflictCommentText
            ? [{
                id: Number.isInteger(visitConflictRawIndex)
                  ? `problem-line-${visitConflictRawIndex}-visit-conflict-comment`
                  : 'visit-conflict-comment',
                label: (
                  <VisitBookingProblemCommentLabel
                    comment={visitConflictCommentText}
                    isFading={isVisitBookingProblemCommentFading}
                  />
                ),
                icon: null,
                secondaryText: '',
              }]
              : VISIT_BOOKING_CONFLICT_PROBLEM_OPTIONS.map((option, optionIndex) => ({
                id: `visit-conflict-option-${optionIndex}`,
                label: (
                  <VisitBookingProblemOptionLabel
                    option={option}
                    optionIndex={optionIndex}
                    onSelect={(selectedOption) => {
                      handleDoneIssueFix({
                        ...VISIT_BOOKING_CONFLICT_PROBLEM_TARGET,
                        replacementText: selectedOption.replacementText,
                        commentText: selectedOption.label,
                      });
                    }}
                  />
                ),
                icon: null,
                secondaryText: '',
              }))
        )
        : [];
      const problemsTreeData = shouldUseVisitBookingProblemsView
        ? [
            {
              id: Number.isInteger(visitConflictRawIndex)
                ? `problem-line-${visitConflictRawIndex}-visit-conflict-diagnostic`
                : 'visit-conflict-diagnostic',
              label: (
                <VisitBookingProblemDiagnosticLabel
                  rawIndex={visitConflictRawIndex}
                  onExpand={(rawIndex) => {
                    setVisitBookingProblemExpanded(true);
                    requestProblemHighlight(rawIndex);
                  }}
                />
              ),
              icon: <ProblemsWarningNodeIcon />,
              secondaryText: '',
              isExpanded: Boolean(visitConflictCommentText) || visitBookingProblemExpanded,
              children: visitConflictChildren,
            },
          ]
        : baseProblemsTreeData;
      const visibleProblemsCount = shouldUseVisitBookingProblemsView
        ? 1
        : problemsTreeData.reduce(
        (count, node) => count + (Array.isArray(node?.children) ? node.children.length : 0),
        0
      );
      const hasVisibleProblems = visibleProblemsCount > 0;
      const shouldShowEmptyProblemsState = !hasVisibleProblems;
      const emptyProblemsFileLabel = problemsTreeData[0]?.label ?? currentProblemsTab?.label ?? 'current file';
      const problemsTabs = [
        {
          label: 'File',
          ...(visibleProblemsCount > 0 ? { count: visibleProblemsCount } : {}),
        },
        { label: 'Project Errors' },
        { label: 'Vulnerable Dependencies' },
        { label: 'Qodana' },
      ];
      const patchedPanel = cloneElement(panel, {
        key: shouldUseVisitBookingProblemsView
          ? `visit-booking-problems-${visitConflictCommentText ?? 'options'}-${visitBookingProblemExpanded ? 'expanded' : 'collapsed'}`
          : panel.key,
        tabs: problemsTabs,
        treeData: shouldShowEmptyProblemsState ? [] : problemsTreeData,
        empty: shouldShowEmptyProblemsState,
        emptyText: `No problems in ${emptyProblemsFileLabel}`,
        className: [
          panel.props.className,
          shouldShowEmptyProblemsState ? 'problems-window-empty-state' : '',
          shouldUseVisitBookingProblemsView ? 'visit-booking-problems-window' : '',
        ].filter(Boolean).join(' ') || undefined,
        onNodeSelect: handleProblemsNodeSelect,
        toolbarButtons: [
          { icon: 'general/show', tooltip: 'Preview' },
          {
            icon: 'codeInsight/intentionBulb',
            tooltip: 'Show Quick-Fixes',
            onClick: shouldShowEmptyProblemsState
              ? undefined
              : (e) => {
                const btn = e?.currentTarget ?? e?.target ?? document.querySelector('button[title="Show Quick-Fixes"]');
                handleProblemsQuickFixesClick(btn);
              },
          },
          { icon: PROBLEMS_REFERENCE_VIEW_OPTIONS_ICON, tooltip: 'View Options' },
        ],
      });
      // Wrap in a capture-phase click interceptor to catch Quick-Fixes button click
      // and to transfer keyboard focus into the panel on any click.
      return createElement('div', {
        style: { display: 'contents' },
        onClickCapture: (e) => {
          const btn = e.target.closest('button[title="Show Quick-Fixes"]');
          if (btn) {
            e.stopPropagation();
            handleProblemsQuickFixesClick(btn);
          }
          // Move focus into the problems panel so ArrowUp/ArrowDown work immediately.
          // Use requestAnimationFrame so the UI kit can finish its own click handling first.
          requestAnimationFrame(() => {
            const panelEl = document.querySelector('.problems-window');
            if (!panelEl) return;
            if (panelEl.contains(document.activeElement)) return;
            // Try the selected node first, then any tree node, then the panel itself.
            const target =
              panelEl.querySelector('.tree-node-selected') ??
              panelEl.querySelector('.tree-node-children .tree-node') ??
              panelEl;
            if (target.tabIndex === -1 || target.tabIndex >= 0) {
              target.focus({ preventScroll: true });
            } else {
              target.tabIndex = -1;
              target.focus({ preventScroll: true });
            }
          });
        },
      }, patchedPanel);
    }
    return panel;
  }

  // These useMemo hooks must be declared before any early return to satisfy
  // the Rules of Hooks (hook call order must be identical across renders).
  const activePlanDiffSourceTabIdForMemo = (() => {
    if (screen === 'welcome') return null;
    const tabId = (activeEditorTabMeta?.id ?? null);
    const tabContent = activeEditorTabContentEntry;
    const isDiff = Boolean(tabContent?.diffData);
    return isDiff ? (tabContent?.diffSourceTabId ?? (activeSourceEditorTabId)) : null;
  })();
  const activePlanDiffSourceViewState = useMemo(
    () => (
      activePlanDiffSourceTabIdForMemo
        ? getCommentDrivenViewStateForTaskTab(activePlanDiffSourceTabIdForMemo)
        : null
    ),
    [activePlanDiffSourceTabIdForMemo, getCommentDrivenViewStateForTaskTab],
  );
  const activePlanDiffDataForMemo = (() => {
    if (screen === 'welcome') return null;
    const tabContent = activeEditorTabContentEntry;
    const isDiff = Boolean(tabContent?.diffData);
    return isDiff ? (tabContent?.diffData ?? null) : null;
  })();
  const activePlanDiffTargetForMemo = (() => {
    if (screen === 'welcome') return null;
    const tabContent = activeEditorTabContentEntry;
    const isDiff = Boolean(tabContent?.diffData);
    return isDiff ? normalizeCommentTarget(tabContent?.diffTarget) : null;
  })();
  const activePlanDiffViewerData = useMemo(
    () => buildPlanDiffViewerData({
      documentSections: activePlanDiffSourceViewState?.documentSections ?? [],
      planRunResult: activePlanDiffSourceViewState?.planRunResult ?? null,
      removedIssueIndices: activePlanDiffSourceViewState?.removedIssueIndices ?? null,
      diffData: activePlanDiffDataForMemo,
      diffTarget: activePlanDiffTargetForMemo,
    }),
    [activePlanDiffDataForMemo, activePlanDiffSourceViewState, activePlanDiffTargetForMemo],
  );
  const activeTabId = activeEditorTabMeta?.id ?? null;
  const activeTabContent = activeEditorTabContentEntry;
  const isAgentTaskTab = activeTabId?.startsWith('agent-task-');
  const isAutonomousWorkflowTab = activeTabId === AUTONOMOUS_WORKFLOW_TAB.id;
  const isDiffTab = Boolean(activeTabContent?.diffData);
  const activeAgentTaskCode = activeAgentTaskViewState?.code ?? activeTabContent?.code ?? '';
  const currentPersistedSpecCode = visibleEditorStateTabId
    ? ((doneEnhanceFlowRef.current && visibleEditorStateTabId === generationTabId)
        ? (doneEnhanceFlowRef.current.initialCode ?? '')
        : (ideTabContents[visibleEditorStateTabId]?.code ?? ''))
    : '';
  const activeVersionHistory = visibleEditorStateTabId
    ? syncSpecVersionHistoryCurrentCode(
        specVersionsByTab[visibleEditorStateTabId] ?? null,
        currentPersistedSpecCode,
      )
    : null;
  const activeEditorAcWarningBanner = isAgentTaskTab && activeSourceEditorTabId
    ? (terminalSessions[buildTerminalSessionTabId(activeSourceEditorTabId)]?.acWarningBanner ?? null)
    : null;
  const activeDoneOverlayUiState = visibleEditorStateTabId
    ? (doneOverlayUiStates[visibleEditorStateTabId] ?? null)
    : null;
  const activePlanDiffData = isDiffTab ? (activeTabContent?.diffData ?? null) : null;
  const activePlanDiffTarget = isDiffTab
    ? normalizeCommentTarget(activeTabContent?.diffTarget)
    : null;
  const activePlanDiffSourceTabId = isDiffTab
    ? (activeTabContent?.diffSourceTabId ?? activeSourceEditorTabId)
    : null;
  const activePlanDiffComments =
    isDiffTab && activePlanDiffData
      ? normalizeStoredDiffCommentsState(activeTabContent?.initialDiffComments)
      : {};
  const activePlanDiffUiState = activeTabId ? (planDiffUiStates[activeTabId] ?? null) : null;
  const activePlanDiffLineText = isDiffTab ? (activeTabContent?.diffLineText ?? '') : '';
  const handleDoneVersionSelect = (version) => {
    if (!visibleEditorStateTabId || !version || !activeVersionHistory?.versions?.length) {
      return;
    }

    const currentVersion = activeVersionHistory.versions[activeVersionHistory.versions.length - 1] ?? null;
    if (!currentVersion || version.id === currentVersion.id) {
      return;
    }

    openSpecVersionDiffTab({
      sourceTabId: visibleEditorStateTabId,
      fromVersion: version,
      toVersion: currentVersion,
    });
  };
  const handleActivePlanDiffCommentsChange = useCallback((comments) => {
    if (activeTabId) {
      setIdeTabContents((prev) => {
        const existing = prev[activeTabId];
        if (!existing) return prev;
        return { ...prev, [activeTabId]: { ...existing, initialDiffComments: comments } };
      });
    }

    if (!activePlanDiffTarget || !activePlanDiffSourceTabId) return;

    syncDiffCommentsToTaskTarget({
      sourceTabId: activePlanDiffSourceTabId,
      target: activePlanDiffTarget,
      comments,
      sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
      line: activePlanDiffLineText,
    });
  }, [
    activeTabId,
    activePlanDiffLineText,
    activePlanDiffSourceTabId,
    activePlanDiffTarget,
    syncDiffCommentsToTaskTarget,
  ]);
  const handleActivePlanDiffUiStateChange = useCallback((uiState) => {
    updatePlanDiffUiStateForTab(uiState, activeTabId);
  }, [activeTabId, updatePlanDiffUiStateForTab]);
  const navigateActivePlanDiffAgentTask = useCallback((direction) => {
    if (!activePlanDiffSourceTabId) return;

    const sourceTab = ideTabs.find((tab) => tab.id === activePlanDiffSourceTabId) ?? null;
    const taskId = getAgentTaskIdForEditorTab(sourceTab, agentTasks)
      ?? (activePlanDiffSourceTabId.startsWith('agent-task-') ? activePlanDiffSourceTabId.slice('agent-task-'.length) : null);
    const taskTree = taskId ? agentTaskPlanTreesByTaskId?.[taskId] : null;
    const navigationEntries = Object.entries(taskTree?.navigationByNodeId ?? {})
      .filter(([, entry]) => entry?.type === 'file')
      .map(([nodeId, entry]) => ({ nodeId, entry }));

    if (navigationEntries.length === 0) return;

    const activeTarget = normalizeCommentTarget(activePlanDiffTarget);
    const activeRowId = activePlanDiffUiState?.activeRowId ?? activePlanDiffData?.focusRowId ?? null;
    const currentIndex = navigationEntries.findIndex(({ entry }) => {
      const entryTarget = normalizeCommentTarget(entry?.issueTarget);
      if (!entryTarget || !activeTarget || entryTarget.kind !== activeTarget.kind || entryTarget.index !== activeTarget.index) {
        return false;
      }

      return !activeRowId || entry.activeRowId === activeRowId;
    });
    const fallbackIndex = navigationEntries.findIndex(({ entry }) => {
      const entryTarget = normalizeCommentTarget(entry?.issueTarget);
      return Boolean(entryTarget && activeTarget && entryTarget.kind === activeTarget.kind && entryTarget.index === activeTarget.index);
    });
    const resolvedCurrentIndex = currentIndex >= 0 ? currentIndex : fallbackIndex;
    const baseIndex = resolvedCurrentIndex >= 0 ? resolvedCurrentIndex : (direction > 0 ? -1 : navigationEntries.length);
    const nextIndex = Math.min(Math.max(baseIndex + direction, 0), navigationEntries.length - 1);
    const nextNavigation = navigationEntries[nextIndex];
    if (!nextNavigation || nextIndex === resolvedCurrentIndex) return;

    setAgentTasksFocusedNodeId(nextNavigation.nodeId);
    handleAgentTaskPlanTreeNodeSelect(taskId, nextNavigation.nodeId);
  }, [
    activePlanDiffData?.focusRowId,
    activePlanDiffSourceTabId,
    activePlanDiffTarget,
    activePlanDiffUiState?.activeRowId,
    agentTaskPlanTreesByTaskId,
    agentTasks,
    handleAgentTaskPlanTreeNodeSelect,
    ideTabs,
  ]);
  const handleActivePlanMarkerClick = useCallback(() => {
    if (!activePlanDiffSourceTabId) return;

    const sourceTabIndex = ideTabs.findIndex((tab) => tab.id === activePlanDiffSourceTabId);
    const sourceTab = sourceTabIndex >= 0
      ? ideTabs[sourceTabIndex]
      : { id: activePlanDiffSourceTabId, label: '' };
    const taskId = getAgentTaskIdForEditorTab(sourceTab, agentTasks)
      ?? (activePlanDiffSourceTabId.startsWith('agent-task-') ? activePlanDiffSourceTabId.slice('agent-task-'.length) : null);

    setScreen('ide');

    if (sourceTabIndex >= 0) {
      setActiveEditorTab(sourceTabIndex);
      restoreSpecDoneScrollForTab(activePlanDiffSourceTabId);
    }

    if (taskId) {
      setSelectedTask(taskId);

      setAgentTasksFocusedNodeId(buildAgentTaskTreeTaskNodeId(taskId));
    }
  }, [activePlanDiffSourceTabId, activePlanDiffTarget, agentTasks, ideTabs, restoreSpecDoneScrollForTab]);
  const handlePlanWorkflowSelect = useCallback((workflow) => {
    if (!activeSourceEditorTabId) return;

    setGeneratedDocument((prevDocument) => {
      const nextDocument = setPlanWorkflowMeta(prevDocument, workflow);
      const nextCode = serializeSpecDocument(nextDocument);

      setIdeTabContents((prev) => ({
        ...prev,
        [activeSourceEditorTabId]: {
          ...(prev[activeSourceEditorTabId] ?? {}),
          language: 'markdown',
          code: nextCode,
        },
      }));

      setInteractiveTaskStates((prev) => ({
        ...prev,
        [activeSourceEditorTabId]: {
          ...(prev[activeSourceEditorTabId] ?? {}),
          documentSections: nextDocument,
        },
      }));

      return nextDocument;
    });
  }, [activeSourceEditorTabId]);
  const handlePlanWorkflowOpen = useCallback((file) => {
    if ((file?.label ?? '') !== 'Autonomous') return;

    setIdeTabContents((prev) => ({
      ...prev,
      [AUTONOMOUS_WORKFLOW_TAB.id]: {
        language: 'markdown',
        code: AUTONOMOUS_WORKFLOW_CONTENT,
      },
    }));

    setIdeTabs((prev) => {
      const existingIndex = prev.findIndex((tab) => tab.id === AUTONOMOUS_WORKFLOW_TAB.id);
      if (existingIndex >= 0) {
        setActiveEditorTab(existingIndex);
        return prev;
      }

      setActiveEditorTab(prev.length);
      return [...prev, AUTONOMOUS_WORKFLOW_TAB];
    });
  }, []);
  const handlePlanWorkflowRemove = useCallback(() => {
    handlePlanWorkflowSelect(null);
  }, [handlePlanWorkflowSelect]);
  const getEditorTabRunningTone = useCallback((tab) => {
    if (!tab?.id?.startsWith('agent-task-')) return null;

    const taskState = getTaskRuntimeState(tab.id)?.taskState ?? null;
    const taskRunState = runStatesByTab[tab.id] ?? 'default';

    if (taskRunState === 'running' || taskState?.genState === 'loading' || taskState?.genState === 'generating') {
      return 'green';
    }

    return null;
  }, [getTaskRuntimeState, runStatesByTab]);
  const renderedIdeTabs = useMemo(() => (
    ideTabs.map((tab) => {
      const shouldUseDiffIcon =
        Boolean(ideTabContents[tab.id]?.diffData) ||
        tab.id?.startsWith('plan-diff-') ||
        tab.id?.startsWith('spec-version-diff-');
      const runningTone = getEditorTabRunningTone(tab);

      if (runningTone) {
        const baseIcon = shouldUseDiffIcon ? DIFF_TAB_ICON_NAME : tab.icon;
        return {
          ...tab,
          icon: <EditorTabRunningIcon icon={baseIcon} tone={runningTone} />,
        };
      }

      if (shouldUseDiffIcon && tab.icon !== DIFF_TAB_ICON_NAME) {
        return { ...tab, icon: DIFF_TAB_ICON_NAME };
      }

      return tab;
    })
  ), [getEditorTabRunningTone, ideTabContents, ideTabs]);
  const activeStatusBarTab = activeEditorTabMeta ?? ideTabs[activeEditorTab ?? 0] ?? null;
  const activeRenderedStatusBarTab = activeStatusBarTab
    ? (renderedIdeTabs.find((tab) => tab.id === activeStatusBarTab.id) ?? activeStatusBarTab)
    : null;
  const activeStatusBarSourceTab = activeSourceEditorTabId
    ? (ideTabs.find((tab) => tab.id === activeSourceEditorTabId) ?? null)
    : null;
  const activeStatusBarTaskTab = (() => {
    if (activeStatusBarSourceTab?.id?.startsWith('agent-task-') || activeStatusBarSourceTab?.label?.endsWith('.md')) {
      return activeStatusBarSourceTab;
    }
    if (activeStatusBarTab?.id?.startsWith('agent-task-') || activeStatusBarTab?.label?.endsWith('.md')) {
      return activeStatusBarTab;
    }
    const taskId = getAgentTaskIdForEditorTab(activeStatusBarTab, agentTasks) ?? selectedTask;
    const taskTabId = taskId ? getAgentTaskTabId(taskId) : null;
    return taskTabId ? (ideTabs.find((tab) => tab.id === taskTabId) ?? null) : null;
  })();
  const activeRenderedStatusBarTaskTab = activeStatusBarTaskTab
    ? (renderedIdeTabs.find((tab) => tab.id === activeStatusBarTaskTab.id) ?? activeStatusBarTaskTab)
    : null;
  const activeStatusBarProjectFileName = (() => {
    if (isDiffTab && typeof activePlanDiffData?.sourceTabLabel === 'string' && activePlanDiffData.sourceTabLabel.trim().length > 0) {
      return activePlanDiffData.sourceTabLabel.trim();
    }
    if (activeStatusBarTab?.id?.startsWith('agent-task-') || activeStatusBarTab?.label?.endsWith('.md')) {
      return null;
    }
    if (activeStatusBarTab && !activeStatusBarTab.id?.startsWith('agent-task-') && !activeStatusBarTab.label?.endsWith('.md')) {
      return activeStatusBarTab.label ?? null;
    }
    return findFirstProjectFileFromRunStatuses(activeAgentTaskAcRunResult, activeAgentTaskPlanRunResult);
  })();
  const ideStatusBarBreadcrumbs = [
    ...(activeStatusBarTaskTab
      ? [{
          icon: false,
          label: (
            <StatusBarActiveFileLabel
              icon={activeRenderedStatusBarTaskTab?.icon ?? 'fileTypes/markdown'}
              label={activeStatusBarTaskTab.label ?? TERMINAL_TASK_TAB_BASE_LABEL}
            />
          ),
        }]
      : []),
    ...(activeStatusBarProjectFileName
      ? [{
          icon: false,
          label: (
            <StatusBarActiveFileLabel
              icon={resolveAgentTaskPlanFileIcon(activeStatusBarProjectFileName)}
              label={activeStatusBarProjectFileName}
            />
          ),
        }]
      : (!activeStatusBarTaskTab && activeStatusBarTab
          ? [{
              icon: false,
              label: (
                <StatusBarActiveFileLabel
                  icon={activeRenderedStatusBarTab?.icon ?? 'fileTypes/text'}
                  label={activeStatusBarTab.label ?? PRIMARY_BREADCRUMBS[2]}
                />
              ),
            }]
          : [])),
  ];

  if (screen === 'welcome') {
    return (
      <ThemeProvider defaultTheme="dark">
        <MainWindow
          key="welcome"
          width={1100}
          height={800}
          projectName={PROJECT_NAME}
          projectIcon="SD"
          projectColor="blue"
          branchName={BRANCH_NAME}
          toolbar={(
            <MainToolbar
              projectName={PROJECT_NAME}
              projectIcon="SD"
              projectColor="blue"
              branchName={BRANCH_NAME}
              runConfig="Current File"
            />
          )}

          editorTabs={[{ id: 'welcome', label: 'Welcome Screen', icon: (() => { const C = getIcon('ij-platform-logo'); return C ? <C width={16} height={16} /> : null; })(), closable: true }]}
          editorTopBar={<WelcomeGradientArea onNewAgentTask={openNewAgentTask} />}

          leftStripeItems={[
            ...MY_LEFT_STRIPE,
            { id: '_sep',        separator: true,                                                   section: 'top'    },
            { id: 'agent-tasks', icon: AGENT_TASKS_ICON, tooltip: 'Agent Tasks',            section: 'top'    },
            { id: 'git',         icon: 'toolwindows/vcs@20x20',      tooltip: 'Git',      panel: 'bottom', section: 'bottom' },
            { id: 'problems',    icon: 'toolwindows/problems@20x20', tooltip: 'Problems', panel: 'bottom', section: 'bottom' },
          ]}
          rightStripeItems={DEFAULT_RIGHT_STRIPE_ITEMS}
          defaultOpenToolWindows={['project']}

          leftPanelContent={(id, ctx) => {
            if (id === 'project') return (
              <WelcomeProjectsPanel
                onNewProject={() => setScreen('ide')}
                onProjectSelect={() => setScreen('ide')}
                onNewAgentTask={openNewAgentTask}
                ctx={ctx}
              />
            );
            if (id === 'agent-tasks') return <AgentTasksPanel ctx={ctx} tasks={agentTaskPanelTasks} selected={activeAgentTaskPanelSelectionId} onAdd={openNewAgentTask} onTaskSelect={handleAgentTaskSelect} dismissedSuccessTaskIds={dismissedAgentTaskSuccessIds} onDismissSuccess={(taskId) => setDismissedAgentTaskSuccessIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))} planTreesByTaskId={agentTaskPlanTreesByTaskId} onPlanTreeNodeSelect={handleAgentTaskPlanTreeNodeSelect} focusedNodeId={agentTasksFocusedNodeId} />;
            return defaultLeftPanelContent(id, ctx);
          }}
          rightPanelContent={(id, ctx) => defaultRightPanelContent(id, ctx)}
          bottomPanelContent={(id, ctx) => renderBottomPanelContent(id, ctx)}

          statusBarProps={{
            breadcrumbs: [
              { label: PRIMARY_BREADCRUMBS[0], module: true },
              { label: PRIMARY_BREADCRUMBS[1] },
              { label: PRIMARY_BREADCRUMBS[2], icon: true, iconName: 'fileTypes/java' },
            ],
            widgets: [
              { type: 'text', text: '42:1' },
              { type: 'text', text: 'UTF-8' },
              { type: 'text', text: 'LF' },
            ],
          }}
        />
        {editorTabsMorePortal}
        {terminalPermissionPortal}
      </ThemeProvider>
    );
  }
  const handlePlanDiffRowDelete = (rowId, comment) => {
    if (!activeTabId || !isDiffTab) return;

    const deletedRow = activePlanDiffData?.rows?.find((row) => row.id === rowId);
    const deletedLineText = deletedRow?.text ?? '';

    setIdeTabContents((prev) => {
      const tabContent = prev[activeTabId];
      if (!tabContent?.diffData?.rows) return prev;
      const nextRows = tabContent.diffData.rows.filter((row) => row.id !== rowId);
      return {
        ...prev,
        [activeTabId]: {
          ...tabContent,
          diffData: {
            ...tabContent.diffData,
            rows: nextRows,
          },
        },
      };
    });

    if (activePlanDiffTarget && activePlanDiffSourceTabId) {
      syncDiffCommentsToTaskTarget({
        sourceTabId: activePlanDiffSourceTabId,
        target: activePlanDiffTarget,
        comments: { [rowId]: [comment || 'delete'] },
        sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
        line: deletedLineText,
      });
    }
  };
  const handlePlanDiffRowFix = (rowId, comment) => {
    if (!activePlanDiffTarget) return;

    const fixedRow = activePlanDiffData?.rows?.find((row) => row.id === rowId);
    const fixedLineText = fixedRow?.text ?? '';

    if (activePlanDiffSourceTabId) {
      syncDiffCommentsToTaskTarget({
        sourceTabId: activePlanDiffSourceTabId,
        target: activePlanDiffTarget,
        comments: { [rowId]: [comment || 'fix'] },
        sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
        line: fixedLineText,
      });
    }

    handleDoneIssueFix({
      kind: activePlanDiffTarget.kind,
      index: activePlanDiffTarget.index,
    });
  };
  const projectTreeData = [{
    ...MY_PROJECT_TREE[0],
    children: [
      ...MY_PROJECT_TREE[0].children,
      {
        id: 'specs',
        label: 'Agent Specifications',
        icon: 'nodes/folder',
        isExpanded: true,
        children: [
          {
            id: 'spec-configuration',
            label: 'Configuration.md',
            icon: 'fileTypes/markdown',
          },
          ...agentTasks.map(task => ({
            id: `spec-${task.id}`,
            label: task.label,
            icon: 'fileTypes/markdown',
          })),
        ],
      },
    ],
  }];
  return (
    <ThemeProvider defaultTheme="dark">
      <MainWindow
        key={`ide-${ideOpenWindows.join('-')}`}
        height={800}
        projectName={PROJECT_NAME}
        projectIcon="SD"
        projectColor="blue"
        branchName={BRANCH_NAME}
        toolbar={(
          <MainToolbar
            projectName={PROJECT_NAME}
            projectIcon="SD"
            projectColor="blue"
            branchName={BRANCH_NAME}
            runConfig="Current File"
            onSettings={() => setScreen('settings')}
          />
        )}

        editorTabs={renderedIdeTabs}
        editorTabContents={ideTabContents}
        activeEditorTab={activeEditorTab}
        onEditorTabChange={handleEditorTabChange}
        onEditorTabClose={handleEditorTabClose}
        onEditorCodeChange={(code) => {
          const tabId = ideTabs[activeEditorTab]?.id;
          if (!tabId?.startsWith('agent-task-') && tabId !== AUTONOMOUS_WORKFLOW_TAB.id) return;
          setIdeTabContents((prev) => ({
            ...prev,
            [tabId]: {
              ...(prev[tabId] ?? {}),
              language: 'markdown',
              code,
            },
          }));
        }}
        editorTopBar={
          isAgentTaskTab
            ? <AgentTaskEditorArea genState={genState} genProgress={genProgress} onSend={startAgentTaskGeneration} onStop={() => setGenState('idle')} onRegenerate={startAgentTaskGeneration} onDoneRegenerate={handleDoneRegenerate} onFixIssue={handleDoneIssueFix} onOpenDiffTab={openPlanDiffTab} onOpenVersionDiff={handleDoneVersionSelect} attachedFiles={attachedFiles} onRemoveAttached={(idx) => updateAttachedFilesForTab((files) => files.filter((_, i) => i !== idx))} onAddAttached={(item) => updateAttachedFilesForTab((files) => files.some((file) => file.label === item.label) ? files : [...files, { label: item.label, description: item.description }])} currentCode={activeAgentTaskCode} documentSections={activeAgentTaskDocumentSections} onOpenProblems={openAndFocusIdeProblemsToolWindow} onOpenTerminal={handleDoneOpenTerminal} addPopupFiles={addPopupFiles} acRunResult={activeAgentTaskAcRunResult} planRunResult={activeAgentTaskPlanRunResult} acWarningBanner={activeEditorAcWarningBanner} inspectionSummary={agentTaskInspectionSummary} versionHistory={activeVersionHistory} removedIssueIndices={activeAgentTaskRemovedIssueIndices} highlightedProblemLocation={highlightedProblemLocation?.tabId === activeEditorTabId ? highlightedProblemLocation : null} updatedRowTarget={updatedSpecRowTarget} doneCommentEntries={agentTaskCommentEntries} onDoneCommentsChange={handleDoneCommentsChange} commentResetToken={doneCommentResetToken} preserveDoneOverlayDuringBusy={Boolean(doneEnhanceFlowRef.current) && (genState === 'loading' || genState === 'generating')} runState={runState} activeRunRequest={runState === 'running' ? (visiblePendingTerminalRun ?? lastTerminalRunRequestRef.current ?? null) : null} doneOverlayUiState={activeDoneOverlayUiState} onDoneOverlayUiStateChange={handleActiveDoneOverlayUiStateChange} specSessionKey={activeEditorTabId} specTabLabel={activeEditorTabMeta?.label ?? ''} pendingAcQuickFixCount={pendingAcQuickFixCount} onPlanWorkflowSelect={handlePlanWorkflowSelect} onPlanWorkflowOpen={handlePlanWorkflowOpen} onPlanWorkflowRemove={handlePlanWorkflowRemove} />
            : (isAutonomousWorkflowTab
                ? <AutonomousMarkdownEditor />
                : (isDiffTab && activePlanDiffData
                ? (
                  <PlanDiffEditorArea
                    diffData={activePlanDiffData}
                    viewerData={activePlanDiffViewerData}
                    initialDiffComments={activePlanDiffComments}
                    onDiffCommentsChange={handleActivePlanDiffCommentsChange}
                    onRowDelete={handlePlanDiffRowDelete}
                    onRowFix={handlePlanDiffRowFix}
                    onPlanMarkerClick={handleActivePlanMarkerClick}
                    onNavigatePrevious={() => navigateActivePlanDiffAgentTask(-1)}
                    onNavigateNext={() => navigateActivePlanDiffAgentTask(1)}
                    uiState={activePlanDiffUiState}
                    onUiStateChange={handleActivePlanDiffUiStateChange}
                  />
                )
                : undefined))
        }

        projectTreeData={projectTreeData}

        leftStripeItems={[
          ...DECORATIVE_LEFT_STRIPE_ITEMS,
          { id: '_sep',        separator: true,                                                    section: 'top' },
          { id: 'agent-tasks', icon: AGENT_TASKS_ICON, tooltip: 'Agent Tasks', section: 'top' },
          { id: 'git',         icon: 'toolwindows/vcs@20x20',       tooltip: 'Git',        section: 'bottom' },
          { id: 'problems',    icon: 'toolwindows/problems@20x20',  tooltip: 'Problems',   section: 'bottom' },
        ]}
        rightStripeItems={DECORATIVE_RIGHT_STRIPE_ITEMS}
        defaultOpenToolWindows={ideOpenWindows}

        leftPanelContent={(id, ctx) => {
          if (id === 'agent-tasks') return <AgentTasksPanel ctx={ctx} tasks={agentTaskPanelTasks} selected={activeAgentTaskPanelSelectionId} onAdd={openNewAgentTask} onTaskSelect={handleAgentTaskSelect} dismissedSuccessTaskIds={dismissedAgentTaskSuccessIds} onDismissSuccess={(taskId) => setDismissedAgentTaskSuccessIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))} planTreesByTaskId={agentTaskPlanTreesByTaskId} onPlanTreeNodeSelect={handleAgentTaskPlanTreeNodeSelect} focusedNodeId={agentTasksFocusedNodeId} />;
          return defaultLeftPanelContent(id, ctx);
        }}
        rightPanelContent={(id, ctx) => defaultRightPanelContent(id, ctx)}
        bottomPanelContent={(id, ctx) => renderBottomPanelContent(id, ctx)}

        statusBarProps={{
          breadcrumbs: ideStatusBarBreadcrumbs,
          widgets: [
            { type: 'text', text: '42:1' },
            { type: 'text', text: 'UTF-8' },
            { type: 'text', text: 'LF' },
          ],
        }}

        overlays={
          screen === 'settings'
            ? (
              <SettingsDialog
                title="Settings"
                width={900}
                height={600}
                treeItems={DEFAULT_SETTINGS_TREE_ITEMS}
                buttons={[
                  { children: 'Cancel', onClick: () => setScreen('ide') },
                  { children: 'OK', type: 'primary', onClick: () => setScreen('ide') },
                ]}
                onClose={() => setScreen('ide')}
              />
            )
            : null
        }
      />
      {editorTabsMorePortal}
      {terminalPermissionPortal}
      <SpecSelectionToolbar position={idleSelectionToolbarPos} />
      {problemsFixMenu && problemsFixMenu.rect && (
        <PositionedPopup triggerRect={problemsFixMenu.rect} onDismiss={() => setProblemsFixMenu(null)} gap={4}>
          <ProblemsQuickFixesMenu
            proposals={problemsFixMenu.proposals}
            onSelect={(selectedOption) => {
              if (problemsFixMenu.issueTarget) {
                handleDoneIssueFix({
                  ...problemsFixMenu.issueTarget,
                  replacementText: selectedOption?.replacementText,
                  commentText: selectedOption?.label,
                });
              }
              setProblemsFixMenu(null);
            }}
            onClose={() => setProblemsFixMenu(null)}
          />
        </PositionedPopup>
      )}
      {editorCompletion && editorCompletion.pos && createPortal(
        <CompletionPopup
          trigger={editorCompletion.trigger}
          query={editorCompletion.query}
          selectedIdx={editorCompletion.selectedIdx}
          onSelect={(item) => {
            const textarea = document.querySelector('.main-window-editor-content .editor .pce-textarea');
            if (textarea instanceof HTMLTextAreaElement) {
              const value = textarea.value;
              const cursorPos = textarea.selectionStart;
              const textBeforeCursor = value.slice(0, cursorPos);
              const triggerIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('#'));
              const before = value.slice(0, triggerIdx + 1);
              const after = value.slice(cursorPos);
              const insertText = getCompletionInsertText(item);
              const newValue = before + insertText + ' ' + after;
              textarea.value = newValue;
              const newPos = triggerIdx + 1 + insertText.length + 1;
              textarea.setSelectionRange(newPos, newPos);
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              textarea.focus();
            }
            const attachment = getCompletionAttachment(item);
            if (attachment) {
              updateAttachedFilesForTab(files => {
                if (files.some(f => f.label === attachment.label)) return files;
                return [...files, attachment];
              });
            }
            setEditorCompletion(null);
          }}
          onClose={() => setEditorCompletion(null)}
          style={{ position: 'fixed', top: editorCompletion.pos.top, left: editorCompletion.pos.left, width: 453 }}
        />,
        document.body
      )}
    </ThemeProvider>
  );
}
