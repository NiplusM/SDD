// ─── IDE Prototype Builder — Figma Plugin ────────────────────────────────────
figma.showUI(__html__, { width: 380, height: 580 });

// ─── Utilities ────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  hex = (hex || '#888').replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return { r: parseInt(hex.slice(0,2),16)/255, g: parseInt(hex.slice(2,4),16)/255, b: parseInt(hex.slice(4,6),16)/255 };
}

function solid(hex, a) {
  if (!hex || hex === 'transparent' || !hex.startsWith('#')) return [];
  return [{ type: 'SOLID', color: hexToRgb(hex), opacity: a === undefined ? 1 : a }];
}

function stroke(node, hex, w) {
  node.strokes = [{ type: 'SOLID', color: hexToRgb(hex) }];
  node.strokeWeight = w || 1;
  node.strokeAlign = 'INSIDE';
}

function fr(parent, name, x, y, w, h, hex, a) {
  var f = figma.createFrame();
  f.name = name; f.x = x; f.y = y;
  f.resize(Math.max(w, 1), Math.max(h, 1));
  f.fills = solid(hex, a);
  f.clipsContent = true;
  if (parent) parent.appendChild(f);
  return f;
}

function rc(parent, name, x, y, w, h, hex, a) {
  var r = figma.createRectangle();
  r.name = name; r.x = x; r.y = y;
  r.resize(Math.max(w, 1), Math.max(h, 1));
  r.fills = solid(hex, a);
  if (parent) parent.appendChild(r);
  return r;
}

async function tx(parent, text, x, y, hex, size, weight, mono) {
  var fam = mono ? 'JetBrains Mono' : 'Inter';
  var sty = weight >= 600 ? 'Semi Bold' : weight >= 500 ? 'Medium' : 'Regular';
  try { await figma.loadFontAsync({ family: fam, style: sty }); } catch(_) {
    fam = 'Inter'; sty = 'Regular';
    try { await figma.loadFontAsync({ family: fam, style: sty }); } catch(__) {}
  }
  var t = figma.createText();
  t.x = x; t.y = y;
  try { t.fontName = { family: fam, style: sty }; } catch(_) { t.fontName = { family: 'Inter', style: 'Regular' }; }
  t.fontSize = size || 12;
  t.fills = solid(hex || '#BBBBBB');
  t.characters = String(text || '');
  if (parent) parent.appendChild(t);
  return t;
}

async function preloadFonts() {
  var fonts = [
    { family: 'Inter', style: 'Regular' },
    { family: 'Inter', style: 'Medium' },
    { family: 'Inter', style: 'Semi Bold' },
    { family: 'JetBrains Mono', style: 'Regular' },
  ];
  for (var i = 0; i < fonts.length; i++) {
    try { await figma.loadFontAsync(fonts[i]); } catch(_) {}
  }
}

// ─── Color palette (defaults, overridden by MD tokens) ────────────────────────

var C = {
  base:        '#1B1C1F',
  surface:     '#1E2022',
  card:        '#212326',
  elevated:    '#2B2D30',
  toolbar:     '#1B1C1F',
  border:      '#383B40',
  textPrimary: '#D1D3D9',
  textDefault: '#BBBBBB',
  textMuted:   '#9FA2A8',
  textLink:    '#548AF7',
  blue:        '#3574F0',
  green:       '#499C54',
  yellow:      '#F2C55C',
  red:         '#DB5C5C',
  selection:   '#2E436E',
  diffRm:      '#3D1515',
  diffAdd:     '#1B3D1B',
  warnBg:      '#44321D',
  warnBorder:  '#694820',
  successBg:   '#253627',
  successBorder:'#375239',
  tooltipBg:   '#33353B',
  overlayBg:   '#191A1C',
};

// Apply color tokens from both MD files
function applyColors(ds, spec) {
  // From design system (token → hex)
  if (ds && ds.colors) {
    var map = {
      'bg/base': 'base', 'bg/surface': 'surface', 'bg/card': 'card',
      'bg/elevated': 'elevated', 'text/primary': 'textPrimary',
      'text/default': 'textDefault', 'text/muted': 'textMuted',
      'text/link': 'textLink', 'accent/blue': 'blue',
      'accent/green': 'green', 'accent/yellow': 'yellow',
      'accent/red': 'red', 'border/default': 'border',
      'selection/active': 'selection',
    };
    for (var token in ds.colors) {
      if (map[token]) C[map[token]] = ds.colors[token];
    }
  }
  // From spec "Key Colors" section (more specific overrides)
  if (spec && spec.colors) {
    var sc = spec.colors;
    if (sc['overall_ide_background']) C.base = sc['overall_ide_background'];
    if (sc['done_overlay_background']) C.overlayBg = sc['done_overlay_background'];
    if (sc['blue_accent_/_links']) C.blue = sc['blue_accent_/_links'];
    if (sc['muted_success_banner_background']) C.successBg = sc['muted_success_banner_background'];
    if (sc['success_banner_borders']) C.successBorder = sc['success_banner_borders'];
    if (sc['active_diff_file_row']) C.selection = sc['active_diff_file_row'];
  }
}

// ─── Global metadata from spec ────────────────────────────────────────────────

var META = {
  project:    'spring-petclinic',
  branch:     'feature/visit-booking',
  runConfig:  'PetClinicApplication',
  primaryTask:'visit-booking.md',
  secondaryTask:'vet-schedules.md',
  breadcrumbs:'spring-petclinic / src/main/java / VisitController.java',
};

