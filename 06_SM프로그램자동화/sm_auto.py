"""
SM VAT PDA 자동화 스크립트
SMVATPDA3.exe 실행 -> 로그인 -> 보고서 열기 -> 날짜 설정 -> 조회 -> 엑셀 저장

필수 패키지:
    pip install pywinauto pyautogui pygetwindow pillow

사용법:
    python sm_auto.py                        # 어제 날짜
    python sm_auto.py 2026-05-07             # 특정 날짜
    python sm_auto.py 2026-05-01 2026-05-07  # 날짜 범위
"""

import subprocess, sys, time, os
from datetime import datetime, timedelta
import pyautogui
import pygetwindow as gw
import win32gui

try:
    from pywinauto import Application
    from pywinauto.keyboard import send_keys
    HAS_PYWINAUTO = True
except ImportError:
    HAS_PYWINAUTO = False
    print("[경고] pywinauto 없음 - pyautogui 단독 모드")

# ── 설정 ───────────────────────────────────────────────────────
EXE_PATH  = r"C:\_SMVAT\Exe\SMVATPDA3.exe"
USER_ID   = "14"
PASSWORD  = "1234"
SAVE_DIR  = r"C:\Users\OWNER\Desktop\SM_데이터"

# 보고서 창 제목 키워드 (MDI 자식 창 탐색에 사용)
REPORT_TITLE_KW = "상품별 이익"

# 엑셀보내기 버튼 이미지 경로 (이미지 인식용)
_HERE     = os.path.dirname(os.path.abspath(__file__))
BTN_IMAGE = os.path.join(_HERE, "03_SM프로그램화면캡쳐", "엑셀보내기_btn.png")

# 툴바 버튼 Y좌표 (전체 화면 기준, 1920x1080 기준값)
# 다른 해상도에서는 아래 run() 에서 자동 보정됩니다
TOOLBAR_Y = 60

# 툴바 버튼 X좌표 (1920x1080 기준 — 스크린샷 실측값)
TOOLBAR_BTN = {
    "기초작업": 20,
    "매입매출": 73,
    "현금출납": 128,
    "경영통계": 183,   # ← 실측
    "바코드":   238,
    "생산관리": 293,
    "마이메뉴": 455,
}

# ── 보고서 메뉴 경로 설정 ──────────────────────────────────────
# "submenu" : 경영통계 툴바 클릭 → 메뉴 패널에서 항목 클릭  ← 기본값
# "mymenu"  : 마이메뉴 툴바 클릭 → 항목 클릭
# "skip"    : 보고서가 이미 열려 있다고 가정
OPEN_METHOD = "submenu"
USE_CONTROL_AUTOMATION = False

# 경영통계 메뉴 패널이 열렸을 때
# "사원 거래처 상품이익 명세" 버튼 좌표 (1920x1080 기준)
# 경영통계(사원별실적) 그룹의 3번째 항목 (매출이익 아래)
SUBMENU_XY = (170, 269)   # 추정: 버튼2(매출이익,244)+25px → 맞지 않으면 조정 필요

# 마이메뉴 방식일 때 항목 좌표
MYMENU_XY  = (350, 150)   # 필요시 수정

# 보고서 화면 좌표 fallback (1920x1080 기준)
DATE_FROM_XY = (160, 165)
DATE_TO_XY   = (282, 165)
QUERY_XY     = (48, 696)
EXCEL_XY     = (304, 696)
# ─────────────────────────────────────────────────────────────

pyautogui.PAUSE    = 0.3
pyautogui.FAILSAFE = True   # 마우스를 왼쪽 상단으로 이동하면 긴급 중단
os.makedirs(SAVE_DIR, exist_ok=True)

# 디버그 스크린샷 저장 경로
DEBUG_DIR = os.path.join(_HERE, "03_SM프로그램화면캡쳐", "debug")
os.makedirs(DEBUG_DIR, exist_ok=True)

def dbg_shot(name):
    path = os.path.join(DEBUG_DIR, f"{name}.png")
    pyautogui.screenshot().save(path)
    print(f"  [DBG] 스크린샷: {name}.png")


# ── 유틸 ─────────────────────────────────────────────────────
def find_window(keyword, timeout=30):
    for _ in range(timeout * 2):
        for w in gw.getAllWindows():
            if keyword in w.title and w.visible:
                return w
        time.sleep(0.5)
    raise TimeoutError(f"창 없음: '{keyword}'")


def activate_win(win, maximize=False):
    """창을 최앞단으로 가져오기 (Windows 포그라운드 보호 우회)"""
    import ctypes
    hwnd = win._hWnd

    show_cmd = 3 if maximize else 9
    ctypes.windll.user32.ShowWindow(hwnd, show_cmd)
    ctypes.windll.user32.SetForegroundWindow(hwnd)

    # 포그라운드가 될 때까지 최대 3초 대기
    for _ in range(6):
        time.sleep(0.5)
        if ctypes.windll.user32.GetForegroundWindow() == hwnd:
            return
        # Alt 키 트릭으로 재시도
        pyautogui.press("alt")
        time.sleep(0.1)
        ctypes.windll.user32.SetForegroundWindow(hwnd)


