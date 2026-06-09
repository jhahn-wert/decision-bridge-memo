/**
 * memo-list.js — 메모 목록/검색/필터/수정/삭제 팝업 로직
 */

let allMemos = [];
let filteredMemos = [];
let hasChanges = false;

(async () => {
  // ── Tableau 팝업 초기화 ──
  await tableau.extensions.initializeDialogAsync();


  // ── 필터 옵션 세팅 ──
  setupFilterOptions();

  // ── 메모 로드 ──
  await loadMemos();

  // ── 이벤트 리스너 ──
  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('filterCategory').addEventListener('change', applyFilters);
  document.getElementById('filterStatus').addEventListener('change', applyFilters);
  document.getElementById('filterAuthor').addEventListener('change', applyFilters);

  document.getElementById('btnClose').addEventListener('click', () => {
    tableau.extensions.ui.closeDialog(hasChanges ? 'updated' : 'closed');
  });
})();

/**
 * 필터 select 옵션 세팅
 */
function setupFilterOptions() {
  const catSelect = document.getElementById('filterCategory');
  CONFIG.CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    catSelect.appendChild(opt);
  });

  const statusSelect = document.getElementById('filterStatus');
  CONFIG.STATUSES.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    statusSelect.appendChild(opt);
  });
}

/**
 * 전체 메모 로드
 */
async function loadMemos() {
  try {
    allMemos = await getAllMemos();

    // 작성자 필터에 실제 데이터 기반 옵션 추가
    updateAuthorFilter();

    applyFilters();
    updateStats();
  } catch (e) {
    document.getElementById('memoList').innerHTML =
      `<div class="memo-list-empty">메모 로드 실패: ${e.message}</div>`;
  }
}

/**
 * 작성자 필터 옵션을 실제 데이터 기반으로 갱신
 */
function updateAuthorFilter() {
  const authors = [...new Set(allMemos.map(m => m['작성자']).filter(Boolean))];
  const select = document.getElementById('filterAuthor');
  // 기존 옵션 유지 (전체)하고 나머지 제거
  while (select.options.length > 1) select.remove(1);

  authors.forEach(author => {
    const opt = document.createElement('option');
    opt.value = author;
    opt.textContent = author;
    select.appendChild(opt);
  });
}

/**
 * 필터/검색 적용
 */
function applyFilters() {
  const keyword = document.getElementById('searchInput').value.toLowerCase().trim();
  const category = document.getElementById('filterCategory').value;
  const status = document.getElementById('filterStatus').value;
  const author = document.getElementById('filterAuthor').value;

  filteredMemos = allMemos.filter(m => {
    // 키워드 검색 (출원번호, 메모내용)
    if (keyword) {
      const matchesKeyword =
        (m['출원번호'] || '').toLowerCase().includes(keyword) ||
        (m['메모내용'] || '').toLowerCase().includes(keyword) ||
        (m['작성자'] || '').toLowerCase().includes(keyword);
      if (!matchesKeyword) return false;
    }
    // 카테고리 필터
    if (category !== 'all' && m['카테고리'] !== category) return false;
    // 상태 필터
    if (status !== 'all' && m['상태'] !== status) return false;
    // 작성자 필터
    if (author !== 'all' && m['작성자'] !== author) return false;

    return true;
  });

  renderMemoList();
}

/**
 * 통계 업데이트
 */
function updateStats() {
  document.getElementById('statTotal').textContent = allMemos.length;
  document.getElementById('statProgress').textContent =
    allMemos.filter(m => m['상태'] === '진행중').length;
  document.getElementById('statDone').textContent =
    allMemos.filter(m => m['상태'] === '완료').length;
  document.getElementById('statHold').textContent =
    allMemos.filter(m => m['상태'] === '보류').length;
}

/**
 * 메모 목록 렌더링
 */
