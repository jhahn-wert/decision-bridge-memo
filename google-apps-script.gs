/**
 * DECISION BRIDGE 특허 메모 — Google Apps Script 웹앱
 *
 * 역할: 고객사 Google Spreadsheet에 대한 CRUD를 JSONP로 제공한다.
 *       Tableau Extension의 js/sheets-api.js가 호출한다.
 *
 * 배포 절차 (script.google.com):
 *   1. 새 프로젝트 생성 → 이 코드 전체 붙여넣기
 *   2. [배포] → [새 배포] → 유형 [웹 앱]
 *      - 다음 사용자 인증: 나
 *      - 액세스 권한: 모든 사용자
 *   3. 배포 후 받은 웹앱 URL을 js/config.js 의 WEBAPP_URL 에 입력
 *
 * 호출 인터페이스 (js/sheets-api.js의 callWebapp 함수와 1:1 대응):
 *   action=test     params: spreadsheetId
 *   action=getAll   params: spreadsheetId               → {memos:[...]}
 *   action=add      params: spreadsheetId, data(JSON)   → {memoId, ...}
 *   action=update   params: spreadsheetId, data(JSON)   → {ok:true}
 *   action=delete   params: spreadsheetId, data(JSON)   → {ok:true}
 *
 * 응답: callback(JSON) 형태의 JSONP — script 태그로 로드되므로 CORS 무관
 */

// ── 설정 (js/config.js와 일치시킬 것) ──
var SHEET_NAME = 'patent_memo';
var PATENT_LIST_SHEET = 'patent_list';

// 컬럼 순서 (config.js의 COLUMNS와 동일)
var COLUMNS = [
  '출원번호',      // A
  '발명의 명칭',   // B (patent_list에서 자동 조회)
  '상태',          // C
  '카테고리',      // D
  '메모내용',      // E
  '작성자',        // F
  '수정일시',      // G (자동)
  '작성일시',      // H (자동)
  'memo_id'        // I (자동)
];

// patent_list 시트 컬럼 (출원번호 → 발명의 명칭 조회용)
// 1열: 출원번호, 2열: 발명의 명칭
var PATENT_LIST_COL_APPNUM = 1;
var PATENT_LIST_COL_TITLE = 2;

// ── 엔트리포인트 ──

function doGet(e) {
  return handle(e);
}

function doPost(e) {
  return handle(e);
}

/**
 * 모든 요청의 진입점.
 * JSONP 응답 형식으로 반환한다: callback(data)
 */
function handle(e) {
  var callback = (e && e.parameter && e.parameter.callback) || 'callback';
  var result;
  try {
    result = dispatch(e.parameter);
  } catch (err) {
    result = { error: String(err && err.message ? err.message : err) };
  }
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/**
 * action에 따라 핸들러를 분기한다.
 */
function dispatch(params) {
  var action = params.action;
  var spreadsheetId = params.spreadsheetId;

  if (!action) throw new Error('action 파라미터가 없습니다.');
  if (!spreadsheetId) throw new Error('spreadsheetId 파라미터가 없습니다.');

  // data는 JSON 문자열로 전송됨 (sheets-api.js의 callWebapp 참고)
  var data = null;
  if (params.data) {
    try {
      data = JSON.parse(params.data);
    } catch (e) {
      throw new Error('data 파라미터 JSON 파싱 실패: ' + e.message);
    }
  }

  switch (action) {
    case 'test':   return handleTest(spreadsheetId);
    case 'getAll': return handleGetAll(spreadsheetId);
    case 'add':    return handleAdd(spreadsheetId, data);
    case 'update': return handleUpdate(spreadsheetId, data);
    case 'delete': return handleDelete(spreadsheetId, data);
    default: throw new Error('알 수 없는 action: ' + action);
  }
}

// ── 액션 핸들러 ──

/**
 * 연결 테스트: 스프레드시트를 열 수 있는지, patent_memo 시트가 있는지 확인.
 * settings.js가 응답에서 result.sheetTitle, result.memoCount 키를 읽으므로 그 형태로 반환.
 */
function handleTest(spreadsheetId) {
  var ss = openSpreadsheet(spreadsheetId);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    // settings.js는 error시 throw로 처리되길 기대하므로 throw
    throw new Error('"' + SHEET_NAME + '" 시트를 찾을 수 없습니다.\n시트명을 확인하세요.');
  }
  ensureHeader(sheet);
  return {
    ok: true,
    sheetTitle: ss.getName(),
    memoCount: Math.max(0, sheet.getLastRow() - 1)
  };
}

