// ---- Config ----
// Removed LS_TENDERS_KEY and LS_TXNS_KEY as we are no longer using localStorage directly.
// IMPORTANT: Replace this with the Web App URL you get after deploying your Google Apps Script.
const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwaXBso-9dn9VP-1TpS1iu8by-2WuPGeivTn2H1G1o/dev'; 

// ---- State ----
let tenders = [];
let transactions = [];
let editTenderId = null;     // when editing, store the original Tender ID
let editTxnId = null;        // when editing, store the original Transaction ID

// ---- Small helpers ----
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Loads application state (tenders and transactions) from Google Drive
 * via the deployed Google Apps Script.
 */
async function loadState(){
  showSpinner(); // Show spinner while loading
  try {
    const response = await fetch(APP_SCRIPT_URL, {
      method: 'GET', // Use GET for loading data
      // No body needed for GET, as parameters can be in the URL if needed,
      // but our Apps Script handles both data types in a single GET.
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Ensure data structure is as expected, handle potential errors from Apps Script
    if (data.error) {
      console.error('Error from Apps Script:', data.error);
      showToast('Error loading data from Drive. Check console.');
      tenders = [];
      transactions = [];
    } else {
      tenders = data.tenders || [];
      transactions = data.transactions || [];
      showToast('Data loaded from Drive');
    }

  } catch (error) {
    console.error('Failed to load state from Google Drive:', error);
    showToast('Failed to load data from Drive. Using empty data.');
    tenders = []; // Fallback to empty arrays on error
    transactions = [];
  } finally {
    hideSpinner(); // Hide spinner after loading
  }
}

/**
 * Saves application state (tenders and transactions) to Google Drive
 * via the deployed Google Apps Script.
 */
async function saveState(){
  showSpinner(); // Show spinner while saving
  try {
    const payload = {
      tenders: tenders,
      transactions: transactions
    };

    const response = await fetch(APP_SCRIPT_URL, {
      method: 'POST', // Use POST for saving data
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload), // Send all data as a JSON string
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    
    if (result.status === 'success') {
      showToast('Data saved to Drive');
    } else {
      console.error('Error from Apps Script:', result.message);
      showToast('Error saving data to Drive. Check console.');
    }

  } catch (error) {
    console.error('Failed to save state to Google Drive:', error);
    showToast('Failed to save data to Drive.');
  } finally {
    hideSpinner(); // Hide spinner after saving
  }
}

function showToast(msg){
  const toast = $('#toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 2400);
}

function confirmDialog({title="Confirm", message="Are you sure?"}) {
  return new Promise(resolve => {
    const dlg = $('#confirmDialog');
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    dlg.showModal();
    dlg.addEventListener('close', function handler(){
      dlg.removeEventListener('close', handler);
      resolve(dlg.returnValue === 'ok');
    });
  });
}

// ---- Date/time helpers (IST) ----
function pad(n){ return String(n).padStart(2, '0'); }

// Return a string suitable for datetime-local input for current IST time
function nowISTDatetimeLocal(){
  const now = new Date();
  // get UTC time then add IST offset (5.5 hours)
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istOffsetMs = (5 * 60 + 30) * 60000;
  const ist = new Date(utc + istOffsetMs);
  const y = ist.getFullYear();
  const m = pad(ist.getMonth() + 1);
  const d = pad(ist.getDate());
  const hh = pad(ist.getHours());
  const mm = pad(ist.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

// Convert ISO stored string to a datetime-local value (localised to IST)
function isoToDatetimeLocalForIST(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  // convert to IST by calculating UTC + offset
  const utc = d.getTime();
  const istOffsetMs = (5 * 60 + 30) * 60000;
  const ist = new Date(utc + istOffsetMs);
  const y = ist.getFullYear();
  const m = pad(ist.getMonth() + 1);
  const day = pad(ist.getDate());
  const hh = pad(ist.getHours());
  const mm = pad(ist.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

// Convert datetime-local input (assumed IST) to ISO string in UTC for storage
function datetimeLocalISTToISO(value){
  if(!value) return '';
  // value like "2025-08-15T13:30"
  // treat this as IST then convert to UTC ISO
  const [datePart, timePart] = value.split('T');
  const [y,m,d] = datePart.split('-').map(Number);
  const [hh,mm] = timePart.split(':').map(Number);
  // build Date in UTC by subtracting IST offset
  // Get millis for that IST datetime
  const istDate = new Date(Date.UTC(y, m-1, d, hh, mm));
  // IST = UTC + 5.5h => UTC = IST - 5.5h
  const istOffsetMs = (5 * 60 + 30) * 60000;
  const utcMs = istDate.getTime() - istOffsetMs;
  return new Date(utcMs).toISOString();
}

// Format ISO to readable IST date/time for display in table
function formatISOToISTDisplay(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  // convert to IST
  const utc = d.getTime();
  const istOffsetMs = (5 * 60 + 30) * 60000;
  const ist = new Date(utc + istOffsetMs);
  const y = ist.getFullYear();
  const m = pad(ist.getMonth()+1);
  const day = pad(ist.getDate());
  const hh = pad(ist.getHours());
  const mm = pad(ist.getMinutes());
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

// ---- ID generator: TD-### (matching previous style) ----
function getNextTenderId(){
  const nums = tenders
    .map(t => {
      const id = String(t.tenderId || '');
      const m = id.match(/^TD-(\d+)$/i);
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter(n => !isNaN(n));

  const max = nums.length ? Math.max(...nums) : 0;
  const next = max + 1;
  return `TD-${String(next).padStart(3, '0')}`;
}

// ---- Transaction ID generator per tender: TD-XXX-TXYYY ----
function getNextTxnIdForTender(tenderId){
  if(!tenderId) return '';
  const nums = transactions
    .filter(x => x.tenderId === tenderId)
    .map(x => {
      const m = String(x.txnId || '').match(/-TX(\d+)$/i);
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  const next = max + 1;
  return `${tenderId}-TX${String(next).padStart(3,'0')}`;
}

// ---- Renderers ----
function renderTenderDropdown(){
  const select = $('#txnTenderId');
  const cur = select.value;
  select.innerHTML = `<option value="">-- Select Tender --</option>` + tenders.map(t => `<option value="${t.tenderId}">${t.tenderId} — ${t.tenderName || ''}</option>`).join('');
  if(cur) select.value = cur;
}

function renderTenderTable(filterText = ''){
  const tbody = $('#tenderTable tbody');
  tbody.innerHTML = '';
  const q = filterText.trim().toLowerCase();

  tenders
    .filter(t => {
      if(!q) return true;
      return Object.values(t).some(v => String(v ?? '').toLowerCase().includes(q));
    })
    .forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge">${t.tenderId}</span></td>
        <td>${t.tenderName ?? ''}</td>
        <td>${t.tenderDesc ?? ''}</td>
        <td>${t.tenderCity ?? ''}</td>
        <td>${t.tenderPincode ?? ''}</td>
        <td>${t.tenderValue ?? ''}</td>
        <td>${formatISOToISTDisplay(t.tenderDate)}</td>
        <td>
          <div class="row-actions">
            <button class="btn" data-action="edit" data-id="${t.tenderId}">Edit</button>
            <button class="btn danger" data-action="delete" data-id="${t.tenderId}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

  // attach action listeners
  $$('#tenderTable [data-action="edit"]').forEach(btn=>{
    btn.addEventListener('click', onEditTender);
  });
  $$('#tenderTable [data-action="delete"]').forEach(btn=>{
    btn.addEventListener('click', onDeleteTender);
  });
}

function renderTxnTable(filterText = ''){
  const tbody = $('#txnTable tbody');
  tbody.innerHTML = '';
  const q = filterText.trim().toLowerCase();

  transactions
    .filter(x => {
      if(!q) return true;
      return Object.values(x).some(v => String(v ?? '').toLowerCase().includes(q));
    })
    .forEach(x => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="badge">${x.txnId}</span></td>
        <td>${x.tenderId ?? ''}</td>
        <td>${x.txnDesc ?? ''}</td>
        <td>${x.txnType ?? ''}</td>
        <td>${x.vendorName ?? ''}</td>
        <td>${x.amount ?? ''}</td>
        <td>${formatISOToISTDisplay(x.txnDate)}</td>
        <td>
          <div class="row-actions">
            <button class="btn" data-action="edit" data-id="${x.txnId}">Edit</button>
            <button class="btn danger" data-action="delete" data-id="${x.txnId}">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

  $$('#txnTable [data-action="edit"]').forEach(btn=>{
    btn.addEventListener('click', onEditTxn);
  });
  $$('#txnTable [data-action="delete"]').forEach(btn=>{
    btn.addEventListener('click', onDeleteTxn);
  });
}

// ---- Handlers: Tender ----
function onEditTender(e){
  const id = e.currentTarget.dataset.id;
  const t = tenders.find(x=> x.tenderId === id);
  if(!t) return;

  // switch to Create Tender screen
  document.querySelector('.tab-btn[data-screen="createTender"]').click();

  // fill the form (convert stored ISO -> datetime-local IST value)
  $('#tenderId').value = t.tenderId;
  $('#tenderName').value = t.tenderName || '';
  $('#tenderDesc').value = t.tenderDesc || '';
  // $('#tenderType').value = t.tenderType || 'Government';
  $('#tenderCity').value = t.tenderCity || '';
  $('#tenderPincode').value = t.tenderPincode || '';
  $('#tenderValue').value = t.tenderValue ?? '';
  $('#tenderDate').value = isoToDatetimeLocalForIST(t.tenderDate);

  editTenderId = t.tenderId;
  $('#saveTenderBtn').textContent = 'Update Tender';
  $('#saveTenderBtn').classList.add('pulse-once');
  setTimeout(()=>$('#saveTenderBtn').classList.remove('pulse-once'), 650);
}

async function onDeleteTender(e){
  const id = e.currentTarget.dataset.id;
  const ok = await confirmDialog({title:'Delete Tender', message:`Delete Tender "${id}"? All linked transactions will be deleted.`});
  if(!ok) return;

  // delete tender
  tenders = tenders.filter(t=> t.tenderId !== id);
  // delete linked transactions
  transactions = transactions.filter(tx => tx.tenderId !== id);

  await saveState(); // AWAIT the save operation
  renderTenderTable($('#tenderSearch').value);
  renderTxnTable($('#txnSearch').value);
  renderTenderDropdown();
  showToast('Tender and linked transactions deleted');
}

async function handleTenderSubmit(e){ // Make this function async
  e.preventDefault();
  const tender = {
    tenderId: $('#tenderId').value.trim() || getNextTenderId(),
    tenderName: $('#tenderName').value.trim(),
    tenderDesc: $('#tenderDesc').value.trim(),
    // tenderType: $('#tenderType').value || 'Government',
    tenderCity: $('#tenderCity').value.trim(),
    tenderPincode: $('#tenderPincode').value.trim(),
    tenderValue: $('#tenderValue').value ? Number($('#tenderValue').value) : '',
    tenderDate: $('#tenderDate').value ? datetimeLocalISTToISO($('#tenderDate').value) : ''
  };

  // Validation
  if(!tender.tenderId){ showToast('Tender ID is required'); return; }
  if(!tender.tenderName){ showToast('Tender Name is required'); return; }
  if(tender.tenderPincode && !/^\d{6}$/.test(tender.tenderPincode)){ showToast('Pincode must be 6 digits'); return; }

  if(editTenderId){
    // If user changed tenderId while editing (shouldn't normally since readonly), ensure no duplicate
    if(tender.tenderId !== editTenderId && tenders.some(t=> t.tenderId === tender.tenderId)){
      showToast('Tender ID already exists'); return;
    }
    const idx = tenders.findIndex(t=> t.tenderId === editTenderId);
    if(idx !== -1){
      tenders[idx] = tender;
      // if tenderId was changed (rare), need to update related transaction.tenderId references
      if(tender.tenderId !== editTenderId){
        transactions = transactions.map(tx => tx.tenderId === editTenderId ? {...tx, tenderId: tender.tenderId} : tx);
      }
    }
    editTenderId = null;
    $('#saveTenderBtn').textContent = 'Save Tender';
    showToast('Tender updated');
  } else {
    // prevent duplicate IDs
    if (tenders.some(t=> t.tenderId === tender.tenderId)){
      showToast('Tender ID already exists'); return;
    }
    tenders.push(tender);
    showToast('Tender saved');
  }

  await saveState(); // AWAIT the save operation
  renderTenderTable($('#tenderSearch').value);
  renderTxnTable($('#txnSearch').value);
  renderTenderDropdown();

  // small animation feedback
  $('#tenderForm').classList.add('flash');
  setTimeout(()=> $('#tenderForm').classList.remove('flash'), 700);

  // clear and prepare next ID
  $('#tenderForm').reset();
  $('#tenderId').value = getNextTenderId();
  $('#tenderDate').value = nowISTDatetimeLocal();
}

// <-------------------------------1---------------------------------->
// ---- Handlers: Transactions ----
function onEditTxn(e){
  const id = e.currentTarget.dataset.id;
  console.log("Editing transaction ID:", id);
  const x = transactions.find(t=> t.txnId === id);
  console.log("Found transaction:", x);
  if(!x) {
    // console.error("Transaction not found!");
    return;
  }
  const editValues = {
    txnId: x.txnId, // This is confirmed to exist from your logs
    tenderId: x.tenderId,
    txnDesc: x.txnDesc || '',
    txnType: x.txnType || 'Payment',
    vendorName: x.vendorName || '',
    amount: x.amount ?? '',
    txnDate: isoToDatetimeLocalForIST(x.txnDate)
  };
  const tenderSelect = $('#txnTenderId');
  if (tenderSelect) {
    tenderSelect.value = editValues.tenderId;
    console.log("Pre-selected tender:", tenderSelect.value);
  }
  console.log('edit' || editValues.txnId);
  $('#txnId').value = x.txnId;
  console.log('txnid' || x.txnId);
  
  console.log('edit values:', editValues);
  console.log('txnId to set:', x.txnId);

  $('#txnId').value = x.txnId;

  console.log('Current field value:', $('#txnId').value);
  document.querySelector('.tab-btn[data-screen="createTxn"]').click();

  setTimeout(() => {
  const txnIdField = $('#txnId');
  if (!txnIdField) {
    console.error('#txnId field not found!');
    return;
  }

  txnIdField.value = x.txnId;
  $('#txnTenderId').value = x.tenderId;
  $('#txnDesc').value = x.txnDesc || '';
  $('#txnType').value = x.txnType || 'Payment';
  $('#vendorName').value = x.vendorName || '';
  $('#amount').value = x.amount ?? '';
  $('#txnDate').value = isoToDatetimeLocalForIST(x.txnDate);

  console.log('Transaction ID loaded:', txnIdField.value);
}, 50);

  editTxnId = x.txnId;
  $('#saveTxnBtn').textContent = 'Update Transaction';
  $('#saveTxnBtn').classList.add('pulse-once');
  setTimeout(()=>$('#saveTxnBtn').classList.remove('pulse-once'), 650);
}


async function onDeleteTxn(e){ // Make this function async
  const id = e.currentTarget.dataset.id;
  const ok = await confirmDialog({title:'Delete Transaction', message:`Delete Transaction "${id}"?`});
  if(!ok) return;

  transactions = transactions.filter(x=> x.txnId !== id);
  await saveState(); // AWAIT the save operation
  renderTxnTable($('#txnSearch').value);
  showToast('Transaction deleted');
}

async function handleTxnSubmit(e){ // Make this function async
  e.preventDefault();
  
  const txn = {
    txnId: $('#txnId').value.trim(),
    tenderId: $('#txnTenderId').value,
    txnDesc: $('#txnDesc').value.trim() || '',       // allow null/empty
    txnType: $('#txnType').value || '',             // allow null/empty
    vendorName: $('#vendorName').value.trim() || '', // allow null/empty
    // paymentMode: $('#paymentMode').value || '',   // uncomment if needed
    amount: $('#amount').value ? Number($('#amount').value) : 0, // default 0
    txnDate: $('#txnDate').value ? datetimeLocalISTToISO($('#txnDate').value) : '' // allow null
  };

  // Validation
  if(!txn.txnId){ showToast('Transaction ID is required'); return; }
  if(!txn.tenderId){ showToast('Linked Tender ID is required'); return; }

  if(editTxnId){
    // Update existing transaction
    const idx = transactions.findIndex(x => x.txnId === editTxnId);
    if(idx !== -1){
      transactions[idx] = txn;
    }
    editTxnId = null;
    $('#saveTxnBtn').textContent = 'Save Transaction';
    showToast('Transaction updated');
  } else {
    // Prevent duplicate txnId
    if(transactions.some(x => x.txnId === txn.txnId)){
      showToast('Transaction ID already exists'); return;
    }
    transactions.push(txn);
    showToast('Transaction saved');
  }

  await saveState(); // AWAIT the save operation
  renderTxnTable($('#txnSearch').value);

  // animation feedback
  $('#txnForm').classList.add('flash');
  setTimeout(()=> $('#txnForm').classList.remove('flash'), 700);

  // reset form for next entry
  $('#txnForm').reset();
  $('#txnDate').value = nowISTDatetimeLocal();
  $('#txnId').value = ''; // auto-generate when tender selected
  renderTenderDropdown();
}


// ---- Init functions ----
function initTabs(){
  $$('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> {
      // switch active class
      $$('.tab-btn').forEach(b=> b.classList.remove('active'));
      btn.classList.add('active');

      // show target screen
      const target = btn.dataset.screen;
      $$('.screen').forEach(s => {
        s.classList.remove('visible');
        s.classList.remove('fade-in');
      });
      const el = document.getElementById(target);
      el.classList.add('visible', 'fade-in');
      window.scrollTo({top:0, behavior:'smooth'});

      // Special behaviour: when clicking Create Tender always reset form & show Save Tender
      if(target === 'createTender') {
        $('#tenderForm').reset();
        editTenderId = null;
        $('#saveTenderBtn').textContent = 'Save Tender';
        // set next ID and current IST datetime
        $('#tenderId').value = getNextTenderId();
        $('#tenderDate').value = nowISTDatetimeLocal();
      }
      // when clicking Create Transaction prepare txnDate and ensure dropdown populated
      if(target === 'createTxn'){
        renderTenderDropdown();
        $('#txnForm').reset();
        editTxnId = null;
        $('#saveTxnBtn').textContent = 'Save Transaction';
        $('#txnDate').value = nowISTDatetimeLocal();
        $('#txnId').value = '';
      }
    });
  });
}

function initSearch(){
  $('#tenderSearch').addEventListener('input', (e)=> renderTenderTable(e.target.value));
  $('#txnSearch').addEventListener('input', (e)=> renderTxnTable(e.target.value));
}

function initForms(){
  $('#tenderForm').addEventListener('submit', handleTenderSubmit);
  $('#txnForm').addEventListener('submit', handleTxnSubmit);

  // When tender selection changes, auto-generate txn id
  $('#txnTenderId').addEventListener('change', (e)=>{
    const tid = e.target.value;
    $('#txnId').value = tid ? getNextTxnIdForTender(tid) : '';
  });

  // reset behaviour: exit edit mode
  $('#tenderForm').addEventListener('reset', ()=>{
    editTenderId = null;
    $('#saveTenderBtn').textContent = 'Save Tender';
    // re-populate default id & date shortly after reset to let browser clear fields
    setTimeout(()=>{
      $('#tenderId').value = getNextTenderId();
      $('#tenderDate').value = nowISTDatetimeLocal();
    }, 20);
  });

  $('#txnForm').addEventListener('reset', ()=>{
    editTxnId = null;
    $('#saveTxnBtn').textContent = 'Save Transaction';
    setTimeout(()=> {
      $('#txnDate').value = nowISTDatetimeLocal();
      $('#txnId').value = '';
    }, 20);
  });
}

//Add a small demo entry at first-run for UX
async function firstTimeUX(){ // Make this async as it might trigger a saveState
  if(tenders.length === 0){
    // tenders.push({
    //   tenderId:'TD-001',
    //   tenderName:'Sample Road Work',
    //   tenderDesc:'Demo tender for onboarding',
    //   // tenderType:'Government',
    //   tenderCity:'Pune',
    //   tenderPincode:'411001',
    //   tenderValue: 500000,
    //   tenderDate: new Date().toISOString()
    // });
    // await saveState(); // AWAIT the save operation if uncommenting demo data
  }
}

document.addEventListener('DOMContentLoaded', async ()=>{ // Make DOMContentLoaded listener async
  await loadState(); // AWAIT the load operation
  await firstTimeUX(); // AWAIT firstTimeUX
  initTabs();
  initForms();
  initSearch();

  // initial values for create forms
  $('#tenderId').value = getNextTenderId();
  $('#tenderDate').value = nowISTDatetimeLocal();
  $('#txnDate').value = nowISTDatetimeLocal();

  renderTenderTable();
  renderTxnTable();
  renderTenderDropdown();
});

// <----------------------------------1-pdf------------------------------------>
// async function exportTxnTableToPDF() {
//   const { jsPDF } = window.jspdf;
//   const doc = new jsPDF('p', 'pt', 'a4'); // portrait

//   doc.setFontSize(16);
//   doc.text('Tenders & Transactions Report', 40, 40);

//   tenders.forEach((tender, index) => {
//     if (index > 0) doc.addPage(); // start each tender on a new page

//     let yPos = 60;

//     // Tender details
//     doc.setFont(undefined, 'bold');
//     doc.setFontSize(12);
//     doc.text(`Tender ID: ${tender.tenderId}`, 40, yPos);
//     doc.setFont(undefined, 'normal');
//     doc.text(`Name: ${tender.tenderName || ''}`, 200, yPos);
//     doc.text(`City: ${tender.tenderCity || ''}`, 400, yPos);
//     yPos += 18;
//     doc.text(`Pincode: ${tender.tenderPincode || ''}`, 40, yPos);
//     doc.text(`Value: ${tender.tenderValue ?? ''}`, 200, yPos);
//     doc.text(`Date: ${formatISOToISTDisplay(tender.tenderDate)}`, 400, yPos);
//     yPos += 25;

//     // Transactions for this tender
//     const txnList = transactions.filter(tx => tx.tenderId === tender.tenderId);
//     if (txnList.length) {
//       const headers = ['Txn ID', 'Description', 'Type', 'Vendor', 'Amount', 'Date'];
//       const data = txnList.map(tx => [
//         tx.txnId,
//         tx.txnDesc || '',
//         tx.txnType || '',
//         tx.vendorName || '',
//         tx.amount ?? '',
//         formatISOToISTDisplay(tx.txnDate)
//       ]);

//       doc.autoTable({
//         head: [headers],
//         body: data,
//         startY: yPos,
//         theme: 'grid',
//         headStyles: { fillColor: [91, 140, 255] },
//         styles: { fontSize: 10 },
//         margin: { left: 40 }
//       });

//     } else {
//       doc.text('No transactions found', 50, yPos);
//     }
//   });

//   doc.save(`Tenders_Transactions_${new Date().toISOString().slice(0,10)}.pdf`);
// }

//<------------------------------2-pdf---------------------------------------->

document.getElementById('exportTxnPdfBtn').addEventListener('click', () => {
  const selectedId = document.getElementById('tenderIdSelect').value;

  let filteredTxns;
  if (selectedId === 'all') {
    filteredTxns = transactions; // all transactions
  } else {
    filteredTxns = transactions.filter(tx => tx.tenderId === selectedId);
  }

  exportTxnTableToPDF(filteredTxns);
});

// async function exportTxnTableToPDF() {
//   const { jsPDF } = window.jspdf;
//   const doc = new jsPDF('p', 'pt', 'a4');
//   const margin = 40;

//   doc.setFontSize(16);
//   doc.text('Tenders & Transactions Report', margin, 40);

//   let yPos = 60;

//   for (let index = 0; index < tenders.length; index++) {
//     const tender = tenders[index];

//     doc.setFont(undefined, 'bold');
//     doc.setFontSize(12);
//     doc.text(`Tender ID: ${tender.tenderId}`, margin, yPos);
//     doc.setFont(undefined, 'normal');

//     doc.text(`Name: ${tender.tenderName || ''}`, margin + 160, yPos);
//     doc.text(`City: ${tender.tenderCity || ''}`, margin + 360, yPos);
//     yPos += 18;
//     doc.text(`Pincode: ${tender.tenderPincode || ''}`, margin, yPos);
//     doc.text(`Value: ${tender.tenderValue ?? ''}`, margin + 160, yPos);
//     doc.text(`Date: ${formatISOToISTDisplay(tender.tenderDate)}`, margin + 360, yPos);
//     yPos += 25;

//     const txnList = transactions.filter(tx => tx.tenderId === tender.tenderId);

//     if (txnList.length) {
//       const headers = ['Txn ID', 'Description', 'Type', 'Vendor', 'Amount', 'Date'];
//       const data = txnList.map(tx => [
//         tx.txnId,
//         tx.txnDesc || '',
//         tx.txnType || '',
//         tx.vendorName || '',
//         tx.amount ?? '',
//         formatISOToISTDisplay(tx.txnDate)
//       ]);

//       doc.autoTable({
//         head: [headers],
//         body: data,
//         startY: yPos,
//         theme: 'grid',
//         headStyles: { fillColor: [91, 140, 255] },
//         styles: { fontSize: 10, overflow: 'linebreak', cellPadding: 3 }, 
//         margin: { left: margin, right: margin },
//         columnStyles: {
//           0: { cellWidth: 60 },   // Txn ID
//           1: { cellWidth: 150 },  // Description - wrap
//           2: { cellWidth: 60 },   // Type
//           3: { cellWidth: 100 },  // Vendor - wrap
//           4: { cellWidth: 60 },   // Amount
//           5: { cellWidth: 80 }    // Date
//         },
//         didDrawPage: (data) => {
//           yPos = data.cursor.y + 20; // update for next content
//         }
//       });
//     } else {
//       doc.text('No transactions found', margin, yPos);
//       yPos += 20;
//     }

//     // Add a page if next tender does not fit
//     if (index < tenders.length - 1) {
//       doc.addPage();
//       yPos = 40;
//     }
//   }

//   doc.save(`Tenders_Transactions_${new Date().toISOString().slice(0,10)}.pdf`);
// }

async function exportTxnTableToPDF(filteredTxns) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'pt', 'a4');
  const margin = 40;

  doc.setFontSize(16);
  doc.text('Tenders & Transactions Report', margin, 40);

  let yPos = 60;

  // Determine which tenders to include
  const selectedId = document.getElementById('tenderIdSelect').value;
  let tendersToInclude;

  if (selectedId === 'all') {
    // all tenders that have transactions
    tendersToInclude = tenders.filter(t => filteredTxns.some(tx => tx.tenderId === t.tenderId));
  } else {
    const tender = tenders.find(t => t.tenderId === selectedId);
    tendersToInclude = tender ? [tender] : [];
  }

  for (let index = 0; index < tendersToInclude.length; index++) {
    const tender = tendersToInclude[index];

    doc.setFont(undefined, 'bold');
    doc.setFontSize(12);
    doc.text(`Tender ID: ${tender.tenderId}`, margin, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(`Name: ${tender.tenderName || ''}`, margin + 160, yPos);
    doc.text(`City: ${tender.tenderCity || ''}`, margin + 360, yPos);
    yPos += 18;
    doc.text(`Pincode: ${tender.tenderPincode || ''}`, margin, yPos);
    doc.text(`Value: ${tender.tenderValue ?? ''}`, margin + 160, yPos);
    doc.text(`Date: ${formatISOToISTDisplay(tender.tenderDate)}`, margin + 360, yPos);
    yPos += 25;

    const txnList = filteredTxns.filter(tx => tx.tenderId === tender.tenderId);

    if (txnList.length) {
      const headers = ['Txn ID', 'Description', 'Type', 'Vendor', 'Amount', 'Date'];
      const data = txnList.map(tx => [
        tx.txnId,
        tx.txnDesc || '',
        tx.txnType || '',
        tx.vendorName || '',
        tx.amount ?? '',
        formatISOToISTDisplay(tx.txnDate)
      ]);

      doc.autoTable({
        head: [headers],
        body: data,
        startY: yPos,
        theme: 'grid',
        headStyles: { fillColor: [91, 140, 255] },
        styles: { fontSize: 10, overflow: 'linebreak', cellPadding: 3 }, 
        margin: { left: margin, right: margin },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 150 },
          2: { cellWidth: 60 },
          3: { cellWidth: 100 },
          4: { cellWidth: 60 },
          5: { cellWidth: 80 }
        },
        didDrawPage: (data) => {
          yPos = data.cursor.y + 20;
        }
      });
    } else {
      doc.text('No transactions found', margin, yPos);
      yPos += 20;
    }

    if (index < tendersToInclude.length - 1) {
      doc.addPage();
      yPos = 40;
    }
  }

  doc.save(`Tenders_Transactions_${new Date().toISOString().slice(0,10)}.pdf`);
}

// attach event
$('#exportTxnPdfBtn').addEventListener('click', exportTxnTableToPDF);

//<--------manage tender filter------------------------>
// Example: populate Tender ID dropdown

// Call this on page load
populateTenderDropdown();
renderTransactions(transactions);

// manageTxns.js

// Example data (replace with actual data or fetch from API)

function formatISOToISTDisplay(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }

function populateTenderDropdown() {
  const tenderSelect = document.getElementById('tenderIdSelect');
  tenderSelect.innerHTML = `<option value="all">All</option>`;
  tenders.forEach(t => {
    const option = document.createElement('option');
    option.value = t.tenderId;
    option.textContent = `${t.tenderId} - ${t.tenderName}`;
    tenderSelect.appendChild(option);
  });
}

function renderTransactions(txns) {
  const tbody = document.querySelector('#txnTable tbody');
  tbody.innerHTML = '';
  txns.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${tx.txnId}</td>
      <td>${tx.tenderId}</td>
      <td>${tx.txnDesc}</td>
      <td>${tx.txnType}</td>
      <td>${tx.vendorName}</td>
      <td>${tx.amount}</td>
      <td>${formatISOToISTDisplay(tx.txnDate)}</td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });
}

// Initialize after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  populateTenderDropdown();
  renderTransactions(transactions);

  document.getElementById('tenderIdSelect').addEventListener('change', (e) => {
    const selectedId = e.target.value;
    const tenderNameInput = document.getElementById('tenderNameInput');

    if (selectedId === 'all') {
      tenderNameInput.value = '';
      renderTransactions(transactions);
    } else {
      const tender = tenders.find(t => t.tenderId === selectedId);
      tenderNameInput.value = tender ? tender.tenderName : '';
      const filteredTxns = transactions.filter(tx => tx.tenderId === selectedId);
      renderTransactions(filteredTxns);
    }
  });
});


//<-----nextpagemanagetxn----------------------?

// Pagination variables
let currentPage = 1;
const pageSize = 5;
let currentTxns = []; // filtered transactions

// Populate Tender dropdown
function populateTenderDropdown() {
  const tenderSelect = document.getElementById('tenderIdSelect');
  tenderSelect.innerHTML = `<option value="all">All</option>`;
  tenders.forEach(t => {
    const option = document.createElement('option');
    option.value = t.tenderId;
    option.textContent = `${t.tenderId} - ${t.tenderName}`;
    tenderSelect.appendChild(option);
  });
}

// Render transactions with pagination
function renderTransactionsPage(page = 1) {
  const tbody = document.querySelector('#txnTable tbody');
  tbody.innerHTML = '';

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageTxns = currentTxns.slice(start, end);

  pageTxns.forEach(tx => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${tx.txnId}</td>
      <td>${tx.tenderId}</td>
      <td>${tx.txnDesc}</td>
      <td>${tx.txnType}</td>
      <td>${tx.vendorName}</td>
      <td>${tx.amount}</td>
      <td>${formatISOToISTDisplay(tx.txnDate)}</td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });

  // Update page info
  const pageCount = Math.ceil(currentTxns.length / pageSize) || 1;
  document.getElementById('pageInfo').textContent = `Page ${currentPage} of ${pageCount}`;

  // Disable buttons at limits
  document.getElementById('prevPageBtn').disabled = currentPage === 1;
  document.getElementById('nextPageBtn').disabled = currentPage === pageCount;
}

// Filter transactions based on dropdown
function filterTransactionsByTender() {
  const tenderSelect = document.getElementById('tenderIdSelect');
  const selectedId = tenderSelect.value;
  const tenderNameInput = document.getElementById('tenderNameInput');

  if (selectedId === 'all') {
    tenderNameInput.value = '';
    currentTxns = transactions;
  } else {
    const tender = tenders.find(t => t.tenderId === selectedId);
    tenderNameInput.value = tender ? tender.tenderName : '';
    currentTxns = transactions.filter(tx => tx.tenderId === selectedId);
  }

  currentPage = 1; // reset to first page
  renderTransactionsPage(currentPage);
}

// Pagination buttons
document.getElementById('prevPageBtn').addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    renderTransactionsPage(currentPage);
  }
});