function renderMemoList() {
  const container = document.getElementById('memoList');

  if (filteredMemos.length === 0) {
    container.innerHTML = '<div class="memo-list-empty">조건에 맞는 메모가 없습니다</div>';
    return;
  }

  container.innerHTML = filteredMemos.map((m, idx) => `
    <div class="memo-item" id="memo-${idx}" data-row-index="${m._rowIndex}">
      <div class="memo-item-body">
        <div class="memo-item-header">
          <span class="memo-patent-num">${escHtml(m['출원번호'])}</span>
          <span class="badge badge-category">${escHtml(m['카테고리'])}</span>
          <span class="badge badge-status-${m['상태']}">${escHtml(m['상태'])}</span>
        </div>
        <div class="memo-content">${escHtml(m['메모내용'])}</div>
        <div class="memo-meta">
          ${escHtml(m['작성자'])} · ${fmtDate(m['수정일시'])}
        </div>

        <!-- 인라인 수정 영역 (숨김) -->
        <div class="edit-area">
          <textarea class="edit-content">${escHtml(m['메모내용'])}</textarea>
          <div class="edit-row">
            <select class="edit-category">
              ${CONFIG.CATEGORIES.map(c =>
                `<option value="${c}" ${c === m['카테고리'] ? 'selected' : ''}>${c}</option>`
              ).join('')}
            </select>
            <select class="edit-status">
              ${CONFIG.STATUSES.map(s =>
                `<option value="${s}" ${s === m['상태'] ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
            ${CONFIG.AUTHORS.length === 0
              ? `<input type="text" class="edit-author" value="${escHtml(m['작성자'] || '')}" placeholder="작성자">`
              : `<select class="edit-author">${CONFIG.AUTHORS.map(a =>
                  `<option value="${a}" ${a === m['작성자'] ? 'selected' : ''}>${a}</option>`
                ).join('')}</select>`}
            <button class="btn-sm save" onclick="saveEdit(${idx})">저장</button>
            <button class="btn-sm cancel" onclick="cancelEdit(${idx})">취소</button>
          </div>
        </div>
      </div>

      <div class="memo-actions">
        <button class="btn-icon" onclick="startEdit(${idx})" title="수정">✏</button>
        <button class="btn-icon danger" onclick="confirmDelete(${idx})" title="삭제">✕</button>
      </div>
    </div>
  `).join('');
}

/**
 * 수정 모드 시작
 */
function startEdit(idx) {
  const el = document.getElementById(`memo-${idx}`);
  el.classList.add('edit-mode');
  el.querySelector('.edit-content').focus();
}

/**
 * 수정 취소
 */
function cancelEdit(idx) {
  document.getElementById(`memo-${idx}`).classList.remove('edit-mode');
}

/**
 * 수정 저장
 */
async function saveEdit(idx) {
  const memo = filteredMemos[idx];
  const el = document.getElementById(`memo-${idx}`);

  const authorEl = el.querySelector('.edit-author');

  const updatedData = {
    ...memo,
    '메모내용': el.querySelector('.edit-content').value.trim(),
    '카테고리': el.querySelector('.edit-category').value,
    '상태': el.querySelector('.edit-status').value,
    '작성자': authorEl ? authorEl.value.trim() : memo['작성자']
  };

  if (!updatedData['메모내용']) {
    alert('메모 내용을 입력하세요.');
    return;
  }

  try {
    await updateMemo(memo['memo_id'], updatedData);
    hasChanges = true;
    await loadMemos();
  } catch (e) {
    alert('수정 실패: ' + e.message);
  }
}

/**
 * 삭제 확인 및 실행
 */
async function confirmDelete(idx) {
  const memo = filteredMemos[idx];
  const ok = confirm(
    `다음 메모를 삭제하시겠습니까?\n\n` +
    `출원번호: ${memo['출원번호']}\n` +
    `내용: ${memo['메모내용'].substring(0, 50)}...`
  );

  if (!ok) return;

  try {
    await deleteMemo(memo['memo_id']);
    hasChanges = true;
    await loadMemos();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

// ── 유틸 ──

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}`;
  } catch {
    return isoStr;
  }
}
