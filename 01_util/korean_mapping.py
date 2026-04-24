# 영문-한글 매핑 모음 (브랜드/등급/검색어)
# 추가할 거 생기면 국가별 묶음 찾아서 넣어주세요.
# 조회할 때 대문자 변환 필요: name.strip().upper()

BRAND_MAPPING: dict[str, str] = {

    # 네덜란드
    "DUMECO": "두메코",
    "IFT": "아이에프티",
    "LUNENBURG": "루넨버그",
    "COMPAXO": "콤파소",
    "HILCKMANN": "힐크만",
    "WIJNEN": "위즈넨",

    # 덴마크
    "DANISH CROWN": "데니쉬크라운",
    "DANPO": "덴포",
    "ROSE": "로즈",
    "TICAN": "티칸",

    # 독일
    "BÖSELER": "베슬러",
    "DNS": "디엔에스",
    "EGO": "이지오",
    "SIMON FLEISCH": "시몬",
    "TONNIES FLEISCH": "테니시",
    "CDS": "씨디에스",
    "DURINGER": "듀링거",
    "GAUSEPOHL": "가오제풀",
    "GREENPORK": "그린포크",
    "MANTEN": "만텐",
    "MULLER": "뮬러",
    "MV FLEISCH": "엠브이 플라이쉬",
    "SCHMITZ": "슈미즈",
    "SCHWEDE": "슈베데",
    "SCHWEINGOLD": "슈바인골드",
    "VOGLER": "보글러",
    "WESTFLEISCH": "웨스트플라이쉬",

    # 벨기에
    "LOCKS": "럭스",
    "BENS": "벤스",
    "DEBRA": "데브라",
    "DELAVI": "델라비",
    "DEWAELE": "드왈래",
    "GOOSSENS": "굿센",
    "HERDICO": "헤르디코",
    "OSMEAT": "오에스미트",
    "WEST VELESS": "웨스트블리스",

    # 스웨덴
    "SCAN": "스캔",

    # 스페인
    "BATALLE": "바텔",
    "BAUCELLS": "바우셀",
    "COREN": "코렌",
    "FRECARN": "프레칸",
    "JUIA": "주이아",
    "MARCJOAN": "마크존",
    "PATEL": "파텔",
    "RODRIGUEZ": "로드리게스",
    "AUSA": "아우사",
    "AVINYÓ": "아비뇨",
    "CAMPOFRIO": "캄포프리오",
    "COSTABRAVA": "코스타브라바",
    "ELPOZO": "엘포조",
    "FACCSA": "팍사",
    "FAMADESA": "파마데사",
    "FERMIN": "페민",
    "FRIBIN": "프리빈",
    "FRISELVA": "프리셀바",
    "FRIVALL": "프리발",
    "HEMOSA": "헤모사",
    "INCARLOPSA": "잉카롭사",
    "MAFRIGES": "마프리제스",
    "MONTRONILL": "몬트로닐",
    "PRIMACARNE": "프리마까르네",
    "RIVASAM": "리바쌈",
    "CELRA": "셀라",
    "MASIA TERO": "마시아테로",
    "LITERA": "리테라",
    "SELECTAS": "셀렉타스",
    "SOLA": "솔라",
    "TELLO": "텔로",
    "TONIJOSEP": "토니조셉",

    # 아일랜드
    "ROSDERRA": "로스데라",
    "DAWNPORK": "다운포크",
    "MCCARREN": "맥카렌",
    "STAUNTON": "스타운톤",

    # 영국
    "HEATHFIELD": "힛필드",
    "KARRO": "카로",
    "TULIP": "튤립",

    # 오스트리아
    "HIGH MOUNTAIN": "하이마운틴",
    "MARCHER": "마처",
    "RUDOLF JOBSTL": "루돌프",
    "AMADEOH": "아마데오",
    "DACHSBERGER": "닥스버거",
    "PURDON": "푸르돈",
    "RAABTAL": "라프탈",
    "STEIRERFLEISCH": "스타이어플래쉬",

    # 폴란드
    "AGROHANDEL": "아그로핸델",
    "ANIMEX": "애니맥스",
    "DUDA": "두다",
    "PINI": "피니",
    "PRIME FOOD": "프라임푸드",
    "SOKOLOW": "소콜로",

    # 프랑스
    "BERNARD": "버나드",
    "KERMENE": "커르멘",
    "ABERA": "아베라",
    "AIM": "에이아이엠",
    "BIGARD": "비가드",
    "CEDRO": "쎄드로",
    "CHARAL": "샤랄",
    "COOPERL": "쿠펠",
    "EUROPIG": "유로피그",
    "FIPSO": "핍소",
    "GAD": "가드",
    "GATINE": "가틴",
    "SOCOPA": "소코파",

    # 핀란드
    "ATRIA": "아트리아",
    "HK": "에이치케이",
    "SNELLMAN": "스넬맨",

    # 헝가리
    "KOMÉTA": "코메타",
    "DÉLHÚS": "델후스",
    "HUNGARY MEAT": "헝가리미트",
    "MASTER GOOD": "마스터굿",
    "PÁPAI": "파파이",
    "PICK": "픽",

    # 미국
    "AURORA": "오로라",
    "EXCEL": "엑셀",
    "FARMLAND": "팜랜드",
    "IBP": "아이비피",
    "NB": "네브래스카 비프",
    "NBP": "내셔널 비프",
    "SEABOARD": "씨보드",
    "SHOWCASE": "쇼케이스",
    "SMITHFIELD": "스미스필드",
    "SWIFT": "스위프트",
    "ACM": "에이씨엠",
    "AFG": "에이에프지",
    "AMICK": "아믹",
    "BELTEX": "벨텍스",
    "BUCKHEAD": "벅헤드",
    "CAVINESS BEEF": "카바이니스 비프",
    "CMA": "씨엠에이",
    "COLORADO": "콜로라도",
    "CREEKSTONE": "크릭스톤",
    "GEORGE'S FARM": "조지스팜",
    "HARRIS RANCH": "해리스랜치",
    "HORMEL": "홈멜",
    "INDIANA": "인디애나",
    "IOWA": "아이오와",
    "IOWA PREMIUM": "아이오와 프리미엄",
    "JOHN MORRELL": "존모렐",
    "LANTOUL": "란툴",
    "OMAHA": "오마하",
    "PERDUE": "퍼듀",
    "PILGRIM": "필그림",
    "PM BEEF": "피엠비프",
    "PORKKING": "포크킹",
    "ROCKY MOUNTAIN": "록키마운틴",
    "SAM KANE": "삼켄",
    "SIMONS": "시몬스",
    "SKYLARK": "스카이라크",
    "WASHINGTON": "워싱턴",
    "WAYNE FARM": "웨인팜",
    "WR": "더블유알",
    "5 STAR 562": "5스타",   # 세 코드 모두 같은 브랜드예요
    "5 STAR 562M": "5스타",
    "5 STAR 267": "5스타",

    # 캐나다
    "BLUE RIBBON": "블루리본",
    "MAPLE": "메이플",
    "OLYMEL": "올리멜",
    "AGROMEX": "아그로맥스",
    "ASTA": "아스타",
    "ATRAHAN": "아트라한",
    "BRITCO": "브리티코",
    "CANADIAN PREMIUM MEATS": "캐나디언 프리미엄 미트",
    "CARGILL LIMITED": "카길 리미티드",
    "CNP": "씨엔피",
    "CONESTOGA": "코네스토가",
    "DUBRETON": "듀브래톤",
    "ÉCOLAIT LTEE": "에코레이트 엘티",
    "FEARMANS": "피어맨",
    "HYLIFE": "하이라이프",
    "LEVINOFF-COLBEX": "레비노프 콜벡스",
    "MONTPAK INTERNATIONAL": "몬트팩 인터내셔널",
    "QUALITY MEAT": "퀄리티미트",
    "WHITE OAK": "화이트오크",

    # 멕시코
    "KINITON": "키니톤",
    "KOWI": "코이",
    "SURADON": "수라돈",
    "CARNES VIBA": "까르네스 비바",
    "DON FILETO": "돈필레토",
    "GRUPO GUSI": "그루뽀 구시",
    "KARNIKA": "까르니까",
    "KEKEN": "케켄",
    "NORSON": "놀슨",
    "PRADERAS HUASTECAS": "프라데라스 우아떼까스",
    "PROCARSON": "프로카르송",
    "RANCHO EL 17": "란초 엘 17",
    "SANTA CECILIA": "산타 세실리아",
    "SASA": "사사",
    "SOLES": "솔레스",
    "SUKARNE": "수까르네",

    # 브라질
    "BIGFRANGO": "빅프랑고",
    "COPACOL": "코파콜",
    "LAR": "엘에이알",
    "PERDIGAO": "페르디가오",
    "SADIA": "사디아",
    "SEARA": "시에라씨에라",
    "TYSON": "타이슨",

    # 우루과이
    "CARRASCO": "까라스코",
    "BPU": "비피유",
    "MARFRIG": "마프리그",
    "PUL": "피유엘",
    "SOLIS": "솔리스",
    "TACUAREMBO": "타쿠아렘보",

    # 칠레
    "ANDES REAL PORK": "안데스참돈육",
    "COEXCA": "코엑스카",
    "GOWONDON": "고원돈",
    "SUPERPORK": "슈퍼포크",
    "AASA": "아싸",
    "FRIOSA": "프리오자",
    "MAXAGRO": "맥스아그로",
    "SIMUNOVIC": "시무노빅",
    "TEMUCO": "테무코",
    # 아그로수퍼 — 사람마다 '아그로수퍼'로도 치고 '아그로슈퍼'로도 쳐서
    # 둘 다 검색에 걸리도록 붙여서 저장해둔 거예요
    "AGRO SUPPER": "아그로수퍼아그로슈퍼",

    # 호주
    "AMH": "에이엠에이치",
    "CARGILL BEEF": "카길",
    "CARGILL TEYS": "카길 티스",
    "KILCOY": "킬코이",
    "NOLAN": "놀란",
    "AACO": "아코",
    "ABG": "에이비지",
    "ALEXANDER": "알렉산더",
    "AMBASSADOR": "앰버서더",
    "AMG": "에이엠지",
    "BASS COAST": "바스 코스트",
    "BINDAREE": "빈다리",
    "CASSINO": "카지노",
    "COLES": "콜스",
    "DARLINGDOWN": "달링다운",
    "DIAMANTINA": "디아만티나",
    "GBP": "지비피",
    "GREENHAM": "그린햄",
    "HARVEY": "하비",
    "HILLTOP": "힐탑",
    "HUNTER VALLEY": "헌터밸리",
    "JOHN DEE": "존디",
    "MIDFIELD": "미드필드",
    "OAKEY": "오끼",
    "O'CONNOR": "오코너",
    "RALPHS": "랄프",
    "T&R": "티앤알",
    "TARA VALLEY": "타라벨리",
    "TBS": "티비에스",
    "THOMAS": "토마스",
    "TEYS": "티스",
    "WINGHAM": "윙햄",
    "WMPG": "더블유엠피지",

    # 뉴질랜드
    "HELLABY": "헬라비",
    "AFFCO": "아프코",
    "ALLIANCE": "얼라이언스",
    "AMP": "에이엠피",
    "GREENLEA": "그린리아",
    "LAND MEAT": "랜드미트",
    "RIVERLAND": "리버랜드",
    "SFF": "에스에프에프",
}


