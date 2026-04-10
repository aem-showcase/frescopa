/**
 * Dashboard insights: usage chart (tabs) + opportunity list.
 * CRM payload (expected keys on shared CRM JSON): company, usage, insights, insightsListUrl.
 * Data is loaded once by templates/dashboard/dashboard.js → window.frescopaData.
 * Do not fetch CRM from this block.
 */

const TABS = [
  { id: 'dailySpikes', label: 'Daily Spikes' },
  { id: 'byLocation', label: 'By Location' },
  { id: 'seasonal', label: 'Seasonal' },
];

const MOCK_USAGE = {
  unitLabel: 'CUPS PER DAY',
  dailySpikes: [
    { label: 'Mon', value: 420 },
    { label: 'Tue', value: 510 },
    { label: 'Wed', value: 380 },
    { label: 'Thu', value: 620 },
    { label: 'Fri', value: 590 },
  ],
  byLocation: [
    { label: 'NYC', value: 720 },
    { label: 'LA', value: 540 },
    { label: 'CHI', value: 410 },
    { label: 'DAL', value: 360 },
  ],
  seasonalSummaries: [
    { label: 'Winter', value: 480 },
    { label: 'Spring', value: 520 },
    { label: 'Summer', value: 610 },
    { label: 'Fall', value: 455 },
  ],
};

const MOCK_INSIGHTS = [
  {
    title: 'Peak weekday demand',
    titleEmphasis: 'Thursday',
    summary: 'Your highest volume aligns with mid-week restocks — consider a promo on slower days.',
    ctaLabel: 'View schedule',
    ctaUrl: '#',
  },
  {
    title: 'Coastal locations',
    titleEmphasis: 'outperform',
    summary: 'West coast sites are 18% above baseline; replicate merchandising in central regions.',
    ctaLabel: 'Compare regions',
    ctaUrl: '#',
  },
  {
    title: 'Seasonal uplift',
    titleEmphasis: 'Summer',
    summary: 'Usage climbs in warmer months; stock ahead and lock in bean contracts early.',
    ctaLabel: 'Plan inventory',
    ctaUrl: '#',
  },
];

/**
 * @param {unknown} row
 * @returns {{ label: string, value: number }}
 */
function normalizeRow(row) {
  if (!row || typeof row !== 'object') return { label: '', value: 0 };
  const r = /** @type {Record<string, unknown>} */ (row);
  const label = String(r.label ?? r.name ?? r.location ?? '');
  const raw = r.value ?? r.cups;
  const value = typeof raw === 'number' ? raw : Number(raw) || 0;
  return { label, value };
}

/**
 * @param {unknown} arr
 * @returns {{ label: string, value: number }[]}
 */
function normalizeSeries(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((r) => normalizeRow(r)).filter((item) => item.label);
}

/**
 * @param {unknown} raw
 * @param {{ label: string, value: number }[]} mock
 */
function seriesOrMock(raw, mock) {
  const s = normalizeSeries(raw);
  return s.length ? s : mock;
}

/**
 * @param {Record<string, unknown>|null|undefined} data
 */
function resolveUsage(data) {
  const u = data && typeof data.usage === 'object' && data.usage !== null
    ? /** @type {Record<string, unknown>} */ (data.usage)
    : {};
  return {
    unitLabel: typeof u.unitLabel === 'string' ? u.unitLabel : MOCK_USAGE.unitLabel,
    dailySpikes: seriesOrMock(u.dailySpikes, MOCK_USAGE.dailySpikes),
    byLocation: seriesOrMock(u.byLocation, MOCK_USAGE.byLocation),
    seasonalSummaries: seriesOrMock(u.seasonalSummaries, MOCK_USAGE.seasonalSummaries),
  };
}

/**
 * @param {Record<string, unknown>|null|undefined} data
 */
function resolveInsightsList(data) {
  const raw = data?.insights;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((item) => {
      const o = /** @type {Record<string, unknown>} */ (item);
      return {
        title: String(o.title ?? ''),
        titleEmphasis: o.titleEmphasis != null ? String(o.titleEmphasis) : '',
        summary: String(o.summary ?? ''),
        ctaLabel: String(o.ctaLabel ?? 'Learn more'),
        ctaUrl: o.ctaUrl != null ? String(o.ctaUrl) : '#',
      };
    });
  }
  return MOCK_INSIGHTS;
}

/**
 * @param {'dailySpikes'|'byLocation'|'seasonal'} tabId
 * @param {ReturnType<typeof resolveUsage>} usage
 */