def scale_xy(x, y):
    """1920x1080 기준 좌표를 현재 화면 해상도로 변환"""
    sw, sh = pyautogui.size()
    return int(x * sw / 1920), int(y * sh / 1080)


def click_scaled(x, y):
    sx, sy = scale_xy(x, y)
    pyautogui.click(sx, sy)
    time.sleep(0.3)


def click_hwnd_center(hwnd):
    r = win32gui.GetWindowRect(hwnd)
    cx, cy = (r[0] + r[2]) // 2, (r[1] + r[3]) // 2
    pyautogui.click(cx, cy)
    return cx, cy


def paste_text(text):
    """한글 경로 입력을 위해 클립보드로 붙여넣기."""
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.clipboard_append(text)
        root.update()
        root.destroy()
        pyautogui.hotkey("ctrl", "v")
    except Exception:
        pyautogui.write(text, interval=0.02)


def set_text_to_first_edit(parent_hwnd, text):
    """저장 대화상자의 파일명 Edit 컨트롤에 직접 텍스트 설정."""
    edits = []

    def _cb(hwnd, _):
        if win32gui.GetClassName(hwnd).lower() == "edit":
            r = win32gui.GetWindowRect(hwnd)
            edits.append((r[1], r[2] - r[0], hwnd))

    win32gui.EnumChildWindows(parent_hwnd, _cb, None)
    if not edits:
        return False

    # 파일명 입력칸은 보통 저장 대화상자 하단에 있으므로 y 좌표를 우선한다.
    edits.sort(reverse=True)
    WM_SETTEXT = 0x000C
    win32gui.SendMessage(edits[0][2], WM_SETTEXT, 0, text)
    return True


def click_save_button(parent_hwnd):
    save_btn = None

    def _cb(hwnd, _):
        nonlocal save_btn
        if win32gui.GetClassName(hwnd) == "Button":
            text = win32gui.GetWindowText(hwnd)
            if "저장" in text or "&S" in text:
                save_btn = hwnd

    win32gui.EnumChildWindows(parent_hwnd, _cb, None)
    if save_btn:
        win32gui.SendMessage(save_btn, 0x00F5, 0, 0)  # BM_CLICK
        return True
    return False


def _sm_status_bar_text():
    """SMVATPDA 메인 창의 상태바 텍스트 반환 (처리 상태 확인용).

    Delphi TStatusBar는 실제 Win32 클래스가 'msctls_statusbar32'이고
    패널 텍스트는 GetWindowText 대신 SB_GETTEXT 메시지로만 읽힌다.
    pywinauto의 StatusBarWrapper.texts()가 이 처리를 내부적으로 수행한다.
    """
    try:
        sm_wins = [w for w in gw.getAllWindows()
                   if 'SMVATPDA' in w.title and 'SMVATPDA  ' not in w.title]
        if not sm_wins:
            return ''
        parent_hwnd = max(sm_wins, key=lambda w: len(w.title))._hWnd

        if HAS_PYWINAUTO:
            import warnings
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    app = Application(backend="win32").connect(handle=parent_hwnd)
                    main = app.window(handle=parent_hwnd)
                    for cls_name in ('msctls_statusbar32', 'TStatusBar'):
                        try:
                            sb = main.child_window(class_name=cls_name)
                            parts = [t for t in sb.texts() if t and t.strip()]
                            if parts:
                                return ' '.join(parts)
                        except Exception:
                            pass
            except Exception:
                pass

        # fallback: GetWindowText (보통 빈값이지만 시도)
        results = []
        def _cb(hwnd, _):
            if win32gui.GetClassName(hwnd) in ('TStatusBar', 'msctls_statusbar32'):
                t = win32gui.GetWindowText(hwnd)
                if t:
                    results.append(t)
        win32gui.EnumChildWindows(parent_hwnd, _cb, None)
        return ' '.join(results)
    except Exception:
        return ''


def _wait_query_done(timeout=60):
    """SM 상태바 '처리중/진행중' 메시지가 사라질 때까지 대기.
    True=완료, False=타임아웃"""
    _LOADING_KWS = ('처리중', '진행중', '조회중')
    deadline = time.time() + timeout
    first = True
    while time.time() < deadline:
        text = _sm_status_bar_text()
        if first:
            print(f"  [상태바] {text!r}")  # 첫 1회 디버그 출력
            first = False
        if not any(kw in text for kw in _LOADING_KWS):
            return True
        time.sleep(0.5)
    return False


