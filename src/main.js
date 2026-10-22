const shipmentTableBody = document.querySelector('#shipment-table-body');
const allocationList = document.querySelector('#allocation-list');
const driverGrid = document.querySelector('#driver-grid');
const generatedAt = document.querySelector('#generated-at');
const activeShipments = document.querySelector('#active-shipments');
const driversOnline = document.querySelector('#drivers-online');

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date) + ' UTC';
}

function statusClass(status) {
  const normalized = status.toLowerCase();
  if (normalized.includes('transit')) return 'in-transit';
  if (normalized.includes('cleared')) return 'cleared';
  if (normalized.includes('loading')) return 'loading';
  if (normalized.includes('delay')) return 'delayed';
  return 'in-transit';
}

function renderShipments(shipments) {
  shipmentTableBody.innerHTML = shipments
    .map((shipment) => `
      <tr>
        <td><strong>${shipment.id}</strong></td>
        <td>${shipment.route}</td>
        <td>${shipment.mode}</td>
        <td><span class="status-pill ${statusClass(shipment.status)}">${shipment.status}</span></td>
        <td>${formatTimestamp(shipment.eta)}</td>
      </tr>
    `)
    .join('');
}

function renderAllocations(allocations) {
  allocationList.innerHTML = allocations
    .map(
      (item) => `
        <div class="allocation-item">
          <div class="allocation-header">
            <strong>${item.region}</strong>
            <span>${item.assigned}</span>
          </div>
          <div class="allocation-bar"><span style="width: ${item.utilization}%"></span></div>
          <small>${item.focus}</small>
        </div>
      `,
    )
    .join('');
}

function renderDrivers(drivers) {
  driverGrid.innerHTML = drivers
    .map(
      (driver) => `
        <article class="driver-card">
          <div class="driver-avatar">${driver.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
          <h3>${driver.name}</h3>
          <p>${driver.region}</p>
          <small>${driver.vehicle}</small>
          <div class="driver-meta">
            <span>${driver.load}</span>
            <span class="driver-status">${driver.status}</span>
          </div>
        </article>
      `,
    )
    .join('');
}

async function loadDashboard() {
  const response = await fetch('/api/dashboard');
  if (!response.ok) {
    throw new Error(`Unable to load logistics dashboard (${response.status})`);
  }

  const data = await response.json();
  const summary = data.summary ?? [];
  const shipmentSummary = summary.find((item) => item.label === 'Active shipments');
  const driverSummary = summary.find((item) => item.label === 'Drivers online');

  generatedAt.textContent = `Updated ${new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(data.generatedAt))}`;

  activeShipments.textContent = shipmentSummary ? shipmentSummary.value : '0';
  driversOnline.textContent = driverSummary ? driverSummary.value : '0';
  renderShipments(data.shipments ?? []);
  renderAllocations(data.allocations ?? []);
  renderDrivers(data.drivers ?? []);
}

window.addEventListener('DOMContentLoaded', () => {
  loadDashboard().catch((error) => {
    const fallback = document.querySelector('#shipment-table-body');
    if (fallback) {
      fallback.innerHTML = '<tr><td colspan="5">Unable to load live logistics data.</td></tr>';
    }
    console.error(error);
  });
});