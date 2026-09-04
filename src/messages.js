export function actionableError(error) {
  const text = String(error?.message || error || '');
  if (/storage|공간|용량/i.test(text)) return 'Google Drive 전체 저장공간을 확인하십시오. Gmail과 Google Photos 용량도 포함됩니다.';
  if (/quota|429|할당량/i.test(text)) return 'Google 사용량 제한에 도달했습니다. 잠시 후 다시 시도하십시오.';
  if (/key|연결키|권한|403/i.test(text)) return '연결이 만료되었습니다. PC 앱에서 모바일 연결 QR을 새로 생성하십시오.';
  if (/timeout|시간이 초과/i.test(text)) return '응답 시간이 초과되었습니다. 인터넷 연결을 확인한 후 다시 시도하십시오.';
  return text || '업로드에 실패했습니다. 인터넷 연결을 확인한 후 다시 시도하십시오.';
}
