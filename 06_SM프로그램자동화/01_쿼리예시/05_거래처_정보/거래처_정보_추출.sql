-- 거래처(회원) 정보 추출 쿼리
-- (네트워크 패킷 캡처 '거래처_정보.pcapng'에서 추출된 원본 쿼리를 바탕으로 작성)

SELECT *
  FROM MEMBER
       LEFT OUTER JOIN MAN ON MAN_CODE = MEM_MCODE
 WHERE MEM_SANGHO LIKE '%%'   -- 상호(거래처명) 검색 시 조건 추가 (예: '%고기%')
   AND MEM_TSANG LIKE '%%'    -- 추가 검색 조건 (필요 시 수정)
