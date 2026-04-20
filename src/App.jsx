import { Fragment, cloneElement, isValidElement, useState, useRef, useEffect, useCallback, useId, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { WelcomeProjectsPanel, WelcomeGradientArea } from './WelcomeScreen.jsx';
import { DiffTabIcon, PlanDiffEditorArea } from './PlanDiffView.jsx';
import {
  ThemeProvider,
  MainWindow,
  MainToolbar,
  Banner,
  SettingsDialog,
  ToolWindow,
  PositionedPopup,
  Tooltip,
  Loader,
  Icon,
  IconButton,
  Button,
  Input,
  Checkbox,
  getIcon,
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

// ─── Data ────────────────────────────────────────────────────────────────────

const PROJECT_NAME = 'payment-service';
const BRANCH_NAME = 'feature/visit-booking';
const PRIMARY_BREADCRUMBS = [PROJECT_NAME, 'src/main/java', 'VisitController.java'];
const TOOLBAR_INPUT_IS_EDITABLE = false;
const ATTACHED_FILES_SYNC_WITH_EDITOR = false;
const AGENT_TASK_LOADING_STATE_ENABLED = true;
const AGENT_TASK_GENERATING_STATE_ENABLED = true;
const AGENT_TASK_USES_INTERMEDIATE_STATES =
  AGENT_TASK_LOADING_STATE_ENABLED || AGENT_TASK_GENERATING_STATE_ENABLED;
const AGENT_TASK_LOADING_STEP_DELAY_MS = 1200;
const AGENT_TASK_CONTENT_MORPH_MAX_FRAMES = 24;
const AGENT_TASK_CONTENT_MORPH_INLINE_MAX_FRAMES = 18;
const AGENT_TASK_CONTENT_MORPH_STEP_DELAY_MS = 36;

const MY_PROJECTS = [
  { id: '1', name: 'payment-service', path: '~/projects/payment-service', initials: 'PS', gradient: ['#22c55e', '#15803d'] },
  { id: '2', name: 'auth-module',     path: '~/projects/auth-module',     initials: 'AM', gradient: ['#8b5cf6', '#6d28d9'] },
  { id: '3', name: 'api-gateway',     path: '~/projects/api-gateway',     initials: 'AG', gradient: ['#10b981', '#059669'] },
];

const MY_EDITOR_TABS = [
  { id: '1', label: 'VisitController.java',          icon: 'fileTypes/java', closable: true },
  { id: '2', label: 'Visit.java',                    icon: 'fileTypes/java', closable: true },
  { id: '3', label: 'createOrUpdateVisitForm.html',  icon: 'fileTypes/html', closable: true },
  { id: '4', label: 'schema.sql',                    icon: 'fileTypes/text', closable: true },
];

const MY_EDITOR_TAB_CONTENTS = {
  '1': {
    language: 'java',
    code: `@Controller
class VisitController {

    private final OwnerRepository ownerRepository;
    private final VisitRepository visitRepository;
    private final VetRepository vetRepository;

    public VisitController(
            OwnerRepository ownerRepository,
            VisitRepository visitRepository,
            VetRepository vetRepository) {
        this.ownerRepository = ownerRepository;
        this.visitRepository = visitRepository;
        this.vetRepository = vetRepository;
    }

    @ModelAttribute("vets")
    public Collection<Vet> populateVets(
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM-dd") LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(pattern = "HH:mm") LocalTime time) {
        if (date == null || time == null) {
            return this.vetRepository.findAll();
        }
        return this.vetRepository.findAvailableFor(date, time);
    }

    @ModelAttribute("timeSlots")
    public List<LocalTime> populateTimeSlots() {
        List<LocalTime> slots = new ArrayList<>();
        for (int hour = 9; hour <= 16; hour++) {
            slots.add(LocalTime.of(hour, 0));
        }
        return slots;
    }

    @GetMapping("/owners/{ownerId}/pets/{petId}/visits/new")
    public String initNewVisitForm(@PathVariable int ownerId, @PathVariable int petId, Map<String, Object> model) {
        Owner owner = this.ownerRepository.findById(ownerId);
        Pet pet = owner.getPet(petId);
        Visit visit = new Visit();
        pet.addVisit(visit);
        model.put("visit", visit);
        return "pets/createOrUpdateVisitForm";
    }

    @PostMapping("/owners/{ownerId}/pets/{petId}/visits/new")
    public String processNewVisitForm(@PathVariable int ownerId,
                                      @PathVariable int petId,
                                      @Valid Visit visit,
                                      BindingResult result,
                                      Model model) {
        if (visit.getVet() != null && visit.getDate() != null && visit.getTime() != null
                && this.visitRepository.existsByVetIdAndDateAndTime(
                    visit.getVet().getId(), visit.getDate(), visit.getTime())) {
            result.rejectValue("time", "duplicate",
                "This vet is already booked for the selected date and time.");
        }

        if (result.hasErrors()) {
            model.addAttribute("vets", populateVets(visit.getDate(), visit.getTime()));
            model.addAttribute("timeSlots", populateTimeSlots());
            return "pets/createOrUpdateVisitForm";
        }

        try {
            Owner owner = this.ownerRepository.findById(ownerId);
            Pet pet = owner.getPet(petId);
            pet.addVisit(visit);
            this.visitRepository.save(visit);
        }
        catch (DataIntegrityViolationException ex) {
            result.rejectValue("time", "duplicate",
                "Concurrent booking detected. Please choose another slot.");
            model.addAttribute("vets", populateVets(visit.getDate(), visit.getTime()));
            model.addAttribute("timeSlots", populateTimeSlots());
            return "pets/createOrUpdateVisitForm";
        }
        return "redirect:/owners/{ownerId}";
    }
}`,
  },
  '2': {
    language: 'java',
    code: `@Entity
@Table(name = "visits")
public class Visit extends BaseEntity {

    @Column(name = "visit_date")
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    @NotNull
    private LocalDate date;

    @Column(name = "visit_time")
    @NotNull
    private LocalTime time;

    @Column(name = "description")
    private String description;

    @ManyToOne
    @JoinColumn(name = "vet_id")
    @NotNull
    private Vet vet;

    @ManyToOne
    @JoinColumn(name = "pet_id")
    private Pet pet;

    public LocalDate getDate() { return this.date; }
    public void setDate(LocalDate date) { this.date = date; }

    public LocalTime getTime() { return this.time; }
    public void setTime(LocalTime time) { this.time = time; }

    public String getDescription() { return this.description; }
    public void setDescription(String description) { this.description = description; }

    public Vet getVet() { return this.vet; }
    public void setVet(Vet vet) { this.vet = vet; }

    public Pet getPet() { return this.pet; }
    public void setPet(Pet pet) { this.pet = pet; }
}`,
  },
  '3': {
    language: 'html',
    code: `<html xmlns:th="https://www.thymeleaf.org">
<body>
  <h2>New Visit</h2>
  <form th:object="\${visit}"
        th:action="@{/owners/{ownerId}/pets/{petId}/visits/new(ownerId=\${owner.id},petId=\${pet.id})}"
        method="post">

    <div>
      <label>Date</label>
      <input type="date" th:field="*{date}" />
    </div>

    <div>
      <label>Vet</label>
      <select th:field="*{vet}">
        <option value="">-- select vet --</option>
        <option th:each="vet : \${vets}"
                th:value="\${vet}"
                th:text="\${vet.firstName + ' ' + vet.lastName}"></option>
      </select>
    </div>

    <div>
      <label>Time</label>
      <select th:field="*{time}">
        <option value="">-- select time --</option>
        <option th:each="slot : \${timeSlots}"
                th:value="\${slot}"
                th:text="\${#temporals.format(slot, 'HH:mm')}"></option>
      </select>
    </div>

    <div>
      <label>Description</label>
      <textarea th:field="*{description}" rows="3"></textarea>
    </div>

    <button type="submit">Add Visit</button>
  </form>
</body>
</html>`,
  },
  '4': {
    language: 'sql',
    code: `DROP TABLE IF EXISTS visits;
DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS types;
DROP TABLE IF EXISTS vets;
DROP TABLE IF EXISTS owners;

CREATE TABLE vets (
    id          INTEGER IDENTITY PRIMARY KEY,
    first_name  VARCHAR(30),
    last_name   VARCHAR(30)
);

CREATE TABLE visits (
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
};

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

const PROJECT_ROOT_PATH = '~/projects/payment-service';
const AGENT_SPECS_PATH = `${PROJECT_ROOT_PATH}/Agent Specifications`;
const PROBLEMS_SECONDARY_GAP = '\u00A0\u00A0\u00A0';
const TERMINAL_RUN_INPUT = { path: AGENT_SPECS_PATH, branch: BRANCH_NAME };
const TERMINAL_RUN_VISIBLE_DELAY_MS = 110;
const TERMINAL_RUN_INITIAL_DELAY_MS = 160;
const TERMINAL_RUN_STEP_DELAY_MS = 240;
const TERMINAL_RUN_END_DELAY_MS = 260;
const RUN_STATUS_REVEAL_STEP_DELAY_MS = 120;
const CHAINED_SECTION_START_DELAY_MS = 220;
const TERMINAL_PERMISSION_PROMPT = 'Allow agent execution?';
const TERMINAL_PERMISSION_OPTIONS = [
  { id: 'allow-once', label: 'Allow once' },
  { id: 'allow-session', label: 'Allow for session' },
  { id: 'reject', label: 'Reject' },
];
const AC_WARNING_TARGET_ORIGINAL_INDEX = 0;
const AC_WARNING_PROMPT = 'AC #1 partially met. Pre-filtering works on POST re-renders (booked vets excluded via findByDateAndTime). But on initial page load, no date/time is selected — @RequestParam values are null — so all vets are shown. AC says "available vets for the selected date/time", implying always-filtered. Full filtering on date selection would require AJAX (out of scope). Suggest rewording AC.';

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
      { type: 'output', text: 'Applying generated specification...' },
      { type: 'success', text: 'Run finished without issues' },
    ];
  }

  if (choiceId === 'allow-once') {
    return [
      { type: 'output', text: 'Permission granted for this run' },
      { type: 'output', text: 'Starting agent execution...' },
      { type: 'output', text: 'Applying generated specification...' },
      { type: 'success', text: 'Run finished without issues' },
    ];
  }

  if (choiceId === 'reject') {
    return [
      { type: 'error', text: 'Execution rejected' },
    ];
  }

  return [];
}

function buildTerminalRunSequence({
  mode = 'section',
  sectionTitle,
  taskLabel = TERMINAL_TASK_TAB_BASE_LABEL,
  question = '',
  permissionChoice = 'prompt',
} = {}) {
  const resolvedTaskLabel = taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;

  if (mode === 'generate') {
    const formattedQuestion = formatTerminalQuestion(question);
    const introLines = [
      { type: 'command', text: `agent run "${resolvedTaskLabel}" --generate` },
      { type: 'output', text: `Reading ${resolvedTaskLabel}` },
      ...(formattedQuestion ? [{ type: 'output', text: `Question: ${formattedQuestion}` }] : []),
      { type: 'output', text: 'Resolving referenced files...' },
      { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
      { type: 'output', text: 'Generating visit-booking specification...' },
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

  const resolvedSection = sectionTitle || 'Plan';
  const activityLine = resolvedSection.toLowerCase() === 'acceptance criteria'
    ? 'Running acceptance checks...'
    : 'Building execution plan...';

  return {
    initialLines: [
      { type: 'command', text: `agent run "${resolvedTaskLabel}" --section "${resolvedSection}"` },
      { type: 'output', text: `Reading ${resolvedTaskLabel}` },
      { type: 'output', text: 'Resolving referenced files...' },
      { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
      { type: 'output', text: activityLine },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Run finished without issues' },
    ],
    permissionPrompt: null,
  };
}

function buildAcceptanceCriteriaIntroLines(taskLabel = TERMINAL_TASK_TAB_BASE_LABEL) {
  const resolvedTaskLabel = taskLabel || TERMINAL_TASK_TAB_BASE_LABEL;
  return [
    { type: 'command', text: `agent run "${resolvedTaskLabel}" --section "Acceptance Criteria"` },
    { type: 'output', text: `Reading ${resolvedTaskLabel}` },
    { type: 'output', text: 'Resolving referenced files...' },
    { type: 'output', text: `Loading ${PROJECT_NAME} context...` },
    { type: 'output', text: 'Running acceptance checks...' },
  ];
}

function buildAcceptanceCriteriaContinuationLines(choiceId) {
  if (choiceId === 'allow-session') {
    return [
      { type: 'output', text: 'Permission granted for this session' },
      { type: 'output', text: 'Continuing acceptance checks...' },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Run finished without issues' },
    ];
  }

  if (choiceId === 'allow-once') {
    return [
      { type: 'output', text: 'Permission granted for this run' },
      { type: 'output', text: 'Continuing acceptance checks...' },
      { type: 'output', text: 'Processed 9 plan steps' },
      { type: 'success', text: 'Run finished without issues' },
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
    && statuses.every((statusItem) => statusItem?.status === 'passed');
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
      match: 'available vets for the selected date/time',
      className: 'spec-inline-warning-highlight',
    },
    issue: {
      severity: 'warning',
      label: 'AC/Plan mismatch — AC says "available vets" but plan loads all vets',
      secondaryText: 'Line 4',
    },
    checks: [
      { status: 'passed', text: 'Pre-filter works on POST re-render', chip: 'VisitController.java' },
      { status: 'failed', text: 'Initial GET shows all vets — no date/time to filter', chip: null },
    ],
  },
  {
    status: 'failed',
    highlight: {
      match: 'e.g. hourly slots',
      className: 'spec-inline-warning-highlight',
    },
    issue: {
      severity: 'warning',
      label: 'Ambiguous AC — "e.g." makes time slot granularity untestable',
      secondaryText: 'Line 5',
    },
    checks: [],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: 'UNIQUE constraint in all 3 schema files', chip: 'schema.sql' },
      { status: 'passed', text: 'existsByVetIdAndDateAndTime check before save', chip: 'VisitController.java' },
    ],
  },
  {
    status: 'passed',
    checks: [
      { status: 'passed', text: '@ManyToOne vet persisted', chip: 'Visit.java' },
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
      actionLabel: 'Fix vet availability',
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
      actionLabel: 'Add time slots',
      replacementText: 'Visit form includes a time slot picker with hourly slots from 09:00 to 16:00 (last bookable slot). Slot range is configurable.',
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

    if (!appliedIssueFixes?.[kind]?.[originalIndex]) {
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

function cloneIssueStateMap(issueState = null) {
  return {
    ac: { ...(issueState?.ac ?? {}) },
    plan: { ...(issueState?.plan ?? {}) },
  };
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
    if (entry?.type !== 'item' || entry.itemType !== 'check') continue;

    const section = documentSections[entry.sectionIndex];
    if (section?.title?.toLowerCase() !== targetSectionTitle) continue;

    if (currentVisibleIndex === visibleIndex) {
      return rawIndex;
    }

    currentVisibleIndex += 1;
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
} = {}) {
  if (!Array.isArray(nextStatuses)) {
    return nextStatuses;
  }

  const rerunOriginalIndexSet = new Set(rerunOriginalIndices);
  const baseStatuses = getBaseRunStatusesForKind(kind);
  const nextResult = new Array(nextStatuses.length).fill(null);

  for (let originalIndex = 0; originalIndex < baseStatuses.length; originalIndex += 1) {
    const nextVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, nextRemovedIssueIndices);
    if (!Number.isInteger(nextVisibleIndex) || nextVisibleIndex < 0) {
      continue;
    }

    if (rerunOriginalIndexSet.has(originalIndex)) {
      nextResult[nextVisibleIndex] = null;
      continue;
    }

    const currentVisibleIndex = mapOriginalIssueIndexToVisible(kind, originalIndex, currentRemovedIssueIndices);
    const preservedStatus = Array.isArray(currentStatuses) && currentVisibleIndex >= 0
      ? currentStatuses[currentVisibleIndex]
      : undefined;

    nextResult[nextVisibleIndex] = preservedStatus !== undefined
      ? preservedStatus
      : (nextStatuses[nextVisibleIndex] ?? null);
  }

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

function applyIssueQuickFixToDocumentSections(documentSections, { kind, index, replacementText }) {
  if (!replacementText) return documentSections;

  return updateDocumentCheckItem(documentSections, {
    kind,
    index,
    updater: (item) => ({ ...item, text: replacementText }),
  });
}

function buildSerializedDocumentLines(documentSections) {
  const lines = [];
  const lineMap = [];

  (documentSections ?? []).forEach((section, sectionIndex) => {
    const sectionStableId = section?.id ?? `section-${sectionIndex}`;
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
        lines.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`);
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

    if (sectionIndex < (documentSections?.length ?? 0) - 1) {
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

    matches[rowIndex] = lineMap[matchedIndex] ?? null;
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

  return documentSections.map((section, sectionIndex) => {
    if (sectionIndex !== target.sectionIndex) return section;
    return {
      ...section,
      items: (section.items ?? []).filter((_, itemIndex) => itemIndex !== target.itemIndex),
    };
  });
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

  return documentSections.map((section, sectionIndex) => {
    if (sectionIndex !== target.sectionIndex) return section;

    let sectionChanged = false;
    const nextItems = (section.items ?? []).map((item, itemIndex) => {
      if (itemIndex !== target.itemIndex) return item;

      const nextItem = updater(item);
      if (nextItem !== item) {
        sectionChanged = true;
      }
      return nextItem;
    });

    return sectionChanged ? { ...section, items: nextItems } : section;
  });
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

  const { sectionIndex, itemIndex } = location.lineMapEntry;

  return documentSections.map((section, nextSectionIndex) => {
    if (nextSectionIndex !== sectionIndex) return section;

    let sectionChanged = false;
    const nextItems = (section.items ?? []).map((item, nextItemIndex) => {
      if (nextItemIndex !== itemIndex) return item;

      const nextItem = updater(item);
      if (nextItem !== item) {
        sectionChanged = true;
      }
      return nextItem;
    });

    return sectionChanged ? { ...section, items: nextItems } : section;
  });
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

      if (entry.deleteTarget) {
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
    nextAppliedIssueFixes[kind][index] = true;
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
  { severity: 'warning', label: 'AC/Plan mismatch — AC says "available vets" but plan loads all vets', secondaryText: 'Line 4' },
  { severity: 'warning', label: 'Ambiguous AC — "e.g." makes time slot granularity untestable', secondaryText: 'Line 5' },
  { severity: 'warning', label: 'Possible race condition — check-then-act without DB constraint', secondaryText: 'Line 10' },
  { severity: 'error', label: 'Incomplete plan — missing VetFormatter, form POST will fail', secondaryText: 'Line 12' },
];

const EDITOR_PROBLEMS_BY_LABEL = {
  'VisitController.java': {
    path: `${PROJECT_ROOT_PATH}/src/main/java/org/springframework/samples/petclinic/owner`,
    issues: [
      { severity: 'warning', label: 'populateTimeSlots() rebuilds list on every request', secondaryText: 'Line 121' },
      { severity: 'warning', label: '@ModelAttribute("vets") loads all vets on GET — no pre-filtering', secondaryText: 'Line 95' },
      { severity: 'error', label: 'DataIntegrityViolationException not caught — 500 on concurrent booking', secondaryText: 'Line 142' },
      { severity: 'error', label: 'Missing VetFormatter — form binding will fail at runtime', secondaryText: 'Line 108' },
    ],
  },
};

const MY_LEFT_STRIPE = DEFAULT_LEFT_STRIPE_ITEMS.filter(i =>
  ['project', 'commit', 'structure'].includes(i.id)
);

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

    const storageKey = getCommentEntryStorageKey(entry);
    const canonicalKey = canonicalKeysByCandidate.get(storageKey);
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
      secondaryText: `${meta.path}${secondarySuffix}`,
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
          secondaryText: normalizedIssue.secondaryText,
        };
      }),
    },
  ];
}