def excel_workbook_keys():
    """현재 Excel에 열린 통합문서 식별자 목록."""
    try:
        import win32com.client
        try:
            xl = win32com.client.GetActiveObject("Excel.Application")
            _ = xl.Workbooks.Count
        except Exception:
            xl = win32com.client.Dispatch("Excel.Application")
        return {
            (xl.Workbooks(i).Name, xl.Workbooks(i).FullName)
            for i in range(1, xl.Workbooks.Count + 1)
        }
    except Exception:
        return set()


def save_exported_excel(save_path, before_keys=None, timeout=20):
    """SM이 Excel로 띄운 미저장 통합문서를 지정 경로에 저장."""
    before_keys = before_keys or set()
    deadline = time.time() + timeout
    last_error = None

    while time.time() < deadline:
        try:
            import win32com.client
            try:
                xl = win32com.client.GetActiveObject("Excel.Application")
                _ = xl.Workbooks.Count
            except Exception:
                xl = win32com.client.Dispatch("Excel.Application")
            try:
                xl.DisplayAlerts = False
            except Exception:
                pass

            candidates = []
            for i in range(1, xl.Workbooks.Count + 1):
                wb = xl.Workbooks(i)
                key = (wb.Name, wb.FullName)
                is_new = key not in before_keys
                is_unsaved = wb.FullName == wb.Name or not wb.Saved
                if is_new or is_unsaved:
                    candidates.append((i, wb, is_new, is_unsaved))

            if candidates:
                _, wb, is_new, is_unsaved = candidates[-1]
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                if os.path.exists(save_path):
                    os.remove(save_path)
                wb.SaveAs(save_path, FileFormat=51)
                print(f"[5] Excel 저장: {save_path}")
                return True
        except Exception as e:
            last_error = e

        time.sleep(1)

    if last_error:
        print(f"  Excel 저장 실패: {last_error}")
    return False


def excel_window_titles():
    return {w.title for w in gw.getAllWindows() if "Microsoft Excel" in w.title}


def _excel_window_number(title):
    import re
    m = re.search(r"통합 문서(\d+)", title)
    return int(m.group(1)) if m else -1


def save_excel_window(save_path, before_titles=None, timeout=20):
    """Excel 창을 직접 조작해 다른 이름으로 저장."""
    before_titles = before_titles or set()
    deadline = time.time() + timeout

    while time.time() < deadline:
        wins = [
            w for w in gw.getAllWindows()
            if "Microsoft Excel" in w.title and w.visible
        ]
        if wins:
            new_wins = [w for w in wins if w.title not in before_titles]
            target_pool = new_wins or wins
            target = max(target_pool, key=lambda w: _excel_window_number(w.title))
            activate_win(target, maximize=False)
            time.sleep(0.5)

            os.makedirs(os.path.dirname(save_path), exist_ok=True)
            # 같은 경로로 열려있는 기존 통합문서 먼저 닫기 → 파일 잠금 해제
            try:
                import win32com.client
                xl = win32com.client.GetActiveObject("Excel.Application")
                for i in range(xl.Workbooks.Count, 0, -1):
                    wb = xl.Workbooks(i)
                    if os.path.normcase(wb.FullName) == os.path.normcase(save_path):
                        wb.Close(SaveChanges=False)
                        break
            except Exception:
                pass
            # 파일 삭제 (잠금 해제 후 재시도)
            for _ in range(3):
                try:
                    if os.path.exists(save_path):
                        os.remove(save_path)
                    break
                except OSError:
                    time.sleep(0.5)

            pyautogui.press("f12")
            try:
                save_dlg = find_window("다른 이름으로 저장", timeout=8)
            except TimeoutError:
                try:
                    save_dlg = find_window("저장", timeout=3)
                except TimeoutError:
                    time.sleep(1)
                    continue

            activate_win(save_dlg)
            if not set_text_to_first_edit(save_dlg._hWnd, save_path):
                pyautogui.hotkey("alt", "n")
                time.sleep(0.2)
                pyautogui.hotkey("ctrl", "a")
                time.sleep(0.1)
                paste_text(save_path)
            time.sleep(0.2)
            if not click_save_button(save_dlg._hWnd):
                pyautogui.hotkey("alt", "s")
                time.sleep(0.5)
                pyautogui.press("enter")
            time.sleep(2)

            # 덮어쓰기 확인 다이얼로그 처리 (파일 삭제 실패 시 대비)
            for title in ("Microsoft Excel", "확인", "파일"):
                try:
                    confirm_win = find_window(title, timeout=4)
                    activate_win(confirm_win)
                    pyautogui.press("y")   # 예(Yes) 단축키
                    time.sleep(1)
                except TimeoutError:
                    pass

            if os.path.exists(save_path):
                print(f"[5] Excel 창 저장: {save_path}")
                return True

        time.sleep(1)

    return False


# 창 타입으로 제외할 클래스 (버튼, 레이블 등)
_SKIP_CLASSES = {'TButton', 'TBitBtn', 'TLabel', 'TEdit', 'TMemo',
                 'TCheckBox', 'TRadioButton', 'TComboBox', 'TListBox',
                 'TGroupBox', 'TTabSheet', 'TStatusBar', 'TToolBar',
                 'TPanel', 'TScrollBar'}