document.getElementById('nextPageBtn').addEventListener('click', () => {
  const pageCount = Math.ceil(currentTxns.length / pageSize);
  if (currentPage < pageCount) {
    currentPage++;
    renderTransactionsPage(currentPage);
  }
});

// Initialize after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  populateTenderDropdown();
  filterTransactionsByTender(); // sets initial currentTxns and renders first page

  document.getElementById('tenderIdSelect').addEventListener('change', filterTransactionsByTender);
});


// Initial render
currentTxns = transactions;
renderTransactionsPage(currentPage);


// Variables for pagination
let summaryCurrentPage = 1;
const summaryPageSize = 10;
let summaryTxns = []; // filtered data for table

// Populate Tender dropdown
function populateSummaryTenderDropdown() {
  const select = document.getElementById('summaryTenderSelect');
  select.innerHTML = `<option value="all">All</option>`;
  tenders.forEach(t => {
    const option = document.createElement('option');
    option.value = t.tenderId;
    option.textContent = `${t.tenderId} - ${t.tenderName}`;
    select.appendChild(option);
  });
}

// Compute summary data
function computeTenderSummary(selectedTenderId = 'all') {
  let filteredTenders = selectedTenderId === 'all' ? tenders : tenders.filter(t => t.tenderId === selectedTenderId);

  const summaryData = filteredTenders.map(t => {
    const tenderTxns = transactions.filter(tx => tx.tenderId === t.tenderId);
    const totalCredit = tenderTxns.filter(tx => tx.txnType.toLowerCase() === 'credit')
                                  .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const totalDebit = tenderTxns.filter(tx => tx.txnType.toLowerCase() === 'debit')
                                 .reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const net = totalCredit - totalDebit;
    const status = net >= 0 ? 'Profit' : 'Loss';

    return {
      tenderId: t.tenderId,
      tenderName: t.tenderName,
      totalCredit,
      totalDebit,
      netAmount: net,
      status
    };
  });

  return summaryData;
}