function applyMeta(spec) {
  if (!spec || !spec.meta) return;
  var m = spec.meta;
  if (m['project_name']) META.project = m['project_name'];
  if (m['branch'])       META.branch  = m['branch'];
  if (m['run_configuration']) META.runConfig = m['run_configuration'];
  if (m['primary_task']) META.primaryTask = m['primary_task'];
  if (m['secondary_task']) META.secondaryTask = m['secondary_task'];
  if (m['primary_breadcrumbs']) META.breadcrumbs = m['primary_breadcrumbs'];
}

// ─── Shell constants ──────────────────────────────────────────────────────────

var TOOLBAR_H  = 44;
var STRIPE_W   = 40;
var STATUS_H   = 22;
var TAB_H      = 36;
var PANEL_W    = 260;
var BOTTOM_H   = 200;

// ─── Shell components ─────────────────────────────────────────────────────────

async function drawToolbar(parent, W) {
  var bar = fr(parent, 'Toolbar', 0, 0, W, TOOLBAR_H, C.toolbar);
  stroke(bar, C.border, 1);
  var badge = fr(bar, 'Badge', 10, 12, 20, 20, C.blue);
  badge.cornerRadius = 4;
  await tx(bar, META.project, 38, 7, C.textDefault, 12, 500);
  await tx(bar, META.branch, 38, 23, C.textMuted, 11, 400);
  var runW = 190;
  var runF = fr(bar, 'RunConfig', W - runW - 52, 10, runW, 24, C.elevated);
  runF.cornerRadius = 4;
  await tx(runF, META.runConfig, 8, 5, C.textDefault, 12, 500);
  for (var i = 0; i < 3; i++) {
    var col = i === 0 ? C.green : i === 1 ? C.yellow : C.red;
    var dot = rc(bar, 'WinBtn', W - 44 + i * 14, 18, 10, 10, col);
    dot.cornerRadius = 5;
  }
  return bar;
}

async function drawStripe(parent, H) {
  var s = fr(parent, 'LeftStripe', 0, 0, STRIPE_W, H, C.surface);
  stroke(s, C.border, 1);
  var icons = ['P', 'C', 'S', '|', 'A', '·', 'T', 'G', 'Pr'];
  var y = 8;
  for (var i = 0; i < icons.length; i++) {
    if (icons[i] === '|') { rc(s, 'sep', 8, y, 24, 1, C.border); y += 8; continue; }
    var btn = fr(s, icons[i], 4, y, 32, 32, 'transparent');
    btn.cornerRadius = 4;
    await tx(btn, icons[i], icons[i].length === 1 ? 10 : 6, 8, C.textMuted, 11, 400);
    y += 40;
  }
  return s;
}

async function drawStatusBar(parent, W, Y) {
  var bar = fr(parent, 'StatusBar', 0, Y, W, STATUS_H, C.surface);
  stroke(bar, C.border, 1);
  await tx(bar, META.breadcrumbs, 8, 5, C.textMuted, 11, 400);
  await tx(bar, '42:1   UTF-8   LF', W - 120, 5, C.textMuted, 11, 400);
  return bar;
}

async function drawTabs(parent, W, Y, tabs, activeIdx) {
  var bar = fr(parent, 'TabBar', 0, Y, W, TAB_H, C.surface);
  stroke(bar, C.border, 1);
  var x = 0;
  for (var i = 0; i < tabs.length; i++) {
    var w = Math.max(tabs[i].length * 7 + 24, 80);
    var active = i === (activeIdx || 0);
    var tab = fr(bar, tabs[i], x, 0, w, TAB_H, active ? C.elevated : 'transparent');
    if (active) rc(tab, 'Ind', 0, TAB_H - 2, w, 2, C.blue);
    await tx(tab, tabs[i], 8, 10, active ? C.textPrimary : C.textMuted, 12, active ? 500 : 400);
    x += w;
  }
  return bar;
}

async function drawProjectTree(parent, X, Y, H) {
  var panel = fr(parent, 'ProjectPanel', X, Y, PANEL_W, H, C.card);
  stroke(panel, C.border, 1);
  var hdr = fr(panel, 'Header', 0, 0, PANEL_W, 28, 'transparent');
  await tx(hdr, 'Project', 10, 7, C.textPrimary, 12, 600);
  var items = [
    { l: META.project + '/', d: 0 },
    { l: 'src/main/java', d: 1 },
    { l: 'owner', d: 2 },
    { l: 'Visit.java', d: 3 },
    { l: 'VisitController.java', d: 3, active: true },
    { l: 'VisitRepository.java', d: 3 },
    { l: 'vet', d: 2 },
    { l: 'Vet.java', d: 3 },
    { l: 'VetSchedule.java', d: 3 },
    { l: 'src/main/resources', d: 1 },
    { l: 'templates/pets', d: 2 },
    { l: 'createOrUpdateVisitForm.html', d: 3 },
    { l: 'db/h2/schema.sql', d: 3 },
    { l: 'Agent Specifications', d: 1 },
    { l: 'visit-booking.md', d: 2 },
    { l: 'vet-schedules.md', d: 2 },
  ];
  var iy = 32;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var row = fr(panel, item.l, 0, iy, PANEL_W, 22, item.active ? C.selection : 'transparent');
    await tx(row, item.l, 8 + item.d * 12, 4, item.active ? C.textPrimary : C.textDefault, 12, 400);
    iy += 22;
  }
  return panel;
}