def find_mdi_child(keyword, timeout=30):
    """SMVATPDA 창 계층에서 title에 keyword가 포함된 폼 창을 반환
    (TButton 등 컨트롤 제외 — 폼 클래스만)"""
    main_wins = [w for w in gw.getAllWindows() if 'SMVATPDA' in w.title and 'SMVATPDA  ' not in w.title]
    if not main_wins:
        raise TimeoutError("SMVATPDA 메인 창 없음")
    parent_hwnd = max(main_wins, key=lambda w: len(w.title))._hWnd

    for _ in range(timeout * 2):
        found = []
        def _cb(hwnd, _):
            cls = win32gui.GetClassName(hwnd)
            if cls in _SKIP_CLASSES:
                return
            t = win32gui.GetWindowText(hwnd)
            if keyword in t:
                found.append(hwnd)
        win32gui.EnumChildWindows(parent_hwnd, _cb, None)
        if found:
            return found[0]
        time.sleep(0.5)
    raise TimeoutError(f"MDI 자식 창 없음: '{keyword}'")


def is_logged_in():
    # TApplication 창('SMVATPDA  유통관리')은 항상 있으므로 제외
    # 실제 메인 창은 '[ SMVATPDA : ...' 형식
    return any(
        "SMVATPDA" in w.title
        and "로그인" not in w.title
        and "SMVATPDA  " not in w.title   # TApplication 제외
        for w in gw.getAllWindows()
    )


# ── 1. 실행 ───────────────────────────────────────────────────
def launch():
    if any("SMVATPDA" in w.title for w in gw.getAllWindows()):
        print("[1] 이미 실행 중")
        return
    print("[1] SMVATPDA3.exe 실행...")
    subprocess.Popen(EXE_PATH, cwd=os.path.dirname(EXE_PATH))
    time.sleep(4)


# ── 2. 로그인 ─────────────────────────────────────────────────
def login():
    # 혹시 "메시지 확인" 잔여 다이얼로그가 있으면 먼저 닫기
    try:
        msg_win = find_window("메시지 확인", timeout=2)
        activate_win(msg_win)
        pyautogui.press("enter")
        time.sleep(0.5)
    except TimeoutError:
        pass

    if is_logged_in():
        print("[2] 이미 로그인됨")
        return

    print("[2] 로그인 중...")
    win = find_window("시스템 로그인")
    activate_win(win)
    time.sleep(0.5)

    # TEdit hwnd를 y좌표 기준으로 찾아 직접 WM_SETTEXT
    import ctypes
    edits = []
    def _edit_cb(hwnd, _):
        if win32gui.GetClassName(hwnd) == 'TEdit':
            r = win32gui.GetWindowRect(hwnd)
            edits.append((r[1], hwnd))   # (y좌표, hwnd)
    win32gui.EnumChildWindows(win._hWnd, _edit_cb, None)
    edits.sort()   # y 오름차순 → [0]=USER ID (위), [1]=PASSWORD (아래)

    if len(edits) >= 2:
        WM_SETTEXT = 0x000C
        # USER ID 설정
        win32gui.SendMessage(edits[0][1], WM_SETTEXT, 0, USER_ID)
        time.sleep(0.1)
        # PASSWORD 설정
        win32gui.SendMessage(edits[1][1], WM_SETTEXT, 0, PASSWORD)
        time.sleep(0.1)
        print(f"  필드 설정: USER_ID→y={edits[0][0]}, PWD→y={edits[1][0]}")
    else:
        raise RuntimeError(f"[2] TEdit 필드 없음 (찾은 수: {len(edits)})")

    # 확인 버튼 클릭
    confirmed = False
    def _btn_cb(hwnd, _):
        nonlocal confirmed
        t = win32gui.GetWindowText(hwnd)
        cls = win32gui.GetClassName(hwnd)
        if cls == 'TBitBtn' and '확인' in t:
            win32gui.SendMessage(hwnd, 0x00F5, 0, 0)  # BM_CLICK
            confirmed = True
    win32gui.EnumChildWindows(win._hWnd, _btn_cb, None)
    if not confirmed:
        pyautogui.press("enter")

    print("[2] 로그인 완료, 메인 창 대기...")
    time.sleep(4)

    # 로그인 실패 메시지 처리
    try:
        msg_win = find_window("메시지 확인", timeout=3)
        activate_win(msg_win)
        pyautogui.screenshot().save(os.path.join(DEBUG_DIR, "02_login_error.png"))
        pyautogui.press("enter")
        time.sleep(0.5)
        raise RuntimeError("[2] 로그인 실패 - USER_ID/PASSWORD 확인 필요")
    except TimeoutError:
        pass  # 다이얼로그 없음 = 로그인 성공

    find_window("SMVATPDA")