# 등급
# S는 곱창=목초, 나머지=스티어인데 "목초 스티어"로 붙여서 저장해요 (아그로수퍼랑 같은 이유)

GRADE_MAPPING: dict[str, str] = {
    "GF":    "곡물",
    "S":     "목초 스티어",  # 곱창=목초, 나머지=스티어 — 둘 다 검색되도록 붙여서 저장해요
    "PR":    "프라임",
    "CH":    "초이스",
    "SE":    "셀렉트",
    "DUROC": "듀록",
}


# EST 단축 입력 — e/m/r/k 또는 엠/알로 쳐도 인식해요
EST_ALIASES: dict[str, str] = {
    "e":  "86E",
    "m":  "86M",
    "r":  "86R",
    "k":  "86K",
    "엠": "86M",
    "알": "86R",
}


# 온도/보관 표기 통일
TEMPERATURE_ALIASES: dict[str, str] = {
    "냉장": "냉장",
    "냉동": "냉동",
    "동결": "냉동",
    "t":   "냉동",   # (T) = 냉동
}


# 형태 표기 통일
FORMAT_ALIASES: dict[str, str] = {
    "조각":  "PCS",
    "pcs":   "PCS",
    "piece": "PCS",
}


# 품목 동의어
# 깐양/깐양(20KG)은 같은 물건인데 표기가 달라서 양방향으로 등록해요
PRODUCT_SYNONYMS: dict[str, list[str]] = {
    "목살":       ["목잡", "목잡살"],
    "목잡":       ["목살", "목잡살"],
    "깐양":       ["깐양(20KG)", "깐양20kg"],
    "깐양(20KG)": ["깐양", "깐양20kg"],
}


