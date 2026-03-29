//
//  WKWebViewConfig_Extention.swift
//  TEMP
//
//  Created by LEETAEIN on 26/10/2018.
//  Copyright © 2018 dqnetworks. All rights reserved.
//

import UIKit
import WebKit

public protocol WKUserInterfaceDelegate {
    func navigationHidden(hidden : Bool)
    func doLogin(strId : String)
    func doExitApp()
    func doWindowOpen(strURL : String)
    func doWindowFinish()
    func doWindowOpenBrowser(url : URL)
    func doShare(strTitle : String, url : URL, strDescription : String)
    func doTwitter(strTitle : String, url : URL)
    func doFacebook(strTitle : String, url : URL)
    func doKakaoStory(strTitle : String, url : URL)
    func doKakaoTalk(strTitle : String, url : URL)
    func doRotate(strRotate : String)
    func doUploadMultiple(count : Int,type : Int)
    func doFileUpload()
    func doUploadChoice()
    func doCameraUpload()
    func doReviewRPop()
    func doRecordingAudio()
    func doFileApp()
    func doGPS(userCode : String)
    func doCheckWiFi()
    func doDownloadFile(nMode : Int, url : URL, strFileNameServer : String, strFileNameOrg : String)
    func doTopicEdit(nMode : Int, strTopicNames : String)
    func doCheckversion()
    func doIAP(productID : String)
    func getUserInfo(key: String)
    func checkInstalledApp(scheme : String)
    func routeShare(type : String, startLat : String, startLon : String, endLat : String, endLon : String, name : String, address : String)
    func getTelNumber(strQuery : String)
    func goToCodeReader(codeType : String)
    func doCallPhone(scheme : String)
    func doAddChildView(url : String)
    func removeChildLastView(reload : Bool)
    func removeChildAllView()
    func googleSignIn()
    func getContacts()
    func doSnsLogin(login_type: String, sns_type: String)
    func doPermission(name: String, show: String)
    func doAdMob(type: String, view: String)
    func doWebReturn(str : String)
    func doDeeplinkInfo(mode: String, cb: String, delete: Bool)
    func doUpdateCheck(state: Int, toastView: Bool)
}


class WKUserInterface: WKUserContentController, WKScriptMessageHandler {
    
    var interfaceDelegate: WKUserInterfaceDelegate?