# ── 3. 보고서 열기 ────────────────────────────────────────────
def open_report():
    # 이미 올바른 보고서 창이 열려있으면 스킵
    try:
        find_mdi_child(REPORT_TITLE_KW, timeout=2)
        print("[3] 보고서 창 이미 열림")
        return
    except TimeoutError:
        pass

    if OPEN_METHOD == "skip":
        raise RuntimeError(
            "[3] 보고서 창이 없습니다.\n"
            "  - 프로그램에서 보고서를 먼저 열어두거나\n"
            "  - sm_auto.py 상단의 OPEN_METHOD를 'submenu' 또는 'mymenu'로 설정하고\n"
            "    SUBMENU_XY / MYMENU_XY 좌표를 채워주세요."
        )

    print("[3] 보고서 열기...")
    main_win = find_window("SMVATPDA")
    activate_win(main_win, maximize=True)   # 좌표 일관성을 위해 최대화
    time.sleep(0.5)

    if OPEN_METHOD == "submenu":
        # ① 경영통계 툴바 클릭
        tx, ty = scale_xy(TOOLBAR_BTN["경영통계"], TOOLBAR_Y)
        pyautogui.click(tx, ty)
        time.sleep(1.0)   # 메뉴 패널이 열릴 때까지 대기

        # ② 버튼 찾기: pywinauto 텍스트 우선 → 좌표 fallback
        clicked = False
        if HAS_PYWINAUTO:
            try:
                # 창이 여러 개일 수 있으므로 handle 기반으로 연결
                main_win = find_window("SMVATPDA", timeout=5)
                app = Application(backend="win32").connect(
                    handle=main_win._hWnd
                )
                main = app.window(handle=main_win._hWnd)
                for keyword in ("사원 거래처 상품이익", "사원거래처상품이익",
                                "거래처 상품이익"):
                    try:
                        btn = main.child_window(title_re=f".*{keyword}.*",
                                               class_name="TButton")
                        btn.click_input()
                        clicked = True
                        break
                    except Exception:
                        pass
            except Exception as e:
                print(f"  pywinauto 버튼 탐색 실패: {e}")

        if not clicked:
            # 좌표로 직접 클릭
            click_scaled(*SUBMENU_XY)

    elif OPEN_METHOD == "mymenu":
        mx, my = scale_xy(TOOLBAR_BTN["마이메뉴"], TOOLBAR_Y)
        pyautogui.click(mx, my)
        time.sleep(0.8)
        click_scaled(*MYMENU_XY)

    time.sleep(1.5)   # 보고서 창 로딩 대기
    dbg_shot("03_report_opened")
    find_mdi_child(REPORT_TITLE_KW)
    print("[3] 보고서 열림")


# ── 4. 날짜 설정 + 조회 ───────────────────────────────────────
def _get_main_win():
    """SMVATPDA 메인 창 (가장 긴 제목) 반환"""
    wins = [w for w in gw.getAllWindows()
            if 'SMVATPDA' in w.title and '경영통계' not in w.title]
    return max(wins, key=lambda w: len(w.title))


def _find_report_controls(report_hwnd):
    """보고서 폼에서 TDateEdit 두 개와 조회/엑셀 버튼 hwnd 반환"""
    date_edits = []   # (x좌표, hwnd)
    f7_btn = None
    excel_btn = None
    quit_btn = None

    def _cb(hwnd, _):
        nonlocal f7_btn, excel_btn, quit_btn
        if not win32gui.IsWindow(hwnd):
            return
        try:
            cls  = win32gui.GetClassName(hwnd)
            text = win32gui.GetWindowText(hwnd)
            r    = win32gui.GetWindowRect(hwnd)
        except Exception:
            return
        cx   = (r[0] + r[2]) // 2

        if cls == 'TDateEdit':
            date_edits.append((cx, hwnd))
        elif cls in ('TButton', 'TBitBtn'):
            if 'F7' in text or '조회' in text:
                f7_btn = hwnd
            elif '엑셀' in text:
                excel_btn = hwnd
            elif '종료' in text or 'Quit' in text:
                quit_btn = hwnd

    win32gui.EnumChildWindows(report_hwnd, _cb, None)
    date_edits.sort()   # x 오름차순 → [0]=시작, [1]=종료
    return date_edits, f7_btn, excel_btn, quit_btn


def _wait_report_controls(timeout=10):
    """보고서가 컨트롤을 다시 그리는 동안 무효 hwnd가 생길 수 있어 안정화 대기."""
    deadline = time.time() + timeout
    last = ([], None, None, None)
    while time.time() < deadline:
        try:
            report_hwnd = find_mdi_child(REPORT_TITLE_KW, timeout=2)
        except TimeoutError:
            time.sleep(0.5)
            continue
        controls = _find_report_controls(report_hwnd)
        date_edits, f7_btn, excel_btn, quit_btn = controls
        valid_dates = [(x, h) for x, h in date_edits if win32gui.IsWindow(h)]
        if len(valid_dates) >= 2:
            return valid_dates, f7_btn, excel_btn, quit_btn
        last = controls
        time.sleep(0.5)
    raise TimeoutError(f"보고서 컨트롤 없음: '{REPORT_TITLE_KW}'")


