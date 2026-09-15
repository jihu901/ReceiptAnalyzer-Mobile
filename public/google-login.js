// No analytics, storage, service-worker registration, or third-party assets.
// Omit Google cookies: Apps Script's multi-account redirect breaks browser callbacks.
(async () => {
  const params = new URLSearchParams(location.search);
  history.replaceState(null, '', location.pathname);
  const message = document.getElementById('status');
  const state = params.get('state') || '';
  const code = params.get('code') || '';
  const error = params.get('error') || '';
  if (!/^[A-Za-z0-9_-]{43}$/.test(state) || (!code && !error) || code.length > 4096) {
    message.textContent = '연결 요청을 확인할 수 없습니다. PC 앱에서 Google로 연결을 다시 누르세요.';
    return;
  }
  try {
    await fetch('https://script.google.com/macros/s/AKfycbxBz8DDXKa_qZPmvY0bXOwwLizjLiuk4Khu48BTVYySmmWfmfYB6M2fgAJPEGDVSxKrig/exec', {
      method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer',
      body: new URLSearchParams({action: 'google_login_callback', state, code, error})
    });
    message.textContent = 'PC 앱으로 돌아가 연결 결과를 확인하세요. 계정 확인이 끝나면 자동으로 동기화합니다.';
  } catch (_) {
    message.textContent = '서버로 전달하지 못했습니다. 인터넷 연결을 확인하고 PC 앱에서 다시 로그인하세요.';
  }
})();