// Render summary table with pagination
function renderSummaryTable(page = 1) {
  const tbody = document.querySelector('#summaryTable tbody');
  tbody.innerHTML = '';

  const start = (page - 1) * summaryPageSize;
  const end = start + summaryPageSize;
  const pageData = summaryTxns.slice(start, end);

  pageData.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.tenderId}</td>
      <td>${item.tenderName}</td>
      <td>${item.totalCredit.toFixed(2)}</td>
      <td>${item.totalDebit.toFixed(2)}</td>
      <td>${item.netAmount.toFixed(2)}</td>
      <td>${item.status}</td>
    `;
    tbody.appendChild(tr);
  });

  const pageCount = Math.ceil(summaryTxns.length / summaryPageSize) || 1;
  document.getElementById('summaryPageInfo').textContent = `Page ${summaryCurrentPage} of ${pageCount}`;
  document.getElementById('summaryPrevPageBtn').disabled = summaryCurrentPage === 1;
  document.getElementById('summaryNextPageBtn').disabled = summaryCurrentPage === pageCount;
}

// Handle tender selection
document.getElementById('summaryTenderSelect').addEventListener('change', (e) => {
  const selectedId = e.target.value;
  const tender = tenders.find(t => t.tenderId === selectedId);
  document.getElementById('summaryTenderName').value = tender ? tender.tenderName : '';
  
  summaryTxns = computeTenderSummary(selectedId);
  summaryCurrentPage = 1;
  renderSummaryTable(summaryCurrentPage);
});

// Pagination buttons
document.getElementById('summaryPrevPageBtn').addEventListener('click', () => {
  if (summaryCurrentPage > 1) {
    summaryCurrentPage--;
    renderSummaryTable(summaryCurrentPage);
  }
});
document.getElementById('summaryNextPageBtn').addEventListener('click', () => {
  const pageCount = Math.ceil(summaryTxns.length / summaryPageSize);
  if (summaryCurrentPage < pageCount) {
    summaryCurrentPage++;
    renderSummaryTable(summaryCurrentPage);
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  populateSummaryTenderDropdown();
  summaryTxns = computeTenderSummary('all');
  renderSummaryTable(summaryCurrentPage);
});


// Spinner JS

// Get spinner overlay element
const spinner = document.getElementById("spinnerOverlay");

// Show spinner
function showSpinner() {
  if (spinner) {
    spinner.classList.remove("hidden");
  }
}

// Hide spinner
function hideSpinner() {
  if (spinner) {
    spinner.classList.add("hidden");
  }
}

// Example usage:

// Show spinner before a task
// showSpinner(); // No need to call here, loadState/saveState will handle it

// Simulate async task (like fetching data)
// setTimeout(() => {
//   // Task done, hide spinner
// //   hideSpinner(); // No need to call here
// }, 2000); // 2 seconds delay, replace with your real task

// No need to close the curly brace here, it closes the entire original script