function extractRuntimeInspectionIssues(results = [], kind, documentSections = null) {
  return results.reduce((issues, item, visibleIndex) => {
    if (item?.issue) {
      issues.push({
        ...item.issue,
        id: `${kind}-issue-${visibleIndex}`,
        rawIndex: getDocumentCheckRawIndex(documentSections, kind, visibleIndex),
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

function CompletionPopup({ trigger, query, selectedIdx, onSelect, onClose, style }) {
  const items = trigger === '@' ? AT_COMPLETIONS : HASH_COMPLETIONS;
  const filtered = items.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase())
  ).slice(0, COMPLETION_POPUP_MAX_ITEMS);

  if (filtered.length === 0) return null;

  return (
    <div className="cmp-popup" style={style}>
      {filtered.map((item, i) => {
        const matchLen = query.length;
        const matchesStart = item.label.toLowerCase().startsWith(query.toLowerCase());
        return (
          <div
            key={item.label}
            className={`cmp-cell${i === selectedIdx ? ' cmp-cell-selected' : ''}`}
            onMouseDown={e => { e.preventDefault(); onSelect(item); }}
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
          </div>
        );
      })}
      <div className="cmp-footer">
        <span className="cmp-footer-text">Press ⌃⇧Space to show only variants suitable by type</span>
        <span className="cmp-footer-tip">Next Tip</span>
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
      {!search && <>
        <div className="add-popup-item">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M1.5 3H5.5L7 4.5H13.5C14.05 4.5 14.5 4.95 14.5 5.5V12C14.5 12.55 14.05 13 13.5 13H1.5C0.95 13 0.5 12.55 0.5 12V4C0.5 3.45 0.95 3 1.5 3Z" stroke="#9FA2A8" strokeWidth="1"/>
          </svg>
          <span className="add-popup-item-label">Files</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 'auto', flexShrink: 0 }}>
            <path d="M6 4l4 4-4 4" stroke="#6F737A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div className="add-popup-item">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <rect x="1" y="2.5" width="14" height="11" rx="1.5" stroke="#9FA2A8" strokeWidth="1"/>
            <circle cx="5.5" cy="6.5" r="1.5" stroke="#9FA2A8" strokeWidth="1"/>
            <path d="M1 11l3.5-3 2.5 2.5 2.5-2 4 4" stroke="#9FA2A8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="add-popup-item-label">Image...</span>
        </div>
        <div className="add-popup-divider" />
        <div className="add-popup-section-label">Recent files</div>
      </>}

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
  { text: 'Add vet assignment and time slot selection to the visit creation flow. When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).', type: 'text' },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Acceptance Criteria',                                                                             type: 'heading' },
  { text: '\u2610 Visit form shows a dropdown of available vets for the selected date/time.',                type: 'check'   },
  { text: '\u2610 Visit form includes a time slot picker (e.g. hourly slots 09:00\u201316:00).',             type: 'check'   },
  { text: '\u2610 A vet cannot be booked for the same date+time twice (server-side validation).',            type: 'check'   },
  { text: '\u2610 Vet and time are persisted with the visit.',                                               type: 'check'   },
  { text: '\u2610 Existing visit display (owner details page) shows the assigned vet and time.',             type: 'check'   },
  { text: '\u2610 All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.',                  type: 'check'   },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Plan',                                                                                            type: 'heading' },
  { text: '\u2610 Schema changes \u2014 add vet_id (FK) and visit_time (TIME) to visits table',              type: 'check'   },
  { text: '\u2610 Visit entity \u2014 add @ManyToOne vet and LocalTime time with @NotNull',                  type: 'check'   },
  { text: '\u2610 VisitRepository \u2014 add existsByVetIdAndDateAndTime for double-booking check',           type: 'check'   },
  { text: '\u2610 VisitController \u2014 inject VetRepository, add @ModelAttribute("vets") with findAll()',   type: 'check'   },
  { text: '\u2610 Form template \u2014 add <select> for vet and <select> for time slot',                      type: 'check'   },
  { text: '\u2610 Owner details \u2014 add Vet and Time columns to visit history table',                      type: 'check'   },
  { text: '\u2610 Tests \u2014 vet list in model, successful booking, double-booking rejected',               type: 'check'   },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Implementation Notes',                                                                            type: 'heading' },
  { text: '\u2022 Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.', type: 'note' },
  { text: '\u2022 Visits persisted via cascade (Owner \u2192 Pet \u2192 Visit). No VisitRepository exists.',  type: 'note'    },
  { text: '\u2022 VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.',                  type: 'note'    },
  { text: '\u2022 Project uses Formatter<T> for form selects (see PetTypeFormatter).',                        type: 'note'    },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Tradeoffs',                                                                                       type: 'heading' },
  { text: '',                                                                                                 type: 'empty'   },
  { text: 'Other',                                                                                           type: 'heading' },
  { text: '// Dynamic availability (AJAX) \u2014 not in prompt, out of scope',                               type: 'comment' },
  { text: '// Vet specialties matching \u2014 not in prompt, out of scope',                                   type: 'comment' },
];

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
          id: 'goal-text',
          type: 'paragraph',
          text: 'Add vet assignment and time slot selection to the visit creation flow. When booking a visit, users pick a vet and a time slot for the chosen date. The system prevents double-booking (same vet, same date+time).',
        },
      ],
    },
    {
      id: 'acceptance',
      title: 'Acceptance Criteria',
      items: [
        { id: 'ac-1', type: 'check', checked: false, text: 'Visit form shows a dropdown of available vets for the selected date/time.' },
        { id: 'ac-2', type: 'check', checked: false, text: 'Visit form includes a time slot picker (e.g. hourly slots 09:00\u201316:00).' },
        { id: 'ac-3', type: 'check', checked: false, text: 'A vet cannot be booked for the same date+time twice (server-side validation).' },
        { id: 'ac-4', type: 'check', checked: false, text: 'Vet and time are persisted with the visit.' },
        { id: 'ac-5', type: 'check', checked: false, text: 'Existing visit display (owner details page) shows the assigned vet and time.' },
        { id: 'ac-6', type: 'check', checked: false, text: 'All three DB schemas (H2, MySQL, PostgreSQL) and seed data are updated.' },
      ],
    },
    {
      id: 'plan',
      title: 'Plan',
      meta: { kind: 'chip', text: 'Configuration.md' },
      items: [
        { id: 'plan-1', type: 'check', checked: false, text: 'Schema changes \u2014 add vet_id (FK) and visit_time (TIME) to visits table' },
        { id: 'plan-2', type: 'check', checked: false, text: 'Visit entity \u2014 add @ManyToOne vet and LocalTime time with @NotNull' },
        { id: 'plan-3', type: 'check', checked: false, text: 'VisitRepository \u2014 add existsByVetIdAndDateAndTime for double-booking check' },
        { id: 'plan-4', type: 'check', checked: false, text: 'VisitController \u2014 inject VetRepository, add @ModelAttribute("vets") with findAll()' },
        { id: 'plan-5', type: 'check', checked: false, text: 'Form template \u2014 add <select> for vet and <select> for time slot' },
        { id: 'plan-6', type: 'check', checked: false, text: 'Owner details \u2014 add Vet and Time columns to visit history table' },
        { id: 'plan-7', type: 'check', checked: false, text: 'Tests \u2014 vet list in model, successful booking, double-booking rejected' },
      ],
    },
    {
      id: 'implementation',
      title: 'Implementation Notes',
      items: [
        { id: 'impl-1', type: 'bullet', text: 'Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.' },
        { id: 'impl-2', type: 'bullet', text: 'Visits persisted via cascade (Owner \u2192 Pet \u2192 Visit). No VisitRepository exists.' },
        { id: 'impl-3', type: 'bullet', text: 'VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.' },
        { id: 'impl-4', type: 'bullet', text: 'Project uses Formatter<T> for form selects (see PetTypeFormatter).' },
      ],
    },
    {
      id: 'tradeoffs',
      title: 'Tradeoffs',
      items: [],
    },
    {
      id: 'other',
      title: 'Other',
      items: [
        { id: 'other-1', type: 'comment', text: 'Dynamic availability (AJAX) \u2014 not in prompt, out of scope' },
        { id: 'other-2', type: 'comment', text: 'Vet specialties matching \u2014 not in prompt, out of scope' },
      ],
    },
  ];
}