# 탕갈비 변형 — 발주 채팅에서 조각탕갈비/미니탕갈비 등으로 들어와요
TANGALBI_VARIANTS: list[dict] = [
    {"tag": "미니",  "patterns": ["미니"]},
    {"tag": "조각",  "patterns": ["조각"]},
    {"tag": "bbq",   "patterns": ["bbq"]},
    {"tag": "meaty", "patterns": ["meaty", "미티"]},
    {"tag": "#2",    "patterns": ["#2", "샵2", "샾2"]},
]


# 진갈비 냉장/냉동 — 표기 방식이 너무 다양해서 따로 묶어둬요
JINGALBI_VARIANTS: dict[str, list[str]] = {
    "냉장진갈비": ["진갈비(냉장)", "냉장진갈비", "냉장진갈비살", "진갈비살(냉장)"],
    "냉동진갈비": ["진갈비(냉동)", "냉동진갈비", "냉동진갈비살", "진갈비살(냉동)",
                  "진갈비(T)", "동결진갈비", "진갈비(동결)"],
}


# 검색어 별칭
# 5스타/5star는 쇼케이스(SHOWCASE) 브랜드 별칭이에요
SEARCH_ALIASES: dict[str, str] = {
    "빽립":   "탕갈비",
    "백립":   "탕갈비",
    "목잡":   "목살",
    "목잡살": "목살",
    "동결":   "냉동",
    "미티":   "meaty",
    "티스":   "teys",
    "5스타":  "showcase",
    "5star":  "showcase",
    "샵":     "#",
    "샾":     "#",
}