function seriesForTab(tabId, usage) {
  if (tabId === 'byLocation') return usage.byLocation;
  if (tabId === 'seasonal') return usage.seasonalSummaries;
  return usage.dailySpikes;
}

/**
 * @param {number} dataMax
 * @returns {{ yMax: number, ticks: number[] }}
 */
function computeYScale(dataMax) {
  const m = Math.max(dataMax, 1);
  let step = 20;
  if (m > 150) step = 50;
  if (m > 400) step = 100;
  if (m > 2000) step = 200;
  let yMax = Math.ceil((m * 1.05) / step) * step;
  if (yMax < m) yMax += step;
  const ticks = [];
  for (let v = yMax; v >= 0; v -= step) {
    ticks.push(v);
    if (ticks.length > 15) break;
  }
  if (ticks[ticks.length - 1] !== 0) ticks.push(0);
  return { yMax, ticks };
}

/** @type {WeakMap<HTMLElement, ResizeObserver>} */
const chartAxisObservers = new WeakMap();

/**
 * Positions the x-axis segment from the y-rule through symmetric padding past the plot.
 * @param {HTMLElement} viz
 * @param {HTMLElement} yRule
 * @param {HTMLElement} plot
 * @param {HTMLElement} baselineLine
 */
function layoutInsightsChartAxes(viz, yRule, plot, baselineLine) {
  const apply = () => {
    const vizRect = viz.getBoundingClientRect();
    const ruleRect = yRule.getBoundingClientRect();
    const plotRect = plot.getBoundingClientRect();
    if (vizRect.width < 1 || plotRect.width < 1) return;
    const inset = Math.max(0, plotRect.left - ruleRect.left);
    const left = ruleRect.left - vizRect.left;
    const width = plotRect.right - ruleRect.left + inset;
    baselineLine.style.marginLeft = `${left}px`;
    baselineLine.style.width = `${width}px`;
  };
  apply();
  requestAnimationFrame(apply);
  const prev = chartAxisObservers.get(viz);
  if (prev) prev.disconnect();
  const ro = new ResizeObserver(apply);
  ro.observe(viz);
  ro.observe(plot);
  chartAxisObservers.set(viz, ro);
}

/**
 * @param {HTMLElement} mount
 * @param {{ label: string, value: number }[]} rows
 * @param {string} unitLabel
 */
