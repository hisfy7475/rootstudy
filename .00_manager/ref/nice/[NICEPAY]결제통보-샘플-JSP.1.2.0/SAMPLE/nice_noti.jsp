<%@ page  contentType="text/html; charset=euc-kr" %>
<%@ page import = "java.io.*" %>
<%@ page import = "java.util.Calendar" %>
<%

//*********************************************************************************
// 구매자가 입금하면 결제데이터 통보를 수신하여 DB 처리 하는 부분 입니다.
// 수신되는 필드에 대한 DB 작업을 수행하십시오.
// 수신필드 자세한 내용은 메뉴얼 참조
//*********************************************************************************

String PayMethod    = request.getParameter("PayMethod");        //지불수단
String MID          = request.getParameter("MID");              //상점ID
String MallUserID   = request.getParameter("MallUserID");       //회원사 ID
String Amt          = request.getParameter("Amt");              //금액
String name         = request.getParameter("name");             //구매자명
String GoodsName    = request.getParameter("GoodsName");        //상품명
String TID          = request.getParameter("TID");              //거래번호
String MOID         = request.getParameter("MOID");             //주문번호
String AuthDate     = request.getParameter("AuthDate");         //입금일시 (yyMMddHHmmss)
String ResultCode   = request.getParameter("ResultCode");       //결과코드 ('4110' 경우 입금통보)
String ResultMsg    = request.getParameter("ResultMsg");        //결과메시지
String VbankNum     = request.getParameter("VbankNum");         //가상계좌번호
String FnCd         = request.getParameter("FnCd");             //가상계좌 은행코드
String VbankName    = request.getParameter("VbankName");        //가상계좌 은행명
String VbankInputName = request.getParameter("VbankInputName"); //입금자 명
String CancelDate   = request.getParameter("CancelDate");       //취소일시

//*********************************************************************************
//가상계좌채번시 현금영수증 자동발급신청이 되었을경우 전달되며 
//RcptTID 에 값이 있는경우만 발급처리 됨
//*********************************************************************************
String RcptTID      = request.getParameter("RcptTID");          //현금영수증 거래번호
String RcptType     = request.getParameter("RcptType");         //현금 영수증 구분(0:미발행, 1:소득공제용, 2:지출증빙용)
String RcptAuthCode = request.getParameter("RcptAuthCode");     //현금영수증 승인번호


//*********************************************************************************
// 이부분에 로그파일 경로를 수정해주세요.
// 로그는 문제발생시 오류 추적의 중요데이터 이므로 반드시 적용해주시기 바랍니다.
//*********************************************************************************
String file_path = "/usr/local/jboss/jboss-as/server/pay/log/nice_vacct_noti_result.log";

File file = new File(file_path);
file.createNewFile();
FileWriter fw = new FileWriter(file_path, true);

fw.write("************************************************\r\n");
fw.write("PayMethod     : " + PayMethod + "\r\n");
fw.write("MID           : " + MID + "\r\n");
fw.write("MallUserID    : "+ MallUserID + "\r\n");
fw.write("Amt           : " + Amt + "\r\n");
fw.write("name          : " +  name + "\r\n");
fw.write("GoodsName     : " + GoodsName + "\r\n");
fw.write("TID           : "+ TID + "\r\n");
fw.write("MOID          : "+ MOID + "\r\n");
fw.write("AuthDate      : "+ AuthDate + "\r\n");
fw.write("ResultCode    : "+ ResultCode + "\r\n");
fw.write("ResultMsg     : "+ ResultMsg + "\r\n");
fw.write("VbankNum      : "+ VbankNum + "\r\n");
fw.write("FnCd          : "+ FnCd + "\r\n");
fw.write("VbankName     : "+ VbankName + "\r\n");
fw.write("VbankInputName : "+ VbankInputName + "\r\n");
fw.write("RcptTID       : "+ RcptTID + "\r\n");
fw.write("RcptType      : "+ RcptType + "\r\n");
fw.write("RcptAuthCode  : "+ RcptAuthCode + "\r\n");
fw.write("CancelDate    : "+ CancelDate + "\r\n");
fw.write("************************************************\r\n");
  
fw.close();
  
//가맹점 DB처리 
  
//**************************************************************************************************
//**************************************************************************************************
//결제 데이터 통보 설정 > “OK” 체크박스에 체크한 경우" 만 처리 하시기 바랍니다.
//**************************************************************************************************		
//TCP인 경우 OK 문자열 뒤에 라인피드 추가
//위에서 상점 데이터베이스에 등록 성공유무에 따라서 성공시에는 "OK"를 NICEPAY로
//리턴하셔야합니다. 아래 조건에 데이터베이스 성공시 받는 FLAG 변수를 넣으세요
//(주의) OK를 리턴하지 않으시면 NICEPAY 서버는 "OK"를 수신할때까지 계속 재전송을 시도합니다
//기타 다른 형태의 PRINT(out.print)는 하지 않으시기 바랍니다
//if (데이터베이스 등록 성공 유무 조건변수 = true) 
//  {
//      out.print("OK"); // 절대로 지우지 마세요
//  } 
//  else 
//  {
//      out.print("FAIL"); // 절대로 지우지 마세요
//  }
//*************************************************************************************************	
//*************************************************************************************************
 
%>