# 검색 동의어 — SEARCH_ALIASES랑 세트예요, 한쪽 바꾸면 같이 맞춰주세요
SEARCH_SYNONYMS: dict[str, list[str]] = {
    "탕갈비":   ["빽립", "백립"],
    "목살":     ["목잡", "목잡살"],
    "냉동":     ["동결"],
    "meaty":    ["미티"],
    "showcase": ["5스타", "5star"],
    "teys":     ["티스"],
    "#":        ["샵", "샾"],
}


# 이 단어들은 한글 매칭이 필요해요 — 발주에 있으면 품목에도 꼭 있어야 해요
MUST_MATCH_MODIFIERS: list[str] = [
    "냉장", "냉동", "작업", "황제", "삼겹", "미박",
]

def get_korean_brand(name: str) -> str:
    return BRAND_MAPPING.get(str(name).strip().upper(), name)


def get_korean_grade(code: str) -> str:
    return GRADE_MAPPING.get(str(code).strip().upper(), code)

def resolve_est_alias(token: str) -> str:
    return EST_ALIASES.get(str(token).strip().lower(), token)

def resolve_temp(token: str) -> str:
    return TEMPERATURE_ALIASES.get(str(token).strip().lower(), token)

def resolve_alias(term: str) -> str:
    return SEARCH_ALIASES.get(str(term).strip().lower(), term)


if __name__ == "__main__":
    print(f"브랜드 {len(BRAND_MAPPING)}개 / 등급 {len(GRADE_MAPPING)}개 / 검색별칭 {len(SEARCH_ALIASES)}개")