    override init() {
        print("AAAAAA-a")
        super.init()
        self.add(self, name: "navigation_hidden")      // navigation 호출
        self.add(self, name: "hybridGetMbid")          // 로그인
        self.add(self, name: "exitApp")                // 어플 종료
        self.add(self, name: "window_open")            // 새창 띄우기
        self.add(self, name: "window_finish")          // 현재창 닫기
        self.add(self, name: "window_open_browser")    // 외부 브라우저 열기
        self.add(self, name: "get_contacts")            // 잔체 연락처 가죠오기
        self.add(self, name: "send_google")            // 구글
        self.add(self, name: "send_share")             // 공유하기
        self.add(self, name: "send_twitter")           // 트위터
        self.add(self, name: "send_facebook")          // 페이스북
        self.add(self, name: "send_kakaostory")        // 카카오스토리
        self.add(self, name: "send_kakaotalk")         // 카카오톡
        self.add(self, name: "rotate_page")            // 가로 세로 | 모드 변경
        self.add(self, name: "review_pop")             // 리뷰창
        self.add(self, name: "recode_start_audio")     // 음성 녹음 시작
        self.add(self, name: "file_upload_choice")     // 파일 선택
        self.add(self, name: "file_upload_process")    // 파일 업로드
        self.add(self, name: "file_cam_upload_process")// 카메라 업로드
        self.add(self, name: "image_gallery_upload_multiple")// 다수의 이미지 업로드
        self.add(self, name: "get_gps")                // GPS 가져오기
        self.add(self, name: "check_wifi")             // 와이파이 체크
        self.add(self, name: "download_file")          // 파일 다운로드
        self.add(self, name: "fcm_topic_edit")         // FCM 토픽 | 등록/수정/삭제
        self.add(self, name: "payment_iap_item")       // 입앱구매
        self.add(self, name: "setUserInfo")            // 사용자 정보 저장
        self.add(self, name: "getUserInfo")            // 사용자 정보 반환
        self.add(self, name: "checkInstalledApp")      // 설치된 어플 확인
        self.add(self, name: "routeShare")             // 경로 탐색
        self.add(self, name: "get_tel_number")         // 전화번호 가져오기
        self.add(self, name: "get_qrcode")             // qr code 가져오기
        self.add(self, name: "get_bacode")             // ba code 가져오기
        self.add(self, name: "make_phonecall")         // 전화 걸기(바로 걸기)
        self.add(self, name: "addChildView")            // 차일드 웹뷰 추가
        self.add(self, name: "doHistoryBack")           // 차일드 웹뷰 제거(최종)
        self.add(self, name: "clearChildView")          // 차일드 웹뷰 제거(전부)
        self.add(self, name: "sns_login")               // sns login
        self.add(self, name: "permission")              // 권한 가져오기
        self.add(self, name: "AdMob")                   // admob
        self.add(self, name: "deeplink_info")           // deeplink info
        self.add(self, name: "appVersion")           // appversion info
        self.add(self, name: "update_check")           // app update check
    }
    
    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let strTask : String = message.name
        var strParams : String? = "{}"
        var JSON : [String: Any]?
        print("message.body:", message.body);
        print("body Type: ", type(of: message.body));
        if message.body is NSNull {
            strParams = "{}"
        }
        else {
            if message.body is String {
                strParams = (message.body as! String)
                strParams = message.body as? String
                strParams = strParams?.replacingOccurrences(of: "+", with: " ")
                strParams = strParams?.replacingOccurrences(of: "\"{", with: "{")
                strParams = strParams?.replacingOccurrences(of: "}\"", with: "}")
            }
        }
        
        print("TASK: ", strTask);
        print("BODY: ", strParams!);
        
