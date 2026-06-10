/**
 * index.js — 대시보드에 삽입되는 메인 Extension 로직
 */

let selectedPatent = null;
let selectedPatents = [];
let patentsWithMemo = new Set();

(async () => {
  await tableau.extensions.initializeAsync();

  document.getElementById('btnSettings').addEventListener('click', openSettingsDialog);

  // 관리자 전용 접근: [설정] 버튼은 기본 숨김(최종 사용자 실수 방지).
  // 최초 연결(미설정) 시에만 버튼을 노출하고, 이후 재설정은 Ctrl+Alt+S 단축키로 연다.
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      openSettingsDialog();
    }
  });

  if (!isClientConfigured()) {
    document.getElementById('btnSettings').style.display = '';  // 최초 연결용으로만 노출
    showNotConfigured();
    await openSettingsDialog();
    return;
  }

  await initMainUI();
})();

function showNotConfigured() {
  document.getElementById('btnAddMemo').disabled = true;
  document.getElementById('btnMemoList').disabled = true;
  document.getElementById('selectedInfo').innerHTML =
    '<span class="warning-msg">[설정] 버튼을 눌러 고객사 스프레드시트를 연결하세요</span>';
}

async function initMainUI() {
  var dashboard = tableau.extensions.dashboardContent.dashboard;

  document.getElementById('btnMemoList').disabled = false;

  document.getElementById('selectedInfo').innerHTML =
    '<span class="status-msg">특허를 선택하면 메모를 추가할 수 있습니다</span>';

  try {
    await refreshMemoIndicators();
  } catch (e) {
    console.warn('초기 메모 로드 실패:', e);
  }

  var patentSheet = dashboard.worksheets.find(function(ws) {
    return ws.name === CONFIG.PATENT_WORKSHEET_NAME;
  });

  if (!patentSheet) {
    document.getElementById('selectedInfo').innerHTML =
      '<span class="status-msg">워크시트 "' + CONFIG.PATENT_WORKSHEET_NAME + '"을 찾을 수 없습니다</span>';
    return;
  }

  patentSheet.addEventListener(
    tableau.TableauEventType.MarkSelectionChanged,
    handleMarkSelection
  );

  document.getElementById('btnAddMemo').addEventListener('click', openMemoDialog);
  document.getElementById('btnMemoList').addEventListener('click', openMemoListDialog);
}

async function handleMarkSelection(event) {
  try {
    var marks = await event.getMarksAsync();

    if (marks.data.length === 0 || marks.data[0].data.length === 0) {
      clearSelection();
      return;
    }

    var columns = marks.data[0].columns;
    var rows = marks.data[0].data;

    var appNumIdx = columns.findIndex(function(c) { return c.fieldName === '출원번호'; });
    var titleIdx = columns.findIndex(function(c) { return c.fieldName === '발명의 명칭'; });
    var gradeIdx = columns.findIndex(function(c) { return c.fieldName === 'grade'; });

    if (appNumIdx < 0) return;

    selectedPatents = rows.map(function(row) {
      return {
        '출원번호': row[appNumIdx].formattedValue,
        '발명의_명칭': titleIdx >= 0 ? row[titleIdx].formattedValue : '',
        'grade': gradeIdx >= 0 ? row[gradeIdx].formattedValue : ''
      };
    });

    selectedPatent = selectedPatents[0];
    document.getElementById('btnAddMemo').disabled = false;

    var infoEl = document.getElementById('selectedInfo');

    if (selectedPatents.length === 1) {
      var hasMemo = patentsWithMemo.has(selectedPatent['출원번호']);
      infoEl.innerHTML =
        '<span class="num">' + selectedPatent['출원번호'] + '</span> ' +
        (hasMemo ? '<span class="memo-badge">메모</span> ' : '') +
        selectedPatent['발명의_명칭'];
    } else {
      infoEl.innerHTML =
        '<span class="num">' + selectedPatents.length + '건 선택</span> ' +
        '<span class="status-msg">' + selectedPatent['출원번호'] + ' 외 ' + (selectedPatents.length - 1) + '건</span>';
    }

    tableau.extensions.settings.set(CONFIG.SETTINGS_KEYS.SELECTED_PATENT, JSON.stringify(selectedPatents));
    await tableau.extensions.settings.saveAsync();
  } catch (e) {
    console.error('마크 선택 처리 오류:', e);
  }
}

function clearSelection() {
  selectedPatent = null;
  selectedPatents = [];
  document.getElementById('btnAddMemo').disabled = true;
  document.getElementById('selectedInfo').innerHTML =
    '<span class="status-msg">특허를 선택하면 메모를 추가할 수 있습니다</span>';
}

async function openSettingsDialog() {
  try {
    var result = await tableau.extensions.ui.displayDialogAsync(
      './settings.html', '',
      { width: CONFIG.DIALOG_SETTINGS.width, height: CONFIG.DIALOG_SETTINGS.height, title: '고객사 스프레드시트 설정' }
    );
    if (result === 'configured' && isClientConfigured()) {
      await initMainUI();
    }
  } catch (e) {
    if (e.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
      console.error('설정 팝업 오류:', e);
    }
  }
}

async function openMemoDialog() {
  if (!selectedPatent) return;
  try {
    var result = await tableau.extensions.ui.displayDialogAsync(
      './dialog.html', selectedPatent['출원번호'],
      { width: CONFIG.DIALOG_MEMO.width, height: CONFIG.DIALOG_MEMO.height, title: '특허 메모 추가' }
    );
    if (result === 'saved') {
      await refreshMemoIndicators();
      updateSelectionDisplay();
    }
  } catch (e) {
    if (e.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
      console.error('팝업 오류:', e);
    }
  }
}

async function openMemoListDialog() {
  try {
    await tableau.extensions.ui.displayDialogAsync(
      './memo-list.html', '',
      { width: CONFIG.DIALOG_LIST.width, height: CONFIG.DIALOG_LIST.height, title: '메모 목록 관리' }
    );
  } catch (e) {
    if (e.errorCode !== tableau.ErrorCodes.DialogClosedByUser) {
      console.error('목록 팝업 오류:', e);
    }
  }
  // 목록 팝업을 닫으면 항상 갱신
  try {
    await refreshMemoIndicators();
    updateSelectionDisplay();
  } catch (e) {
    console.warn('갱신 실패:', e);
  }
}

function updateSelectionDisplay() {
  if (!selectedPatent) return;
  var infoEl = document.getElementById('selectedInfo');

  if (selectedPatents.length === 1) {
    var hasMemo = patentsWithMemo.has(selectedPatent['출원번호']);
    infoEl.innerHTML =
      '<span class="num">' + selectedPatent['출원번호'] + '</span> ' +
      (hasMemo ? '<span class="memo-badge">메모</span> ' : '') +
      selectedPatent['발명의_명칭'];
  } else if (selectedPatents.length > 1) {
    infoEl.innerHTML =
      '<span class="num">' + selectedPatents.length + '건 선택</span> ' +
      '<span class="status-msg">' + selectedPatent['출원번호'] + ' 외 ' + (selectedPatents.length - 1) + '건</span>';
  }
}

async function refreshMemoIndicators() {
  patentsWithMemo = await getPatentsWithMemo();
  tableau.extensions.settings.set(
    CONFIG.SETTINGS_KEYS.PATENTS_WITH_MEMO,
    JSON.stringify([].concat(Array.from(patentsWithMemo)))
  );
  await tableau.extensions.settings.saveAsync();
}