async function drawAgentPanel(parent, X, Y, H, activeTask) {
  var panel = fr(parent, 'AgentTasksPanel', X, Y, PANEL_W, H, C.card);
  stroke(panel, C.border, 1);
  var hdr = fr(panel, 'Header', 0, 0, PANEL_W, 28, 'transparent');
  await tx(hdr, 'Agent Tasks', 10, 7, C.textPrimary, 12, 600);
  var projRow = fr(panel, 'Project', 0, 32, PANEL_W, 24, 'transparent');
  await tx(projRow, '▾  ' + META.project, 8, 5, C.textDefault, 12, 500);
  var tasks = [
    { name: META.primaryTask,   time: '2m',  status: 'done' },
    { name: META.secondaryTask, time: '15m', status: 'running' },
  ];
  var ty = 60;
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var sel = t.name === activeTask;
    var row = fr(panel, t.name, 0, ty, PANEL_W, 24, sel ? C.selection : 'transparent');
    var ic = t.status === 'done' ? C.green : t.status === 'running' ? C.blue : C.textMuted;
    var ch = t.status === 'done' ? '✓' : t.status === 'running' ? '◌' : '·';
    await tx(row, ch, 20, 5, ic, 12, 500);
    await tx(row, t.name, 36, 5, sel ? C.textPrimary : C.textDefault, 12, 500);
    await tx(row, t.time, PANEL_W - 32, 5, C.textMuted, 11, 400, true);
    ty += 24;
  }
  return panel;
}

async function drawCodeEditor(parent, X, Y, W, H, tabs, activeTab) {
  var area = fr(parent, 'EditorArea', X, Y, W, H, C.elevated);
  await drawTabs(area, W, 0, tabs || ['VisitController.java', 'Visit.java', 'createOrUpdateVisitForm.html', 'schema.sql'], activeTab || 0);
  var body = fr(area, 'EditorBody', 0, TAB_H, W, H - TAB_H, C.overlayBg);
  var gutter = fr(body, 'Gutter', 0, 0, 28, H - TAB_H, C.surface);
  var lines = [
    { n:'1',  code:'@Controller',                                    col: C.textDefault },
    { n:'2',  code:'class VisitController {',                        col: C.textDefault },
    { n:'3',  code:'',                                               col: C.textDefault },
    { n:'4',  code:'    @ModelAttribute("vets")',                    col: C.yellow },
    { n:'5',  code:'    public Collection<Vet> populateVets() {',    col: C.textDefault },
    { n:'6',  code:'        return vetRepository.findAll();',        col: C.textDefault },
    { n:'7',  code:'    }',                                          col: C.textDefault },
    { n:'8',  code:'',                                               col: C.textDefault },
    { n:'9',  code:'    @ModelAttribute("timeSlots")',               col: C.yellow },
    { n:'10', code:'    public List<LocalTime> populateTimeSlots(){',col: C.textDefault },
    { n:'11', code:'        List<LocalTime> slots = new ArrayList<>',col: C.textMuted },
    { n:'12', code:'        for (int h = 9; h <= 16; h++)',          col: C.textMuted },
    { n:'13', code:'            slots.add(LocalTime.of(h, 0));',     col: C.textMuted },
    { n:'14', code:'        return slots;',                          col: C.textDefault },
    { n:'15', code:'    }',                                          col: C.textDefault },
    { n:'16', code:'',                                               col: C.textDefault },
    { n:'17', code:'    @GetMapping("/owners/{id}/pets/{pid}/visits/new")',col: C.yellow },
    { n:'18', code:'    public String initNewVisitForm(...) {',      col: C.textDefault },
    { n:'19', code:'        return "pets/createOrUpdateVisitForm";', col: C.textLink },
    { n:'20', code:'    }',                                          col: C.textDefault },
  ];
  var ly = 8;
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    await tx(gutter, ln.n, 4, ly, C.textMuted, 11, 400, true);
    if (ln.code) await tx(body, ln.code, 36, ly, ln.col, 12, 400, true);
    ly += 22;
  }
  return area;
}

// ─── Spec overlay (visit-booking.md done state) ───────────────────────────────