def query(date_from: str, date_to: str):
    """date_from, date_to: 'YYYY-MM-DD' 형식"""
    print(f"[4] 조회: {date_from} ~ {date_to}")

    main_win = _get_main_win()
    activate_win(main_win, maximize=True)
    time.sleep(0.5)

    if USE_CONTROL_AUTOMATION:
        try:
            date_edits, f7_btn, _, _ = _wait_report_controls()
            if len(date_edits) < 2 or not all(win32gui.IsWindow(h) for _, h in date_edits[:2]):
                date_edits, f7_btn = [], None
        except Exception as e:
            print(f"  컨트롤 탐색 실패, 좌표 방식 사용: {e}")
            date_edits, f7_btn = [], None
    else:
        date_edits, f7_btn = [], None

    if len(date_edits) >= 2:
        # TDateEdit에 날짜 입력: 클릭 → 전체선택 → 타이핑
        date_str = date_from.replace("-", "")   # "YYYYMMDD"
        date_end = date_to.replace("-", "")

        for (_, hwnd), dstr in ((date_edits[0], date_str), (date_edits[1], date_end)):
            if not win32gui.IsWindow(hwnd):
                date_edits = []
                break
            r = win32gui.GetWindowRect(hwnd)
            cx, cy = (r[0]+r[2])//2, (r[1]+r[3])//2
            pyautogui.click(cx, cy)
            time.sleep(0.2)
            pyautogui.hotkey("ctrl", "a")
            time.sleep(0.1)
            pyautogui.typewrite(dstr, interval=0.04)
            time.sleep(0.1)
        if date_edits:
            print(f"  날짜 설정: {date_from} ~ {date_to}")

    if len(date_edits) < 2:
        pyautogui.typewrite(date_from, interval=0.04)
        time.sleep(0.2)
        pyautogui.press("tab")
        time.sleep(0.2)
        pyautogui.typewrite(date_to, interval=0.04)
        time.sleep(0.2)
        print(f"  날짜 키보드 설정: {date_from} ~ {date_to}")

    dbg_shot("04a_after_date_set")

    # 조회(F7) 버튼 클릭
    if f7_btn and win32gui.IsWindow(f7_btn):
        r = win32gui.GetWindowRect(f7_btn)
        cx, cy = (r[0]+r[2])//2, (r[1]+r[3])//2
        pyautogui.click(cx, cy)
        print(f"  조회 버튼 클릭: ({cx},{cy})")
    else:
        pyautogui.press("f7")
        print("  F7 키 전송")

    time.sleep(5)   # 서버 요청 전송 대기 (범위가 넓으면 더 길게 조정)
    if not _wait_query_done(timeout=60):
        print("  [경고] 조회 완료 대기 타임아웃 (60초) — 계속 진행")
    dbg_shot("04_after_f7")
    print("[4] 조회 완료")


def _set_date_ctrl(ctrl, date_str):
    """날짜 컨트롤에 값 입력 (여러 방식 시도)"""
    try:
        ctrl.set_edit_text(date_str)
    except Exception:
        ctrl.click_input()
        time.sleep(0.2)
        pyautogui.hotkey("ctrl", "a")
        pyautogui.write(date_str, interval=0.03)
    time.sleep(0.15)


