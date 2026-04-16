import { useEffect, useMemo, useState } from 'react';
import { MainToolbar, MainWindow, ThemeProvider } from '@jetbrains/int-ui-kit';
import './App.css';
import { DiffTabIcon, PlanDiffEditorArea } from './PlanDiffView.jsx';
import { PLAN_DIFF_PAGE_STORAGE_KEY } from './planDiffPageState.js';

const PLAN_DIFF_PAGE_PROJECT_NAME = 'payment-service';
const PLAN_DIFF_PAGE_BRANCH_NAME = 'feature/visit-booking';

const DEFAULT_PLAN_DIFF_ROWS = [
  {
    id: 'context-17',
    kind: 'context',
    oldNumber: 18,
    newNumber: 18,
    text: '        this.vetRepository = vetRepository;',
    fragments: [{ text: '        this.vetRepository = vetRepository;', tone: 'plain' }],
  },
  {
    id: 'removed-18',
    kind: 'removed',
    oldNumber: 19,
    newNumber: null,
    text: '    }',
    fragments: [{ text: '    }', tone: 'removed' }],
  },
  {
    id: 'added-18',
    kind: 'added',
    oldNumber: null,
    newNumber: 19,
    text: '        this.timeSlots = IntStream.rangeClosed(9, 16)',
    fragments: [
      { text: '        this.timeSlots = ', tone: 'plain' },
      { text: 'IntStream.rangeClosed(9, 16)', tone: 'added' },
    ],
  },
  {
    id: 'added-19',
    kind: 'added',
    oldNumber: null,
    newNumber: 20,
    text: '            .mapToObj(hour -> LocalTime.of(hour, 0))',
    fragments: [{ text: '            .mapToObj(hour -> LocalTime.of(hour, 0))', tone: 'added' }],
  },
  {
    id: 'added-20',
    kind: 'added',
    oldNumber: null,
    newNumber: 21,
    text: '            .toList();',
    fragments: [{ text: '            .toList();', tone: 'added' }],
  },
  {
    id: 'added-21',
    kind: 'added',
    oldNumber: null,
    newNumber: 22,
    text: '    }',
    fragments: [{ text: '    }', tone: 'added' }],
  },
  {
    id: 'context-22',
    kind: 'context',
    oldNumber: 23,
    newNumber: 23,
    text: '',
    fragments: [{ text: ' ', tone: 'plain' }],
  },
  {
    id: 'context-23',
    kind: 'context',
    oldNumber: 24,
    newNumber: 24,
    text: '@ModelAttribute("timeSlots")',
    fragments: [{ text: '@ModelAttribute("timeSlots")', tone: 'plain' }],
  },
  {
    id: 'context-24',
    kind: 'context',
    oldNumber: 25,
    newNumber: 25,
    text: 'public List<LocalTime> populateTimeSlots() {',
    fragments: [{ text: 'public List<LocalTime> populateTimeSlots() {', tone: 'plain' }],
  },
  {
    id: 'removed-25',
    kind: 'removed',
    oldNumber: 26,
    newNumber: null,
    text: '    List<LocalTime> slots = new ArrayList<>();',
    fragments: [{ text: '    List<LocalTime> slots = new ArrayList<>();', tone: 'removed' }],
  },
  {
    id: 'removed-26',
    kind: 'removed',
    oldNumber: 27,
    newNumber: null,
    text: '    for (int hour = 9; hour <= 16; hour++) {',
    fragments: [{ text: '    for (int hour = 9; hour <= 16; hour++) {', tone: 'removed' }],
  },
  {
    id: 'removed-27',
    kind: 'removed',
    oldNumber: 28,
    newNumber: null,
    text: '        slots.add(LocalTime.of(hour, 0));',
    fragments: [{ text: '        slots.add(LocalTime.of(hour, 0));', tone: 'removed' }],
  },
  {
    id: 'removed-28',
    kind: 'removed',
    oldNumber: 29,
    newNumber: null,
    text: '    }',
    fragments: [{ text: '    }', tone: 'removed' }],
  },
  {
    id: 'removed-29',
    kind: 'removed',
    oldNumber: 30,
    newNumber: null,
    text: '    return slots;',
    fragments: [{ text: '    return slots;', tone: 'removed' }],
  },
  {
    id: 'added-25',
    kind: 'added',
    oldNumber: null,
    newNumber: 26,
    text: '    return this.timeSlots;',
    fragments: [{ text: '    return this.timeSlots;', tone: 'added' }],
  },
  {
    id: 'context-26',
    kind: 'context',
    oldNumber: 31,
    newNumber: 27,
    text: '}',
    fragments: [{ text: '}', tone: 'plain' }],
  },
];

const DEFAULT_PLAN_DIFF_DATA = {
  sourceTabLabel: 'VisitController.java',
  title: 'Diff VisitController.java',
  differenceCount: 2,
  focusRowId: 'added-25',
  status: 'warning',
  lineText: 'Time slots never change at runtime — build the list once in the constructor',
  rows: DEFAULT_PLAN_DIFF_ROWS,
};

const DEFAULT_PLAN_DIFF_VIEWER_DATA = {
  planItems: [
    { id: 'plan-1', text: 'Implement aaaa for BbbbService', status: 'passed', files: ['app.py'], isCurrent: true },
    { id: 'plan-2', text: 'Add cccc to DdddManager', status: 'passed', files: ['string_validator.py'] },
    { id: 'plan-3', text: 'Integrate with @AaaaComponent', status: 'passed', files: ['list_operations.py', 'math_utils.py', 'string_validator.py', 'text_analyzer.py'] },
  ],
  changedFiles: ['app.py'],
};