async function drawSpecOverlay(parent, X, Y, W, H, opts, detail) {
  opts = opts || {};
  var overlay = fr(parent, 'SpecOverlay', X, Y, W, H, C.overlayBg);

  // Top action bar
  var topBar = fr(overlay, 'TopBar', 0, 0, W, 36, C.elevated);
  stroke(topBar, C.border, 1);
  var taskLabel = detail && detail.tabs && detail.tabs[0] ? detail.tabs[0] : META.primaryTask;
  await tx(topBar, '◈  ' + taskLabel + '  —  Add vet assignment and time slot selection', 12, 10, C.textDefault, 12, 500);
  var btnLabels = ['Run', 'Enhance'];
  var rbx = W - 8;
  for (var ri = 0; ri < btnLabels.length; ri++) {
    var rbw = btnLabels[ri].length * 7 + 20;
    rbx -= rbw + 8;
    var rb = fr(topBar, btnLabels[ri], rbx, 6, rbw, 24, ri === 0 ? C.blue : C.elevated);
    rb.cornerRadius = 4;
    stroke(rb, ri === 0 ? C.blue : C.border, 1);
    await tx(rb, btnLabels[ri], 8, 5, '#fff', 12, 500);
  }

  // Inspection widget
  var iw = fr(overlay, 'InspectionWidget', W - 196, 44, 184, 24, C.tooltipBg);
  iw.cornerRadius = 6;
  await tx(iw, 'Version 1', 8, 5, C.textDefault, 11, 500);
  await tx(iw, '⚠ 2', 80, 5, C.yellow, 11, 500);
  await tx(iw, '✕ 1', 112, 5, C.red, 11, 500);
  await tx(iw, '‹  ›', 148, 5, C.textMuted, 11, 500);

  var contentY = 36;

  // AC Warning Banner
  if (opts.showBanner) {
    var bannerText = (detail && detail.bannerText) ||
      'AC #1 partially met. POST re-renders filter booked vets, but initial load shows all vets because date/time are empty. Fully filtering by selected date/time would require AJAX, so AC wording should be adjusted.';
    var banner = fr(overlay, 'ACWarningBanner', 0, contentY, W, 52, C.warnBg);
    stroke(banner, C.warnBorder, 1);
    await tx(banner, '⚠', 12, 18, C.yellow, 14, 400);
    await tx(banner, bannerText, 36, 8, C.textDefault, 11, 500);
    var bans = ['Allow once', 'Allow for session', 'Reject'];
    var banX = W - 12;
    for (var bi = 0; bi < bans.length; bi++) {
      var bw = bans[bi].length * 7 + 16;
      banX -= bw + 8;
      var ban = fr(banner, bans[bi], banX, 14, bw, 24, bi === 2 ? C.red : 'transparent');
      ban.cornerRadius = 3;
      await tx(ban, bans[bi], 6, 5, bi === 2 ? '#fff' : C.textLink, 11, 500);
    }
    contentY += 52;
  }

  // Success banner (quick-fix applied)
  if (opts.showSuccess) {
    var sBanner = fr(overlay, 'SuccessBanner', 0, contentY, W, 40, C.successBg);
    stroke(sBanner, C.successBorder, 1);
    await tx(sBanner, '✓  AC #1 resolved. Visit form now shows vets excluding those already booked for the selected date/time.', 12, 12, '#DFE1E5', 12, 500);
    contentY += 40;
  }

  // Scroll area with prose content
  var scroll = fr(overlay, 'Content', 0, contentY, W, H - contentY, C.overlayBg);

  // Build sections from parsed detail or defaults
  var sections = [];
  if (detail && detail.sections && detail.sections.length > 0) {
    sections = detail.sections;
  } else {
    sections = [
      { heading: 'Goal', items: [
        { type: 'text', text: 'Add vet assignment and time slot selection to the visit creation flow.' },
        { type: 'text', text: 'When booking, users pick a vet and a time slot for the chosen date. The system prevents double-booking.' },
      ]},
      { heading: 'Acceptance Criteria', items: [
        { type: 'item', status: opts.inspection ? 'warning' : 'pass', text: 'Visit form shows a dropdown of available vets for the selected date/time.' },
        { type: 'item', status: opts.inspection ? 'warning' : 'pass', text: 'Visit form includes a time slot picker (e.g. hourly slots 09:00-16:00).' },
        { type: 'item', status: 'pass', text: 'A vet cannot be booked for the same date+time twice (server-side validation).' },
        { type: 'item', status: 'pass', text: 'Vet and time are persisted with the visit.' },
        { type: 'item', status: 'pass', text: 'Existing visit display shows the assigned vet and time.' },
        { type: 'item', status: 'pass', text: 'All three DB schemas and seed data are updated.' },
      ]},
      { heading: 'Plan', items: [
        { type: 'item', status: 'pass', text: 'Schema changes - add vet_id (FK) and visit_time (TIME) to visits table' },
        { type: 'item', status: 'pass', text: 'Visit entity - add @ManyToOne vet and LocalTime time with @NotNull' },
        { type: 'item', status: opts.inspection ? 'warning' : 'pass', text: 'VisitRepository - add existsByVetIdAndDateAndTime for double-booking check' },
        { type: 'item', status: 'pass', text: 'VisitController - inject VetRepository, add @ModelAttribute("vets")' },
        { type: 'item', status: opts.inspection ? 'error' : 'pass', text: 'Form template - add <select> for vet and <select> for time slot' },
        { type: 'item', status: 'pass', text: 'Owner details - add Vet and Time columns to visit history table' },
        { type: 'item', status: 'pass', text: 'Tests - vet list in model, successful booking, double-booking rejected' },
      ]},
      { heading: 'Implementation Notes', items: [
        { type: 'text', text: 'Current Visit entity has only date (LocalDate) and description (String). No relationship to Vet.' },
        { type: 'text', text: 'VetRepository.findAll() is @Cacheable("vets"). Returns Collection<Vet>.' },
      ]},
    ];
  }

  var cy = 20;
  for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    await tx(scroll, sec.heading, 24, cy, C.textPrimary, 14, 600);
    cy += 28;
    for (var ii = 0; ii < sec.items.length; ii++) {
      var item = sec.items[ii];
      if (item.type === 'item') {
        var st = item.status || 'pass';
        var sc2 = st === 'pass' ? C.green : st === 'warning' ? C.yellow : C.red;
        var ic2 = st === 'pass' ? '✓' : st === 'warning' ? '⚠' : '✕';
        await tx(scroll, ic2, 24, cy, sc2, 12, 500);
        await tx(scroll, item.text, 44, cy, C.textDefault, 12, 500);
        if (opts.inspection && (st === 'warning' || st === 'error')) {
          rc(scroll, 'hl', 44, cy + 15, Math.min(item.text.length * 7, W - 60), 2, sc2, 0.35);
          cy += 14;
        }
        cy += 22;
      } else {
        await tx(scroll, item.text, 24, cy, C.textDefault, 13, 500);
        cy += 22;
      }
    }
    cy += 12;
  }
  return overlay;
}