function renderChart(mount, rows, unitLabel) {
  const prevViz = mount.querySelector(':scope > .insights-chart-viz');
  if (prevViz) {
    const prevRo = chartAxisObservers.get(prevViz);
    if (prevRo) prevRo.disconnect();
    chartAxisObservers.delete(prevViz);
  }
  mount.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'insights-chart-empty';
    empty.textContent = 'No usage data for this view.';
    mount.append(empty);
    return;
  }

  const dataMax = Math.max(1, ...rows.map((r) => r.value), 0);
  const { yMax, ticks } = computeYScale(dataMax);

  const viz = document.createElement('div');
  viz.className = 'insights-chart-viz';

  const yAxis = document.createElement('div');
  yAxis.className = 'insights-chart-y-axis';
  yAxis.setAttribute('aria-hidden', 'true');

  const yTitle = document.createElement('span');
  yTitle.className = 'insights-chart-y-axis-title';
  yTitle.textContent = unitLabel.toUpperCase();

  const yScale = document.createElement('div');
  yScale.className = 'insights-chart-y-scale';

  const yTicks = document.createElement('div');
  yTicks.className = 'insights-chart-y-ticks';
  ticks.forEach((t) => {
    const tick = document.createElement('span');
    tick.className = 'insights-chart-y-tick';
    tick.textContent = String(t);
    yTicks.append(tick);
  });

  const yRule = document.createElement('div');
  yRule.className = 'insights-chart-y-rule';

  yScale.append(yTicks, yRule);
  yAxis.append(yTitle, yScale);

  const plot = document.createElement('div');
  plot.className = 'insights-chart-plot';

  const barsRow = document.createElement('div');
  barsRow.className = 'insights-chart-bars';
  barsRow.setAttribute('role', 'group');
  barsRow.setAttribute('aria-label', `${unitLabel} chart`);

  /** Figma @ 1728px viewport: x-axis plot 748px, each bar 90px with 5 bars */
  const DESIGN_PLOT_PX = 748;
  const DESIGN_BAR_PX = 90;
  const DESIGN_VIEWPORT_PX = 1728;
  const barFrac = DESIGN_BAR_PX / DESIGN_PLOT_PX;
  const n = rows.length;
  const basisPct = `${barFrac * 100}%`;
  /** Vars on viz so sibling x-labels row inherits the same gap/basis as the bars. */
  if (n <= 1) {
    viz.style.setProperty('--insights-gap-pct', '0px');
    viz.style.setProperty('--insights-bar-basis-pct', basisPct);
    barsRow.style.justifyContent = 'center';
  } else {
    const gapFrac = (1 - n * barFrac) / (n - 1);
    viz.style.setProperty('--insights-gap-pct', `${gapFrac * 100}%`);
    viz.style.setProperty('--insights-bar-basis-pct', basisPct);
    barsRow.style.justifyContent = '';
  }
  const plotMaxVw = (DESIGN_PLOT_PX * 100) / DESIGN_VIEWPORT_PX;
  viz.style.setProperty('--insights-x-plot-max', `min(100%, ${plotMaxVw}vw)`);

  rows.forEach((row) => {
    const pct = (row.value / yMax) * 100;
    const col = document.createElement('div');
    col.className = 'insights-chart-column';

    const barWrap = document.createElement('div');
    barWrap.className = 'insights-chart-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'insights-chart-bar';
    bar.style.height = `${pct}%`;

    const val = document.createElement('span');
    val.className = 'insights-chart-value';
    val.textContent = String(row.value);
    bar.append(val);
    barWrap.append(bar);
    col.append(barWrap);
    barsRow.append(col);
  });

  const baseline = document.createElement('div');
  baseline.className = 'insights-chart-baseline';
  baseline.setAttribute('aria-hidden', 'true');
  const baselineLine = document.createElement('div');
  baselineLine.className = 'insights-chart-baseline-line';
  baselineLine.setAttribute('aria-hidden', 'true');
  baseline.append(baselineLine);

  const xLabels = document.createElement('div');
  xLabels.className = 'insights-chart-x-labels';
  rows.forEach((row) => {
    const lab = document.createElement('span');
    lab.className = 'insights-chart-label';
    lab.textContent = row.label;
    xLabels.append(lab);
  });
  if (n <= 1) {
    xLabels.style.justifyContent = 'center';
  } else {
    xLabels.style.justifyContent = '';
  }

  plot.append(barsRow);
  viz.append(yAxis, plot, baseline, xLabels);
  mount.append(viz);
  layoutInsightsChartAxes(viz, yRule, plot, baselineLine);
}

/**
 * @param {Record<string, unknown>|null|undefined} data
 */
function buildInsightsModel(data) {
  const company = (data && typeof data.company === 'string' && data.company.trim())
    ? data.company.trim()
    : 'Your company';
  return {
    company,
    usage: resolveUsage(data),
    insightsList: resolveInsightsList(data),
    viewAllUrl: data && typeof data.insightsListUrl === 'string' ? data.insightsListUrl : '#',
  };
}

