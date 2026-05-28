/**
 * DECISION BRIDGE 메모 Extension 설정
 *
 * ※ SPREADSHEET_ID는 여기에 없습니다.
 *   고객사마다 다르므로 Tableau 대시보드별로 [설정] 팝업에서 입력합니다.
 *   입력된 값은 Tableau Extension settings에 저장되어 대시보드에 귀속됩니다.
 *
 * 배포 전 WEBAPP_URL만 실제 값으로 수정하세요.
 */
const CONFIG = {
  // ── Google Sheets 시트명 (모든 고객사 공통) ──
  SHEET_NAME: 'patent_memo',

  // ── Google Apps Script 웹앱 URL ──
  // Apps Script 웹앱 배포 후 받은 URL을 입력하세요.
  // 이 URL 하나로 모든 고객사 스프레드시트에 접근합니다.
  WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxEg3RhFev_vwsF4cxPLBMQaCmWDpFblk7Kj23xFv8Dcsxb0yxMjq7DCr7zbZjZ21jUcg/exec',

  // ── Tableau 워크시트 이름 (대시보드에서 사용하는 이름과 일치시킬 것) ──
  PATENT_WORKSHEET_NAME: '기술이전특허 목록',

  // ── 메모 컬럼 순서 (Google Sheets 컬럼 순서와 일치) ──
  COLUMNS: [
    '출원번호',      // A
    '발명의 명칭',   // B (Tableau에서 자동 입력, Sheets에서는 Apps Script가 자동 채움)
    '상태',          // C
    '카테고리',      // D
    '메모내용',      // E
    '작성자',        // F
    '수정일시',      // G
    '작성일시',      // H
    'memo_id'        // I
  ],

  // ── 카테고리 옵션 ──
  CATEGORIES: [
    '기술이전검토',
    '기업컨택',
    '후속조치',
    '기타'
  ],

  // ── 상태 옵션 ──
  STATUSES: [
    '진행중',
    '완료',
    '보류'
  ],

  // ── 작성자 목록 (조직에 맞게 수정) ──
  // 비워두면 메모 입력 시 자유 텍스트 입력란이 표시됩니다.
  AUTHORS: [
    // 예시: '홍길동', '김철수', '이영희'
  ],

  // ── 팝업 크기 (1920×1080 기준) ──
  DIALOG_MEMO: { width: 520, height: 560 },
  DIALOG_LIST: { width: 860, height: 640 },
  DIALOG_SETTINGS: { width: 560, height: 580 },

  // ── Tableau Extension settings 키 이름 ──
  SETTINGS_KEYS: {
    SPREADSHEET_ID: 'client_spreadsheet_id',   // 고객사 스프레드시트 ID
    CLIENT_NAME: 'client_name',                 // 고객사 이름
    SELECTED_PATENT: 'selected_patent',         // 현재 선택된 특허
    PATENTS_WITH_MEMO: 'patents_with_memo'      // 메모 있는 출원번호 목록
  }
};

/**
 * 현재 대시보드에 연결된 고객사 Spreadsheet ID를 반환합니다.
 * 설정되어 있지 않으면 null을 반환합니다.
 */
function getClientSpreadsheetId() {
  return tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.SPREADSHEET_ID) || null;
}

/**
 * 현재 대시보드에 연결된 고객사 이름을 반환합니다.
 */
function getClientName() {
  return tableau.extensions.settings.get(CONFIG.SETTINGS_KEYS.CLIENT_NAME) || '';
}

/**
 * 고객사 설정이 완료되었는지 확인합니다.
 */
function isClientConfigured() {
  const id = getClientSpreadsheetId();
  return id !== null && id !== '' && id !== 'YOUR_SPREADSHEET_ID';
}