# ── 5. 엑셀 저장 ──────────────────────────────────────────────
def export_excel(date_from: str, date_to: str):
    print("[5] 엑셀 내보내기...")
    main_win = _get_main_win()
    activate_win(main_win, maximize=True)

    dbg_shot("05a_before_export")
    clicked = False
    before_excel = excel_workbook_keys()
    before_excel_titles = excel_window_titles()

    # 방법 A: 보고서 폼 안의 실제 엑셀 버튼 hwnd 클릭
    if USE_CONTROL_AUTOMATION:
        try:
            report_hwnd = find_mdi_child(REPORT_TITLE_KW, timeout=5)
            _, _, excel_btn, _ = _find_report_controls(report_hwnd)
            if excel_btn:
                cx, cy = click_hwnd_center(excel_btn)
                clicked = True
                print(f"  엑셀 버튼 클릭: ({cx}, {cy})")
        except Exception as e:
            print(f"  엑셀 버튼 탐색 실패: {e}")

    # 방법 B: 이미지 인식 (OpenCV 한글 경로 대응 — numpy로 읽기)
    if not clicked and os.path.exists(BTN_IMAGE):
        try:
            import cv2, numpy as np
            template = cv2.imdecode(
                np.fromfile(BTN_IMAGE, dtype=np.uint8), cv2.IMREAD_COLOR
            )
            if template is not None:
                screenshot = pyautogui.screenshot()
                screen_np = cv2.cvtColor(np.array(screenshot), cv2.COLOR_RGB2BGR)
                res = cv2.matchTemplate(screen_np, template, cv2.TM_CCOEFF_NORMED)
                _, max_val, _, max_loc = cv2.minMaxLoc(res)
                if max_val >= 0.75:
                    th, tw = template.shape[:2]
                    cx = max_loc[0] + tw // 2
                    cy = max_loc[1] + th // 2
                    pyautogui.click(cx, cy)
                    time.sleep(0.2)
                    pyautogui.press("space")
                    clicked = True
                    print(f"  이미지 인식으로 클릭: ({cx}, {cy}), confidence={max_val:.2f}")
        except Exception as e:
            print(f"  이미지 인식 실패: {e}")

    # 방법 C: pywinauto로 MDI 자식 내 버튼 탐색
    if USE_CONTROL_AUTOMATION and HAS_PYWINAUTO and not clicked:
        try:
            child_hwnd = find_mdi_child(REPORT_TITLE_KW, timeout=5)
            app = Application(backend="win32").connect(handle=child_hwnd)
            dlg = app.window(handle=child_hwnd)
            dlg["엑셀보내기"].click()
            clicked = True
        except Exception:
            pass

    # 방법 D: 고정 좌표 클릭 (최대화 1920x1080 기준 실측값)
    if not clicked:
        # 창이 포그라운드인지 재확인 후 클릭
        import ctypes
        fg_hwnd = ctypes.windll.user32.GetForegroundWindow()
        if fg_hwnd != main_win._hWnd:
            activate_win(main_win, maximize=True)
        bx, by = scale_xy(*EXCEL_XY)
        pyautogui.click(bx, by)
        time.sleep(0.2)
        pyautogui.press("space")
        clicked = True
        print(f"  좌표 클릭: ({bx}, {by})")

    time.sleep(2)
    dbg_shot("05b_after_export_click")

    # 저장 다이얼로그 처리
    fname = f"상품이익_{date_from.replace('-','')}_{date_to.replace('-','')}.xlsx"
    save_path = os.path.join(SAVE_DIR, fname)

    if save_excel_window(save_path, before_excel_titles):
        return

    if save_exported_excel(save_path, before_excel):
        return

    try:
        save_dlg = find_window("저장", timeout=5)
        activate_win(save_dlg)
        pyautogui.hotkey("ctrl", "a")
        if not set_text_to_first_edit(save_dlg._hWnd, save_path):
            paste_text(save_path)
        pyautogui.press("enter")
        time.sleep(1)
        # 덮어쓰기 확인
        try:
            confirm_win = find_window("확인", timeout=3)
            activate_win(confirm_win)
            pyautogui.press("enter")
        except TimeoutError:
            pass
        print(f"[5] 저장: {save_path}")
    except TimeoutError:
        if save_excel_window(save_path, before_excel_titles, timeout=5):
            return
        if save_exported_excel(save_path, before_excel, timeout=5):
            return
        status = _sm_status_bar_text()
        if any(kw in status for kw in ('처리중', '진행중')):
            print("[5] 조회가 아직 완료되지 않아 엑셀 내보내기를 건너뜁니다 (재실행 필요)")
        else:
            print("[5] 엑셀 내보내기 실패 — 조회 결과가 없거나 (일요일/공휴일 등) "
                  "SM이 빈 데이터는 Excel을 열지 않는 것으로 보입니다")


# ── 서버 업로드 ───────────────────────────────────────────────
SERVER_BASE_URL   = "http://211.47.183.155:8034"
SERVER_UPLOAD_URL = f"{SERVER_BASE_URL}/api/workbook-cache/append-order-assistant"
SERVER_STATUS_URL = f"{SERVER_BASE_URL}/api/workbook-cache/status"