function serializeSpecDocument(documentSections) {
  return documentSections.map((section) => {
    const lines = [`## ${section.title}`];

    // Hidden for now, kept here for easy restore:
    // if (section.meta?.text) {
    //   lines.push(`Reference file: ${section.meta.text}`);
    // }

    section.items.forEach((item) => {
      if (item.type === 'paragraph') lines.push(item.text);
      if (item.type === 'check') lines.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`);
      if (item.type === 'bullet') lines.push(`- ${item.text}`);
      if (item.type === 'comment') lines.push(`// ${item.text}`);
    });

    return lines.join('\n');
  }).join('\n\n');
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
  };

  const pushItem = (item) => {
    if (!currentSection || !item) return;

    const baseItem = currentBaseSection?.items?.[itemIndex] ?? null;
    currentSection.items.push({
      id: baseItem?.id ?? `${currentSection.id}:item-${itemIndex}`,
      ...item,
    });
    itemIndex += 1;
  };

  lines.forEach((line) => {
    const headingTitle = getDoneHeadingTitle(line);
    if (headingTitle !== null) {
      startSection(headingTitle);
      return;
    }

    if (!currentSection || line.trim().length === 0) {
      return;
    }

    const refFileMatch = line.match(/^Reference file:\s+(.+)$/);
    if (refFileMatch) {
      currentSection.meta = {
        ...(currentSection.meta ?? {}),
        kind: 'chip',
        text: refFileMatch[1].trim(),
      };
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
  const checkMatch = sourceLine.match(/^(-\s+\[[ x]\]\s+)(.*)$/i);
  if (checkMatch) {
    return `${checkMatch[1]}${nextText}`;
  }

  if (/^-\s+/.test(sourceLine)) {
    return `- ${nextText}`;
  }

  if (/^\/\/\s?/.test(sourceLine)) {
    return `// ${nextText}`;
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
  const normalizedText = typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim()
    : '';
  const visitBookingGoalLineOne = 'Add vet assignment and time slot selection to the visit creation flow.';
  const visitBookingGoalTail = 'The system prevents double-booking (same vet, same date+time).';

  if (
    normalizedText.startsWith(visitBookingGoalLineOne)
    && normalizedText.includes(visitBookingGoalTail)
  ) {
    const afterFirst = normalizedText.slice(visitBookingGoalLineOne.length);
    const trailingSpace = afterFirst.length > 0 && afterFirst[0] === ' ' ? ' ' : '';
    const secondLine = afterFirst.trimStart();
    return [
      visitBookingGoalLineOne + trailingSpace,
      <br key={`${keyPrefix}-break`} />,
      secondLine,
    ];
  }

  const parts = text.split(/(@\w+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    /^@\w+$/.test(part)
      ? <span key={`${keyPrefix}-${index}`} className="spec-ref">{part}</span>
      : part
  );
}

function renderDoneMarkdownInline(text, highlight = null) {
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

    return (
      <span key={`segment-${index}`} className={segment.className}>
        {content}
      </span>
    );
  });
}

function DoneFileChipGroup({ initialFiles = [], addPopupFiles, addButtonLabel = 'Add file', className = '' }) {
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

  const openAddPopup = () => {
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
            onRemove={(event) => {
              event.preventDefault();
              event.stopPropagation();
              removeFile(file.label);
            }}
          />
        ))}
        <button
          type="button"
          className="at-icon-btn spec-done-ref-add-btn"
          ref={addBtnRef}
          onClick={openAddPopup}
          aria-label={addButtonLabel}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M7.5 1C7.77614 1 8 1.22386 8 1.5V7H13.5C13.7761 7 14 7.22386 14 7.5C14 7.77614 13.7761 8 13.5 8H8V13.5C8 13.7761 7.77614 14 7.5 14C7.22386 14 7 13.7761 7 13.5V8H1.5C1.22386 8 1 7.77614 1 7.5C1 7.22386 1.22386 7 1.5 7H7V1.5C7 1.22386 7.22386 1 7.5 1Z" fill="#C4C4C4" />
          </svg>
        </button>
      </div>
      {showAddPopup && popupPos && createPortal(
        <>
          <div className="add-popup-overlay" onMouseDown={() => setShowAddPopup(false)} />
          <AddPopup
            onClose={() => setShowAddPopup(false)}
            onSelectFile={(item) => {
              setFiles((prev) => prev.some((file) => file.label === item.label) ? prev : [...prev, { label: item.label }]);
            }}
            files={addPopupFiles}
            style={{ position: 'fixed', ...popupPos }}
          />
        </>,
        document.body
      )}
    </>
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
      {commentCount > 0 && <DoneInlineCommentPreview comment={latestComment} />}
      <DoneCommentButton
        commentCount={commentCount}
        isOpen={isOpen}
        demoId={demoId}
        onOpen={onOpen}
      />
    </span>
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
  const hasComments = comments.length > 0;
  const isEditing = Number.isInteger(editingIndex);

  useEffect(() => {
    const input = popupRef.current?.querySelector('input');
    if (input instanceof HTMLInputElement) {
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
        if (!(event.target instanceof HTMLInputElement)) return;
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
                <div className="spec-done-comment-popup-item-text text-ui-default">{comment}</div>
                <div className="spec-done-comment-popup-item-actions">
                  <button
                    type="button"
                    className="spec-done-comment-popup-link"
                    onClick={() => onStartEdit?.(index)}
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    className="spec-done-comment-popup-link"
                    onClick={() => onDelete?.(index)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="spec-done-comment-popup-compose">
        <div className="spec-done-comment-popup-input-wrap">
          <Input
            value={value}
            placeholder="Write a comment"
            data-demo-id="spec-comment-input"
            onChange={(event) => onChange?.(event.target.value)}
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

function DoneHeadingWithFiles({ title, initialFiles = [], addPopupFiles, commentAdornment = null }) {
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
      />
      {commentAdornment}
    </div>
  );
}

function getDoneHeadingTitle(line) {
  const headingMatch = line.match(/^\s*##\s+(.*)$/);
  return headingMatch ? headingMatch[1].trim() : null;
}

function shouldShowDoneRunIcon(line) {
  const headingTitle = getDoneHeadingTitle(line)?.toLowerCase();
  return headingTitle === 'plan' || headingTitle === 'acceptance criteria';
}

function CheckStatus({ status }) {
  return (
    <span className={`spec-check-status spec-check-status-${status}`} aria-label={status} title={status}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        {status === 'passed'
          ? <path d="M5.5 8.5L7 10L10.5 6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          : <rect x="4" y="7.25" width="8" height="1.5" rx="0.75" fill="#fff" />
        }
      </svg>
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

function AcCheckRow({ checkItem, text, isIssueActive = false, commentAdornment = null }) {
  const [expanded, setExpanded] = useState(false);
  const checks = checkItem.checks || [];
  const hasChecks = checks.length > 0;
  const visualStatus = checkItem.status === 'passed'
    ? 'passed'
    : (checkItem.issue?.severity === 'warning'
        ? 'warning'
        : (checkItem.issue?.severity === 'error'
            ? 'error'
            : checkItem.status));

  return (
    <div className="spec-done-line spec-done-line-check ac-check-row">
      <div className={`ac-check-main spec-done-primary-line${isIssueActive ? ' spec-done-active-issue-line' : ''}`}>
        <CheckStatus status={visualStatus} />
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(text, checkItem.highlight)}</span>
        {hasChecks && (
          <button className="ac-checks-toggle" onClick={() => setExpanded(e => !e)}>
            {checks.length} checks
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
            <div key={i} className="ac-subcheck-item">
              <AcSubcheckIcon status={check.status} />
              <span className="ac-subcheck-text">{check.text}</span>
              {check.chip && <span className="ac-subcheck-chip">{check.chip}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PLAN_DIFF_PREVIEW_REPLACEMENTS = {
  0: 'Schema changes — add vet_id (FK), visit_time (TIME), and UNIQUE(vet_id, visit_date, visit_time) constraint',
  1: 'Visit entity — add @ManyToOne vet and LocalTime time with @NotNull',
  2: 'VisitRepository — add double-booking query + UNIQUE(vet_id, visit_date, visit_time) constraint',
  3: 'VisitController — inject VetRepository, add @ModelAttribute("vets") with findAll()',
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
  const initialFiles = [];

  if (sectionMeta?.kind === 'chip' && typeof sectionMeta.text === 'string' && sectionMeta.text.trim().length > 0) {
    initialFiles.push(sectionMeta.text);
  }

  (attachedFiles ?? []).forEach((file) => {
    const label = typeof file === 'string' ? file : file?.label;
    if (label === 'Configuration.md') {
      initialFiles.push(label);
    }
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
    const status = planRunResult?.[visibleIndex]?.status ?? null;

    items.push({
      id: item.id ?? `plan-viewer-item-${originalIndex}`,
      text: item.text ?? '',
      status,
      files: [presetFile, ...currentDiffFiles].filter((file, index, files) => typeof file === 'string' && file.trim().length > 0 && files.indexOf(file) === index),
      isCurrent,
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
      rows.push({
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
      rows.push({
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

function buildPlanDiffTabContent({ sourceCode, text, statusItem, issueTarget, sourceTabLabel }) {
  const diffData = buildPlanDiffData({ sourceCode, text, statusItem, issueTarget, sourceTabLabel });

  if (diffData.rows.length > 0) {
    return diffData.rows.map((row) => {
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

  return diffData.rows.map((row) => {
    const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
    return `${prefix} ${row.text}`;
  }).join('\n');
}

function PlanStatusRow({ statusItem, text, issueTarget = null, checkTarget = null, isIssueActive = false, commentAdornment = null, onOpenDiffTab = null }) {
  const diffTarget = issueTarget ?? checkTarget;
  const demoTargetId = formatDemoTargetId(diffTarget);

  return (
    <div className={`spec-done-line spec-done-line-status spec-done-primary-line${isIssueActive ? ' spec-done-active-issue-line' : ''}`}>
      <CheckStatus status={statusItem.status} />
      <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(text, statusItem.highlight)}</span>
      <button
        type="button"
        className="ac-checks-toggle"
        data-demo-id={demoTargetId ? `plan-show-diff-${demoTargetId}` : undefined}
        onClick={() => onOpenDiffTab?.({ text, statusItem, issueTarget: diffTarget })}
      >
        Show diff
      </button>
      {commentAdornment}
    </div>
  );
}

function renderDoneLine(line, key, addPopupFiles, attachedFiles = [], checkStatus = null, sectionMeta = null, planStatus = null, isIssueLineActive = false, commentAdornment = null, issueTarget = null, onOpenDiffTab = null, checkTarget = null) {
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
  const checkMatch = line.match(/^- \[([ x])\]\s+(.*)$/i);
  if (checkMatch) {
    const checked = checkMatch[1].toLowerCase() === 'x';
    if (checkStatus != null) {
      return <AcCheckRow key={key} checkItem={checkStatus} text={checkMatch[2]} isIssueActive={isIssueLineActive} commentAdornment={commentAdornment} />;
    }
    if (planStatus != null) {
      return <PlanStatusRow key={key} statusItem={planStatus} text={checkMatch[2]} issueTarget={issueTarget} checkTarget={checkTarget} isIssueActive={isIssueLineActive} commentAdornment={commentAdornment} onOpenDiffTab={onOpenDiffTab} />;
    }
    return (
      <div key={key} className="spec-done-line spec-done-line-check">
        <Checkbox className="spec-done-checkbox" checked={checked} onChange={() => {}} />
        <span contentEditable suppressContentEditableWarning>{renderDoneMarkdownInline(checkMatch[2])}</span>
        {commentAdornment}
      </div>
    );
  }
  const bulletMatch = line.match(/^-\s+(.*)$/);
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
      <button
        type="button"
        className={`spec-done-inspection-version-btn${versionPopupRect ? ' is-open' : ''}`}
        onClick={toggleVersionPopup}
        aria-expanded={Boolean(versionPopupRect)}
        aria-haspopup="menu"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2C11.3137 2 14 4.68629 14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2ZM8 3C5.23858 3 3 5.23858 3 8C3 10.7614 5.23858 13 8 13C10.7614 13 13 10.7614 13 8C13 5.23858 10.7614 3 8 3ZM7.50153 5C7.74699 5 7.95114 5.17688 7.99347 5.41012L8.00153 5.5V8H9.5C9.77614 8 10 8.22386 10 8.5C10 8.74546 9.82312 8.94961 9.58988 8.99194L9.5 9H7.50153C7.25607 9 7.05192 8.82312 7.00958 8.58988L7.00153 8.5V5.5C7.00153 5.22386 7.22538 5 7.50153 5Z" fill="#CED0D6" />
        </svg>
        <span className="spec-done-inspection-text">{currentVersion?.label ?? buildSpecVersionLabel(1)}</span>
        <svg className="spec-done-inspection-chevron" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M11.5 6.25L8 9.75L4.5 6.25" stroke="#818594" strokeLinecap="round" />
        </svg>
      </button>
      {hasIssues && (
        <>
          <div className="spec-done-inspection-separator" />
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
    return 'Apply fix and rerun';
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
  return itemNumber ? `Fix ${issueKindLabel} item ${itemNumber} and rerun` : 'Apply fix and rerun';
}

function buildDoneIntentionPopupActions({ severity, canFixIssue = true, issueTarget = null }) {
  const fixActionLabel = getDoneIssueFixActionLabel(issueTarget);

  if (severity === 'failed') {
    return {
      primary: [
        canFixIssue ? { id: 'apply-fix', label: fixActionLabel, icon: 'codeInsight/intentionBulb', action: 'fix' } : null,
        { id: 'open-problems', label: 'Open Problems', icon: 'codeInsight/intentionBulb', action: 'problems' },
        { id: 'regenerate-spec', label: 'Regenerate spec', icon: 'codeInsight/intentionBulb', action: 'regenerate' },
      ].filter(Boolean),
      secondary: [
        { id: 'rewrite-item', label: 'Rewrite this item' },
        { id: 'explain-failure', label: 'Explain failure in notes' },
        { id: 'move-tradeoff', label: 'Move to Tradeoffs' },
      ],
    };
  }

  return {
    primary: [
      canFixIssue ? { id: 'apply-fix', label: fixActionLabel, icon: 'codeInsight/intentionBulb', action: 'fix' } : null,
      { id: 'open-problems', label: 'Open Problems', icon: 'codeInsight/intentionBulb', action: 'problems' },
      { id: 'regenerate-spec', label: 'Regenerate spec', icon: 'codeInsight/intentionBulb', action: 'regenerate' },
    ].filter(Boolean),
    secondary: [
      { id: 'clarify-item', label: 'Clarify this requirement' },
      { id: 'attach-reference', label: 'Attach reference file' },
      { id: 'move-notes', label: 'Move to Implementation Notes' },
    ],
  };
}

function DoneIssueIntentionPopup({ severity, canFixIssue = true, issueTarget = null, onOpenProblems, onRegenerateSpec, onFixIssue, onClose }) {
  const actions = buildDoneIntentionPopupActions({ severity, canFixIssue, issueTarget });
  const demoTargetId = formatDemoTargetId(issueTarget);

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

  return (
    <div className="cmp-popup spec-done-intention-popup" onMouseDown={(event) => event.preventDefault()}>
      {actions.primary.map((item) => renderActionRow(item, { key: item.id, primary: true }))}
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
        Changes made — click <strong>Enhance</strong> to update the spec.
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

function DoneMarkdownOverlay({ code, onOpenProblems, onOpenTerminal, onRegenerateSpec, onFixIssue, onOpenDiffTab, addPopupFiles, attachedFiles = [], onAddToProjectContext, acRunResult, planRunResult, documentSections, acWarningBanner, inspectionSummary, versionHistory = null, onOpenVersionDiff = null, onCommentCountChange, onCommentsChange, commentEntries: persistedCommentEntries = [], removedIssueIndices, highlightedProblemLocation = null, commentResetToken = 0, uiState = null, onUiStateChange = null, onPendingEnhanceStateChange = null, onUserInput = null }) {
  const tradeoffCount = useMemo(
    () => countRecordedTradeoffs(documentSections),
    [documentSections]
  );
  const acceptanceCriteriaCount = Array.isArray(acRunResult) ? acRunResult.length : 0;
  const planItemCount = Array.isArray(planRunResult) ? planRunResult.length : 0;
  const projectContextFile = useMemo(
    () => getProjectContextFile(documentSections, addPopupFiles),
    [addPopupFiles, documentSections]
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
  const [draftCode, setDraftCode] = useState(() => (typeof code === 'string' ? code : ''));
  const draftCodeRef = useRef(draftCode);
  draftCodeRef.current = draftCode;

  useEffect(() => {
    setProjectContextBannerDismissed(false);
  }, [projectContextFile?.label, showSuccessBanner]);

  useEffect(() => {
    setDraftCode(typeof code === 'string' ? code : '');
  }, [code, commentResetToken]);

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
    () => buildSerializedDocumentLines(documentSections),
    [documentSections]
  );
  const serializedDocumentLineMap = serializedDocumentModel.lineMap;
  const serializedDocumentLines = serializedDocumentModel.lines;
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
  const [hoveredRowKey, setHoveredRowKey] = useState(null);
  const [commentPopup, setCommentPopup] = useState(null);
  const [intentionPopup, setIntentionPopup] = useState(null);
  const normalizedCode = useMemo(
    () => normalizeSpecCodeForComparison(code),
    [code]
  );
  const rowMetaList = useMemo(() => {
    const sectionMetaByTitle = new Map(
      (documentSections ?? []).map((section) => [section.title.toLowerCase(), section.meta ?? null])
    );
    let inAcSection = false;
    let inPlanSection = false;
    let acCheckIdx = 0;
    let planCheckIdx = 0;
    let currentSectionTitle = null;

    return displayRows.map((row, rowIndex) => {
      const line = row.line;
      const headingTitle = getDoneHeadingTitle(line);
      const sectionMeta = headingTitle ? sectionMetaByTitle.get(headingTitle.toLowerCase()) ?? null : null;
      const showRunIcon = shouldShowDoneRunIcon(line);
      const serializedLineMeta = matchedSerializedLineMetaByRow[rowIndex] ?? null;

      if (headingTitle !== null) {
        currentSectionTitle = headingTitle;
        inAcSection = headingTitle.toLowerCase() === 'acceptance criteria';
        inPlanSection = headingTitle.toLowerCase() === 'plan';
        if (!inAcSection) acCheckIdx = 0;
        if (!inPlanSection) planCheckIdx = 0;
      }

      const isCheckLine = /^- \[([ x])\]\s+/i.test(line);
      let checkStatus = null;
      let planStatus = null;
      let checkTarget = null;
      let issueSeverity = null;
      let issueTarget = null;

      if (isCheckLine && inAcSection) {
        const visibleIndex = acCheckIdx;
        const originalIndex = mapVisibleIssueIndexToOriginal('ac', visibleIndex, removedIssueIndices);
        if (Number.isInteger(originalIndex)) {
          checkTarget = { kind: 'ac', index: originalIndex };
        }
        checkStatus = acRunResult?.[visibleIndex] ?? null;
        if (checkStatus && (checkStatus.status === 'warning' || checkStatus.status === 'failed') && Number.isInteger(originalIndex)) {
          issueSeverity = checkStatus.status;
          issueTarget = { kind: 'ac', index: originalIndex };
        }
        acCheckIdx += 1;
      }

      if (isCheckLine && inPlanSection) {
        const visibleIndex = planCheckIdx;
        const originalIndex = mapVisibleIssueIndexToOriginal('plan', visibleIndex, removedIssueIndices);
        if (Number.isInteger(originalIndex)) {
          checkTarget = { kind: 'plan', index: originalIndex };
        }
        planStatus = planRunResult?.[visibleIndex] ?? null;
        if (planStatus && (planStatus.status === 'warning' || planStatus.status === 'failed') && Number.isInteger(originalIndex)) {
          issueSeverity = planStatus.status;
          issueTarget = { kind: 'plan', index: originalIndex };
        }
        planCheckIdx += 1;
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
        checkStatus,
        planStatus,
        checkTarget,
        issueSeverity,
        issueTarget,
      };
    });
  }, [acRunResult, displayRows, documentSections, matchedSerializedLineMetaByRow, planRunResult, removedIssueIndices]);
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
      .filter((rowMeta) => rowMeta.issueSeverity === 'warning' || rowMeta.issueSeverity === 'failed')
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
      setIntentionPopup(null);
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
      setIntentionPopup((prev) => (
        prev?.rowKey === rowMeta.stableKey
          ? null
          : {
              rowKey: rowMeta.stableKey,
              rowIndex: rowMeta.rowIndex,
              rect: triggerRect,
              severity: rowMeta.issueSeverity ?? 'warning',
              sectionTitle: rowMeta.currentSectionTitle,
              issueTarget: rowMeta.issueTarget,
            }
      ));
    }
  }, [getSelectionToolbarRowMeta]);

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

    const { rowKey, rowCommentKey, editingIndex } = commentPopup;

    if (Number.isInteger(editingIndex)) {
      updateRowComments(rowCommentKey, (comments) => comments.map((comment, index) => (
        index === editingIndex ? nextValue : comment
      )));
    } else {
      updateRowComments(rowCommentKey, (comments) => [...comments, nextValue]);
    }

    setCommentPopup((prev) => (
      prev && prev.rowKey === rowKey
        ? { ...prev, value: '', editingIndex: null }
        : prev
    ));
  }, [commentPopup, updateRowComments]);

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
    span.textContent = `@${item.label}`;
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
        if (item) { if (refSpanRef.current) refSpanRef.current.textContent = `@${item.label}`; setRefPopupPos(null); }
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
        if (item) { applyDoneCompletion(item); setDoneCmpPos(null); }
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
    const updateSelectionUi = () => {
      clearHighlights();

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setActiveIssueRowKey(null);
        setNavigatedIssueRowKey(null);
        setFocusedCommentRowKey(null);
        setSelectionToolbarPos(null);
        return;
      }

      const anchorNode = selection.anchorNode;
      const focusNode = selection.focusNode;
      const anchorElement = anchorNode?.nodeType === Node.TEXT_NODE ? anchorNode.parentElement : anchorNode;
      const focusElement = focusNode?.nodeType === Node.TEXT_NODE ? focusNode.parentElement : focusNode;

      if (!anchorElement || !focusElement || !el.contains(anchorElement) || !el.contains(focusElement)) {
        setActiveIssueRowKey(null);
        setNavigatedIssueRowKey(null);
        setFocusedCommentRowKey(null);
        setSelectionToolbarPos(null);
        return;
      }

      const anchorEditable = anchorElement.closest('[contenteditable]');
      if (!anchorEditable) {
        setActiveIssueRowKey(null);
        setNavigatedIssueRowKey(null);
        setFocusedCommentRowKey(null);
        setSelectionToolbarPos(null);
        return;
      }

      const activeRow = anchorEditable.closest('.spec-done-row');
      activeRow?.classList.add('spec-done-active-line');
      const activeRowSeverity = activeRow?.dataset.issueSeverity;
      const activeRowKey = typeof activeRow?.dataset.rowKey === 'string' ? activeRow.dataset.rowKey : null;
      const nextActiveIssueRowKey =
        activeRowSeverity === 'warning' || activeRowSeverity === 'failed'
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

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('selectionchange', scheduleSelectionUiUpdate);
      el.removeEventListener('scroll', scheduleSelectionUiUpdate);
      window.removeEventListener('resize', scheduleSelectionUiUpdate);
      clearHighlights();
      setActiveIssueRowKey(null);
      setNavigatedIssueRowKey(null);
      setFocusedCommentRowKey(null);
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

  useEffect(() => {
    onCommentCountChange?.(totalCommentCount);
  }, [onCommentCountChange, totalCommentCount]);

  useEffect(() => {
    onCommentsChange?.(commentEntries);
  }, [commentEntries, onCommentsChange]);

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

    let frameId = 0;

    frameId = requestAnimationFrame(() => {
      scrollDoneRowIntoView(highlightedProblemRowIndex);
    });

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [highlightedProblemRowIndex, highlightedProblemLocation?.requestKey, scrollDoneRowIntoView]);

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

            const rowCommentKey = getRowMetaCommentStorageKey(rowMeta);
            const isIssuePopupOpen = intentionPopup?.rowKey === stableKey;
            const isCommentPopupOpen = commentPopup?.rowKey === stableKey;
            const isNavigatedIssueRow = navigatedIssueRowKey === stableKey;
            const showIssueBulb = (activeIssueRowKey === stableKey || isNavigatedIssueRow || isIssuePopupOpen) && Boolean(effectiveIssueSeverity);
            const showIssueLineHighlight = Boolean(effectiveIssueSeverity) && (activeIssueRowKey === stableKey || isNavigatedIssueRow || isIssuePopupOpen);
            const commentsForRow = rowComments[rowCommentKey] ?? [];
            const commentCount = commentsForRow.length;
            const isEmptyLine = !effectiveLine.trim();
            const demoTargetId = formatDemoTargetId(effectiveIssueTarget ?? effectiveCheckTarget);
            const showCommentAdornment = commentCount > 0 || focusedCommentRowKey === stableKey || isCommentPopupOpen
              || (isEmptyLine && hoveredRowKey === stableKey)
              || activeIssueRowKey === stableKey
              || isNavigatedIssueRow;
            const isProblemHighlightedRow = highlightedProblemRowIndex === rowIndex;
            const commentAdornment = showCommentAdornment ? (
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
            ) : null;
            return (
            <div
              key={stableKey}
              className={`spec-done-row${showIssueLineHighlight ? ' spec-done-issue-row' : ''}${isProblemHighlightedRow ? ' spec-done-problems-row' : ''}`}
              data-row-index={rowIndex}
              data-row-key={stableKey}
              data-demo-id={demoTargetId ? `spec-row-${demoTargetId}` : undefined}
              data-raw-index={Number.isInteger(rowMeta.rawIndex) ? rowMeta.rawIndex : undefined}
              data-issue-severity={effectiveIssueSeverity ?? ''}
              data-cleared={clearedRowKeys.has(stableKey) ? 'true' : undefined}
              onMouseEnter={isEmptyLine ? () => setHoveredRowKey(stableKey) : undefined}
              onMouseLeave={isEmptyLine ? (() => setHoveredRowKey(null)) : undefined}
              onClick={(e) => {
                if (e.target.closest('.spec-done-comment-adornment') || e.target.closest('.spec-done-gutter-intention-btn')) {
                  return;
                }

                if (isEmptyLine) {
                  // Focus the caret editable when clicking anywhere in the empty row.
                  const editable = e.currentTarget.querySelector('.spec-done-line-empty-editable');
                  editable?.focus();
                  return;
                }

                if (effectiveIssueSeverity) {
                  setActiveIssueRowKey(stableKey);
                  setNavigatedIssueRowKey(stableKey);
                }
              }}
            >
              <div className={`editor-gutter-row spec-done-gutter-cell${showRunIcon ? ' spec-done-gutter-cell-run' : ''}`}>
                {showRunIcon ? (
                  <button
                    type="button"
                    className="editor-gutter-line-number spec-done-gutter-line-number-run"
                    aria-label="Open Terminal"
                    onClick={() => onOpenTerminal?.({
                      sectionTitle: headingTitle,
                      commentEntries,
                    })}
                  >
                    <Icon name="run/run" size={16} />
                  </button>
                ) : (
                  <div
                    className={`editor-gutter-line-number${showIssueBulb ? ' spec-done-gutter-line-number-intention' : ''}`}
                    role={showIssueBulb ? undefined : 'button'}
                    tabIndex={showIssueBulb ? -1 : 0}
                    aria-label={showIssueBulb ? undefined : (breakpoints.has(stableKey) ? 'Remove breakpoint' : 'Add breakpoint')}
                    onClick={showIssueBulb ? undefined : () => toggleBreakpoint(stableKey)}
                    onKeyDown={showIssueBulb ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBreakpoint(stableKey); } }}
                  >
                    {showIssueBulb ? (
                      <button
                        type="button"
                        className={`spec-done-gutter-intention-btn${isIssuePopupOpen ? ' is-open' : ''}`}
                        aria-label="Open issue actions"
                        data-demo-id={demoTargetId ? `spec-issue-actions-${demoTargetId}` : undefined}
                        aria-haspopup="menu"
                        aria-expanded={isIssuePopupOpen}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          setIntentionPopup((prev) => (
                            prev?.rowKey === stableKey
                              ? null
                              : {
                                  rowKey: stableKey,
                                  rowIndex,
                                  rect,
                                  severity: issueSeverity,
                                  sectionTitle: currentSectionTitle,
                                  issueTarget,
                                }
                          ));
                        }}
                      >
                        <Icon name="codeInsight/intentionBulb" size={16} />
                      </button>
                    ) : (
                      breakpoints.has(stableKey) && <span className="editor-breakpoint-dot" />
                    )}
                  </div>
                )}
              </div>
              <div
                className="spec-done-row-content"
                data-cleared={clearedRowKeys.has(stableKey) ? 'true' : undefined}
              >
                {renderDoneLine(effectiveLine, `line-${stableKey}`, addPopupFiles, attachedFiles, effectiveCheckStatus, sectionMeta, effectivePlanStatus, showIssueLineHighlight, commentAdornment, effectiveIssueTarget, onOpenDiffTab, effectiveCheckTarget)}
              </div>
            </div>
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
            if (refSpanRef.current) refSpanRef.current.textContent = `@${item.label}`;
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
    {intentionPopup && (
      <PositionedPopup triggerRect={intentionPopup.rect} onDismiss={() => setIntentionPopup(null)} gap={4}>
        <DoneIssueIntentionPopup
          severity={intentionPopup.severity}
          canFixIssue={Boolean(intentionPopup.issueTarget)}
          issueTarget={intentionPopup.issueTarget}
          onOpenProblems={onOpenProblems}
          onRegenerateSpec={onRegenerateSpec}
          onFixIssue={() => {
            if (intentionPopup.issueTarget) {
              onFixIssue?.(intentionPopup.issueTarget);
            }
          }}
          onClose={() => setIntentionPopup(null)}
        />
      </PositionedPopup>
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
          {/* Regenerate button */}
          <button className="fu-regenerate-btn" onClick={onRegenerate}>Regenerate</button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Task Editor Area ───────────────────────────────────────────────────

function AttachedFileChip({ label, onRemove, className = '' }) {
  return (
    <div className={`attached-file-chip${className ? ` ${className}` : ''}`} contentEditable={false}>
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

function AgentTaskTopBarIcon({ style }) {
  const gradientId = useId();

  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={style}>
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

function AgentTaskEditorArea({ genState, genProgress, onSend, onStop, onRegenerate, onDoneRegenerate, onFixIssue, onOpenDiffTab, onOpenVersionDiff, attachedFiles, onRemoveAttached, onAddAttached, currentCode, documentSections, onOpenProblems, onOpenTerminal, addPopupFiles, acRunResult, planRunResult, acWarningBanner, inspectionSummary, versionHistory = null, removedIssueIndices, highlightedProblemLocation = null, doneCommentEntries = [], onDoneCommentsChange, commentResetToken = 0, preserveDoneOverlayDuringBusy = false, runState = 'default', doneOverlayUiState = null, onDoneOverlayUiStateChange = null, specSessionKey = null }) {
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
  const shouldShowDoneEnhanceHint = genState === 'done'
    && runState !== 'running'
    && hasPendingDoneEnhanceChanges
    && !isDoneEnhanceLocked;
  const isDoneEnhanceEnabled = genState === 'done'
    && hasPendingDoneEnhanceChanges
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
    if (!value.trim() && goalTitle !== toolbarPlaceholder) {
      setValue(goalTitle);
    }
  }, [genState, goalTitle, toolbarPlaceholder, value]);

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
      (Array.isArray(acRunResult) ? acRunResult.filter((s) => s === null).length : 0) +
      (Array.isArray(planRunResult) ? planRunResult.filter((s) => s === null).length : 0);
    prevNullSlotCountRef.current = currentNullCount;
  }, [acRunResult, commentResetToken, currentCode, planRunResult, resetDoneEnhanceAttention, specSessionKey]);

  // When a quick fix is applied the affected run-result slot is set to null.
  // Treat that as a pending change so the Enhance badge + popup appear.
  // Track the null-slot count so that tab switches (same nulls, new reference)
  // don't re-trigger the badge — only genuinely new null slots do.
  useEffect(() => {
    const nullCount =
      (Array.isArray(acRunResult) ? acRunResult.filter((s) => s === null).length : 0) +
      (Array.isArray(planRunResult) ? planRunResult.filter((s) => s === null).length : 0);
    if (nullCount > prevNullSlotCountRef.current && !isDoneEnhanceLocked) {
      liftDoneEnhanceSuppression();
      allowDoneEnhanceAttentionRef.current = true;
      setHasPendingDoneEnhanceChanges(true);
    }
    prevNullSlotCountRef.current = nullCount;
  }, [acRunResult, isDoneEnhanceLocked, liftDoneEnhanceSuppression, planRunResult]);

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

  const handlePendingEnhanceStateChange = useCallback((pending) => {
    const hasPendingQuickFixRerun =
      (Array.isArray(acRunResult) && acRunResult.some((status) => status === null))
      || (Array.isArray(planRunResult) && planRunResult.some((status) => status === null));

    if (!pending && hasPendingQuickFixRerun && !isDoneEnhanceLocked) {
      return;
    }
    if (pending && (isDoneEnhanceLocked || suppressEnhanceBadgeRef.current || !allowDoneEnhanceAttentionRef.current)) return;
    setHasPendingDoneEnhanceChanges(pending);
  }, [acRunResult, isDoneEnhanceLocked, planRunResult]);

  // Called when the user actually types in the overlay — lifts suppress immediately
  // so that edits made right after Enhance still trigger the badge.
  const handleOverlayUserInput = useCallback(() => {
    setDoneEnhanceLockedForSession(false);
    allowDoneEnhanceAttentionRef.current = true;
    liftDoneEnhanceSuppression();
  }, [liftDoneEnhanceSuppression, setDoneEnhanceLockedForSession]);
  const handleDoneOverlayFixIssue = useCallback((payload) => {
    // Quick fix updates `currentCode` and may also bump comment reset state in
    // separate renders. Skip both baseline-reset passes so Enhance stays active.
    skipNextDoneEnhanceBaselineResetCountRef.current = 2;
    setDoneEnhanceLockedForSession(false);
    allowDoneEnhanceAttentionRef.current = true;
    liftDoneEnhanceSuppression();
    setHasPendingDoneEnhanceChanges(true);
    onFixIssue?.(payload);
  }, [liftDoneEnhanceSuppression, onFixIssue, setDoneEnhanceLockedForSession]);

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
    if (!hasPendingDoneEnhanceChanges) {
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
      if (item) applyCompletion(item);
    } else if (e.key === 'Escape') {
      setCompletion(null);
    }
  }

  function applyCompletion(item) {
    const triggerIdx = Math.max(value.lastIndexOf('@'), value.lastIndexOf('#'));
    const before = value.slice(0, triggerIdx + 1);
    setValue(before + item.label + ' ');
    setCompletion(null);
    // Add file to attached files list
    onAddAttached?.(item);
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
            <svg className="at-loader" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91"/>
              <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91"/>
              <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91"/>
              <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91"/>
              <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91"/>
              <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91"/>
              <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91"/>
              <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91"/>
            </svg>
            <span className="at-generating-label">{title}</span>
          </div>

          <div className="agent-task-toolbar-right">
            <button className="at-icon-btn" ref={addBtnRef} onClick={() => {
              if (!showAddPopup && addBtnRef.current) {
                const r = addBtnRef.current.getBoundingClientRect();
                setPopupPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
              }
              setShowAddPopup(v => !v);
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path fillRule="evenodd" clipRule="evenodd" d="M7.5 1C7.77614 1 8 1.22386 8 1.5V7H13.5C13.7761 7 14 7.22386 14 7.5C14 7.77614 13.7761 8 13.5 8H8V13.5C8 13.7761 7.77614 14 7.5 14C7.22386 14 7 13.7761 7 13.5V8H1.5C1.22386 8 1 7.77614 1 7.5C1 7.22386 1.22386 7 1.5 7H7V1.5C7 1.22386 7.22386 1 7.5 1Z" fill="#C4C4C4" />
              </svg>
            </button>

            <div className="at-vsep" />

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
          {renderBusyToolbar('Analizing...')}
          {renderFloatingPopups()}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} />,
          doneOverlayHost
        )}
      </>
    );
  }

  if (showGeneratingState) {
    return (
      <>
        <div className="agent-task-editor-area" data-gen-state="generating">
          {renderBusyToolbar('Generating...')}
          {renderFloatingPopups()}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} />,
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
                  <svg className="at-loader" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91"/>
                    <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                    <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91"/>
                    <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91"/>
                    <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91"/>
                    <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                    <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91"/>
                    <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91"/>
                  </svg>
                  <span className="at-generating-label">Running...</span>
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
                  <button className="at-icon-btn" ref={addBtnRef} onClick={handleAddToolbarClick}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path fillRule="evenodd" clipRule="evenodd" d="M7.5 1C7.77614 1 8 1.22386 8 1.5V7H13.5C13.7761 7 14 7.22386 14 7.5C14 7.77614 13.7761 8 13.5 8H8V13.5C8 13.7761 7.77614 14 7.5 14C7.22386 14 7 13.7761 7 13.5V8H1.5C1.22386 8 1 7.77614 1 7.5C1 7.22386 1.22386 7 1.5 7H7V1.5C7 1.22386 7.22386 1 7.5 1Z" fill="#C4C4C4" />
                    </svg>
                  </button>

                  <div className="at-vsep" />

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
                    <span className="at-send-label">Run</span>
                  </button>

                  <div className="at-vsep" />

                  <button
                    className={`at-send-btn at-send-btn-enhance${shouldShowDoneEnhanceHint ? ' has-attention' : ''}`}
                    ref={doneEnhanceBtnRef}
                    data-demo-id="agent-task-enhance"
                    onClick={handleDoneEnhance}
                    disabled={!isDoneEnhanceEnabled}
                    aria-disabled={!isDoneEnhanceEnabled}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                      <path d="M13.5 1.5V5.5H12.9003M9.5 5.5H12.9003M12.9003 5.5C11.9899 3.71916 10.1373 2.5 8 2.5C4.96243 2.5 2.5 4.96243 2.5 8C2.5 11.0376 4.96243 13.5 8 13.5C10.1373 13.5 11.9899 12.2808 12.9003 10.5" stroke="#CED0D6" strokeLinecap="round"/>
                    </svg>
                    <span className="at-send-label">Enhance</span>
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
          {doneEnhanceHintRect && shouldShowDoneEnhanceHint && (
            <PositionedPopup triggerRect={doneEnhanceHintRect} onDismiss={() => setDoneEnhanceHintRect(null)} gap={20}>
              <DoneEnhanceGuidePopup
                arrowPosition={doneEnhanceHintArrowPosition}
                dismissing={isDoneEnhanceHintDismissing}
                onDismiss={() => setDoneEnhanceHintRect(null)}
              />
            </PositionedPopup>
          )}
        </div>
        {shouldRenderDoneOverlay && doneOverlayHost && createPortal(
          <DoneMarkdownOverlay code={currentCode} onOpenProblems={onOpenProblems} onOpenTerminal={onOpenTerminal} onRegenerateSpec={onDoneRegenerate} onFixIssue={handleDoneOverlayFixIssue} onOpenDiffTab={onOpenDiffTab} addPopupFiles={addPopupFiles} attachedFiles={attachedFiles} onAddToProjectContext={onAddAttached} acRunResult={acRunResult} planRunResult={planRunResult} documentSections={documentSections} acWarningBanner={acWarningBanner} inspectionSummary={inspectionSummary} versionHistory={versionHistory} onOpenVersionDiff={onOpenVersionDiff} onCommentsChange={onDoneCommentsChange} commentEntries={doneCommentEntries} removedIssueIndices={removedIssueIndices} highlightedProblemLocation={highlightedProblemLocation} commentResetToken={commentResetToken} uiState={doneOverlayUiState} onUiStateChange={onDoneOverlayUiStateChange} onPendingEnhanceStateChange={handlePendingEnhanceStateChange} onUserInput={handleOverlayUserInput} />,
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
              <svg className="at-loader" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect opacity="0.93" x="2.34961" y="3.76416" width="2" height="4" rx="1" transform="rotate(-45 2.34961 3.76416)" fill="#868A91"/>
                <rect opacity="0.78" x="1" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                <rect opacity="0.69" x="5.17871" y="9.40991" width="2" height="4" rx="1" transform="rotate(45 5.17871 9.40991)" fill="#868A91"/>
                <rect opacity="0.62" x="7" y="11" width="2" height="4" rx="1" fill="#868A91"/>
                <rect opacity="0.48" x="9.41003" y="10.8242" width="2" height="4" rx="1" transform="rotate(-45 9.41003 10.8242)" fill="#868A91"/>
                <rect opacity="0.38" x="11" y="7" width="4" height="2" rx="1" fill="#868A91"/>
                <rect opacity="0.3" x="12.2384" y="2.35001" width="2" height="4" rx="1" transform="rotate(45 12.2384 2.35001)" fill="#868A91"/>
                <rect x="7" y="1" width="2" height="4" rx="1" fill="#868A91"/>
              </svg>
              <span className="at-generating-label">Generating...</span>
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
              <button className="at-icon-btn" ref={addBtnRef} onClick={handleAddToolbarClick}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path fillRule="evenodd" clipRule="evenodd" d="M7.5 1C7.77614 1 8 1.22386 8 1.5V7H13.5C13.7761 7 14 7.22386 14 7.5C14 7.77614 13.7761 8 13.5 8H8V13.5C8 13.7761 7.77614 14 7.5 14C7.22386 14 7 13.7761 7 13.5V8H1.5C1.22386 8 1 7.77614 1 7.5C1 7.22386 1.22386 7 1.5 7H7V1.5C7 1.22386 7.22386 1 7.5 1Z" fill="#C4C4C4" />
                </svg>
              </button>

              <div className="at-vsep" />

		              <button className="at-send-btn" data-demo-id="agent-task-idle-run" onClick={handleGenerate}>
		                <Icon name="run/run" size={16} />
		                <span className="at-send-label">Run</span>
		              </button>
	              <div className="at-vsep" />
	              <button className="at-send-btn" data-demo-id="agent-task-generate" onClick={handleGenerate}>
	                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
	                  <path d="M8 13V3M8 3L3.5 7.5M8 3L12.5 7.5" stroke="#C4C4C4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
	                </svg>
	                <span className="at-send-label">Generate</span>
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
  { id: 't1', label: 'visit-booking.md',   time: '2m',  status: null },
  { id: 't2', label: 'vet-schedules.md',   time: '15m', status: 'running' },
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
  ];
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
    acBaseStatuses: AC_RUN_STATUSES,
    planBaseStatuses: PLAN_RUN_STATUSES,
    initialTaskState: createInteractiveTaskState({
      documentSections,
      genState: isVisitBookingPreset ? 'done' : 'idle',
      acBaseStatuses: AC_RUN_STATUSES,
      planBaseStatuses: PLAN_RUN_STATUSES,
      seedRunResults: isVisitBookingPreset,
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

function AgentTasksPanel({ ctx, tasks, selected, onAdd, onTaskSelect, dismissedSuccessTaskIds = [], onDismissSuccess = null }) {
  const [expanded, setExpanded] = useState(true);
  const dismissedSuccessTaskIdSet = useMemo(
    () => new Set(Array.isArray(dismissedSuccessTaskIds) ? dismissedSuccessTaskIds : []),
    [dismissedSuccessTaskIds]
  );
  const handleFolderToggleKeyDown = useCallback((event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setExpanded((prev) => !prev);
  }, []);

  const handleTaskRowKeyDown = useCallback((event, task) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (task?.indicator === 'success') {
      onDismissSuccess?.(task.id);
    }
    onTaskSelect?.(task);
  }, [onDismissSuccess, onTaskSelect]);

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
      className="main-window-tool-window main-window-tool-window-left"
    >
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        <div
          className="agent-task-row"
          style={{ paddingLeft: 16 }}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          onKeyDown={handleFolderToggleKeyDown}
        >
          <IconChevron expanded={expanded} />
          <Icon name="nodes/folder" size={16} />
          <span className="agent-task-label">{PROJECT_NAME}</span>
        </div>
        {expanded && tasks.map(task => (
          <div
            key={task.id}
            className={`agent-task-row${selected === task.id ? ' selected' : ''}`}
            data-demo-id={`agent-task-row-${toDemoSlug(task.label || task.id)}`}
            style={{ paddingLeft: 48 }}
            role="button"
            tabIndex={0}
            aria-current={selected === task.id ? 'page' : undefined}
            onClick={() => {
              if (task.indicator === 'success') {
                onDismissSuccess?.(task.id);
              }
              onTaskSelect?.(task);
            }}
            onKeyDown={(event) => handleTaskRowKeyDown(event, task)}
          >
            <IconMdTask />
            <span className="agent-task-label">{task.label}</span>
            {task.indicator === 'loading'
              ? <Loader size={16} />
              : selected === task.id
                ? null
                : <>
                    {task.indicator === 'warning' && <IconWarning />}
                    {task.indicator === 'success' && !dismissedSuccessTaskIdSet.has(task.id) && <IconDone />}
                  </>
            }
            <span className="agent-task-time">{task.time}</span>
          </div>
        ))}
      </div>
    </ToolWindow>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('welcome'); // 'welcome' | 'ide' | 'settings'
  const [ideTabs, setIdeTabs] = useState(MY_EDITOR_TABS);
  const [ideTabContents, setIdeTabContents] = useState(MY_EDITOR_TAB_CONTENTS);
  const [interactiveTaskStates, setInteractiveTaskStates] = useState({});
  const [activeEditorTab, setActiveEditorTab] = useState(null);
  const [agentTasks, setAgentTasks] = useState(AGENT_TASKS);
  const [dismissedAgentTaskSuccessIds, setDismissedAgentTaskSuccessIds] = useState([]);
  const [agentTaskExecutionTimings, setAgentTaskExecutionTimings] = useState({});
  const [agentTaskTimeTick, setAgentTaskTimeTick] = useState(() => Date.now());
  const [selectedTask, setSelectedTask] = useState('t1');
  const [ideOpenWindows, setIdeOpenWindows] = useState(['project']);
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
  const [runStatesByTab, setRunStatesByTab] = useState({});
  const [acRunResult, setAcRunResult] = useState(null); // null | string[] — statuses per AC checkbox
  const [planRunResult, setPlanRunResult] = useState(null);
  const [acWarningBanner, setAcWarningBanner] = useState(null);
  const lastRunSectionRef = useRef(null);
  const lastTerminalRunRequestRef = useRef(null);
  const queueTerminalRunRef = useRef(null);
  const currentTerminalRunTabIdRef = useRef(null);
  const currentRunSourceTabIdRef = useRef(null);
  const statusRevealTimeoutsRef = useRef({ ac: [], plan: [] });
  const chainedRunTimeoutRef = useRef(null);
  const acWarningFlowRef = useRef(null);
  const [genState, setGenState] = useState('idle'); // 'idle' | 'done' in the current flow; loading/generating are kept behind a flag
  const [genProgress, setGenProgress] = useState(0);
  const [generatedDocument, setGeneratedDocument] = useState(() => createSpecDocument());
  const [appliedIssueFixes, setAppliedIssueFixes] = useState({ ac: {}, plan: {} });
  const [removedIssueIndices, setRemovedIssueIndices] = useState({ ac: {}, plan: {} });
  const [agentTaskCommentEntries, setAgentTaskCommentEntries] = useState([]);
  const [doneCommentResetToken, setDoneCommentResetToken] = useState(0);
  const [highlightedProblemLocation, setHighlightedProblemLocation] = useState(null);
  const [generationTabId, setGenerationTabId] = useState(null);
  const doneEnhanceFlowRef = useRef(null);
  const seededPresetTaskRef = useRef(false);
  const genTimerRef = useRef(null);
  const terminalDrivenGenerationRef = useRef(false);
  const terminalRunTimeoutsRef = useRef([]);

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

    setPlanDiffUiStates((prev) => ({
      ...prev,
      [resolvedTabId]: uiState && typeof uiState === 'object' ? uiState : {},
    }));
  }, [activeEditorTabId]);

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
    setAgentTaskCommentEntries([]);
    setDoneCommentResetToken((prev) => prev + 1);
  }, []);

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
    setIdeOpenWindows((prev) => (
      prev.includes('agent-tasks') ? prev : [...prev, 'agent-tasks']
    ));

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
  }, [agentTasks, applyInteractiveTaskState, ideTabs, interactiveTaskStates, selectedTask]);

  const requestProblemHighlight = useCallback((rawIndex) => {
    if (!Number.isInteger(rawIndex) || rawIndex < 0) return;

    setHighlightedProblemLocation((prev) => ({
      rawIndex,
      tabId: activeEditorTabId,
      requestKey: (prev?.requestKey ?? 0) + 1,
    }));
  }, [activeEditorTabId]);

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

    const currentAcRunResult =
      currentViewState?.acRunResult
      ?? runtimeState?.taskState?.acRunResult
      ?? acRunResult;
    const currentPlanRunResult =
      currentViewState?.planRunResult
      ?? runtimeState?.taskState?.planRunResult
      ?? planRunResult;
    // Enhance only updates content. It does not confirm checks as a run.
    // Changed AC/Plan items must reset back to unchecked (null).
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
    const rerunPlanOriginalIndices = collectRunRerunOriginalIndices({
      kind: 'plan',
      currentDocumentSections: baseDocumentSections,
      nextDocumentSections: nextDocument,
      currentStatuses: currentPlanRunResult,
      nextStatuses: nextPlanRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
    });
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

  const openPlanDiffTab = useCallback(({ text, statusItem, issueTarget }) => {
    const sourceTabIndex = activeEditorTab ?? 0;
    const sourceTab = ideTabs[sourceTabIndex];
    if (!sourceTab) return;

    const diffTarget = normalizeCommentTarget(issueTarget);
    const sourceViewState = getCommentDrivenViewStateForTaskTab(sourceTab.id);
    const sourceCode = sourceViewState?.code ?? ideTabContents[sourceTab.id]?.code ?? '';
    const diffTabId = buildPlanDiffTabId(sourceTab.id);
    const diffData = buildPlanDiffData({
      sourceCode,
      text,
      statusItem,
      issueTarget,
      sourceTabLabel: sourceTab.label,
    });
    const diffCode = buildPlanDiffTabContent({
      sourceCode,
      text,
      statusItem,
      issueTarget,
      sourceTabLabel: sourceTab.label,
    });
    const diffTabLabel = diffData.title || `Diff ${diffData.sourceTabLabel || sourceTab.label}`;
    const currentTaskCommentEntries = getCommentEntriesForTaskTab(sourceTab.id);
    const initialDiffComments = buildPlanDiffInitialComments(
      currentTaskCommentEntries,
      diffData,
      diffTarget,
    );

    const existingDiffTabIndex = ideTabs.findIndex((tab) => tab.id === diffTabId);
    const nextActiveTabIndex = existingDiffTabIndex >= 0 ? existingDiffTabIndex : sourceTabIndex + 1;
    const diffTab = {
      id: diffTabId,
      label: diffTabLabel,
      icon: <DiffTabIcon />,
      closable: true,
      sourceTabId: sourceTab.id,
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
        diffSourceTabId: sourceTab.id,
        diffTarget,
        diffLineText: text,
        initialDiffComments,
      },
    }));
    setActiveEditorTab(nextActiveTabIndex);
  }, [
    activeEditorTab,
    getCommentDrivenViewStateForTaskTab,
    getCommentEntriesForTaskTab,
    ideTabContents,
    ideTabs,
    syncDiffCommentsToTaskTarget,
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
      icon: <DiffTabIcon />,
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
      });

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
  }, [clearChainedRunTimeout, clearStatusReveal]);

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
      revealRunStatuses('ac', nextAcRunStatuses, acRevealOptions.hasSelectiveRerun
        ? {
            initialResult: acRevealOptions.initialResult,
            indices: acRevealOptions.indices,
          }
        : undefined);
    } else if (section === 'plan') {
      const planRevealOptions = buildSelectiveRunRevealOptions({
        kind: 'plan',
        runRequest: lastRunRequest,
        currentStatuses: planRunResult,
        removedIssueIndices,
      });
      // Clear applied plan fixes — run result is now authoritative
      setAppliedIssueFixes((prev) => ({ ...prev, plan: {} }));
      revealRunStatuses('plan', nextPlanRunStatuses, planRevealOptions.hasSelectiveRerun
        ? {
            initialResult: planRevealOptions.initialResult,
            indices: planRevealOptions.indices,
          }
        : undefined);
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
            preserveAcRunResult: Array.isArray(lastRunRequest?.initialAcRunResult),
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
    const { baseLines = [], onComplete } = options;
    const frames = buildTerminalFrames(lines, baseLines);
    if (frames.length === 0) {
      onComplete?.();
      return;
    }

    setTerminalStreamingForTab(true);

    frames.forEach((frame, idx) => {
      const timeoutId = window.setTimeout(() => {
        setTerminalBlocksForTab(frame);
      }, TERMINAL_RUN_INITIAL_DELAY_MS + TERMINAL_RUN_STEP_DELAY_MS * idx);
      terminalRunTimeoutsRef.current.push(timeoutId);
    });

    const finalTimeoutId = window.setTimeout(() => {
      setTerminalStreamingForTab(false);
      onComplete?.();
    }, TERMINAL_RUN_INITIAL_DELAY_MS + TERMINAL_RUN_STEP_DELAY_MS * frames.length + TERMINAL_RUN_END_DELAY_MS);
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

    const introLines = buildAcceptanceCriteriaIntroLines(runRequest?.taskLabel ?? TERMINAL_TASK_TAB_BASE_LABEL);
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
          revealRunStatuses('ac', nextAcRunStatuses, acRevealOptions.hasSelectiveRerun
            ? {
                initialResult: acRevealOptions.initialResult,
                indices: acRevealOptions.indices,
              }
            : undefined);
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
          ...(acRevealOptions.hasSelectiveRerun
            ? {
                initialResult: acRevealOptions.initialResult,
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

  const openIdeBottomToolWindow = (id) => {
    const stripe = findIdeBottomToolWindowButton(id);
    const alreadyOpen =
      ideOpenWindows.includes(id) ||
      stripe?.getAttribute('aria-pressed') === 'true' ||
      isIdeBottomToolWindowVisible(id);

    if (alreadyOpen) {
      setActiveIdeBottomToolWindow(id);
      return;
    }

    setActiveIdeBottomToolWindow(id);
    if (stripe) {
      stripe.click();
    }
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
    setPendingTerminalRunForTab(nextRunRequest, nextTerminalTabId);
    openIdeBottomToolWindow('terminal');
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
      pendingCommentEntriesSnapshot,
      hasPendingReruns,
      hasPendingComments,
      hasSpecChanges,
    } = pendingDoneSpecState;
    if (!hasSpecChanges && !hasPendingComments && !hasPendingReruns) {
      return;
    }

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
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
      commentsAlreadyCleared: hasPendingComments,
      versionCommit: (hasSpecChanges || hasPendingReruns)
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
    if (hasPendingComments) {
      clearTaskCommentsForTab(currentTabId);
    }
    setGenState(AGENT_TASK_LOADING_STATE_ENABLED ? 'loading' : 'generating');
  };

  const handleDoneIssueFix = useCallback(({ kind, index }) => {
    if (!Number.isInteger(index) || index < 0) return;
    const fixConfig = getIssueQuickFixConfig(kind, index);
    if (!fixConfig) return;

    const currentTabId = generationTabId ?? ideTabs[activeEditorTab ?? 0]?.id;
    const terminalTabId = currentTabId ? buildTerminalSessionTabId(currentTabId) : null;
    const visibleIndex = mapOriginalIssueIndexToVisible(kind, index, removedIssueIndices);
    if (!Number.isInteger(visibleIndex) || visibleIndex < 0) return;

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

    if (currentTabId) {
      setIdeTabContents((prev) => {
        const currentEntry = prev[currentTabId] ?? { language: 'markdown', code: '' };
        return {
          ...prev,
          [currentTabId]: {
            ...currentEntry,
            language: 'markdown',
            code: applyIssueQuickFixToCode(currentEntry.code ?? '', {
              kind,
              index: visibleIndex,
              replacementText: fixConfig.replacementText,
            }),
          },
        };
      });
    }

    setGeneratedDocument((prev) => applyIssueQuickFixToDocumentSections(prev, {
      kind,
      index: visibleIndex,
      replacementText: fixConfig.replacementText,
    }));

    setAppliedIssueFixes((prev) => ({
      ...prev,
      [kind]: {
        ...(prev[kind] ?? {}),
        [index]: true,
      },
    }));

    // Immediately show empty checkbox — run will confirm the fix with green status
    const setResult = kind === 'ac' ? setAcRunResult : setPlanRunResult;
    setResult((prev) => {
      if (!Array.isArray(prev)) return prev;
      const next = [...prev];
      next[visibleIndex] = null;
      return next;
    });

    if (currentTabId) {
      clearTaskCommentTargetForTab(currentTabId, { kind, index });
    }

  }, [
    activeEditorTab,
    clearAcWarningFlow,
    clearTaskCommentTargetForTab,
    clearChainedRunTimeout,
    clearStatusReveal,
    clearTerminalRunAnimation,
    generationTabId,
    ideTabs,
    removedIssueIndices,
    setAcRunResult,
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

  useEffect(() => {
    if (screen !== 'ide' || seededPresetTaskRef.current) return;
    seededPresetTaskRef.current = true;
    handleAgentTaskSelect('t1');
  }, [screen, handleAgentTaskSelect]);

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
          if (item) {
            const value = textarea.value;
            const cursorPos = textarea.selectionStart;
            const textBeforeCursor = value.slice(0, cursorPos);
            const triggerIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('#'));
            const before = value.slice(0, triggerIdx + 1);
            const after = value.slice(cursorPos);
            const newValue = before + item.label + ' ' + after;
            textarea.value = newValue;
            const newPos = triggerIdx + 1 + item.label.length + 1;
            textarea.setSelectionRange(newPos, newPos);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            // Add file to attached files list
            updateAttachedFilesForTab(files => {
              if (files.some(f => f.label === item.label)) return files;
              return [...files, { label: item.label, description: item.description }];
            });
            setEditorCompletion(null);
          }
        }
      } else if (e.key === 'Escape') {
        setEditorCompletion(null);
      }
    };

    document.addEventListener('input', handleEditorInput, true);
    document.addEventListener('keydown', handleEditorKeyDown, true);

    return () => {
      document.removeEventListener('input', handleEditorInput, true);
      document.removeEventListener('keydown', handleEditorKeyDown, true);
    };
  }, [screen, updateAttachedFilesForTab]);

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

      const secondary = treeNode.querySelector('.tree-node-secondary');
      if (!(secondary instanceof HTMLElement)) return;

      const rawIndex = parseProblemRawIndexFromSecondaryText(secondary.textContent ?? '');
      if (!Number.isInteger(rawIndex)) return;

      requestProblemHighlight(rawIndex);
    };

    document.addEventListener('click', handleProblemsNodeClick, true);

    return () => {
      document.removeEventListener('click', handleProblemsNodeClick, true);
    };
  }, [requestProblemHighlight]);

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
    setIdeOpenWindows((prev) => (
      prev.includes('agent-tasks') ? prev : [...prev, 'agent-tasks']
    ));
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
          commentsAlreadyCleared = false,
          usesDirectSwap = false,
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
          resetDoneComments();
        };

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
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
          });
          // Store rerun indices so Run knows what to check after Enhance
          if (sourceTabId && (Array.isArray(rerunAcOriginalIndices) || Array.isArray(rerunPlanOriginalIndices))) {
            setInteractiveTaskStates((prev) => ({
              ...prev,
              [sourceTabId]: {
                ...(prev[sourceTabId] ?? {}),
                pendingRerunAcOriginalIndices: Array.isArray(rerunAcOriginalIndices) && rerunAcOriginalIndices.length > 0 ? rerunAcOriginalIndices : undefined,
                pendingRerunPlanOriginalIndices: Array.isArray(rerunPlanOriginalIndices) && rerunPlanOriginalIndices.length > 0 ? rerunPlanOriginalIndices : undefined,
              },
            }));
          }
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
          // Store rerun indices so Run knows what to check after Enhance
          if (sourceTabId && (Array.isArray(rerunAcOriginalIndices) || Array.isArray(rerunPlanOriginalIndices))) {
            setInteractiveTaskStates((prev) => ({
              ...prev,
              [sourceTabId]: {
                ...(prev[sourceTabId] ?? {}),
                pendingRerunAcOriginalIndices: Array.isArray(rerunAcOriginalIndices) && rerunAcOriginalIndices.length > 0 ? rerunAcOriginalIndices : undefined,
                pendingRerunPlanOriginalIndices: Array.isArray(rerunPlanOriginalIndices) && rerunPlanOriginalIndices.length > 0 ? rerunPlanOriginalIndices : undefined,
              },
            }));
          }
          clearDoneCommentsOnce();
          setGeneratedDocument(nextDocument);
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
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
            clearDoneCommentsOnce();
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
          setAppliedIssueFixes(nextAppliedIssueFixes);
          setRemovedIssueIndices(nextRemovedIssueIndices);
          startDoneEnhanceStatusReveal(nextPlanRunResult, nextAcRunResult, {
            currentPlanStatuses: currentPlanRunResult,
            currentAcStatuses: currentAcRunResult,
            currentRemovedIssueIndices,
            nextRemovedIssueIndices,
            rerunPlanOriginalIndices,
            rerunAcOriginalIndices,
          });
          // Store rerun indices so Run knows what to check after Enhance
          if (sourceTabId && (Array.isArray(rerunAcOriginalIndices) || Array.isArray(rerunPlanOriginalIndices))) {
            setInteractiveTaskStates((prev) => ({
              ...prev,
              [sourceTabId]: {
                ...(prev[sourceTabId] ?? {}),
                pendingRerunAcOriginalIndices: Array.isArray(rerunAcOriginalIndices) && rerunAcOriginalIndices.length > 0 ? rerunAcOriginalIndices : undefined,
                pendingRerunPlanOriginalIndices: Array.isArray(rerunPlanOriginalIndices) && rerunPlanOriginalIndices.length > 0 ? rerunPlanOriginalIndices : undefined,
              },
            }));
          }
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
    genState,
    generatedDocument,
    generationTabId,
    isTerminalStreaming,
    pendingTerminalRun,
    resetDoneComments,
    resetRunUiForTab,
    startDoneEnhanceStatusReveal,
    terminalPermissionPrompt,
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
    if (doneEnhanceFlowRef.current?.commentsAlreadyCleared) {
      return;
    }
    setAgentTaskCommentEntries(nextEntries);
  }, []);
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

    if (!hasSpecChanges && !hasPendingComments) {
      return {
        didCommit: false,
        sourceTabId,
        nextAcRunResult,
        nextPlanRunResult,
        currentAcRunResult,
        currentPlanRunResult,
        currentRemovedIssueIndices,
        nextRemovedIssueIndices,
        rerunAcOriginalIndices,
        rerunPlanOriginalIndices,
        hasPendingReruns,
      };
    }

    const terminalTabId = buildTerminalSessionTabId(sourceTabId);

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
    setAcRunResult(buildRunStatusesRevealSeed({
      kind: 'ac',
      currentStatuses: currentAcRunResult,
      nextStatuses: nextAcRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
      rerunOriginalIndices: rerunAcOriginalIndices,
    }));
    setPlanRunResult(buildRunStatusesRevealSeed({
      kind: 'plan',
      currentStatuses: currentPlanRunResult,
      nextStatuses: nextPlanRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
      rerunOriginalIndices: rerunPlanOriginalIndices,
    }));
    if (options?.applyPendingComments !== false) {
      resetDoneComments();
    }
    setAcWarningBannerForTab(null, terminalTabId);
    setPendingTerminalRunForTab(null, terminalTabId);
    setTerminalPermissionPromptForTab(null, terminalTabId);
    setRunStateForTab('default', sourceTabId);
    currentRunSourceTabIdRef.current = null;
    if (hasSpecChanges) {
      updateSpecVersionsForTab((prevHistory) => appendSpecVersionHistoryEntry(prevHistory, {
        currentCode,
        nextCode,
        currentCommentEntries: pendingCommentEntriesSnapshot,
      }), sourceTabId);
    }

    return {
      didCommit: true,
      sourceTabId,
      nextAcRunResult,
      nextPlanRunResult,
      currentAcRunResult,
      currentPlanRunResult,
      currentRemovedIssueIndices,
      nextRemovedIssueIndices,
      rerunAcOriginalIndices,
      rerunPlanOriginalIndices,
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
    const commitResult = commitDoneSpecUpdate({ applyPendingComments: false });
    const sourceTabId = commitResult?.sourceTabId ?? generationTabId ?? activeEditorTabId;
    const sectionTitle = typeof input === 'string' ? input : input?.sectionTitle;
    const terminalTabId = sourceTabId ? buildTerminalSessionTabId(sourceTabId) : null;
    const isFullDoneRun = input == null;

    // Use pending rerun indices from Enhance if available
    const taskState = sourceTabId ? interactiveTaskStates[sourceTabId] : null;
    const rerunAcOriginalIndices = commitResult?.rerunAcOriginalIndices
      ?? taskState?.pendingRerunAcOriginalIndices
      ?? [];
    const rerunPlanOriginalIndices = commitResult?.rerunPlanOriginalIndices
      ?? taskState?.pendingRerunPlanOriginalIndices
      ?? [];
    const hasSelectiveAcRerun = !isFullDoneRun && rerunAcOriginalIndices.length > 0;
    const hasSelectivePlanRerun = !isFullDoneRun && rerunPlanOriginalIndices.length > 0;

    const initialAcRunResult = hasSelectiveAcRerun
      ? buildRunStatusesRevealSeed({
          kind: 'ac',
          currentStatuses: commitResult?.currentAcRunResult ?? activeAgentTaskAcRunResult,
          nextStatuses: commitResult?.nextAcRunResult ?? activeAgentTaskAcRunResult,
          currentRemovedIssueIndices: commitResult?.currentRemovedIssueIndices ?? activeAgentTaskRemovedIssueIndices,
          nextRemovedIssueIndices: commitResult?.nextRemovedIssueIndices ?? activeAgentTaskRemovedIssueIndices,
          rerunOriginalIndices: rerunAcOriginalIndices,
        })
      : null;
    const initialPlanRunResult = hasSelectivePlanRerun
      ? buildRunStatusesRevealSeed({
          kind: 'plan',
          currentStatuses: commitResult?.currentPlanRunResult ?? activeAgentTaskPlanRunResult,
          nextStatuses: commitResult?.nextPlanRunResult ?? activeAgentTaskPlanRunResult,
          currentRemovedIssueIndices: commitResult?.currentRemovedIssueIndices ?? activeAgentTaskRemovedIssueIndices,
          nextRemovedIssueIndices: commitResult?.nextRemovedIssueIndices ?? activeAgentTaskRemovedIssueIndices,
          rerunOriginalIndices: rerunPlanOriginalIndices,
        })
      : null;
    if (terminalTabId) {
      setAcWarningBannerForTab(null, terminalTabId);
    }

    // Clear pending rerun indices after using them
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
      taskLabel: currentAgentTaskLabel,
      initialAcRunResult,
      initialPlanRunResult,
      rerunAcOriginalIndices: hasSelectiveAcRerun ? rerunAcOriginalIndices : [],
      rerunPlanOriginalIndices: hasSelectivePlanRerun ? rerunPlanOriginalIndices : [],
    }, {
      preserveAcRunResult: hasSelectiveAcRerun,
      preservePlanRunResult: hasSelectivePlanRerun,
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
      return cloneElement(panel, {
        treeData: buildProblemsTreeForTab(
          currentProblemsTab,
          currentProblemsTab?.id?.startsWith('agent-task-') || currentProblemsTab?.label?.endsWith('.md')
            ? agentTaskInspectionSummary.issues
            : null,
          currentProblemsTab?.id?.startsWith('agent-task-') || currentProblemsTab?.label?.endsWith('.md')
            ? agentTaskCommentEntries
            : []
        ),
        onNodeSelect: handleProblemsNodeSelect,
      });
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
            { id: 'terminal',    icon: 'toolwindows/terminal@20x20', tooltip: 'Terminal', panel: 'bottom', section: 'bottom' },
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
            if (id === 'agent-tasks') return <AgentTasksPanel ctx={ctx} tasks={agentTaskPanelTasks} selected={navigatedAgentTaskId} onAdd={openNewAgentTask} onTaskSelect={handleAgentTaskSelect} dismissedSuccessTaskIds={dismissedAgentTaskSuccessIds} onDismissSuccess={(taskId) => setDismissedAgentTaskSuccessIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))} />;
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

  const activeTabId = activeEditorTabMeta?.id ?? null;
  const activeTabContent = activeEditorTabContentEntry;
  const isAgentTaskTab = activeTabId?.startsWith('agent-task-');
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
      ? (activePlanDiffTarget && activePlanDiffSourceTabId
          ? buildPlanDiffInitialComments(
              getCommentEntriesForTaskTab(activePlanDiffSourceTabId),
              activePlanDiffData,
              activePlanDiffTarget,
            )
          : normalizeStoredDiffCommentsState(activeTabContent?.initialDiffComments))
      : {};
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
  const activePlanDiffUiState = activeTabId ? (planDiffUiStates[activeTabId] ?? null) : null;
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

        editorTabs={ideTabs}
        editorTabContents={ideTabContents}
        activeEditorTab={activeEditorTab}
        onEditorTabChange={handleEditorTabChange}
        onEditorTabClose={handleEditorTabClose}
        onEditorCodeChange={(code) => {
          const tabId = ideTabs[activeEditorTab]?.id;
          if (!tabId?.startsWith('agent-task-')) return;
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
            ? <AgentTaskEditorArea genState={genState} genProgress={genProgress} onSend={startAgentTaskGeneration} onStop={() => setGenState('idle')} onRegenerate={startAgentTaskGeneration} onDoneRegenerate={handleDoneRegenerate} onFixIssue={handleDoneIssueFix} onOpenDiffTab={openPlanDiffTab} onOpenVersionDiff={handleDoneVersionSelect} attachedFiles={attachedFiles} onRemoveAttached={(idx) => updateAttachedFilesForTab((files) => files.filter((_, i) => i !== idx))} onAddAttached={(item) => updateAttachedFilesForTab((files) => files.some((file) => file.label === item.label) ? files : [...files, { label: item.label, description: item.description }])} currentCode={activeAgentTaskCode} documentSections={activeAgentTaskDocumentSections} onOpenProblems={() => toggleIdeBottomToolWindow('problems')} onOpenTerminal={handleDoneOpenTerminal} addPopupFiles={addPopupFiles} acRunResult={activeAgentTaskAcRunResult} planRunResult={activeAgentTaskPlanRunResult} acWarningBanner={activeEditorAcWarningBanner} inspectionSummary={agentTaskInspectionSummary} versionHistory={activeVersionHistory} removedIssueIndices={activeAgentTaskRemovedIssueIndices} highlightedProblemLocation={highlightedProblemLocation?.tabId === activeEditorTabId ? highlightedProblemLocation : null} doneCommentEntries={agentTaskCommentEntries} onDoneCommentsChange={handleDoneCommentsChange} commentResetToken={doneCommentResetToken} preserveDoneOverlayDuringBusy={Boolean(doneEnhanceFlowRef.current) && genState === 'loading'} runState={runState} doneOverlayUiState={activeDoneOverlayUiState} onDoneOverlayUiStateChange={handleActiveDoneOverlayUiStateChange} specSessionKey={activeEditorTabId} />
            : (isDiffTab && activePlanDiffData
                ? (
                  <PlanDiffEditorArea
                    diffData={activePlanDiffData}
                    viewerData={activePlanDiffViewerData}
                    initialDiffComments={activePlanDiffComments}
                    onDiffCommentsChange={(comments) => {
                      if (!activePlanDiffTarget || !activePlanDiffSourceTabId) return;
                      syncDiffCommentsToTaskTarget({
                        sourceTabId: activePlanDiffSourceTabId,
                        target: activePlanDiffTarget,
                        comments,
                        sectionTitle: activePlanDiffTarget.kind === 'plan' ? 'Plan' : 'Acceptance Criteria',
                        line: activeTabContent?.diffLineText ?? '',
                      });
                    }}
                    onRowDelete={handlePlanDiffRowDelete}
                    onRowFix={handlePlanDiffRowFix}
                    uiState={activePlanDiffUiState}
                    onUiStateChange={(uiState) => updatePlanDiffUiStateForTab(uiState, activeTabId)}
                  />
                )
                : undefined)
        }

        projectTreeData={projectTreeData}

        leftStripeItems={[
          ...MY_LEFT_STRIPE,
          { id: '_sep',        separator: true,                                                    section: 'top' },
          { id: 'agent-tasks', icon: AGENT_TASKS_ICON, tooltip: 'Agent Tasks', section: 'top' },
          { id: 'terminal',    icon: 'toolwindows/terminal@20x20',  tooltip: 'Terminal',   panel: 'bottom', section: 'bottom' },
          { id: 'git',         icon: 'toolwindows/vcs@20x20',       tooltip: 'Git',        panel: 'bottom', section: 'bottom' },
          { id: 'problems',    icon: 'toolwindows/problems@20x20',  tooltip: 'Problems',   panel: 'bottom', section: 'bottom' },
        ]}
        rightStripeItems={DEFAULT_RIGHT_STRIPE_ITEMS}
        defaultOpenToolWindows={ideOpenWindows}

        leftPanelContent={(id, ctx) => {
          if (id === 'agent-tasks') return <AgentTasksPanel ctx={ctx} tasks={agentTaskPanelTasks} selected={navigatedAgentTaskId} onAdd={openNewAgentTask} onTaskSelect={handleAgentTaskSelect} dismissedSuccessTaskIds={dismissedAgentTaskSuccessIds} onDismissSuccess={(taskId) => setDismissedAgentTaskSuccessIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]))} />;
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
              const newValue = before + item.label + ' ' + after;
              textarea.value = newValue;
              const newPos = triggerIdx + 1 + item.label.length + 1;
              textarea.setSelectionRange(newPos, newPos);
              textarea.dispatchEvent(new Event('input', { bubbles: true }));
              textarea.focus();
            }
            // Add file to attached files list
            updateAttachedFilesForTab(files => {
              if (files.some(f => f.label === item.label)) return files;
              return [...files, { label: item.label, description: item.description }];
            });
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
