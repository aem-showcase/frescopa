function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isMaintenanceDue(nextService) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysUntil = (new Date(`${nextService}T00:00:00`) - new Date()) / msPerDay;
  return daysUntil <= 30;
}

function buildFilters(machines) {
  const statuses = [...new Set(machines.map((m) => m.status))];
  const filters = ['All', ...statuses];
  if (machines.some((m) => isMaintenanceDue(m.nextService))) filters.push('Maintenance Due');
  return filters;
}

function createCard(machine) {
  const due = isMaintenanceDue(machine.nextService);
  const statusClass = machine.status.toLowerCase().replace(/\s+/g, '-');

  const card = document.createElement('div');
  card.className = 'machine-fleet-card';
  card.dataset.status = machine.status;
  card.dataset.maintenanceDue = due;

  const img = document.createElement('img');
  img.src = machine.image;
  img.alt = machine.model;
  img.loading = 'lazy';

  const imageEl = document.createElement('div');
  imageEl.className = 'machine-fleet-card-image';
  imageEl.append(img);

  const badge = document.createElement('span');
  badge.className = `machine-fleet-status ${statusClass}`;
  badge.textContent = machine.status;

  const title = document.createElement('h3');
  title.textContent = machine.model;

  const meta = document.createElement('p');
  meta.className = 'machine-fleet-card-meta';
  meta.textContent = `${machine.location.toUpperCase()} · ${machine.unitId}`;

  const stats = [
    ['Cups Today', machine.cupsToday],
    ['Uptime', `${machine.uptime} %`],
    ['Rating', machine.rating],
    ['Next Service', formatDate(machine.nextService)],
  ].map(([label, value]) => {
    const stat = document.createElement('div');
    stat.className = 'machine-fleet-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'machine-fleet-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'machine-fleet-stat-value';
    valueEl.textContent = value;
    stat.append(labelEl, valueEl);
    return stat;
  });

  const statsGrid = document.createElement('div');
  statsGrid.className = 'machine-fleet-stats';
  statsGrid.append(...stats);

  const details = document.createElement('div');
  details.className = 'machine-fleet-card-details';
  details.append(badge, title, meta, statsGrid);

  card.append(imageEl, details);
  return card;
}

export default async function decorate(block) {
  const data = await (window.frescopaData ?? Promise.resolve(null));

  if (!data?.machineFleet?.length) {
    block.closest('.section')?.remove();
    return;
  }

  const { machineFleet, company } = data;
  const filters = buildFilters(machineFleet);

  const title = document.createElement('h2');
  title.className = 'machine-fleet-title';
  title.textContent = `${company} Machine Fleet`;

  const filterBar = document.createElement('div');
  filterBar.className = 'machine-fleet-filters';
  filters.forEach((filter, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'machine-fleet-filter';
    if (i === 0) btn.classList.add('active');
    btn.textContent = filter;
    btn.dataset.filter = filter;

    if (filter !== 'All') {
      const hasMatch = filter === 'Maintenance Due'
        ? machineFleet.some((m) => isMaintenanceDue(m.nextService))
        : machineFleet.some((m) => m.status === filter);
      if (!hasMatch) btn.disabled = true;
    }

    filterBar.append(btn);
  });

  const header = document.createElement('div');
  header.className = 'machine-fleet-header';
  header.append(title, filterBar);

  const grid = document.createElement('div');
  grid.className = 'machine-fleet-grid';
  machineFleet.forEach((machine) => grid.append(createCard(machine)));

  filterBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.machine-fleet-filter');
    if (!btn || btn.disabled) return;
    filterBar.querySelectorAll('.machine-fleet-filter').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const active = btn.dataset.filter;
    grid.querySelectorAll('.machine-fleet-card').forEach((card) => {
      if (active === 'All') {
        card.hidden = false;
      } else if (active === 'Maintenance Due') {
        card.hidden = card.dataset.maintenanceDue !== 'true';
      } else {
        card.hidden = card.dataset.status !== active;
      }
    });
  });

  block.textContent = '';
  block.append(header, grid);
}
