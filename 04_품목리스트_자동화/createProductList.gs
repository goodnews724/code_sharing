/*************************
 * 설정
 *************************/
const SPREADSHEET_ID = '1GtSjZhwr4Nz7E_vMFvDKuYFVstVDcm_2FcRfQnsBcBI';
const SOURCE_SHEET_NAME = '통합재고_Total';
const CATEGORY_SHEET_NAME = '수입육_구분';
const PRICE_SHEET_NAME = '단가';
const PRICE_SHEET_HEADERS = ['구분', '원산지', '브랜드', '품명', 'EST', '등급', '단가', '복합키'];
const DEFAULT_CATEGORY_TEXT = '미분류';
const SALE_BAN_PRICE_TEXT = '판매금지';
const PRICE_COLUMN_INDEX = 11;
const PRICE_SHEET_NOTE_COLUMN_INDEX = 7;
const STRIKETHROUGH_START_COLUMN = 6; // 등급(F열)
const STRIKETHROUGH_COLUMN_COUNT = 8; // F~M (등급~평균중량)

/**
 * 숫자 변환 헬퍼 함수 (콤마 제거)
 */
function parseNumber(value) {
  if (!value) return 0;
  const str = String(value).replace(/,/g, '').trim();
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

/**
 * 날짜 문자열을 Date 객체로 변환 (여러 형식 지원)
 */
function parseDateString(dateStr) {
  if (!dateStr || dateStr === '') return null;

  const trimmed = String(dateStr).trim();
  let parsedDate = null;

  // YYYY.MM.DD 또는 YYYY. MM. DD 형식
  if (/^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}$/.test(trimmed)) {
    const parts = trimmed.split('.').map(p => p.trim());
    parsedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  // YYYYMMDD 형식
  else if (/^\d{8}$/.test(trimmed)) {
    parsedDate = new Date(trimmed.substring(0, 4), trimmed.substring(4, 6) - 1, trimmed.substring(6, 8));
  }
  // YYYY-MM-DD 형식
  else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    parsedDate = new Date(trimmed);
  }
  // YYYY/MM/DD 형식
  else if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) {
    parsedDate = new Date(trimmed.replace(/\//g, '-'));
  }

  return (parsedDate && !isNaN(parsedDate)) ? parsedDate : null;
}

function isSaleBanPrice_(value) {
  return String(value || '').trim().replace(/\s+/g, '') === SALE_BAN_PRICE_TEXT;
}

function columnIndexToLetter_(columnIndex) {
  let letter = '';
  let num = columnIndex;
  while (num > 0) {
    const remainder = (num - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    num = Math.floor((num - 1) / 26);
  }
  return letter;
}

function applySaleBanStrikethroughForRows_(sheet, startRow, rowCount) {
  if (!sheet || rowCount <= 0) return;

  const safeStartRow = Math.max(2, startRow);
  const safeRowCount = rowCount - (safeStartRow - startRow);
  if (safeRowCount <= 0) return;

  const prices = sheet.getRange(safeStartRow, PRICE_COLUMN_INDEX, safeRowCount, 1).getDisplayValues();
  const strikeStartColLetter = columnIndexToLetter_(STRIKETHROUGH_START_COLUMN);
  const strikeEndColLetter = columnIndexToLetter_(STRIKETHROUGH_START_COLUMN + STRIKETHROUGH_COLUMN_COUNT - 1);
  const strikeRanges = [];
  const normalRanges = [];

  for (let i = 0; i < prices.length; i++) {
    const rowNumber = safeStartRow + i;
    const rowA1 = `${strikeStartColLetter}${rowNumber}:${strikeEndColLetter}${rowNumber}`;
    if (isSaleBanPrice_(prices[i][0])) {
      strikeRanges.push(rowA1);
    } else {
      normalRanges.push(rowA1);
    }
  }

  if (normalRanges.length > 0) {
    sheet.getRangeList(normalRanges).setFontLine('none');
  }
  if (strikeRanges.length > 0) {
    sheet.getRangeList(strikeRanges).setFontLine('line-through');
  }
}

function withDocumentLock_(callback) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function isDateSheetName_(sheetName) {
  return /^\d{6}$/.test(String(sheetName || '').trim());
}

function buildPriceKey_(item) {
  const base = [
    item.구분,
    item.원산지,
    item.브랜드,
    item.품명,
    item.EST
  ].map(value => String(value || '').trim());
  const grade = String(item.등급 || '').trim();
  return grade ? [...base, grade].join('|') : base.join('|');
}

function getLatestDateSheet_(spreadsheet) {
  const dateSheets = spreadsheet.getSheets()
    .filter(sheet => isDateSheetName_(sheet.getName()))
    .sort((a, b) => b.getName().localeCompare(a.getName()));
  return dateSheets.length > 0 ? dateSheets[0] : null;
}

function resolvePriceSyncSourceSheet_(spreadsheet, isScheduled = false) {
  const latestSheet = getLatestDateSheet_(spreadsheet);
  if (!latestSheet) return null;

  if (isScheduled) {
    return latestSheet;
  }

  const activeSheet = spreadsheet.getActiveSheet();
  if (activeSheet && isDateSheetName_(activeSheet.getName())) {
    return activeSheet;
  }

  return latestSheet;
}

function normalizeLookupText_(value) {
  return String(value || '').trim().toUpperCase();
}

function loadCategoryMap_(spreadsheet) {
  const categoryMap = new Map();
  if (!spreadsheet) return categoryMap;

  const categorySheet = spreadsheet.getSheetByName(CATEGORY_SHEET_NAME);
  if (!categorySheet) {
    Logger.log(`${CATEGORY_SHEET_NAME} 시트를 찾을 수 없습니다.`);
    return categoryMap;
  }

  const categoryData = categorySheet.getDataRange().getValues();
  if (categoryData.length === 0) return categoryMap;

  const categoryHeaders = categoryData[0];
  const productNameIdx = categoryHeaders.findIndex(h => String(h).trim() === '품목명');
  const categoryIdx = categoryHeaders.findIndex(h => String(h).trim() === '구분');
  if (productNameIdx < 0 || categoryIdx < 0) {
    Logger.log(`${CATEGORY_SHEET_NAME} 시트에서 "품목명" 또는 "구분" 컬럼을 찾을 수 없습니다.`);
    return categoryMap;
  }

  for (let i = 1; i < categoryData.length; i++) {
    const productName = normalizeLookupText_(categoryData[i][productNameIdx]);
    const category = normalizeLookupText_(categoryData[i][categoryIdx]);
    if (productName && category) {
      categoryMap.set(productName, category);
    }
  }

  return categoryMap;
}

function resolveCategoryByName_(categoryMap, productName) {
  const normalizedName = normalizeLookupText_(productName);
  if (!normalizedName) return DEFAULT_CATEGORY_TEXT;

  if (categoryMap.has(normalizedName)) {
    return categoryMap.get(normalizedName);
  }

  let longestMatch = '';
  let longestCategory = '';
  for (const [mappedName, categoryValue] of categoryMap) {
    if (normalizedName.includes(mappedName) && mappedName.length > longestMatch.length) {
      longestMatch = mappedName;
      longestCategory = categoryValue;
    }
  }

  return longestCategory || DEFAULT_CATEGORY_TEXT;
}

function normalizePriceValue_(value) {
  return String(value || '').trim();
}

function parseComparablePriceNumber_(value) {
  const normalized = normalizePriceValue_(value).replace(/,/g, '');
  if (!normalized) return null;
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

function resolvePreferredPriceValue_(currentPrice, candidatePrice) {
  const current = normalizePriceValue_(currentPrice);
  const candidate = normalizePriceValue_(candidatePrice);

  if (!current) return { selected: candidate, hasConflict: false };
  if (!candidate) return { selected: current, hasConflict: false };
  if (current === candidate) return { selected: current, hasConflict: false };

  const currentIsSaleBan = isSaleBanPrice_(current);
  const candidateIsSaleBan = isSaleBanPrice_(candidate);
  if (currentIsSaleBan && candidateIsSaleBan) {
    return { selected: SALE_BAN_PRICE_TEXT, hasConflict: false };
  }
  if (currentIsSaleBan || candidateIsSaleBan) {
    return { selected: SALE_BAN_PRICE_TEXT, hasConflict: true };
  }

  const currentNum = parseComparablePriceNumber_(current);
  const candidateNum = parseComparablePriceNumber_(candidate);
  const currentIsText = currentNum === null;
  const candidateIsText = candidateNum === null;

  if (currentIsText && candidateIsText) {
    return { selected: candidate, hasConflict: true };
  }
  if (currentIsText) {
    return { selected: current, hasConflict: true };
  }
  if (candidateIsText) {
    return { selected: candidate, hasConflict: true };
  }

  if (currentNum !== null && candidateNum !== null && currentNum === candidateNum) {
    return { selected: candidate, hasConflict: false };
  }

  if (currentNum !== null && candidateNum !== null) {
    return {
      selected: candidateNum > currentNum ? candidate : current,
      hasConflict: true
    };
  }
  if (currentNum !== null) {
    return { selected: current, hasConflict: true };
  }
  if (candidateNum !== null) {
    return { selected: candidate, hasConflict: true };
  }

  return { selected: candidate, hasConflict: true };
}

function buildPriceConflictLabel_(item) {
  return [
    item.구분,
    item.원산지,
    item.브랜드,
    item.품명,
    item.EST,
    item.등급
  ].filter(Boolean).join(' | ');
}

function buildPriceConflictWarningMessage_(sheetName, conflicts) {
  if (!conflicts || conflicts.length === 0) return '';

  const preview = conflicts.slice(0, 5).map((conflict, idx) => (
    `${idx + 1}. ${conflict.label}\n입력값: ${conflict.values.join(' / ')}\n적용값: ${conflict.selected}`
  )).join('\n\n');
  const extra = conflicts.length > 5 ? `\n\n외 ${conflicts.length - 5}건` : '';

  return [
    `[경고] ${sheetName} 시트에서 같은 품목에 단가가 여러 개 있습니다.`,
    '판매금지 우선, 일반 텍스트 우선, 숫자 단가는 큰 값으로 저장했습니다.',
    '',
    `${preview}${extra}`
  ].join('\n');
}

function collectPriceStateResultFromDateSheet_(sourceSheet) {
  const priceStateMap = new Map();
  const conflictMap = new Map();
  if (!sourceSheet) {
    return { priceStateMap, conflicts: [] };
  }

  const categoryMap = loadCategoryMap_(sourceSheet.getParent());
  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) {
    return { priceStateMap, conflicts: [] };
  }

  const sourceValues = sourceSheet.getRange(2, 1, lastRow - 1, 12).getDisplayValues();
  let prevMeta = { 원산지: '', 브랜드: '', 품명: '', EST: '' };

  for (let i = 0; i < sourceValues.length; i++) {
    const row = sourceValues[i];
    let [, origin, brand, name, est, grade, qty] = [row[0], row[1], row[2], row[3], row[4], row[5], row[6]];

    // 중간 빈 행이 있어도 뒤쪽 품목까지 계속 읽는다.
    if (!origin && !brand && !name && !est && !grade && !qty && !row[10]) {
      continue;
    }

    if (origin) prevMeta.원산지 = origin;
    if (brand) prevMeta.브랜드 = brand;
    if (name) prevMeta.품명 = name;
    if (est) prevMeta.EST = est;

    const resolvedName = String(name || prevMeta.품명).trim();
    const currentMeta = {
      구분: resolveCategoryByName_(categoryMap, resolvedName),
      원산지: String(origin || prevMeta.원산지).trim(),
      브랜드: String(brand || prevMeta.브랜드).trim(),
      품명: resolvedName,
      EST: String(est || prevMeta.EST).trim(),
      등급: grade ? String(grade).trim() : '',
      단가: String(row[10] || '').trim()
    };

    if (!currentMeta.품명) continue;
    if (currentMeta.품명.includes('작업') || currentMeta.품명.includes('냉장')) continue;

    const key = buildPriceKey_(currentMeta);
    if (!priceStateMap.has(key)) {
      priceStateMap.set(key, currentMeta);
      continue;
    }

    const existingMeta = priceStateMap.get(key);
    const resolution = resolvePreferredPriceValue_(existingMeta.단가, currentMeta.단가);

    if (resolution.hasConflict) {
      if (!conflictMap.has(key)) {
        conflictMap.set(key, new Set());
      }
      if (existingMeta.단가) conflictMap.get(key).add(normalizePriceValue_(existingMeta.단가));
      if (currentMeta.단가) conflictMap.get(key).add(normalizePriceValue_(currentMeta.단가));
    }

    existingMeta.단가 = resolution.selected;
  }

  const conflicts = Array.from(conflictMap.entries()).map(([key, values]) => {
    const item = priceStateMap.get(key);
    return {
      key,
      label: buildPriceConflictLabel_(item),
      values: Array.from(values),
      selected: normalizePriceValue_(item.단가)
    };
  });

  return { priceStateMap, conflicts };
}

function collectPriceStatesFromDateSheet_(sourceSheet) {
  return collectPriceStateResultFromDateSheet_(sourceSheet).priceStateMap;
}

function extractPriceValueMap_(priceStateMap) {
  const priceValueMap = new Map();
  priceStateMap.forEach((item, key) => {
    priceValueMap.set(key, String(item.단가 || '').trim());
  });
  return priceValueMap;
}

function ensurePriceSheet_(spreadsheet) {
  let priceSheet = spreadsheet.getSheetByName(PRICE_SHEET_NAME);
  if (!priceSheet) {
    priceSheet = spreadsheet.insertSheet(PRICE_SHEET_NAME);
    priceSheet.appendRow(PRICE_SHEET_HEADERS);
    priceSheet.getRange(1, 1, 1, PRICE_SHEET_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#EFEFEF');
    priceSheet.setFrozenRows(1);
  } else {
    const headerRange = priceSheet.getRange(1, 1, 1, PRICE_SHEET_HEADERS.length);
    const headers = headerRange.getValues()[0];
    let headerUpdated = false;

    PRICE_SHEET_HEADERS.forEach((header, idx) => {
      if (String(headers[idx] || '').trim() !== header) {
        headers[idx] = header;
        headerUpdated = true;
      }
    });

    if (headerUpdated) {
      headerRange.setValues([headers]);
      headerRange.setFontWeight('bold').setBackground('#EFEFEF');
    }
  }

  priceSheet.getRange('A2:H5000').setNumberFormat('@');
  return priceSheet;
}

function buildPriceSyncStatusNote_(sourceSheetName, stats) {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return [
    `마지막 단가 저장: ${timestamp}`,
    `기준 시트: ${sourceSheetName}`,
    `추가: ${stats.added}건`,
    `업데이트: ${stats.updated}건`,
    `비움: ${stats.cleared}건`
  ].join('\n');
}

function applyPriceStatusNoteToSheet_(sheet, note) {
  if (!sheet || !note || sheet.getMaxColumns() < PRICE_COLUMN_INDEX) return;
  sheet.getRange(1, PRICE_COLUMN_INDEX).setNote(note);
}

function syncPriceSheetFromSourceSheet_(sourceSheet, options = {}) {
  if (!sourceSheet) return null;

  const {
    showAlert = false
  } = options;
  const spreadsheet = sourceSheet.getParent();
  const collectionResult = collectPriceStateResultFromDateSheet_(sourceSheet);
  const newPriceMap = collectionResult.priceStateMap;
  const conflicts = collectionResult.conflicts;
  const priceSheet = ensurePriceSheet_(spreadsheet);
  const priceLastRow = priceSheet.getLastRow();
  const existingData = priceLastRow > 1
    ? priceSheet.getRange(2, 1, priceLastRow - 1, 8).getDisplayValues()
    : [];
  const existingKeyMap = new Map();
  const latestSheet = getLatestDateSheet_(spreadsheet);
  const shouldClearMissingPrices = latestSheet && sourceSheet.getSheetId() === latestSheet.getSheetId();

  existingData.forEach((row, idx) => {
    const key = buildPriceKey_({
      구분: row[0],
      원산지: row[1],
      브랜드: row[2],
      품명: row[3],
      EST: row[4],
      등급: row[5]
    });
    existingKeyMap.set(key, idx);
  });

  const rowsToAdd = [];
  let updateCount = 0;
  let clearedCount = 0;
  let existingDataChanged = false;

  newPriceMap.forEach((item, key) => {
    const newPrice = String(item.단가 || '').trim();

    if (existingKeyMap.has(key)) {
      const existingIndex = existingKeyMap.get(key);
      const existingRow = existingData[existingIndex];
      const existingPrice = String(existingRow[6] || '').trim();

      if (existingPrice !== newPrice) {
        existingRow[6] = newPrice;
        existingRow[7] = key;
        existingDataChanged = true;
        if (existingPrice && !newPrice) {
          clearedCount++;
        } else {
          updateCount++;
        }
      }
      return;
    }

    if (newPrice) {
      rowsToAdd.push([item.구분, item.원산지, item.브랜드, item.품명, item.EST, item.등급, newPrice, key]);
    }
  });

  if (shouldClearMissingPrices) {
    existingData.forEach((row, idx) => {
      const key = buildPriceKey_({
        구분: row[0],
        원산지: row[1],
        브랜드: row[2],
        품명: row[3],
        EST: row[4],
        등급: row[5]
      });
      const existingPrice = String(row[6] || '').trim();

      if (!newPriceMap.has(key) && existingPrice) {
        existingData[idx][6] = '';
        existingData[idx][7] = key;
        existingDataChanged = true;
        clearedCount++;
      }
    });
  }

  if (existingDataChanged && existingData.length > 0) {
    priceSheet.getRange(2, 1, existingData.length, 8).setValues(existingData);
  }

  if (rowsToAdd.length > 0) {
    priceSheet.getRange(priceSheet.getLastRow() + 1, 1, rowsToAdd.length, 8).setValues(rowsToAdd);
  }

  const finalLastRow = priceSheet.getLastRow();
  if (finalLastRow > 1) {
    const sortRange = priceSheet.getRange(2, 1, finalLastRow - 1, 8);
    const sortData = sortRange.getValues();
    const categoryOrder = ['냉동우육', '우부산물', '냉동돈육', '돈부산물', '냉동계육'];

    sortData.sort((a, b) => {
      const orderA = categoryOrder.indexOf(a[0]);
      const orderB = categoryOrder.indexOf(b[0]);
      const valA = orderA === -1 ? 999 : orderA;
      const valB = orderB === -1 ? 999 : orderB;
      if (valA !== valB) return valA - valB;

      for (let i = 1; i <= 5; i++) {
        const compare = String(a[i] || '').localeCompare(String(b[i] || ''), 'ko');
        if (compare !== 0) return compare;
      }
      return 0;
    });

    sortRange.setValues(sortData);
    sortRange.setHorizontalAlignment('center').setVerticalAlignment('middle');
  }

  SpreadsheetApp.flush();

  const stats = {
    added: rowsToAdd.length,
    updated: updateCount,
    cleared: clearedCount
  };
  const note = buildPriceSyncStatusNote_(sourceSheet.getName(), stats);
  priceSheet.getRange(1, PRICE_SHEET_NOTE_COLUMN_INDEX).setNote(note);
  applyPriceStatusNoteToSheet_(sourceSheet, note);

  const msg = `동기화 완료 (${sourceSheet.getName()} 기준): 추가 ${stats.added}건, 업데이트 ${stats.updated}건, 비움 ${stats.cleared}건`;
  const warningMsg = buildPriceConflictWarningMessage_(sourceSheet.getName(), conflicts);
  Logger.log(msg);
  if (warningMsg) {
    Logger.log(warningMsg);
  }

  if (showAlert) {
    const alertMsg = warningMsg ? `${msg}\n\n${warningMsg}` : msg;
    SpreadsheetApp.getUi().alert(alertMsg);
  }

  return {
    ...stats,
    conflicts
  };
}

/**
 * 복합키 기반 8자리 관리 코드 생성
 * 형식: 2자리(품명) + 2자리(브랜드) + 4자리(해시)
 */
function generateProductCode(components) {
  // 필수 요소가 비어있으면 기본값
  if (!components.품명 || !components.브랜드) {
    return 'XXXXXXXX';
  }

  // 1-2자리: 품명 앞 2글자 (영문으로 변환)
  const itemCode = convertToAlphaCode(components.품명, 2);

  // 3-4자리: 브랜드 앞 2글자 (영문으로 변환)
  const brandCode = convertToAlphaCode(components.브랜드, 2);

  // 5-8자리: 전체 복합키의 해시값 (4자리 영숫자)
  const compositeKey = [
    components.품명,
    components.브랜드,
    components.등급,
    components.EST,
    components['B/L_NO'],
    components.출처,
    components.창고
  ].join('|');

  const hashCode = generateHash(compositeKey, 4);

  return `${itemCode}${brandCode}${hashCode}`.toUpperCase();
}

/**
 * 문자열을 영문 코드로 변환 (한글 -> 초성/영문)
 */
function convertToAlphaCode(text, length) {
  if (!text) return 'X'.repeat(length);

  // 한글 초성 테이블
  const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const CHO_ENG = ['G', 'K', 'N', 'D', 'T', 'R', 'M', 'B', 'P', 'S', 'S', 'O', 'J', 'J', 'C', 'K', 'T', 'P', 'H'];

  let result = '';
  for (let i = 0; i < text.length && result.length < length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    if (code >= 0xAC00 && code <= 0xD7A3) {
      // 한글인 경우 초성 추출
      const choIndex = Math.floor((code - 0xAC00) / 588);
      result += CHO_ENG[choIndex];
    } else if (/[A-Za-z0-9]/.test(char)) {
      // 영문/숫자는 그대로
      result += char.toUpperCase();
    }
  }

  // 부족하면 X로 채우기
  while (result.length < length) {
    result += 'X';
  }

  return result.substring(0, length);
}

/**
 * 간단한 해시 함수 (CRC32 유사)
 */
function generateHash(str, length) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit 정수로 변환
  }

  // 음수를 양수로 변환
  hash = Math.abs(hash);

  // 영숫자 조합으로 변환 (36진수)
  let result = hash.toString(36).toUpperCase();

  // 길이 맞추기
  while (result.length < length) {
    result = '0' + result;
  }

  return result.substring(0, length);
}

/*************************
 * 원산지 기준 품목리스트 생성 (구분 컬럼 추가)
 * ✅ 수정사항: 구분 > 원산지 > 브랜드 순 정렬 및 데이터 분리 (콤마 병합 없음)
 *************************/
function createProductListByOrigin() {
  return withDocumentLock_(() => createProductListByOrigin_());
}

function createProductListByOrigin_() {
  const sourceSpreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sourceSheet = sourceSpreadsheet.getSheetByName(SOURCE_SHEET_NAME);

  if (!sourceSheet) return;

  const lastRow = sourceSheet.getLastRow();
  const lastCol = sourceSheet.getLastColumn();
  if (lastRow < 2) return;

  const targetSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const categoryMap = loadCategoryMap_(targetSpreadsheet);
  Logger.log('구분 매핑 데이터 로드 완료: ' + categoryMap.size + '개');

  const headers = sourceSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const displayData = sourceSheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();
  const rawData = sourceSheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const idx = (...names) =>
    headers.findIndex(h => names.includes(String(h).trim()));

  const col = {
    품목명: idx('품명'),
    브랜드: idx('브랜드'),
    원산지: idx('원산지'),
    등급: idx('등급'),
    EST: idx('EST'),
    'B/L_NO': idx('B/L_NO'),
    평균중량: idx('평균중량'),
    창고: idx('창고'),
    단가: idx('단가'),
    재고: idx('재고'),
    출처: idx('출처'),
    유통기한: idx('유통기한')
  };

  // ✅ 데이터를 병합 (품명+등급+EST+창고가 같으면 병합)
  const dataMap = new Map();

  displayData.forEach((row, rowIdx) => {
    // 진짜 원본 값 (관리 코드용 - 대문자 변환 안 함)
    const rawBrand = String(row[col.브랜드] || '').trim();
    const rawName = String(row[col.품목명] || '').trim();
    const rawGrade = String(row[col.등급] || '').trim();
    const rawEst = String(row[col.EST] || '').trim();
    const rawBlNo = String(row[col['B/L_NO']] || '').trim();
    let rawSource = String(row[col.출처] || '').trim();
    const rawWarehouse = String(row[col.창고] || '').trim();

    // ✅ 검색창과 동일: 출처 변환 (JNS → 유통) - 관리 코드 생성 전 변환
    if (rawSource.toUpperCase() === 'JNS') {
      rawSource = '유통';
    }

    // ✅ 1순위: 모든 텍스트 컬럼 소문자 → 대문자 변환 (표시/병합용)
    const origin = String(row[col.원산지] || '').trim().toUpperCase();
    let brand = rawBrand.toUpperCase();
    const name = rawName.toUpperCase();
    const grade = rawGrade.toUpperCase();
    const est = rawEst.toUpperCase();
    const blNo = rawBlNo.toUpperCase();
    let warehouse = rawWarehouse.toUpperCase();
    const price = String(row[col.단가] || '').trim().toUpperCase();
    let source = rawSource.toUpperCase();
    const expiryDate = String(row[col.유통기한] || '').trim().toUpperCase();

    // ✅ 창고명 변환: 곤지암 → 제니스 (표시용만)
    if (warehouse === '곤지암') {
      warehouse = '제니스';
    }

    // ✅ 2순위: '작업' 또는 '냉장'이 포함된 데이터는 제외
    if (name.includes('작업') || name.includes('냉장') ||
        brand.includes('작업') || brand.includes('냉장')) {
      return; // 이 행은 건너뛰기
    }

    const stock = parseNumber(rawData[rowIdx][col.재고]);
    const avgWeight = parseNumber(rawData[rowIdx][col.평균중량]);

    // ✅ 3순위: 브랜드 통합 ('5 STAR'로 시작하면 무조건 '5 STAR') - 표시용만
    if (brand.startsWith('5 STAR')) {
      brand = '5 STAR';
    }

    if (!origin || !name) return;

    const category = resolveCategoryByName_(categoryMap, name);
    
    // ✅ 품명+등급+EST+창고가 같으면 병합 (B/L_NO 제외 - 같은 품목은 B/L_NO 달라도 합산)
    const key = `${category}|${origin}|${brand}|${name}|${grade}|${est}|${warehouse}`;

    if (!dataMap.has(key)) {
      dataMap.set(key, {
        구분: category,
        원산지: origin,
        브랜드: brand,
        품명: name,
        등급: grade,
        EST: est,
        'B/L_NO': blNo,
        재고: stock,
        평균중량: avgWeight,
        총중량: avgWeight > 0 ? avgWeight * stock : 0, // 가중평균 계산용 (0/null 제외)
        평균중량_재고: avgWeight > 0 ? stock : 0, // 평균중량이 유효한 재고만 합산
        유통기한: expiryDate,
        출처: source,
        창고: warehouse,
        단가: price,
        // 진짜 원본 값 (관리 코드 생성용 - 대문자 변환 전)
        브랜드_원본: rawBrand,
        품명_원본: rawName,
        등급_원본: rawGrade,
        EST_원본: rawEst,
        'B/L_NO_원본': rawBlNo,
        출처_원본: rawSource,
        창고_원본: rawWarehouse
      });
    } else {
      const existing = dataMap.get(key);
      existing.재고 += stock;
      if (avgWeight > 0) {
        existing.총중량 += avgWeight * stock; // 가중평균 계산용 (0/null 제외)
        existing.평균중량_재고 += stock;
      }

      // ✅ 유통기한 비교: 가장 짧은(빠른) 날짜를 저장
      const newExpiry = parseDateString(expiryDate);
      const existingExpiry = parseDateString(existing.유통기한);

      // 둘 다 유효한 날짜이면 더 짧은 것 선택
      if (newExpiry && existingExpiry) {
        if (newExpiry < existingExpiry) {
          existing.유통기한 = expiryDate;
          // 유통기한이 더 짧은 행의 원본 값으로 관리코드용 데이터 갱신
          existing.브랜드_원본 = rawBrand;
          existing.품명_원본 = rawName;
          existing.등급_원본 = rawGrade;
          existing.EST_원본 = rawEst;
          existing['B/L_NO_원본'] = rawBlNo;
          existing.출처_원본 = rawSource;
          existing.창고_원본 = rawWarehouse;
        }
      }
      // 기존에 유통기한이 없고 새로운 유통기한이 있으면 사용
      else if (newExpiry && !existingExpiry) {
        existing.유통기한 = expiryDate;
        existing.브랜드_원본 = rawBrand;
        existing.품명_원본 = rawName;
        existing.등급_원본 = rawGrade;
        existing.EST_원본 = rawEst;
        existing['B/L_NO_원본'] = rawBlNo;
        existing.출처_원본 = rawSource;
        existing.창고_원본 = rawWarehouse;
      }
      // 둘 다 없으면 그냥 비워둠 (아무것도 안 함)
    }
  });

  // ✅ 평균중량 계산 (가중평균, 평균중량이 0/null인 행은 제외) 및 재고 20 이상 필터링
  const allData = [...dataMap.values()]
    .map(item => {
      item.평균중량 = item.평균중량_재고 > 0 ? item.총중량 / item.평균중량_재고 : 0;
      delete item.총중량; // 계산용 필드 제거
      delete item.평균중량_재고; // 계산용 필드 제거
      return item;
    })
    .filter(item => item.재고 > 0);

  // ✅ 구분 우선순위 함수: 소 > 돼지 > 닭 > 나머지
  const getCategoryPriority = (category) => {
    if (!category) return 4;
    if (category.includes('우육') || category.includes('우부산물')) return 1; // 소
    if (category.includes('돈육') || category.includes('돈부산물')) return 2; // 돼지
    if (category.includes('계육')) return 3; // 닭
    return 4; // 나머지
  };

  // ✅ 행수 계산: 구분별, 원산지별, 브랜드별
  const categoryCount = new Map();
  const originCount = new Map();
  const brandCount = new Map();

  allData.forEach(item => {
    // 구분별 행수
    categoryCount.set(item.구분, (categoryCount.get(item.구분) || 0) + 1);

    // 원산지별 행수 (구분 내에서)
    const originKey = `${item.구분}|${item.원산지}`;
    originCount.set(originKey, (originCount.get(originKey) || 0) + 1);

    // 브랜드별 행수 (원산지 내에서)
    const brandKey = `${item.구분}|${item.원산지}|${item.브랜드}`;
    brandCount.set(brandKey, (brandCount.get(brandKey) || 0) + 1);
  });

  // ✅ 구분(소>돼지>닭>나머지, 같은 우선순위 내에서는 행수 많은 순) > 원산지(행수 많은 순) > 브랜드(행수 많은 순) > 품명(가나다순) > EST(알파벳순) 순으로 정렬
  const sortedData = allData.sort((a, b) => {
    // 1순위: 구분 우선순위
    const priorityA = getCategoryPriority(a.구분);
    const priorityB = getCategoryPriority(b.구분);

    if (priorityA !== priorityB) {
      return priorityA - priorityB; // 우선순위 낮은 숫자가 먼저
    }

    // 같은 우선순위 내에서는 행수가 많은 순
    if (a.구분 !== b.구분) {
      return categoryCount.get(b.구분) - categoryCount.get(a.구분);
    }

    // 2순위: 원산지 (가나다순)
    if (a.원산지 !== b.원산지) {
      return a.원산지.localeCompare(b.원산지);
    }

    // 3순위: 브랜드 (가나다순)
    if (a.브랜드 !== b.브랜드) {
      // 5 STAR를 SHOWCASE 바로 다음에 오도록 정렬키 조정
      const getSortKey = (brand) => {
        if (brand === '5 STAR') return 'SHOWCASE_Z';  // SHOWCASE 바로 다음
        return brand;
      };

      return getSortKey(a.브랜드).localeCompare(getSortKey(b.브랜드));
    }

    // 4순위: 품명 (가나다순)
    if (a.품명 !== b.품명) {
      return a.품명.localeCompare(b.품명);
    }

    // 5순위: EST (알파벳순)
    return a.EST.localeCompare(b.EST);
  });

  const sheetName = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd');
  const old = targetSpreadsheet.getSheetByName(sheetName);
  const sameDayPriceOverrideMap = old
    ? extractPriceValueMap_(collectPriceStatesFromDateSheet_(old))
    : new Map();

  // ✅ 기존 오늘 시트의 수동 단가를 먼저 백업한 뒤 재생성
  if (old) {
    targetSpreadsheet.deleteSheet(old);
  }

  // ✅ 단가 시트에서 단가 데이터 로드
  const priceMap = new Map();
  const priceSheet = targetSpreadsheet.getSheetByName(PRICE_SHEET_NAME);
  const latestPriceStatusNote = priceSheet
    ? priceSheet.getRange(1, PRICE_SHEET_NOTE_COLUMN_INDEX).getNote()
    : '';

  if (priceSheet) {
    const priceLastRow = priceSheet.getLastRow();
    if (priceLastRow > 1) {
      const priceData = priceSheet.getRange(2, 1, priceLastRow - 1, 8).getDisplayValues();
      priceData.forEach(row => {
        const key = buildPriceKey_({
          구분: row[0],
          원산지: row[1],
          브랜드: row[2],
          품명: row[3],
          EST: row[4],
          등급: row[5]
        });
        const price = row[6]; // 단가
        if (price) {
          priceMap.set(key, price);
        }
      });
      Logger.log(`단가 시트에서 ${priceMap.size}개 단가 로드`);
    }
  } else {
    Logger.log('단가 시트를 찾을 수 없습니다.');
  }

  const sheet = targetSpreadsheet.insertSheet(sheetName, 0); // 맨 앞(0번째 위치)에 시트 생성

  // ✅ 컬럼 순서: 구분, 원산지, 브랜드, 품명, EST, 등급, 재고, 유통기한, 출처, 창고, 단가, 관리 코드, 평균중량 (평균중량은 굵은선 밖)
  const outHeaders = ['구분', '원산지', '브랜드', '품명', 'EST', '등급', '재고', '유통기한', '출처', '창고', '단가', '관리 코드', '평균중량'];
  sheet.getRange(1, 1, 1, outHeaders.length).setValues([outHeaders]);
  applyPriceStatusNoteToSheet_(sheet, latestPriceStatusNote);

  if (sortedData.length) {
    // ✅ 단가 시트에서 단가를 가져와서 각 행에 적용 + 관리 코드 생성
    let priceLoadedCount = 0;
    const output = sortedData.map((v, idx) => {
      const key = buildPriceKey_(v);
      const hasSameDayOverride = sameDayPriceOverrideMap.has(key);
      const savedPrice = hasSameDayOverride ? sameDayPriceOverrideMap.get(key) : priceMap.get(key);
      const price = savedPrice || '';
      if (price) {
        priceLoadedCount++;
        Logger.log(`단가 적용: 행 ${idx + 8}, 키: ${key}, 단가: ${price}${hasSameDayOverride ? ' (오늘 시트 우선 복원)' : ''}`);
      }

      // 관리 코드 생성 (진짜 원본 값 사용 - 대문자 변환 전)
      const productCode = generateProductCode({
        품명: v.품명_원본 || '',
        브랜드: v.브랜드_원본 || '',
        등급: v.등급_원본 || '',
        EST: v.EST_원본 || '',
        'B/L_NO': v['B/L_NO_원본'] || '',
        출처: v.출처_원본 || '',
        창고: v.창고_원본 || ''
      });

      return [...outHeaders.slice(0, -3).map(h => v[h] || ''), price, productCode, v.평균중량 || '']; // 마지막에 단가, 관리 코드, 평균중량 추가
    });
    Logger.log(`총 ${priceLoadedCount}개의 단가 적용 완료`);

    // ✅ 냉동육 데이터 출력
    const dataRange = sheet.getRange(2, 1, output.length, outHeaders.length);
    dataRange.setNumberFormat('@');
    dataRange.setValues(output);

    // 정렬 및 포맷
    sheet.getRange(1, 1, output.length + 1, outHeaders.length)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    // ✅ 숫자 컬럼만 선택적으로 숫자 포맷 적용
    // 재고 컬럼 (7번째)
    sheet.getRange(2, 7, output.length, 1).setNumberFormat('#,##0');
    // 단가 컬럼 (11번째)
    sheet.getRange(2, 11, output.length, 1).setNumberFormat('#,##0');
    // 관리 코드 컬럼 (12번째) - 텍스트 포맷
    sheet.getRange(2, 12, output.length, 1).setNumberFormat('@');
    // 평균중량 컬럼 (13번째, 굵은선 밖)
    sheet.getRange(2, 13, output.length, 1).setNumberFormat('#,##0.00');

    // ✅ 모바일 가독성: 데이터 평균 길이 기반으로 컬럼 너비 조정
    // 품명, 브랜드, 창고는 최대 길이로 조정 (글자 안 잘리게)
    for (let col = 0; col < outHeaders.length; col++) {
      const headerName = String(outHeaders[col]).trim();
      let totalLength = 0;
      let count = 0;
      let maxLength = 0;

      // 각 컬럼의 평균 및 최대 글자 길이 계산
      for (let row = 0; row < output.length; row++) {
        const value = String(output[row][col] || '');
        if (value) {
          totalLength += value.length;
          count++;
          if (value.length > maxLength) {
            maxLength = value.length;
          }
        }
      }

      const avgLength = count > 0 ? totalLength / count : 0;
      const headerLength = headerName.length;

      // 품명, 브랜드, 창고는 최대 길이 기준, 나머지는 평균 길이 기준
      let baseLength;
      if (headerName === '품명' || headerName === '브랜드' || headerName === '창고') {
        baseLength = Math.max(maxLength, headerLength);
      } else {
        baseLength = Math.max(avgLength, headerLength);
      }

      // 한글/영문 혼합 기준 약 9픽셀, 최소 60, 최대 300
      const width = Math.max(60, Math.min(300, baseLength * 9 + 20));

      sheet.setColumnWidth(col + 1, width);
    }

    // ✅ 유통기한 컬럼 조건부 배경색 적용 (헤더명 기반)
    const today = new Date();
    const oneYearLater = new Date(today);
    oneYearLater.setDate(oneYearLater.getDate() + 365);
    const sixMonthsLater = new Date(today);
    sixMonthsLater.setDate(sixMonthsLater.getDate() + 180);
    const expiryColIdx = outHeaders.indexOf('유통기한');

    Logger.log(`오늘: ${today}, 6개월 후: ${sixMonthsLater}, 1년 후: ${oneYearLater}`);
    let colorAppliedCount = 0;

    if (expiryColIdx === -1) {
      Logger.log('유통기한 컬럼을 찾지 못해 배경색 적용을 건너뜁니다.');
    }

    for (let i = 0; i < output.length; i++) {
      if (expiryColIdx === -1) break;
      const expiryDateStr = String(output[i][expiryColIdx]).trim();

      if (expiryDateStr && expiryDateStr !== '') {
        Logger.log(`행 ${i + 2}: 유통기한 원본="${expiryDateStr}", 타입=${typeof expiryDateStr}, 길이=${expiryDateStr.length}`);

        const expiryDate = parseDateString(expiryDateStr);
        if (!expiryDate) {
          Logger.log('  파싱 실패: 지원하지 않는 형식');
        }

        if (expiryDate && !isNaN(expiryDate)) {
          const cellRange = sheet.getRange(i + 2, expiryColIdx + 1);

          // 6개월 미만: 연한 빨간색
          if (expiryDate <= sixMonthsLater) {
            cellRange.setBackground('#FFCCCC');
            Logger.log(`  배경색 적용: 빨간색 (6개월 미만)`);
            colorAppliedCount++;
          }
          // 1년 미만: 연한 주황색
          else if (expiryDate <= oneYearLater) {
            cellRange.setBackground('#FFE5CC');
            Logger.log(`  배경색 적용: 주황색 (1년 미만)`);
            colorAppliedCount++;
          } else {
            Logger.log(`  배경색 미적용: 1년 이상`);
          }
        }
      }
    }
    Logger.log(`총 ${colorAppliedCount}개 셀에 배경색 적용`);

    // ✅ 디버깅 로그 추가: 정렬된 데이터 일부 출력
    Logger.log('정렬된 데이터 (상위 20개): ' + JSON.stringify(sortedData.slice(0, 20).map(d => `${d.구분}|${d.원산지}|${d.브랜드}`)));

    // ✅ 구분 > 원산지 > 브랜드 > 품명 > EST 순으로 셀 병합 (냉동육 데이터)
    let i = 0;
    while (i < sortedData.length) {
      // 1. 구분 병합
      let j = i + 1;
      while (j < sortedData.length && sortedData[j].구분 === sortedData[i].구분) j++;
      if (j - i > 1) sheet.getRange(i + 2, 1, j - i, 1).merge();

      // 2. 같은 '구분' 내에서 '원산지' 병합
      let k = i;
      while (k < j) {
        Logger.log(`원산지 그룹 시작: k=${k}, 구분=${sortedData[k]?.구분}, 원산지=${sortedData[k]?.원산지}`);
        let m = k + 1;
        while (m < j && sortedData[m].원산지 === sortedData[k].원산지) m++;
        if (m - k > 1) sheet.getRange(k + 2, 2, m - k, 1).merge();
        Logger.log(` -> 원산지 그룹 끝: m=${m}`);

        // 3. 같은 '원산지' 내에서 '브랜드' 병합
        let n = k;
        while (n < m) {
          Logger.log(`  브랜드 그룹 시작: n=${n}, 브랜드=${sortedData[n]?.브랜드}`);
          let p = n + 1;
          while (p < m && sortedData[p].브랜드 === sortedData[n].브랜드) {
            // Logger.log(`    브랜드 비교: p=${p}, ${sortedData[p]?.브랜드} === ${sortedData[n]?.브랜드}`); // 필요시 상세 로그
            p++;
          }
          if (p - n > 1) {
            Logger.log(`  -> 브랜드 병합 실행: ${p - n}개 행`);
            sheet.getRange(n + 2, 3, p - n, 1).merge();
          }
          Logger.log(`  -> 브랜드 그룹 끝: p=${p}`);

          // 4. 같은 '브랜드' 내에서 '품명' 병합
          let q = n;
          while (q < p) {
            let r = q + 1;
            while (r < p && sortedData[r].품명 === sortedData[q].품명) r++;
            if (r - q > 1) sheet.getRange(q + 2, 4, r - q, 1).merge();

            // 5. 같은 '품명' 내에서 'EST' 병합
            let s = q;
            while (s < r) {
              let t = s + 1;
              while (t < r && sortedData[t].EST === sortedData[s].EST) t++;
              if (t - s > 1) sheet.getRange(s + 2, 5, t - s, 1).merge();
              s = t;
            }
            q = r;
          }
          n = p;
        }
        k = m;
      }
      i = j;
    }

    // ✅ 그룹별 굵은 사각 테두리 추가
    if (sortedData.length > 0) {
      let groupStartRow = 2; // 데이터는 2행부터 시작
      for (let i = 0; i < sortedData.length - 1; i++) {
        const current = sortedData[i];
        const next = sortedData[i + 1];

        // 구분, 원산지, 또는 브랜드가 변경되면 그룹의 끝
        if (current.구분 !== next.구분 || current.원산지 !== next.원산지 || current.브랜드 !== next.브랜드) {
          const groupEndRow = i + 2;
          const range = sheet.getRange(groupStartRow, 1, groupEndRow - groupStartRow + 1, outHeaders.length - 1);
          range.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);

          // 다음 그룹의 시작 행 업데이트
          groupStartRow = groupEndRow + 1;
        }
      }

      // 마지막 그룹에 테두리 적용 (하단선 제외 - 나중에 따로 적용)
      const lastRowIndex = sortedData.length - 1 + 2;
      const lastGroupRange = sheet.getRange(groupStartRow, 1, lastRowIndex - groupStartRow + 1, outHeaders.length - 1);
      lastGroupRange.setBorder(true, true, false, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    // ✅ 구분, 원산지, 브랜드 컬럼의 오른쪽 세로선을 굵게
    if (sortedData.length > 0) {
      sheet.getRange(2, 1, sortedData.length, 1).setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
      sheet.getRange(2, 2, sortedData.length, 1).setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
      sheet.getRange(2, 3, sortedData.length, 1).setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    // ✅ 마지막 구분과 원산지 병합셀에 바깥쪽 테두리 적용
    if (sortedData.length > 0) {
      const lastIdx = sortedData.length - 1;
      const lastData = sortedData[lastIdx];

      // 구분 병합 범위 찾기
      let 구분Start = lastIdx;
      while (구분Start > 0 && sortedData[구분Start - 1].구분 === lastData.구분) {
        구분Start--;
      }

      // 원산지 병합 범위 찾기
      let 원산지Start = lastIdx;
      while (원산지Start > 0 && sortedData[원산지Start - 1].원산지 === lastData.원산지 && sortedData[원산지Start - 1].구분 === lastData.구분) {
        원산지Start--;
      }

      // 구분 병합셀 전체 범위에 바깥쪽 테두리 적용
      const 구분Range = sheet.getRange(구분Start + 2, 1, lastIdx - 구분Start + 1, 1);
      구분Range.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);

      // 원산지 병합셀 전체 범위에 바깥쪽 테두리 적용
      const 원산지Range = sheet.getRange(원산지Start + 2, 2, lastIdx - 원산지Start + 1, 1);
      원산지Range.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    // ✅ 냉동육 전체 바깥쪽 테두리 굵게 적용 (평균중량 제외)
    const fullDataRange = sheet.getRange(2, 1, output.length, outHeaders.length - 1);
    fullDataRange.setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);

    // ✅ 단가가 "판매금지"인 행은 취소선 적용
    applySaleBanStrikethroughForRows_(sheet, 2, output.length);

    // ✅ 불필요한 행과 열 정리 (내부용 시트)
    const dataEndRow = output.length + 1; // 헤더(1) + 데이터
    const dataEndCol = outHeaders.length; // 12개 컬럼

    // 현재 시트의 전체 행/열 개수
    const maxRows = sheet.getMaxRows();
    const maxCols = sheet.getMaxColumns();

    // 데이터 범위를 넘어서는 행 삭제
    if (maxRows > dataEndRow) {
      sheet.deleteRows(dataEndRow + 1, maxRows - dataEndRow);
    }

    // 데이터 범위를 넘어서는 열 삭제
    if (maxCols > dataEndCol) {
      sheet.deleteColumns(dataEndCol + 1, maxCols - dataEndCol);
    }
  }

  sheet.setFrozenRows(1);

  // ===== 외부 공개용 시트 생성 (yyMMdd_외부자료) =====
  const externalSheetName = sheetName + '_외부자료';
  const oldExternal = targetSpreadsheet.getSheetByName(externalSheetName);

  // 기존 외부자료 시트가 있으면 삭제
  if (oldExternal) {
    targetSpreadsheet.deleteSheet(oldExternal);
  }

  const externalSheet = targetSpreadsheet.insertSheet(externalSheetName, 1); // 내부용 시트 다음에 생성

  // ✅ 외부자료용 템플릿 시트 가져오기
  const templateSheet = targetSpreadsheet.getSheetByName('품목리스트_양식');

  // ✅ 품목리스트_양식에서 A21:H28 복사 (상단 헤더)
  if (templateSheet) {
    const externalHeaderRange = templateSheet.getRange('A21:H28');
    const externalHeaderTarget = externalSheet.getRange('A1:H8');
    externalHeaderRange.copyTo(externalHeaderTarget);

    // 열 너비 복사 (A~H 열, 1~8번째 열)
    for (let col = 1; col <= 8; col++) {
      const width = templateSheet.getColumnWidth(col);
      externalSheet.setColumnWidth(col, width);
    }

    // 행 높이 복사 (1~8행)
    for (let row = 1; row <= 8; row++) {
      const height = templateSheet.getRowHeight(row + 20); // 양식의 21~28행
      externalSheet.setRowHeight(row, height);
    }

    // E3:H4에 오늘 날짜 입력 (텍스트 형식으로)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    const dateRange = externalSheet.getRange('E3:H4');
    dateRange.setNumberFormat('@');  // 텍스트 형식으로 먼저 설정
    dateRange.setValue(dateString);
  }

  // ✅ 외부용 컬럼: 구분, 원산지, 브랜드, 품명, EST, 등급, 유통기한, 창고, 평균중량(굵은선 밖)
  const externalHeaders = ['구분', '원산지', '브랜드', '품명', 'EST', '등급', '유통기한', '창고', '평균중량'];
  const EXTERNAL_BORDER_COLS = externalHeaders.length - 1; // 평균중량 제외한 테두리 범위
  externalSheet.getRange(9, 1, 1, externalHeaders.length).setValues([externalHeaders]);

  // ✅ 외부자료는 재고 50 이상만 표시
  const externalSortedData = sortedData.filter(item => item.재고 >= 50);

  // I1:I4에 유통기한 범례 추가
  externalSheet.getRange('I1').setValue('유통기한 표기')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setFontWeight('bold');

  externalSheet.getRange('I2').setValue('6개월 미만')
    .setBackground('#FFCCCC')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  externalSheet.getRange('I3').setValue('1년 미만')
    .setBackground('#FFE5CC')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  externalSheet.getRange('I4').setValue('1년 이상')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  if (externalSortedData.length) {
    // 외부용 데이터 출력 (재고, 출처, 단가 제외)
    const externalOutput = externalSortedData.map((v) => {
      return [
        v.구분 || '',
        v.원산지 || '',
        v.브랜드 || '',
        v.품명 || '',
        v.EST || '',
        v.등급 || '',
        v.유통기한 || '',
        v.창고 || '',
        v.평균중량 || ''
      ];
    });

    // 데이터 출력
    const externalDataRange = externalSheet.getRange(10, 1, externalOutput.length, externalHeaders.length);
    externalDataRange.setNumberFormat('@');
    externalDataRange.setValues(externalOutput);

    // 정렬 및 포맷
    externalSheet.getRange(9, 1, externalOutput.length + 1, externalHeaders.length)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    // 평균중량 컬럼만 숫자 포맷 적용 (9번째)
    externalSheet.getRange(10, 9, externalOutput.length, 1).setNumberFormat('#,##0.00');

    // ✅ 유통기한 컬럼 조건부 배경색 적용 (헤더명 기반)
    const today2 = new Date();
    const oneYearLater = new Date(today2);
    oneYearLater.setDate(oneYearLater.getDate() + 365);
    const sixMonthsLater = new Date(today2);
    sixMonthsLater.setDate(sixMonthsLater.getDate() + 180);
    const externalExpiryColIdx = externalHeaders.indexOf('유통기한');

    if (externalExpiryColIdx === -1) {
      Logger.log('외부자료 유통기한 컬럼을 찾지 못해 배경색 적용을 건너뜁니다.');
    }

    for (let i = 0; i < externalOutput.length; i++) {
      if (externalExpiryColIdx === -1) break;
      const expiryDateStr = String(externalOutput[i][externalExpiryColIdx]).trim();

      if (expiryDateStr && expiryDateStr !== '') {
        const expiryDate = parseDateString(expiryDateStr);

        if (expiryDate && !isNaN(expiryDate)) {
          const cellRange = externalSheet.getRange(i + 10, externalExpiryColIdx + 1);
          if (expiryDate <= sixMonthsLater) {
            cellRange.setBackground('#FFCCCC');
          } else if (expiryDate <= oneYearLater) {
            cellRange.setBackground('#FFE5CC');
          }
        }
      }
    }

    // ✅ 품목리스트_양식에서 A32:H42 복사 (하단 냉장육)
    if (templateSheet) {
      const externalChillStartRow = 10 + externalOutput.length + 1;
      const externalChillSourceRange = templateSheet.getRange('A32:H42');
      const externalChillTargetRange = externalSheet.getRange(externalChillStartRow, 1, 11, 8);
      externalChillSourceRange.copyTo(externalChillTargetRange);
    }

    // ✅ 구분 > 원산지 > 브랜드 > 품명 > EST 순으로 셀 병합
    let i = 0;
    while (i < externalSortedData.length) {
      // 1. 구분 병합
      let j = i + 1;
      while (j < externalSortedData.length && externalSortedData[j].구분 === externalSortedData[i].구분) j++;
      if (j - i > 1) externalSheet.getRange(i + 10, 1, j - i, 1).merge();

      // 2. 원산지 병합
      let k = i;
      while (k < j) {
        let m = k + 1;
        while (m < j && externalSortedData[m].원산지 === externalSortedData[k].원산지) m++;
        if (m - k > 1) externalSheet.getRange(k + 10, 2, m - k, 1).merge();

        // 3. 브랜드 병합
        let n = k;
        while (n < m) {
          let p = n + 1;
          while (p < m && externalSortedData[p].브랜드 === externalSortedData[n].브랜드) p++;
          if (p - n > 1) externalSheet.getRange(n + 10, 3, p - n, 1).merge();

          // 4. 품명 병합
          let q = n;
          while (q < p) {
            let r = q + 1;
            while (r < p && externalSortedData[r].품명 === externalSortedData[q].품명) r++;
            if (r - q > 1) externalSheet.getRange(q + 10, 4, r - q, 1).merge();

            // 5. EST 병합
            let s = q;
            while (s < r) {
              let t = s + 1;
              while (t < r && externalSortedData[t].EST === externalSortedData[s].EST) t++;
              if (t - s > 1) externalSheet.getRange(s + 10, 5, t - s, 1).merge();
              s = t;
            }
            q = r;
          }
          n = p;
        }
        k = m;
      }
      i = j;
    }

    // ✅ 그룹별 굵은 사각 테두리 (평균중량 제외)
    if (externalSortedData.length > 0) {
      let groupStartRow = 10;
      for (let i = 0; i < externalSortedData.length - 1; i++) {
        const current = externalSortedData[i];
        const next = externalSortedData[i + 1];

        if (current.구분 !== next.구분 || current.원산지 !== next.원산지 || current.브랜드 !== next.브랜드) {
          const groupEndRow = i + 10;
          const range = externalSheet.getRange(groupStartRow, 1, groupEndRow - groupStartRow + 1, EXTERNAL_BORDER_COLS);
          range.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
          groupStartRow = groupEndRow + 1;
        }
      }

      // 마지막 그룹
      const lastRowIndex = externalSortedData.length - 1 + 10;
      const lastGroupRange = externalSheet.getRange(groupStartRow, 1, lastRowIndex - groupStartRow + 1, EXTERNAL_BORDER_COLS);
      lastGroupRange.setBorder(true, true, false, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    // ✅ 구분, 원산지, 브랜드 컬럼 오른쪽 세로선 굵게
    if (externalSortedData.length > 0) {
      externalSheet.getRange(10, 1, externalSortedData.length, 1).setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
      externalSheet.getRange(10, 2, externalSortedData.length, 1).setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
      externalSheet.getRange(10, 3, externalSortedData.length, 1).setBorder(null, null, null, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    // ✅ 마지막 구분과 원산지 병합셀에 바깥쪽 테두리
    if (externalSortedData.length > 0) {
      const lastIdx = externalSortedData.length - 1;
      const lastData = externalSortedData[lastIdx];

      let 구분Start = lastIdx;
      while (구분Start > 0 && externalSortedData[구분Start - 1].구분 === lastData.구분) {
        구분Start--;
      }

      let 원산지Start = lastIdx;
      while (원산지Start > 0 && externalSortedData[원산지Start - 1].원산지 === lastData.원산지 && externalSortedData[원산지Start - 1].구분 === lastData.구분) {
        원산지Start--;
      }

      const 구분Range = externalSheet.getRange(구분Start + 10, 1, lastIdx - 구분Start + 1, 1);
      구분Range.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);

      const 원산지Range = externalSheet.getRange(원산지Start + 10, 2, lastIdx - 원산지Start + 1, 1);
      원산지Range.setBorder(true, true, true, true, false, false, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    // ✅ 전체 바깥쪽 테두리 굵게 (평균중량 제외)
    const fullExternalDataRange = externalSheet.getRange(10, 1, externalOutput.length, EXTERNAL_BORDER_COLS);
    fullExternalDataRange.setBorder(true, true, true, true, null, null, '#000000', SpreadsheetApp.BorderStyle.SOLID_THICK);

    // ✅ 불필요한 행과 열 정리 (외부자료 시트)
    // 헤더(8) + 컬럼헤더(1) + 데이터 + 냉장육(11)
    const externalEndRow = 9 + externalOutput.length + 11;
    const externalEndCol = 9; // A~I 열 (데이터 8개 + 평균중량 1개, 범례도 I열)

    const externalMaxRows = externalSheet.getMaxRows();
    const externalMaxCols = externalSheet.getMaxColumns();

    // 데이터 범위를 넘어서는 행 삭제
    if (externalMaxRows > externalEndRow) {
      externalSheet.deleteRows(externalEndRow + 1, externalMaxRows - externalEndRow);
    }

    // 데이터 범위를 넘어서는 열 삭제
    if (externalMaxCols > externalEndCol) {
      externalSheet.deleteColumns(externalEndCol + 1, externalMaxCols - externalEndCol);
    }
  }

  externalSheet.setFrozenRows(9);

  targetSpreadsheet.setActiveSheet(sheet);
}

function syncPriceSheet(isScheduled = false) {
  return withDocumentLock_(() => {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = resolvePriceSyncSourceSheet_(spreadsheet, isScheduled);

    if (!sourceSheet) {
      const msg = '날짜 형식의 시트가 없습니다.';
      if (isScheduled) {
        Logger.log(msg);
      } else {
        SpreadsheetApp.getUi().alert(msg);
      }
      return null;
    }

    Logger.log(`단가 동기화 기준 시트: ${sourceSheet.getName()}`);
    return syncPriceSheetFromSourceSheet_(sourceSheet, {
      showAlert: !isScheduled
    });
  });
}

/**
 * 단가 시트에서 현재 시트로 단가 가져오기
 */
function importPricesFromPriceSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = spreadsheet.getActiveSheet();

  // 현재 시트 이름이 yyMMdd 형식인지 확인
  const sheetName = activeSheet.getName();
  if (!/^\d{6}$/.test(sheetName)) {
    SpreadsheetApp.getUi().alert('현재 시트가 날짜 형식(yyMMdd)이 아닙니다.');
    return;
  }

  // 단가 시트 찾기
  const priceSheet = spreadsheet.getSheetByName(PRICE_SHEET_NAME);
  if (!priceSheet) {
    SpreadsheetApp.getUi().alert('단가 시트를 찾을 수 없습니다. 먼저 "단가 시트 동기화"를 실행해주세요.');
    return;
  }

  // 단가 시트에서 데이터 읽기
  const priceLastRow = priceSheet.getLastRow();
  if (priceLastRow < 2) {
    SpreadsheetApp.getUi().alert('단가 시트에 데이터가 없습니다.');
    return;
  }

  const priceData = priceSheet.getRange(2, 1, priceLastRow - 1, 8).getDisplayValues();
  const priceMap = new Map();

  priceData.forEach(row => {
    const grade = String(row[5] || '').trim();
    // 등급이 비어있으면 등급 제외, 있으면 포함
    const key = grade ? `${row[0]}|${row[1]}|${row[2]}|${row[3]}|${row[4]}|${grade}` : `${row[0]}|${row[1]}|${row[2]}|${row[3]}|${row[4]}`;
    const price = row[6]; // 단가
    if (price) {
      priceMap.set(key, price);
    }
  });

  Logger.log(`단가 시트에서 ${priceMap.size}개 단가 로드`);

  // 현재 시트에서 데이터 읽기 및 단가 업데이트
  const currentLastRow = activeSheet.getLastRow();
  if (currentLastRow < 2) {
    SpreadsheetApp.getUi().alert('현재 시트에 데이터가 없습니다.');
    return;
  }

  const currentData = activeSheet.getRange(2, 1, currentLastRow - 1, 12).getDisplayValues();
  const currentLastValues = ['', '', '', '', '', '', '', '', '', '', ''];
  let updatedCount = 0;

  currentData.forEach((row, idx) => {
    // ✅ 재고 컬럼으로 유효한 데이터 확인 (병합되지 않는 컬럼 체크)
    const stock = String(row[6] || '').trim(); // 재고 컬럼 (병합 안 됨)
    if (!stock) return; // 재고가 없으면 빈 행이므로 건너뛰기

    // 병합된 셀의 빈 값 채우기 (구분, 원산지, 브랜드, 품명, EST만)
    // 등급(인덱스 5)은 병합되지 않으므로 이전 값을 복사하지 않음
    for (let i = 0; i <= 4; i++) {  // 0~4까지만 (구분, 원산지, 브랜드, 품명, EST)
      if (row[i]) {
        currentLastValues[i] = row[i];
      } else {
        row[i] = currentLastValues[i];
      }
    }

    const grade = String(row[5] || '').trim();
    // 등급이 비어있으면 등급 제외, 있으면 포함
    const key = grade ? `${row[0]}|${row[1]}|${row[2]}|${row[3]}|${row[4]}|${grade}` : `${row[0]}|${row[1]}|${row[2]}|${row[3]}|${row[4]}`;
    const currentPrice = row[10]; // 현재 단가 (11번째 컬럼, 인덱스 10)
    const savedPrice = priceMap.get(key); // 단가 시트의 단가

    const normalizedSavedPrice = String(savedPrice || '').trim();

    // 현재 단가가 비어있는 경우에만 저장소(단가 시트) 값을 채운다.
    if (!currentPrice && normalizedSavedPrice) {
      activeSheet.getRange(idx + 2, 11).setValue(normalizedSavedPrice);
      updatedCount++;
    }
  });

  // ✅ 마지막 행의 단가 지우기 (병합으로 인한 오입력 방지)
  const lastDataRow = activeSheet.getLastRow();
  if (lastDataRow >= 2) {
    activeSheet.getRange(lastDataRow, 11).clearContent();
    Logger.log(`마지막 행(${lastDataRow}) 단가 제거`);
  }

  applySaleBanStrikethroughForRows_(activeSheet, 2, currentLastRow - 1);

  Logger.log(`총 ${updatedCount}개의 단가 업데이트 완료`);
  SpreadsheetApp.getUi().alert(`단가 시트에서 ${updatedCount}개의 단가를 가져왔습니다.`);
}

/**
 * 시트 보호 및 숨김 처리 (편집자도 스크립트 실행 가능)
 */
function protectAndHideSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // ✅ 보호 및 숨김 처리할 시트 목록
  const protectedSheetNames = ['단가', '수입육_구분', '품목리스트_양식'];

  protectedSheetNames.forEach(sheetName => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (sheet) {
      // 시트 숨기기
      sheet.hideSheet();

      // ✅ 기존 보호 완전히 제거 (편집자도 스크립트 실행 가능하도록)
      const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
      protections.forEach(protection => protection.remove());

      // ✅ 보호 없이 숨김만 적용 (편집자가 스크립트로 단가 동기화 가능)
      Logger.log(`${sheetName} 시트: 보호 제거, 숨김만 적용`);
    }
  });

  SpreadsheetApp.getUi().alert('시트 숨김 처리가 완료되었습니다. (보호는 제거되어 편집자도 스크립트 실행 가능)');
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  // ✅ 기존 품목관리 메뉴
  ui.createMenu('📋 품목관리')
    .addItem('품목리스트 생성', 'syncPricesAndCreateProductList')
    .addSeparator()
    .addItem('단가 시트 동기화', 'syncPriceSheet')
    .addSeparator()
    .addItem('숨긴 시트 보기/숨기기', 'toggleHiddenSheets')
    .addItem('시트 보호 설정 (소유자 전용)', 'protectAndHideSheets')
    .addToUi();

  // ✅ 자동 실행 관리 메뉴
  ui.createMenu('🤖 자동 실행')
    .addItem('자동 실행 설정', 'createScheduledTrigger')
    .addItem('모든 자동 실행 중지', 'deleteAllTriggers')
    .addSeparator()
    .addItem('스케줄 작업 수동 실행 (테스트용)', 'runManually')
    .addToUi();
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const range = e.range;
    const sheet = range.getSheet();
    const sheetName = sheet.getName();

    if (!isDateSheetName_(sheetName)) return;

    const startCol = range.getColumn();
    const endCol = startCol + range.getNumColumns() - 1;
    if (endCol < PRICE_COLUMN_INDEX || startCol > PRICE_COLUMN_INDEX) return;

    const startRow = range.getRow();
    const rowCount = range.getNumRows();
    applySaleBanStrikethroughForRows_(sheet, startRow, rowCount);

    withDocumentLock_(() => {
      syncPriceSheetFromSourceSheet_(sheet, {
        showAlert: false
      });
    });
  } catch (error) {
    Logger.log(`onEdit 단가 즉시 저장 실패: ${error}`);
  }
}

/**
 * 숨긴 시트 보기/숨기기 토글
 */
function toggleHiddenSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const protectedSheetNames = ['단가', '수입육_구분', '품목리스트_양식'];

  // 첫 번째 시트의 숨김 상태를 확인
  const firstSheet = spreadsheet.getSheetByName(protectedSheetNames[0]);
  if (!firstSheet) return;

  const isHidden = firstSheet.isSheetHidden();

  protectedSheetNames.forEach(sheetName => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (sheet) {
      if (isHidden) {
        sheet.showSheet(); // 숨김 해제
      } else {
        sheet.hideSheet(); // 숨김
      }
    }
  });

  const ui = SpreadsheetApp.getUi();
  if (isHidden) {
    ui.alert('숨긴 시트를 표시했습니다. (단가, 수입육_구분, 품목리스트_양식)');
  } else {
    ui.alert('시트를 숨겼습니다. (단가, 수입육_구분, 품목리스트_양식)');
  }
}

/**
 * 🤖 자동 실행 트리거 생성
 * - 주중(월-금) 오전 7시, 10시, 오후 4시, 10시에 품목 리스트 생성
 * - 단가 동기화 후 품목 리스트 자동 생성
 */
function createScheduledTrigger() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '자동 실행 설정',
    '주중(월-금) 오전 7시, 10시, 오후 4시, 10시에\n단가 동기화 후 품목 리스트를 자동 생성합니다.\n\n계속하시겠습니까?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  // ✅ 기존 트리거 모두 삭제
  deleteAllTriggersWithoutConfirm();

  // ✅ 주중 오전 7시에 품목 리스트 생성
  ScriptApp.newTrigger('scheduledCreateProductList_07')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_07')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(7)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_07')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(7)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_07')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(7)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_07')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(7)
    .create();

  // ✅ 주중 오전 10시에 품목 리스트 생성
  ScriptApp.newTrigger('scheduledCreateProductList_10')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(10)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_10')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(10)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_10')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(10)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_10')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(10)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_10')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(10)
    .create();

  // ✅ 주중 오후 4시에 품목 리스트 생성
  ScriptApp.newTrigger('scheduledCreateProductList_16')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(16)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_16')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(16)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_16')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(16)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_16')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(16)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_16')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(16)
    .create();

  // ✅ 주중 오후 10시에 품목 리스트 생성
  ScriptApp.newTrigger('scheduledCreateProductList_22')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(22)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_22')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(22)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_22')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(22)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_22')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(22)
    .create();

  ScriptApp.newTrigger('scheduledCreateProductList_22')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(22)
    .create();

  ui.alert('자동 실행 설정 완료!\n\n주중 오전 7시, 10시, 오후 4시, 10시에\n단가 동기화 후 품목 리스트가 자동 생성됩니다.');
}