/**
 * 전체 메모 조회.
 * 반환: { memos: [ {출원번호, 발명의 명칭, 상태, 카테고리, 메모내용, 작성자, 수정일시, 작성일시, memo_id}, ... ] }
 */
function handleGetAll(spreadsheetId) {
  var sheet = getMemoSheet(spreadsheetId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { memos: [] };

  var values = sheet.getRange(2, 1, lastRow - 1, COLUMNS.length).getValues();
  var memos = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    // memo_id가 비어있는 행은 건너뜀 (사용자가 시트에 직접 추가 중일 수도)
    var memoId = row[COLUMNS.indexOf('memo_id')];
    if (!memoId) continue;

    var memo = {};
    for (var c = 0; c < COLUMNS.length; c++) {
      memo[COLUMNS[c]] = row[c] == null ? '' : String(row[c]);
    }
    memos.push(memo);
  }
  return { memos: memos };
}

/**
 * 메모 추가.
 * input: { 출원번호, 발명의 명칭, 상태, 카테고리, 메모내용, 작성자 }
 * 자동 채움: memo_id, 작성일시, 수정일시, (발명의 명칭이 비어있으면 patent_list에서 조회)
 */
function handleAdd(spreadsheetId, memo) {
  if (!memo) throw new Error('data가 없습니다.');
  if (!memo['출원번호']) throw new Error('출원번호가 없습니다.');

  var ss = openSpreadsheet(spreadsheetId);
  var sheet = getMemoSheet(spreadsheetId, ss);
  ensureHeader(sheet);

  // 발명의 명칭 자동 채움
  // dialog.js는 '발명의_명칭'(언더스코어)로 보내고, memo-list.js는 '발명의 명칭'(공백)으로 보냄
  var title = memo['발명의 명칭'] || memo['발명의_명칭'] || '';
  if (!title) {
    title = lookupInventionName(ss, memo['출원번호']) || '';
  }

  var now = formatDateTime(new Date());
  var memoId = generateMemoId();

  var row = [
    memo['출원번호']  || '',
    title,
    memo['상태']      || '',
    memo['카테고리']  || '',
    memo['메모내용']  || '',
    memo['작성자']    || '',
    now,              // 수정일시
    now,              // 작성일시
    memoId            // memo_id
  ];

  sheet.appendRow(row);

  return {
    ok: true,
    memo_id: memoId,
    '발명의 명칭': title,
    '작성일시': now,
    '수정일시': now
  };
}

/**
 * 메모 수정.
 * input: { memoId, memo: { 상태, 카테고리, 메모내용, 작성자, ... } }
 * 자동: 수정일시 갱신
 */