        if let data = strParams?.data(using: .utf8) {
            do {
                JSON = try (JSONSerialization.jsonObject(with: data, options: []) as? [String: Any])!
                NSLog("[WKWEBVIEW]STRING=%@", String(format: "%@", JSON!));
            } catch {
                NSLog("[WKWEBVIEW]STRING=%@", error.localizedDescription);
                Util.showToast(message: "잘못된 형식입니다. JSON String 형식으로 호출해주세요.")
	
                return
            }
        }
        print("kkkk")
        switch(strTask) {
        case "update_check":
            if  let state = JSON?["state"] as? Int, let toastView = JSON?["toast"] as? Bool {
                Util.log("update_check: \(state) / \(toastView)")
                interfaceDelegate?.doUpdateCheck(state: state, toastView: toastView)
            }
            break;
        case "navigation_hidden":
            let state = String.init(format: "%@", JSON!["state"] as! CVarArg)
            interfaceDelegate?.navigationHidden(hidden: state.elementsEqual("0"))
            break;
        case "hybridGetMbid":
            let mb_id : String = JSON?["mb_id"] as? String ?? ""
            if mb_id != "" {
                interfaceDelegate?.doLogin(strId: mb_id)
            }
            break
        case "exitApp":
            interfaceDelegate?.doExitApp()
            break
        case "window_open":
            //let url : String = JSON!["url"] as? String ?? ""
            let url : String = JSON?["url"] as? String ?? ""
            interfaceDelegate?.doWindowOpen(strURL: url)
            break
        case "window_finish":
            interfaceDelegate?.doWindowFinish()
            break
        case "window_open_browser":
            let strUrl : String = JSON?["url"] as? String ?? "";
            if strUrl != "" {
                let url : URL = URL.init(string: strUrl)!;
                interfaceDelegate?.doWindowOpenBrowser(url: url)
            }
            break
        case "send_share":
            let strTile : String = JSON!["title"] as? String ?? "";
            let strUrl : String = JSON!["url"] as? String ?? "";
            if strUrl.isEmpty{
                break
            }
            let url : URL = URL.init(string: strUrl)!;
            
            // 서버쪽에서 자꾸만 옛날 템플릿을 쓰네.....-_-;
            if let strDescription : String = JSON!["description"] as? String {
                interfaceDelegate?.doShare(strTitle: strTile, url: url, strDescription: strDescription)
            }
            else if let strDescription : String = JSON!["title2"] as? String {
                interfaceDelegate?.doShare(strTitle: strTile, url: url, strDescription: strDescription)
            }
            break
        case "send_twitter":
            let strTitle : String = JSON!["title"] as? String ?? "";
            let url : URL = URL(string : JSON!["url"] as? String ?? "")!;
            interfaceDelegate?.doTwitter(strTitle: strTitle, url: url)
            break
        case "send_facebook":
            let strTitle : String = JSON!["title"] as? String ?? "";
            let url : URL = URL(string : JSON!["url"] as? String ?? "")!;
            interfaceDelegate?.doFacebook(strTitle: strTitle, url: url)
            break
        case "send_kakaostory":
            let strTitle : String = JSON!["title"] as? String ?? "";
            let url : URL = URL(string : JSON!["url"] as? String ?? "")!;
            interfaceDelegate?.doKakaoStory(strTitle: strTitle, url: url)
            break
        case "send_kakaotalk":
            let strTitle : String = JSON!["title"] as? String ?? "";
            let url : URL = URL(string : JSON!["url"] as? String ?? "")!;
            interfaceDelegate?.doKakaoTalk(strTitle: strTitle, url: url)
            break
        case "send_google":
            //interfaceDelegate?.googleSignIn()
            Util.showToast(message: "deprecated send_google, use sns_login")
            break
        case "get_contacts":
            interfaceDelegate?.getContacts()
            break
        case "rotate_page":
            let strRotate : String = JSON!["rotate_val"] as? String ?? "";
            interfaceDelegate?.doRotate(strRotate: strRotate)
            break
        case "file_upload_process":
            interfaceDelegate?.doFileUpload()
            break
        case "file_cam_upload_process":
            interfaceDelegate?.doCameraUpload()
            break
        case "review_pop":
            interfaceDelegate?.doReviewRPop()
            break
        case "recode_start_audio":
            interfaceDelegate?.doRecordingAudio()
            break
        case "file_upload_choice":
            interfaceDelegate?.doUploadChoice()
            break
        case "image_gallery_upload_multiple":
            let count : Int = JSON!["count"] as! Int;
            var type : Int = 0
            if JSON!.count > 1 {
                type = JSON!["type"] as! Int
            }
            interfaceDelegate?.doUploadMultiple(count: count, type: type)
            break
        case "get_gps":
            var userCode : String = ""
            if let uCode: String = JSON!["userCode"] as? String{
                userCode = uCode
            }
            interfaceDelegate?.doGPS(userCode: userCode)
            break
        case "check_wifi":
            interfaceDelegate?.doCheckWiFi()
            break
        case "download_file":
            let strFileNameServer : String = JSON!["file_name"] as? String ?? ""
            let strFileNameOrg : String = JSON!["file_name_org"] as? String ?? ""
            let nMode : Int = JSON!["mode"] as! Int
            let url : URL = URL(string: JSON!["url"] as? String ?? "")!
            interfaceDelegate?.doDownloadFile(nMode: nMode, url: url, strFileNameServer: strFileNameServer, strFileNameOrg: strFileNameOrg)
            break
        case "fcm_topic_edit":
            let nMode : Int = JSON!["mode"] as! Int
            let strTopicNames : String = JSON!["topic_names"] as? String ?? ""
            interfaceDelegate?.doTopicEdit(nMode: nMode, strTopicNames: strTopicNames)
            break
        case "appVersion":
            interfaceDelegate?.doCheckversion()
            break
        case "payment_iap_item":
            print("json", JSON)
            if let strProductID: String = JSON!["productID"] as? String , strProductID != "" {
                print("strProductID:", strProductID)
                interfaceDelegate?.doIAP(productID: strProductID)
            }else{
                Util.showToast(message: "productID가 없습니다.")
            }
            break
        case "setUserInfo":
            let strKey : String = JSON!["key"] as? String ?? ""
            let strValue : String = JSON!["value"] as? String ?? ""
            UserDefaults.standard.set(strValue, forKey: strKey)
            UserDefaults.standard.synchronize()
            break
        case "getUserInfo":
            let strKey : String = JSON!["key"] as? String ?? ""
            interfaceDelegate?.getUserInfo(key: strKey)
            break
        case "getInstalledPackage":
            let strScheme : String = JSON!["scheme"] as? String ?? ""
            interfaceDelegate?.checkInstalledApp(scheme: strScheme)
            break
        case "routeShare":
            let strType : String = JSON!["type"] as? String ?? ""
            let strEndName : String = JSON!["name"] as? String ?? ""
            let strEndAddress : String = JSON!["addr"] as? String ?? ""
            let strStartLat : String = String.init(format: "%@", JSON!["startLat"] as! CVarArg)
            let strStartLon : String = String.init(format: "%@", JSON!["startLon"] as! CVarArg)
            let strEndLat : String =  String.init(format: "%@", JSON!["endLat"] as! CVarArg)
            let strEndLon : String = String.init(format: "%@", JSON!["endLon"] as! CVarArg)
            interfaceDelegate?.routeShare(type: strType, startLat: strStartLat, startLon: strStartLon, endLat: strEndLat, endLon: strEndLon, name: strEndName, address: strEndAddress)
            break
        case "get_tel_number":
            if let mb_id = UserDefaults.standard.value(forKey: "mb_id") as? String {
                let strJSP : String = "result_app_get_tel_number('" + mb_id + "')"
                interfaceDelegate?.getTelNumber(strQuery: strJSP);
            }
            break
        case "get_qrcode":
            interfaceDelegate?.goToCodeReader(codeType: "qrcode")
            break
        case "get_bacode":
            interfaceDelegate?.goToCodeReader(codeType: "bacode")
            break
        case "make_phonecall":
            if let strNumber : String = JSON!["number"] as? String {
                interfaceDelegate?.doCallPhone(scheme: strNumber)
            }
            break;
        case "addChildView":
            if let url : String = JSON!["url"] as? String {
                interfaceDelegate?.doAddChildView(url: url)
            }
            break;
        case "doHistoryBack":
            if let reload : String = JSON!["reload"] as? String {
                let isReload : Bool = reload.elementsEqual("y");
                interfaceDelegate?.removeChildLastView(reload: isReload)
            }
            break;
        case "clearChildView":
            interfaceDelegate?.removeChildAllView()
            break
        case "sns_login":
            var login_type: String = "login"
            var sns_type: String = ""	
            if message.body is String {
                if let ltype: String = JSON!["login_type"] as? String{
                    login_type = ltype
                }
                if let stype: String = JSON!["sns_type"] as? String{
                    sns_type = stype
                }
            }else{
                if let dict: [String: String] = message.body as? Dictionary {
                    if let ltype: String = dict["login_type"] as String?{
                        login_type = ltype
                    }
                    if let stype: String = dict["sns_type"] as String?{
                        sns_type = stype
                    }
                }
            }
            print("login_type: ", login_type, " /sns_type: ", sns_type)
            interfaceDelegate?.doSnsLogin(login_type:login_type, sns_type:sns_type)
            break
        case "permission":
            let name : String = JSON!["name"] as? String ?? ""
            let show : String = JSON!["show"] as? String ?? ""
            interfaceDelegate?.doPermission(name:name, show: show)
            break
        case "AdMob":
            let t : String = JSON!["type"] as? String ?? ""
            let v : String = JSON!["view"] as? String ?? ""
            interfaceDelegate?.doAdMob(type:t, view: v)
            break
        case "deeplink_info":
            let mode : String = JSON!["mode"] as? String ?? ""
            let cb : String = JSON!["cb"] as? String ?? ""
            let delete : Bool = JSON!["delete"] as! Bool
            interfaceDelegate?.doDeeplinkInfo(mode: mode, cb: cb, delete: delete)
            break
        default:
            break
        }
    }
}
#if !WKUserInterface
typealias WKUserInterfaceDefault = WKUserInterface
#endif