/**
 * 🤖 모든 자동 실행 트리거 삭제
 */
function deleteAllTriggers() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '자동 실행 중지',
    '모든 자동 실행 트리거를 삭제하시겠습니까?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  deleteAllTriggersWithoutConfirm();
  ui.alert('모든 자동 실행 트리거가 삭제되었습니다.');
}

/**
 * 내부용: 확인 없이 모든 트리거 삭제
 */
function deleteAllTriggersWithoutConfirm() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  Logger.log(`총 ${triggers.length}개 트리거 삭제`);
}

function syncPricesAndCreateProductList(isScheduled = false) {
  return withDocumentLock_(() => {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sourceSheet = resolvePriceSyncSourceSheet_(spreadsheet, isScheduled);
    let syncResult = null;

    if (sourceSheet) {
      Logger.log(`품목리스트 생성 전 단가 동기화 기준 시트: ${sourceSheet.getName()}`);
      syncResult = syncPriceSheetFromSourceSheet_(sourceSheet, {
        showAlert: false
      });
    } else {
      Logger.log('품목리스트 생성 전 단가 동기화를 건너뜁니다. 날짜 형식의 시트가 없습니다.');
    }

    if (!isScheduled && sourceSheet && syncResult && syncResult.conflicts.length > 0) {
      SpreadsheetApp.getUi().alert(buildPriceConflictWarningMessage_(sourceSheet.getName(), syncResult.conflicts));
    }

    createProductListByOrigin_();
  });
}

/**
 * 🤖 스케줄 작업 수동 실행 (테스트용)
 */
function runManually() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('수동 실행 시작\n\n단가 동기화 후 품목 리스트를 생성합니다.');

  syncPricesAndCreateProductList();

  ui.alert('수동 실행 완료!');
}

/**
 * 🤖 스케줄 실행 함수들 (트리거에서 호출)
 */
function scheduledCreateProductList_07() {
  Logger.log('오전 7시 자동 실행 시작');
  syncPricesAndCreateProductList(true);
}

function scheduledCreateProductList_10() {
  Logger.log('오전 10시 자동 실행 시작');
  syncPricesAndCreateProductList(true);
}

function scheduledCreateProductList_16() {
  Logger.log('오후 4시 자동 실행 시작');
  syncPricesAndCreateProductList(true);
}

function scheduledCreateProductList_22() {
  Logger.log('오후 10시 자동 실행 시작');
  syncPricesAndCreateProductList(true);
}
