import './style.css';
import {actionableError} from './messages.js';

const picker = document.querySelector('#picker');
const selectButton = document.querySelector('#select');
const connection = document.querySelector('#connection');
const summary = document.querySelector('#summary');
const results = document.querySelector('#results');
const clearButton = document.querySelector('#clear');

function readPairing() {
  const fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
  const endpoint = fragment.get('endpoint');
  const key = fragment.get('key');
  const oneTimePairing = fragment.get('pairing');
  if (endpoint) {
    if (oneTimePairing || endpoint !== localStorage.getItem('ra.endpoint')) {
      localStorage.removeItem('ra.key');
      localStorage.removeItem('ra.pairing');
    }
    localStorage.setItem('ra.endpoint', endpoint);
    if (key) localStorage.setItem('ra.key', key);
    if (oneTimePairing) localStorage.setItem('ra.pairing', oneTimePairing);
    history.replaceState(null, '', location.pathname + location.search);
  }
  return {
    endpoint: localStorage.getItem('ra.endpoint') || '',
    key: localStorage.getItem('ra.key') || '',
    oneTimePairing: localStorage.getItem('ra.pairing') || ''
  };
}

let pairing = readPairing();
renderConnection();
initializePairing();
renderPendingQueue();

selectButton.addEventListener('click', () => picker.click());
picker.addEventListener('change', () => uploadSelection([...picker.files]));
clearButton.addEventListener('click', () => {
  localStorage.removeItem('ra.endpoint');
  localStorage.removeItem('ra.key');
  localStorage.removeItem('ra.pairing');
  pairing = {endpoint: '', key: '', oneTimePairing: ''};
  results.replaceChildren();
  summary.hidden = true;
  renderConnection();
});

function renderConnection() {
  const ready = Boolean(pairing.endpoint && pairing.key);
  connection.textContent = ready ? 'Drive 연결 준비 완료' :
    (pairing.oneTimePairing ? '모바일 연결 확인 중' : 'PC 앱의 모바일 연결 QR을 스캔하십시오.');
  selectButton.disabled = !ready;
}

async function initializePairing() {
  if (pairing.key || !pairing.endpoint || !pairing.oneTimePairing) return;
  try {
    const result = await bridgeRequest({action: 'pair', pairing: pairing.oneTimePairing});
    if (!result?.uploadToken) throw new Error('연결키를 받지 못했습니다.');
    pairing.key = result.uploadToken;
    pairing.oneTimePairing = '';
    localStorage.setItem('ra.key', pairing.key);
    localStorage.removeItem('ra.pairing');
  } catch (error) {
    pairing.oneTimePairing = '';
    localStorage.removeItem('ra.pairing');
    connection.textContent = actionableError(error);
    selectButton.disabled = true;
    return;
  }
  renderConnection();
}

async function sha256(blob) {
  const bytes = await blob.arrayBuffer();
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

async function prepareImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('JPEG, PNG 또는 WEBP 이미지를 다시 선택하십시오.');
  if (file.size > 10 * 1024 * 1024) throw new Error('이미지 크기는 10MB 이하여야 합니다.');
  try {
    const bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= 2400) { bitmap.close(); return file; }
    const scale = 2400 / longest;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d', {alpha: false}).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const compressed = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
    if (compressed && compressed.size < file.size) return new File([compressed], file.name.replace(/\.[^.]+$/, '.jpg'), {type: 'image/jpeg'});
  } catch (_) { /* Older Safari keeps the original. */ }
  return file;
}

async function toPayload(file) {
  const prepared = await prepareImage(file);
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(prepared);
  });
  return {name: prepared.name, mimeType: prepared.type || 'image/jpeg', base64};
}