function newBlockUid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `insights-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * @param {ReturnType<typeof resolveInsightsList>[number]} item
 */
function createInsightListItem(item) {
  const li = document.createElement('li');
  li.className = 'insights-list-item';

  const titleRow = document.createElement('p');
  titleRow.className = 'insights-item-title';
  if (item.titleEmphasis) {
    titleRow.append(document.createTextNode(`${item.title} `));
  } else {
    titleRow.textContent = item.title;
  }

  const summary = document.createElement('p');
  summary.className = 'insights-item-summary';
  summary.textContent = item.summary;

  const cta = document.createElement('a');
  cta.className = 'insights-item-cta';
  cta.href = item.ctaUrl;
  cta.textContent = item.ctaLabel;
  const arrow = document.createElement('span');
  arrow.className = 'insights-item-cta-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '\u2192';
  cta.append(arrow);

  li.append(titleRow, summary, cta);
  return li;
}

/**
 * @param {string} uid
 * @param {string} company
 * @param {ReturnType<typeof resolveInsightsList>} items
 * @param {string} viewAllUrl
 */
function createInsightsListSection(uid, company, items, viewAllUrl) {
  const panel = document.createElement('section');
  panel.className = 'insights-list-panel';
  panel.setAttribute('aria-labelledby', `${uid}-list-title`);

  const listHeader = document.createElement('div');
  listHeader.className = 'insights-list-header';

  const listTitle = document.createElement('h3');
  listTitle.id = `${uid}-list-title`;
  listTitle.className = 'insights-panel-title';
  listTitle.textContent = `${company} Insights`;

  const viewAll = document.createElement('a');
  viewAll.className = 'insights-view-all';
  viewAll.href = viewAllUrl;
  viewAll.textContent = 'View all';
  listHeader.append(listTitle, viewAll);

  const list = document.createElement('ul');
  list.className = 'insights-list';
  items.forEach((item) => list.append(createInsightListItem(item)));

  const scroll = document.createElement('div');
  scroll.className = 'insights-list-scroll';
  scroll.append(list);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'insights-list-scroll-wrap';
  scrollWrap.append(scroll);

  panel.append(listHeader, scrollWrap);
  return panel;
}

/**
 * @param {string} uid
 * @param {string} company
 * @param {ReturnType<typeof resolveUsage>} usage
 */
function createUsageTrendsSection(uid, company, usage) {
  const state = {
    activeTab: /** @type {'dailySpikes' | 'byLocation' | 'seasonal'} */ ('byLocation'),
  };

  const usagePanel = document.createElement('section');
  usagePanel.className = 'insights-usage';
  usagePanel.setAttribute('aria-labelledby', `${uid}-usage-title`);

  const usageTitle = document.createElement('h3');
  usageTitle.id = `${uid}-usage-title`;
  usageTitle.className = 'insights-panel-title';
  usageTitle.textContent = `${company} Usage Trends`;

  const tabs = document.createElement('div');
  tabs.className = 'insights-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Usage breakdown');

  const chartMount = document.createElement('div');
  chartMount.className = 'insights-chart';
  chartMount.id = `${uid}-chart-panel`;
  chartMount.setAttribute('role', 'tabpanel');
  chartMount.setAttribute('aria-labelledby', `${uid}-tab-${state.activeTab}`);

  const chartArea = document.createElement('div');
  chartArea.className = 'insights-chart-area';
  chartArea.append(chartMount);

  /** @type {HTMLButtonElement[]} */
  const tabButtons = [];
  TABS.forEach((tab) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'insights-tab';
    btn.setAttribute('role', 'tab');
    btn.id = `${uid}-tab-${tab.id}`;
    btn.setAttribute('aria-selected', tab.id === state.activeTab ? 'true' : 'false');
    btn.setAttribute('aria-controls', `${uid}-chart-panel`);
    btn.setAttribute('tabindex', tab.id === state.activeTab ? '0' : '-1');
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    if (tab.id === state.activeTab) btn.classList.add('is-active');
    tabs.append(btn);
    tabButtons.push(btn);
  });

  function updateChart() {
    const series = seriesForTab(state.activeTab, usage);
    renderChart(chartMount, series, usage.unitLabel);
    chartMount.setAttribute('aria-labelledby', `${uid}-tab-${state.activeTab}`);
  }

  function setActiveTab(nextId) {
    if (nextId === state.activeTab) return;
    state.activeTab = nextId;
    tabButtons.forEach((b) => {
      const id = b.dataset.tab;
      const isSel = id === state.activeTab;
      b.classList.toggle('is-active', isSel);
      b.setAttribute('aria-selected', isSel ? 'true' : 'false');
      b.setAttribute('tabindex', isSel ? '0' : '-1');
    });
    updateChart();
  }

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.insights-tab');
    if (!btn || !tabs.contains(btn)) return;
    const next = btn.dataset.tab;
    if (next) setActiveTab(next);
  });

  tabs.addEventListener('keydown', (e) => {
    const i = tabButtons.findIndex((b) => b.dataset.tab === state.activeTab);
    if (i < 0) return;
    let nextIdx = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (i + 1) % tabButtons.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (i - 1 + tabButtons.length) % tabButtons.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = tabButtons.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextBtn = tabButtons[nextIdx];
    const nextId = nextBtn.dataset.tab;
    if (nextId) {
      setActiveTab(nextId);
      nextBtn.focus();
    }
  });

  updateChart();

  const usageHeader = document.createElement('div');
  usageHeader.className = 'insights-usage-header';
  usageHeader.append(usageTitle, tabs);
  usagePanel.append(usageHeader, chartArea);
  return usagePanel;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  const data = await (window.frescopaData ?? Promise.resolve(null));
  const model = buildInsightsModel(data);
  const uid = newBlockUid();

  const layout = document.createElement('div');
  layout.className = 'insights-layout';
  layout.append(
    createUsageTrendsSection(uid, model.company, model.usage),
    createInsightsListSection(uid, model.company, model.insightsList, model.viewAllUrl),
  );

  block.replaceChildren(layout);
}