def upload_to_server(save_path: str) -> bool:
    """저장된 xlsx를 주문 어시스턴트 서버에 이어붙이기 업로드."""
    import urllib.request, json as _json
    if not os.path.exists(save_path):
        print("[6] 업로드 건너뜀: 파일 없음")
        return False
    print(f"[6] 서버 업로드 중: {SERVER_UPLOAD_URL}")
    with open(save_path, "rb") as f:
        data = f.read()
    req = urllib.request.Request(SERVER_UPLOAD_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("Content-Length", str(len(data)))
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = _json.loads(resp.read().decode("utf-8"))
        if result.get("ok"):
            data    = result.get("data", {})
            new_r   = data.get("newRows", "?")
            total_r = data.get("totalRows", "?")
            dates   = data.get("appendedDates", [])
            print(f"[6] 업로드 완료: 신규 {new_r}행 / 전체 {total_r}행 / 날짜: {dates}")
            return True
        else:
            print(f"[6] 업로드 실패: {result.get('error')}")
            return False
    except Exception as e:
        print(f"[6] 업로드 오류: {e}")
        return False


# ── 영업일 계산 ───────────────────────────────────────────────
def _kr_holidays():
    import holidays as holidays_lib
    today = datetime.today().date()
    return holidays_lib.KR(years=range(today.year - 2, today.year + 2))

def get_server_last_date() -> str:
    """서버 Parquet의 마지막 날짜 반환 (YYYY-MM-DD). 실패 시 빈 문자열."""
    import urllib.request, json as _json
    try:
        with urllib.request.urlopen(SERVER_STATUS_URL, timeout=10) as resp:
            data = _json.loads(resp.read().decode("utf-8"))
            return data.get("targetDate", "")
    except Exception as e:
        print(f"  [경고] 서버 상태 조회 실패: {e}")
        return ""


def prev_business_day():
    """오늘 기준 직전 영업일 반환 (토·일·한국 공휴일 제외)"""
    kr = _kr_holidays()
    d = datetime.today().date() - timedelta(days=1)
    while d.weekday() >= 5 or d in kr:
        d -= timedelta(days=1)
    return d.strftime("%Y-%m-%d")

def business_days_in_range(start: str, end: str) -> list[str]:
    """start~end 사이의 영업일 목록 반환 (YYYY-MM-DD 문자열 리스트)"""
    from datetime import date as _date
    kr  = _kr_holidays()
    cur = datetime.strptime(start, "%Y-%m-%d").date()
    fin = datetime.strptime(end,   "%Y-%m-%d").date()
    days = []
    while cur <= fin:
        if cur.weekday() < 5 and cur not in kr:
            days.append(cur.strftime("%Y-%m-%d"))
        cur += timedelta(days=1)
    return days



# ── 메인 ──────────────────────────────────────────────────────
def main():
    """
    사용법:
      python sm_auto.py                       # 이전 영업일 1일
      python sm_auto.py 2026-05-08            # 특정 날짜 1일
      python sm_auto.py 2026-05-01 2026-05-08 # 범위를 단일 파일로 조회
      python sm_auto.py --backfill 2026-04-01              # 해당일~어제 영업일 전체
      python sm_auto.py --backfill 2026-04-01 2026-05-08   # 범위 영업일 전체
    """
    args = sys.argv[1:]

    # ── backfill 모드 ──────────────────────────────────────────
    if args and args[0] == "--backfill":
        rest = args[1:]
        if not rest:
            # 날짜 미지정: 서버 마지막 날짜 다음 영업일부터 어제까지
            last = get_server_last_date()
            if not last:
                print("[backfill] 서버 마지막 날짜를 가져올 수 없습니다. 날짜를 직접 입력해주세요.")
                print("  사용법: python sm_auto.py --backfill YYYY-MM-DD")
                sys.exit(1)
            # 마지막 날짜 다음 날부터 시작
            bf_start = (datetime.strptime(last, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            bf_end   = prev_business_day()
            print(f"  (서버 마지막 날짜: {last} -> {bf_start}부터 백필)")
        else:
            bf_start = rest[0]
            bf_end   = rest[1] if len(rest) >= 2 else prev_business_day()
        days = business_days_in_range(bf_start, bf_end)
        if not days:
            print(f"[backfill] {bf_start} ~ {bf_end} 구간에 영업일 없음")
            return
        print(f"\n=== SM 백필: {bf_start} ~ {bf_end} ({len(days)}일) ===")
        launch()
        login()
        open_report()
        query(bf_start, bf_end)
        export_excel(bf_start, bf_end)
        fname = f"상품이익_{bf_start.replace('-','')}_{bf_end.replace('-','')}.xlsx"
        upload_to_server(os.path.join(SAVE_DIR, fname))
        print("\n=== 백필 완료 ===\n")
        return

    # ── 단일 / 범위 모드 ──────────────────────────────────────
    if len(args) == 0:
        last = get_server_last_date()
        yesterday = prev_business_day()
        if last:
            bf_start = (datetime.strptime(last, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
            missed = business_days_in_range(bf_start, yesterday)
        else:
            missed = []
        if len(missed) > 1:
            date_from, date_to = missed[0], missed[-1]
            print(f"  (서버 마지막: {last} -> {len(missed)}일 자동 백필: {date_from} ~ {date_to})")
        else:
            date_from = date_to = yesterday
            print(f"  (이전 영업일 자동 선택: {yesterday})")
    elif len(args) == 1:
        date_from = date_to = args[0]
    else:
        date_from, date_to = args[0], args[1]

    print(f"\n=== SM 자동화: {date_from} ~ {date_to} ===")
    launch()
    login()
    open_report()
    query(date_from, date_to)
    export_excel(date_from, date_to)
    fname = f"상품이익_{date_from.replace('-','')}_{date_to.replace('-','')}.xlsx"
    upload_to_server(os.path.join(SAVE_DIR, fname))
    print("=== 완료 ===\n")


if __name__ == "__main__":
    main()