function bridgeRequest(fields) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const iframe = document.createElement('iframe');
    iframe.name = `bridge-${requestId}`;
    iframe.hidden = true;
    const timer = setTimeout(() => finish(new Error('Google Drive 응답 시간이 초과되었습니다. 잠시 후 다시 시도하십시오.')), 90000);
    function onMessage(event) {
      if (!/^https:\/\/([a-z0-9-]+\.)?script\.googleusercontent\.com$/.test(event.origin) && event.origin !== 'https://script.google.com') return;
      const data = event.data || {};
      if (data.type !== 'receipt-upload-result' || data.requestId !== requestId) return;
      finish(data.ok ? null : new Error(data.error || 'Drive 업로드에 실패했습니다.'), data.result);
    }
    function finish(error, value) {
      clearTimeout(timer); window.removeEventListener('message', onMessage); iframe.remove(); form.remove();
      error ? reject(error) : resolve(value);
    }
    window.addEventListener('message', onMessage);
    const form = document.createElement('form');
    form.hidden = true; form.method = 'POST'; form.action = pairing.endpoint; form.target = iframe.name;
    const requestFields = {requestId, origin: location.origin, ...fields};
    Object.entries(requestFields).forEach(([name, value]) => {
      const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.append(input);
    });
    document.body.append(iframe, form); form.submit();
  });
}

function bridgeUpload(payload) {
  return bridgeRequest({action: 'upload', key: pairing.key, payload: JSON.stringify(payload)});
}

function pendingDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('receiptanalyzer-mobile', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function pendingTransaction(mode, operation) {
  const database = await pendingDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('pending', mode);
    operation(transaction.objectStore('pending'));
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

async function savePending(file, message, existingId = '') {
  const record = {id: existingId || crypto.randomUUID(), name: file.name, file, message, createdAt: Date.now()};
  try { await pendingTransaction('readwrite', store => store.put(record)); } catch (_) { /* Keep the visible result. */ }
  return record.id;
}

async function removePending(id) {
  if (!id) return;
  try { await pendingTransaction('readwrite', store => store.delete(id)); } catch (_) { /* It remains retryable. */ }
}

async function allPending() {
  const database = await pendingDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction('pending').objectStore('pending').getAll();
    request.onsuccess = () => { database.close(); resolve(request.result || []); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

function appendResult(file, state, message, retry) {
  const item = document.createElement('li');
  item.className = `result ${state}`;
  item.innerHTML = '<strong></strong><p></p>';
  item.querySelector('strong').textContent = file.name;
  item.querySelector('p').textContent = message;
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'retry';
    button.textContent = '재시도';
    button.addEventListener('click', retry);
    item.append(button);
  }
  results.append(item);
}

async function renderPendingQueue() {
  try {
    const records = await allPending();
    if (!records.length) return;
    summary.hidden = false;
    summary.textContent = `재시도 대기 ${records.length}개`;
    records.forEach(record => appendResult(
      record.file, 'error', record.message,
      () => uploadSelection([record.file], new Map([[record.file, record.id]]))
    ));
  } catch (_) { /* Private browsing can disable IndexedDB. */ }
}

async function uploadSelection(files, pendingIds = new Map()) {
  picker.value = '';
  if (!files.length) return;
  selectButton.disabled = true;
  results.replaceChildren();
  summary.hidden = false;
  summary.textContent = `0/${files.length} 처리 중`;
  const seen = new Set();
  let success = 0, duplicate = 0, failed = 0, finished = 0;
  const jobs = files.map(file => async () => {
    let state = 'error', message = '';
    try {
      const hash = await sha256(file);
      if (seen.has(hash)) {
        state = 'duplicate'; message = '같은 선택 항목이 이미 있어 새 파일을 저장하지 않았습니다.'; duplicate++;
      } else {
        seen.add(hash);
        const response = await bridgeUpload(await toPayload(file));
        if (response.status === 'duplicate') { state = 'duplicate'; message = '이미 등록된 이미지이므로 새 파일을 저장하지 않았습니다.'; duplicate++; }
        else { state = 'success'; message = 'Drive 저장 완료. PC 실행 시 자동 처리됩니다.'; success++; }
      }
      await removePending(pendingIds.get(file));
    } catch (error) {
      failed++; message = actionableError(error);
      const pendingId = await savePending(file, message, pendingIds.get(file));
      pendingIds.set(file, pendingId);
    }
    appendResult(file, state, message, state === 'error' ?
      () => uploadSelection([file], new Map([[file, pendingIds.get(file)]])) : null);
    finished++;
    summary.textContent = `${finished}/${files.length} · 저장 ${success} · 중복 ${duplicate} · 실패 ${failed}`;
  });
  let index = 0;
  async function worker() { while (index < jobs.length) { const job = jobs[index++]; await job(); } }
  await Promise.all([worker(), worker()]);
  selectButton.disabled = false;
}