function buildDiffCodeFromRows(rows = []) {
  return rows.map((row) => {
    const prefix = row.kind === 'added' ? '+' : row.kind === 'removed' ? '-' : ' ';
    return `${prefix} ${row.text || ''}`;
  }).join('\n');
}

const DEFAULT_PLAN_DIFF_PAGE_PAYLOAD = {
  tabLabel: 'Diff VisitController.java',
  diffCode: buildDiffCodeFromRows(DEFAULT_PLAN_DIFF_ROWS),
  diffData: DEFAULT_PLAN_DIFF_DATA,
};

function normalizePlanDiffPagePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return DEFAULT_PLAN_DIFF_PAGE_PAYLOAD;
  }

  const diffRows = Array.isArray(payload.diffData?.rows) ? payload.diffData.rows : DEFAULT_PLAN_DIFF_ROWS;
  const diffData = {
    ...DEFAULT_PLAN_DIFF_DATA,
    ...(payload.diffData ?? {}),
    rows: diffRows,
  };

  return {
    tabLabel: typeof payload.tabLabel === 'string' && payload.tabLabel.trim().length > 0
      ? payload.tabLabel
      : DEFAULT_PLAN_DIFF_PAGE_PAYLOAD.tabLabel,
    diffCode: typeof payload.diffCode === 'string' && payload.diffCode.length > 0
      ? payload.diffCode
      : buildDiffCodeFromRows(diffRows),
    diffData,
  };
}

function readPlanDiffPagePayload() {
  if (typeof window === 'undefined') {
    return DEFAULT_PLAN_DIFF_PAGE_PAYLOAD;
  }

  try {
    const rawPayload = window.localStorage.getItem(PLAN_DIFF_PAGE_STORAGE_KEY);
    if (!rawPayload) {
      return DEFAULT_PLAN_DIFF_PAGE_PAYLOAD;
    }

    return normalizePlanDiffPagePayload(JSON.parse(rawPayload));
  } catch {
    return DEFAULT_PLAN_DIFF_PAGE_PAYLOAD;
  }
}

export default function PlanDiffPage() {
  const [pagePayload, setPagePayload] = useState(() => readPlanDiffPagePayload());
  const [viewportHeight, setViewportHeight] = useState(() => (
    typeof window === 'undefined' ? 900 : window.innerHeight
  ));

  const handleRowDelete = (rowId) => {
    setPagePayload((prev) => {
      const nextRows = (prev.diffData?.rows ?? []).filter((row) => row.id !== rowId);
      const nextDiffData = {
        ...prev.diffData,
        rows: nextRows,
      };
      return {
        ...prev,
        diffCode: buildDiffCodeFromRows(nextRows),
        diffData: nextDiffData,
      };
    });
  };

  useEffect(() => {
    document.title = pagePayload.tabLabel;
  }, [pagePayload.tabLabel]);

  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };

    const handleStorage = (event) => {
      if (event.key && event.key !== PLAN_DIFF_PAGE_STORAGE_KEY) return;
      setPagePayload(readPlanDiffPagePayload());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const editorTabs = useMemo(() => ([{
    id: 'standalone-plan-diff',
    label: pagePayload.tabLabel,
    icon: <DiffTabIcon />,
    closable: false,
  }]), [pagePayload.tabLabel]);

  const editorTabContents = useMemo(() => ({
    'standalone-plan-diff': {
      code: pagePayload.diffCode,
      language: 'text',
      topBar: <PlanDiffEditorArea diffData={pagePayload.diffData} viewerData={DEFAULT_PLAN_DIFF_VIEWER_DATA} onRowDelete={handleRowDelete} />,
    },
  }), [pagePayload.diffCode, pagePayload.diffData]);

  return (
    <ThemeProvider defaultTheme="dark">
      <div style={{ minHeight: '100vh', background: '#1B1C1F' }}>
        <MainWindow
          key={pagePayload.tabLabel}
          height={Math.max(820, viewportHeight)}
          projectName={PLAN_DIFF_PAGE_PROJECT_NAME}
          projectIcon="SD"
          projectColor="blue"
          branchName={PLAN_DIFF_PAGE_BRANCH_NAME}
          toolbar={(
            <MainToolbar
              projectName={PLAN_DIFF_PAGE_PROJECT_NAME}
              projectIcon="SD"
              projectColor="blue"
              branchName={PLAN_DIFF_PAGE_BRANCH_NAME}
              runConfig="Current File"
            />
          )}
          editorTabs={editorTabs}
          editorTabContents={editorTabContents}
          activeEditorTab={0}
          onEditorTabChange={() => {}}
          leftStripeItems={[]}
          rightStripeItems={[]}
          defaultOpenToolWindows={[]}
          projectTreeData={[]}
          statusBarProps={{
            breadcrumbs: [
              { label: PLAN_DIFF_PAGE_PROJECT_NAME, module: true },
              { label: 'src/main/java' },
              { label: pagePayload.diffData?.sourceTabLabel ?? pagePayload.tabLabel, icon: true, iconName: 'fileTypes/java' },
            ],
            widgets: [
              { type: 'text', text: 'Unified viewer' },
              { type: 'text', text: 'UTF-8' },
              { type: 'text', text: 'LF' },
            ],
          }}
        />
      </div>
    </ThemeProvider>
  );
}