// ─── Terminal panel ───────────────────────────────────────────────────────────

async function drawTerminal(parent, X, Y, W, opts, detail) {
  opts = opts || {};
  var panel = fr(parent, 'Terminal', X, Y, W, BOTTOM_H, C.overlayBg);
  stroke(panel, C.border, 1);
  var tbar = fr(panel, 'Tabs', 0, 0, W, 28, C.surface);
  stroke(tbar, C.border, 1);
  await tx(tbar, 'Terminal', 12, 7, C.textPrimary, 12, 600);
  var cmd = (detail && detail.command) || opts.command || '';
  if (cmd) await tx(panel, '$ ' + cmd, 12, 36, C.green, 12, 400, true);
  var output = (detail && detail.output && detail.output.length) ? detail.output : (opts.output || []);
  for (var i = 0; i < output.length; i++) {
    await tx(panel, output[i], 12, 56 + i * 18, C.textMuted, 11, 400, true);
  }
  if (opts.showPrompt) {
    var py = 56 + output.length * 18 + 8;
    var pf = fr(panel, 'Prompt', 8, py, W - 16, 36, C.elevated);
    pf.cornerRadius = 4;
    stroke(pf, C.border, 1);
    await tx(pf, 'Allow agent execution?', 10, 10, C.textPrimary, 12, 500);
    var btns = ['Allow once', 'Allow for session', 'Reject'];
    var bx = W - 24;
    for (var bi = 0; bi < btns.length; bi++) {
      var bw = btns[bi].length * 7 + 16;
      bx -= bw + 8;
      var btn = fr(pf, btns[bi], bx, 7, bw, 22, bi === 2 ? C.red : C.elevated);
      btn.cornerRadius = 3;
      stroke(btn, bi === 2 ? C.red : C.border, 1);
      await tx(btn, btns[bi], 6, 4, bi === 2 ? '#fff' : C.textDefault, 11, 500);
    }
  }
  return panel;
}

// ─── Problems panel ───────────────────────────────────────────────────────────

async function drawProblems(parent, X, Y, W, detail) {
  var panel = fr(parent, 'Problems', X, Y, W, BOTTOM_H, C.overlayBg);
  stroke(panel, C.border, 1);
  var tbar = fr(panel, 'Tabs', 0, 0, W, 28, C.surface);
  stroke(tbar, C.border, 1);
  await tx(tbar, 'Problems', 12, 7, C.textPrimary, 12, 600);
  var problems = (detail && detail.problems && detail.problems.length) ? detail.problems : [
    { sev: 'warning', text: 'AC/Plan mismatch - AC says "available vets" but plan loads all vets', line: 'Line 4' },
    { sev: 'warning', text: 'Ambiguous AC - "e.g." makes time slot granularity untestable', line: 'Line 5' },
    { sev: 'warning', text: 'Possible race condition - check-then-act without DB constraint', line: 'Line 10' },
    { sev: 'error',   text: 'Incomplete plan - missing VetFormatter, form POST will fail', line: 'Line 12' },
  ];
  var py = 36;
  for (var i = 0; i < problems.length; i++) {
    var p = problems[i];
    var row = fr(panel, 'Problem' + i, 0, py, W, 24, 'transparent');
    var sc = p.sev === 'error' ? C.red : C.yellow;
    await tx(row, p.sev === 'error' ? '✕' : '⚠', 8, 5, sc, 12, 500);
    await tx(row, p.text, 28, 5, C.textDefault, 12, 400);
    await tx(row, p.line, W - 60, 5, C.textMuted, 11, 400, true);
    py += 24;
  }
  return panel;
}

// ─── Diff view ────────────────────────────────────────────────────────────────

async function drawDiff(parent, X, Y, W, H, detail) {
  var tabLabel = (detail && detail.diffFile) ? 'Diff  ' + detail.diffFile : 'Diff  VisitController.java';
  var area = fr(parent, 'DiffArea', X, Y, W, H, C.overlayBg);
  await drawTabs(area, W, 0, [tabLabel], 0);
  var body = fr(area, 'DiffBody', 0, TAB_H, W, H - TAB_H, C.overlayBg);
  var gutter = fr(body, 'Gutter', 0, 0, 56, H - TAB_H, C.surface);
  var rows = [
    { ln:'356', type:'ctx', code:'@ModelAttribute("timeSlots")' },
    { ln:'357', type:'ctx', code:'public List<LocalTime> populateTimeSlots() {' },
    { ln:'358', type:'rm',  code:'    List<LocalTime> slots = new ArrayList<>();' },
    { ln:'359', type:'rm',  code:'    for (int hour = 9; hour <= 16; hour++) {' },
    { ln:'360', type:'rm',  code:'        slots.add(LocalTime.of(hour, 0));' },
    { ln:'361', type:'rm',  code:'    }' },
    { ln:'362', type:'rm',  code:'    return slots;' },
    { ln:'363', type:'ctx', code:'}' },
    { ln:'',    type:'sep', code:'' },
    { ln:'356', type:'ctx', code:'private final List<LocalTime> timeSlots;' },
    { ln:'358', type:'add', code:'public VisitController(...) {' },
    { ln:'359', type:'add', code:'    this.timeSlots = IntStream.rangeClosed(9, 16)' },
    { ln:'360', type:'add', code:'        .mapToObj(h -> LocalTime.of(h, 0)).toList();' },
    { ln:'361', type:'add', code:'}' },
    { ln:'363', type:'add', code:'@ModelAttribute("timeSlots")' },
    { ln:'364', type:'add', code:'public List<LocalTime> populateTimeSlots() {' },
    { ln:'365', type:'add', code:'    return this.timeSlots;' },
    { ln:'366', type:'add', code:'}' },
  ];
  var dy = 8;
  for (var di = 0; di < rows.length; di++) {
    var dr = rows[di];
    if (dr.type === 'sep') { rc(body, 'sep', 56, dy, W - 56, 2, C.border); dy += 10; continue; }
    var bg = dr.type === 'rm' ? C.diffRm : dr.type === 'add' ? C.diffAdd : 'transparent';
    var col = dr.type === 'rm' ? '#E07070' : dr.type === 'add' ? '#7EC87E' : C.textDefault;
    var pfx = dr.type === 'rm' ? '−' : dr.type === 'add' ? '+' : ' ';
    if (bg !== 'transparent') rc(body, 'rowbg', 56, dy, W - 56, 22, bg);
    if (dr.ln) await tx(gutter, dr.ln, 4, dy, C.textMuted, 10, 400, true);
    await tx(body, pfx + ' ' + dr.code, 64, dy, col, 12, 400, true);
    dy += 22;
  }
  var commentBadge = fr(body, 'Comment', W - 300, 8 + 6 * 22, 288, 28, C.tooltipBg);
  commentBadge.cornerRadius = 4;
  stroke(commentBadge, C.border, 1);
  await tx(commentBadge, '💬  Time slots never change at runtime — build the list once in the constructor', 8, 8, C.textDefault, 10, 400);
  return area;
}