function handleUpdate(spreadsheetId, payload) {
  if (!payload) throw new Error('data가 없습니다.');
  var memoId = payload.memoId;
  var memo = payload.memo || {};
  if (!memoId) throw new Error('memoId가 없습니다.');

  var sheet = getMemoSheet(spreadsheetId);
  var rowIndex = findRowByMemoId(sheet, memoId);
  if (rowIndex < 0) throw new Error('memo_id에 해당하는 메모를 찾을 수 없습니다: ' + memoId);

  // 기존 행 읽기
  var currentRange = sheet.getRange(rowIndex, 1, 1, COLUMNS.length);
  var currentValues = currentRange.getValues()[0];

  // 변경 가능한 컬럼만 덮어씀 (출원번호/memo_id/작성일시는 변경 금지)
  var editable = ['발명의 명칭', '상태', '카테고리', '메모내용', '작성자'];
  for (var i = 0; i < editable.length; i++) {
    var key = editable[i];
    if (Object.prototype.hasOwnProperty.call(memo, key)) {
      var idx = COLUMNS.indexOf(key);
      currentValues[idx] = memo[key];
    }
  }

  // 수정일시 갱신
  var now = formatDateTime(new Date());
  currentValues[COLUMNS.indexOf('수정일시')] = now;

  currentRange.setValues([currentValues]);

  return { ok: true, memo_id: memoId, '수정일시': now };
}

/**
 * 메모 삭제.
 * input: { memoId }
 */
function handleDelete(spreadsheetId, payload) {
  if (!payload) throw new Error('data가 없습니다.');
  var memoId = payload.memoId;
  if (!memoId) throw new Error('memoId가 없습니다.');

  var sheet = getMemoSheet(spreadsheetId);
  var rowIndex = findRowByMemoId(sheet, memoId);
  if (rowIndex < 0) throw new Error('memo_id에 해당하는 메모를 찾을 수 없습니다: ' + memoId);

  sheet.deleteRow(rowIndex);
  return { ok: true, memo_id: memoId };
}

// ── 유틸 ──

function openSpreadsheet(spreadsheetId) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (e) {
    throw new Error('스프레드시트를 열 수 없습니다. ID와 공유 권한을 확인하세요. (' + e.message + ')');
  }
}

function getMemoSheet(spreadsheetId, ss) {
  ss = ss || openSpreadsheet(spreadsheetId);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('"' + SHEET_NAME + '" 시트가 없습니다.');
  return sheet;
}

/**
 * 1행이 헤더와 일치하는지 확인하고, 비어있으면 헤더를 채운다.
 * 기존 헤더가 다르면 그대로 둔다 (사용자가 컬럼 순서를 바꿨을 수 있음 — 단, 그러면 다른 로직이 깨짐).
 */
function ensureHeader(sheet) {
  var firstRow = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  var isEmpty = firstRow.every(function(v) { return v === '' || v == null; });
  if (isEmpty) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.setFrozenRows(1);
  }
}

/**
 * memo_id로 행 번호(1-indexed) 찾기. 없으면 -1.
 */
function findRowByMemoId(sheet, memoId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var memoIdCol = COLUMNS.indexOf('memo_id') + 1; // 1-indexed
  var values = sheet.getRange(2, memoIdCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(memoId)) {
      return i + 2; // 헤더 포함 1-indexed
    }
  }
  return -1;
}

/**
 * patent_list 시트에서 출원번호로 발명의 명칭 조회.
 * 시트가 없거나 매치되는 행이 없으면 null.
 */
function lookupInventionName(ss, applicationNumber) {
  var sheet = ss.getSheetByName(PATENT_LIST_SHEET);
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var range = sheet.getRange(2, PATENT_LIST_COL_APPNUM, lastRow - 1, PATENT_LIST_COL_TITLE);
  var values = range.getValues();
  var target = String(applicationNumber).trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][PATENT_LIST_COL_APPNUM - 1]).trim() === target) {
      return String(values[i][PATENT_LIST_COL_TITLE - 1]);
    }
  }
  return null;
}

/**
 * Date → 'yyyy.MM.dd HH:mm:ss' (KST)
 */
function formatDateTime(d) {
  var tz = 'Asia/Seoul';
  return Utilities.formatDate(d, tz, 'yyyy.MM.dd HH:mm:ss');
}

/**
 * memo_id 생성: m_yyyymmddHHmmss_xxxx
 */
function generateMemoId() {
  var ts = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMddHHmmss');
  var rand = Math.random().toString(36).substr(2, 4);
  return 'm_' + ts + '_' + rand;
}