// ─── Frame builders ───────────────────────────────────────────────────────────

async function buildWelcome(pageX, spec) {
  var W = (spec && spec.welcomeSize) ? spec.welcomeSize.w : 1100;
  var H = (spec && spec.welcomeSize) ? spec.welcomeSize.h : 800;
  var detail = spec && spec.frameDetails && spec.frameDetails['F-01'];
  var root = fr(figma.currentPage, 'F-01  Welcome', pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H;
  var stripeArea = fr(root, 'StripeAndBody', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(stripeArea, bodyH);
  await drawProjectTree(stripeArea, STRIPE_W, 0, bodyH);

  // Welcome gradient area
  var gradW = W - STRIPE_W - PANEL_W;
  var grad = fr(stripeArea, 'WelcomeArea', STRIPE_W + PANEL_W, 0, gradW, bodyH, C.card);
  rc(grad, 'GradCyan',   0, 0, gradW, bodyH/2, '#00A7E3', 0.22);
  rc(grad, 'GradGreen',  gradW*0.5, 0, gradW*0.5, bodyH/3, '#00F362', 0.14);
  rc(grad, 'GradYellow', 0, 0, gradW*0.5, bodyH/3, '#FDFB00', 0.10);

  var cx = gradW / 2;
  var cy = bodyH / 2 - 180;
  await tx(grad, 'Welcome to IntelliJ IDEA', cx - 160, cy, C.textDefault, 20, 600);
  await tx(grad, 'Start in one click', cx - 64, cy + 30, C.textMuted, 13, 500);

  // Quick action tiles from parsed spec or defaults
  var tiles = (detail && detail.quickTiles && detail.quickTiles.length > 0)
    ? detail.quickTiles
    : ['New Agent Task', 'New Script', 'New Notebook', 'Import File', 'Learn', 'Plugins'];
  var tW = 128, tH = 96, tGap = 16;
  var gridW = tW * 3 + tGap * 2;
  var gx = cx - gridW / 2, gy = cy + 62;
  for (var i = 0; i < tiles.length; i++) {
    var col = i % 3, row = Math.floor(i / 3);
    var tile = fr(grad, tiles[i], gx + col*(tW+tGap), gy + row*(tH+tGap), tW, tH, '#212326');
    tile.cornerRadius = 8;
    await tx(tile, tiles[i], 14, tH - 28, C.textDefault, 13, 500);
  }

  // Segmented control
  var segY = gy + tH * 2 + tGap + 20;
  var seg = fr(grad, 'Segmented', cx - 80, segY, 160, 28, C.elevated);
  seg.cornerRadius = 6;
  stroke(seg, C.border, 1);
  var active = fr(seg, 'Manual', 2, 2, 78, 24, C.blue);
  active.cornerRadius = 4;
  await tx(seg, 'Manual', 16, 6, '#fff', 13, 500);
  await tx(seg, 'AI', 100, 6, C.textMuted, 13, 500);

  // Footer
  var footY = bodyH - 56;
  await tx(grad, '🌙  Theme: Dark', cx - 100, footY, C.textDefault, 13, 500);
  await tx(grad, '⌨  Keymap: macOS', cx + 20, footY, C.textDefault, 13, 500);
  await tx(grad, '☑  Always show this page on startup', cx - 116, footY + 24, C.textMuted, 12, 400);

  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

async function buildIDEWorkspace(pageX, spec) {
  var sz = spec && spec.ideSize ? spec.ideSize : { w: 1440, h: 900 };
  var W = sz.w, H = sz.h;
  var root = fr(figma.currentPage, 'F-02  IDE Workspace', pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H - BOTTOM_H;
  var body = fr(root, 'Body', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(body, bodyH);
  await drawProjectTree(body, STRIPE_W, 0, bodyH);
  var eX = STRIPE_W + PANEL_W, eW = W - eX;
  await drawCodeEditor(body, eX, 0, eW, bodyH, null, 0);
  await drawTerminal(root, eX, TOOLBAR_H + bodyH, eW, { command: '', output: ['Started PetClinicApplication in 3.2s (JVM running for 3.8s)'] });
  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

async function buildAgentTasksPanel(pageX, spec) {
  var sz = spec && spec.ideSize ? spec.ideSize : { w: 1440, h: 900 };
  var W = sz.w, H = sz.h;
  var root = fr(figma.currentPage, 'F-03  Agent Tasks Panel', pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H;
  var body = fr(root, 'Body', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(body, bodyH);
  await drawAgentPanel(body, STRIPE_W, 0, bodyH, null);
  var eX = STRIPE_W + PANEL_W, eW = W - eX;
  await drawCodeEditor(body, eX, 0, eW, bodyH, null, 0);
  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

async function buildSpecFrame(pageX, spec, frameId, name, opts) {
  var sz = spec && spec.ideSize ? spec.ideSize : { w: 1440, h: 900 };
  var W = sz.w, H = sz.h;
  var detail = spec && spec.frameDetails && spec.frameDetails[frameId];
  var root = fr(figma.currentPage, frameId + '  ' + name, pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H;
  var body = fr(root, 'Body', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(body, bodyH);
  await drawAgentPanel(body, STRIPE_W, 0, bodyH, META.primaryTask);
  var eX = STRIPE_W + PANEL_W, eW = W - eX;
  var editorArea = fr(body, 'EditorArea', eX, 0, eW, bodyH, C.elevated);
  var tabs = (detail && detail.tabs && detail.tabs.length) ? detail.tabs : [META.primaryTask, 'VisitController.java'];
  await drawTabs(editorArea, eW, 0, tabs, 0);
  await drawSpecOverlay(editorArea, 0, TAB_H, eW, bodyH - TAB_H, opts, detail);
  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

async function buildTerminalFrame(pageX, spec, frameId, name, termOpts) {
  var sz = spec && spec.ideSize ? spec.ideSize : { w: 1440, h: 900 };
  var W = sz.w, H = sz.h;
  var detail = spec && spec.frameDetails && spec.frameDetails[frameId];
  var root = fr(figma.currentPage, frameId + '  ' + name, pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H - BOTTOM_H;
  var body = fr(root, 'Body', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(body, bodyH);
  await drawAgentPanel(body, STRIPE_W, 0, bodyH, META.primaryTask);
  var eX = STRIPE_W + PANEL_W, eW = W - eX;
  var editorArea = fr(body, 'EditorArea', eX, 0, eW, bodyH, C.elevated);
  var tabs = (detail && detail.tabs && detail.tabs.length) ? detail.tabs : [META.primaryTask, 'VisitController.java'];
  await drawTabs(editorArea, eW, 0, tabs, 0);
  await drawSpecOverlay(editorArea, 0, TAB_H, eW, bodyH - TAB_H, {}, detail);
  await drawTerminal(root, eX, TOOLBAR_H + bodyH, eW, termOpts, detail);
  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

async function buildProblems(pageX, spec, frameId, name) {
  var sz = spec && spec.ideSize ? spec.ideSize : { w: 1440, h: 900 };
  var W = sz.w, H = sz.h;
  var detail = spec && spec.frameDetails && spec.frameDetails[frameId];
  var root = fr(figma.currentPage, frameId + '  ' + name, pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H - BOTTOM_H;
  var body = fr(root, 'Body', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(body, bodyH);
  await drawAgentPanel(body, STRIPE_W, 0, bodyH, META.primaryTask);
  var eX = STRIPE_W + PANEL_W, eW = W - eX;
  var editorArea = fr(body, 'EditorArea', eX, 0, eW, bodyH, C.elevated);
  var tabs = (detail && detail.tabs && detail.tabs.length) ? detail.tabs : [META.primaryTask, 'VisitController.java'];
  await drawTabs(editorArea, eW, 0, tabs, 0);
  await drawSpecOverlay(editorArea, 0, TAB_H, eW, bodyH - TAB_H, { inspection: true }, detail);
  await drawProblems(root, eX, TOOLBAR_H + bodyH, eW, detail);
  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

async function buildVetSchedules(pageX, spec) {
  var sz = spec && spec.ideSize ? spec.ideSize : { w: 1440, h: 900 };
  var W = sz.w, H = sz.h;
  var detail = spec && spec.frameDetails && spec.frameDetails['F-09'];
  var root = fr(figma.currentPage, 'F-09  vet-schedules.md', pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H;
  var body = fr(root, 'Body', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(body, bodyH);
  await drawAgentPanel(body, STRIPE_W, 0, bodyH, META.secondaryTask);
  var eX = STRIPE_W + PANEL_W, eW = W - eX;
  var editorArea = fr(body, 'EditorArea', eX, 0, eW, bodyH, C.elevated);
  var tabs = [META.secondaryTask, META.primaryTask];
  await drawTabs(editorArea, eW, 0, tabs, 0);
  var overlay = fr(editorArea, 'SpecOverlay', 0, TAB_H, eW, bodyH - TAB_H, C.overlayBg);
  var topBar = fr(overlay, 'TopBar', 0, 0, eW, 36, C.elevated);
  stroke(topBar, C.border, 1);
  await tx(topBar, '◈  ' + META.secondaryTask + '  —  Define Vet Schedules track', 12, 10, C.textDefault, 12, 500);

  var sections = (detail && detail.sections && detail.sections.length) ? detail.sections : [
    { heading: 'Goal', items: [{ type: 'text', text: 'Define the parallel Vet Schedules track that enables real availability checks for visit booking.' }] },
    { heading: 'Acceptance Criteria', items: [
      { type: 'item', status: 'pass', text: 'Vets can have working schedules stored by day of week.' },
      { type: 'item', status: 'pass', text: 'Booking validation can reject slots outside a vet\'s working hours.' },
      { type: 'item', status: 'pass', text: 'Demo seed data includes at least one schedule per vet.' },
      { type: 'item', status: 'pass', text: 'Visit-booking can keep using static hourly slots while this task is in progress.' },
    ]},
    { heading: 'Plan', items: [
      { type: 'item', status: 'pass', text: 'Add VetSchedule entity under the vet package' },
      { type: 'item', status: 'pass', text: 'Add repository queries by vet and date' },
      { type: 'item', status: 'pass', text: 'Validate requested visit_time against schedule windows' },
      { type: 'item', status: 'pass', text: 'Seed sample schedules in H2 data.sql' },
    ]},
  ];
  var cy = 44;
  for (var si = 0; si < sections.length; si++) {
    var sec = sections[si];
    await tx(overlay, sec.heading, 24, cy, C.textPrimary, 14, 600);
    cy += 28;
    for (var ii = 0; ii < sec.items.length; ii++) {
      var item = sec.items[ii];
      if (item.type === 'item') {
        await tx(overlay, '✓', 24, cy, C.green, 12, 500);
        await tx(overlay, item.text, 44, cy, C.textDefault, 12, 500);
      } else {
        await tx(overlay, item.text, 24, cy, C.textDefault, 13, 500);
      }
      cy += 22;
    }
    cy += 12;
  }
  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

async function buildDiffView(pageX, spec) {
  var sz = spec && spec.ideSize ? spec.ideSize : { w: 1440, h: 900 };
  var W = sz.w, H = sz.h;
  var detail = spec && spec.frameDetails && spec.frameDetails['F-12'];
  var root = fr(figma.currentPage, 'F-12  Diff VisitController.java', pageX, 0, W, H, C.surface);
  await drawToolbar(root, W);
  var bodyH = H - TOOLBAR_H - STATUS_H;
  var body = fr(root, 'Body', 0, TOOLBAR_H, W, bodyH, 'transparent');
  await drawStripe(body, bodyH);
  await drawAgentPanel(body, STRIPE_W, 0, bodyH, null);
  var eX = STRIPE_W + PANEL_W, eW = W - eX;
  await drawDiff(body, eX, 0, eW, bodyH, detail);
  await drawStatusBar(root, W, H - STATUS_H);
  return root;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

figma.ui.onmessage = async function(msg) {
  if (msg.type !== 'generate') return;

  var ds   = msg.ds   || {};
  var spec = msg.flows || {};

  function progress(pct) { figma.ui.postMessage({ type: 'progress', pct: pct }); }
  function log(text)     { figma.ui.postMessage({ type: 'log', text: text }); }

  try {
    log('Loading fonts…');
    await preloadFonts();
    progress(5);

    log('Applying design tokens from MD…');
    applyColors(ds, spec);
    applyMeta(spec);
    progress(10);

    var GAP = 80;
    var x = 0;

    log('F-01  Welcome Screen');
    await buildWelcome(x, spec);
    x += 1100 + GAP; progress(18);

    log('F-02  IDE Workspace');
    await buildIDEWorkspace(x, spec);
    x += 1440 + GAP; progress(26);

    log('F-03  Agent Tasks Panel');
    await buildAgentTasksPanel(x, spec);
    x += 1440 + GAP; progress(33);

    log('F-04  visit-booking Done State');
    await buildSpecFrame(x, spec, 'F-04', 'visit-booking Done', {});
    x += 1440 + GAP; progress(40);

    log('F-05  Terminal / Generate');
    await buildTerminalFrame(x, spec, 'F-05', 'Terminal – Generate', { showPrompt: true });
    x += 1440 + GAP; progress(47);

    log('F-06  Terminal / Plan');
    await buildTerminalFrame(x, spec, 'F-06', 'Terminal – Plan Success', {});
    x += 1440 + GAP; progress(53);

    log('F-07  Terminal / AC Check');
    await buildTerminalFrame(x, spec, 'F-07', 'Terminal – AC Paused', {});
    x += 1440 + GAP; progress(59);

    log('F-08  Quick-Fix / Version 2');
    await buildSpecFrame(x, spec, 'F-08', 'visit-booking Version 2', { showSuccess: true });
    x += 1440 + GAP; progress(65);

    log('F-09  vet-schedules.md');
    await buildVetSchedules(x, spec);
    x += 1440 + GAP; progress(71);

    log('F-10  Problems / visit-booking');
    await buildProblems(x, spec, 'F-10', 'Problems – visit-booking');
    x += 1440 + GAP; progress(78);

    log('F-11  Problems / VisitController.java');
    await buildProblems(x, spec, 'F-11', 'Problems – VisitController.java');
    x += 1440 + GAP; progress(85);

    log('F-12  Diff View');
    await buildDiffView(x, spec);
    progress(98);

    figma.ui.postMessage({ type: 'done' });
    figma.notify('✓ 12 frames generated from MD spec!', { timeout: 4000 });

  } catch(err) {
    figma.ui.postMessage({ type: 'error', text: String(err) });
    figma.notify('Error: ' + String(err), { error: true });
  }
};
