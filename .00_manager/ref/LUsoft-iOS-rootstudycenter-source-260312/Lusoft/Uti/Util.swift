//
//  Util.swift
//
//  Created by Yeongseong Seo on 2016. 8. 12..
//  Copyright © 2016년 dqnetworks. All rights reserved.
//

import UIKit
import AVFoundation
import AudioToolbox
import UserNotifications
import OSLog


class Util
{
    static let shared = Util()
    static let m_localNotiInfo : LocalNotiUserInfo = LocalNotiUserInfo.init()
    
    public static func formateTodayDate() -> String? {
       return formateTodayDate("yyyy-MM-dd_HHmmss")
    }
    public static func currentTime(format:String = "yyyy-MM-dd HH:mm:ss") -> String? {
        return formateTodayDate(format)
    }
    
    public static func formateTodayDate(_ val: String?) -> String? {
         if val != nil && val?.count == 0 {
            return nil
        }
        let dateFormatter = DateFormatter()
        // setup formate string for the date formatter
        dateFormatter.dateFormat = val
        // format the current date and time by the date formatter
        let dateStr = dateFormatter.string(from: Date())
        return dateStr
    }
    
   public static func getJSONFromArray(array:NSArray) -> String {
        if (!JSONSerialization.isValidJSONObject(array)) {
            return ""
        }
        let data : NSData! = try? JSONSerialization.data(withJSONObject: array, options: []) as NSData?
        let JSONString = NSString(data:data as Data,encoding: String.Encoding.utf8.rawValue)
        return JSONString! as String
    }
    public static func toJsonString(_ paramDic:[String:Any]) -> String{
        guard let data = try? JSONSerialization.data(withJSONObject: paramDic, options: []) else {
           return ""
        }
        let jsonString:String! = String(data: data, encoding: String.Encoding.utf8)
        return jsonString
    }
    public static func toStringDict(_ jsonString: String) -> [String:Any]? {
        guard let data = jsonString.data(using: .utf8) else {
            return nil
        }
        
        do {
            return try JSONSerialization.jsonObject(with: data, options: []) as? [String:Any]
        } catch {
            print("JSON 파싱 오류: \(error.localizedDescription)")
            return nil
        }
    }
    public static func nilOrValue(_ val: String?) -> String? {
        if val != nil && val?.count == 0 {
            return nil
        }
        return val
    }

    // document interaction
    private var docIC : UIDocumentInteractionController?
    public func presentDocumentInteraction(url: URL)
    {
        docIC = UIDocumentInteractionController(url: url)
        //docIC?.delegate = self
        docIC?.presentOptionsMenu(from: (Config.shared.vcStack.top()?.view.frame)!, in: (Config.shared.vcStack.top()?.view)!, animated: true)
    }
    
    struct LocalNotiUserInfo {
        let Command : String
        let DownloadFileCommand : String
        let DownloadFilePath : String
        let DownloadFileName : String
        let FCMCommand : String
        let FCMInfo : String
        init()
        {
            self.Command = "command"
            self.FCMCommand = "fcm_command"
            self.DownloadFileCommand = "download_file"
            self.DownloadFilePath = "filePath"
            self.DownloadFileName = "fileName"
            self.FCMInfo = "fcm_info"
        }
    }
    
    public static func sendDownloadCompleteLocalNoti(fileName: String, filePath: String)
    {
        let noti = UILocalNotification()
        if #available(iOS 8.2, *)
        {
            noti.alertTitle = fileName
            noti.alertBody = "다운로드 완료."
        }
        else
        {
            noti.alertBody = fileName + " - 다운로드 완료."
        }
        
        noti.userInfo = [m_localNotiInfo.Command : m_localNotiInfo.DownloadFileCommand,
                         m_localNotiInfo.DownloadFileName : fileName,
                         m_localNotiInfo.DownloadFilePath : filePath]
        UIApplication.shared.scheduleLocalNotification(noti)
    }
    
    
    // remote push

    public static func playSound(url : URL) {
        var soundId: SystemSoundID = 0
        AudioServicesCreateSystemSoundID(url as CFURL, &soundId)
        AudioServicesAddSystemSoundCompletion(soundId, nil, nil, { (soundId, clientData) -> Void in
            AudioServicesDisposeSystemSoundID(soundId)
        }, nil)
        AudioServicesPlaySystemSound(soundId)
    }
    
    public static func playVibrate(){
        AudioServicesPlaySystemSound(SystemSoundID(kSystemSoundID_Vibrate))
    }
    
    public static func showToast(message : String) {
        let deleget = UIApplication.shared.delegate as! AppDelegate

        let frame : CGRect = CGRect(x: 0,
                                    y: deleget.window!.frame.size.height - (deleget.window!.frame.size.height * 0.2),
                                    width: deleget.window!.frame.size.width - (deleget.window!.frame.size.width * 0.2),
                                    height: deleget.window!.frame.size.height * 0.2)
        let padding : UIEdgeInsets = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
        let toastLabel: PaddingLabel = PaddingLabel(frame: frame, padding: padding)
        toastLabel.backgroundColor = UIColor.black.withAlphaComponent(0.7)
        toastLabel.textColor = UIColor.white
        toastLabel.textAlignment = .center;
        toastLabel.numberOfLines = 3
        toastLabel.font = UIFont(name: "Verdana", size: 14.0)
        toastLabel.text = message
        toastLabel.alpha = 1.0
        toastLabel.layer.cornerRadius = 10;
        toastLabel.clipsToBounds  =  true
        toastLabel.sizeToFit()
        
        let windowCenter : CGPoint = (deleget.window?.center)!
        var toastCenter : CGPoint = windowCenter
        toastCenter.y += (windowCenter.y / 2) * 1.5
        toastLabel.center = toastCenter
        
        deleget.window!.addSubview(toastLabel)
        UIView.animate(withDuration: 4.0, delay: 0.1, options: .curveEaseOut, animations: {
            toastLabel.alpha = 0.0
        }, completion: {(isCompleted) in
            toastLabel.removeFromSuperview()
        })
    }
    
    //
    // 사용자 권한 동의 페이지가 필요한가?
    //
    public static func isPermisson()->Bool {
        var isPermission: Bool = false
        let readItem: Dictionary<String, Any> = Config.shared.getPermission()
        let keys : Array = Array(readItem.keys)
        for key : String in keys {
            if let s:Dictionary<String, Bool> = readItem[key] as? Dictionary<String, Bool>{
                if let disp1:Bool = s["use"] as? Bool {
                    if (disp1 == true) {
                        isPermission = true
                        break;
                    }
                }
            }
        }
        //isPermission = true
        return isPermission
    }
    
    func getPermission(name:String)->Bool {
        var yn:Bool = false
        if name=="push"{
            yn = self.getPermissionPush()
        }
        return yn
    }
    func getPermissionPush()->Bool {
        var yn:Bool = false
        UNUserNotificationCenter.current()
              .getNotificationSettings { permission in
                switch permission.authorizationStatus  {
                case .authorized:
                    yn = true
                  print("푸시 수신 동의")
                case .denied:
                  print("푸시 수신 거부")
                case .notDetermined:
                  print("한 번 허용 누른 경우")
                case .provisional:
                  print("푸시 수신 임시 중단")
                case .ephemeral:
                  // @available(iOS 14.0, *)
                  print("푸시 설정이 App Clip에 대해서만 부분적으로 동의한 경우")
                @unknown default:
                  print("Unknow Status")
                }
              }
        return yn
    }

    
    enum LogLevel {
        case debug
        case info
        case warning
        case error
        case fatal
    }
    private static let log = OSLog(subsystem: Bundle.main.bundleIdentifier!, category: "lusoft")
    static func log(_ message: String, _ tag: String = "", _ level: LogLevel = .debug, isNeededStackTraceInfo : Bool = false, line : Int = #line, fileName : String = #file) {
        writeLog(message, tag, level, isNeededStackTraceInfo: isNeededStackTraceInfo, line: line, fileName: fileName)
    }
    static func writeLog(_ message: String, _ tag: String = "", _ level: LogLevel = .debug, isNeededStackTraceInfo : Bool = false, line : Int = #line, fileName : String = #file) {
        var logType: OSLogType
        var logMessage = ""
        var emoji = ""
        switch level {
        case .debug :
            logType = .debug
            emoji = "ℹ️"
        case .info:
            logType = .info
            emoji = "✅"
        case .warning:
            logType = .default
            emoji = "⚠️"
        case .error:
            logType = .error
            emoji = "❌"
        case .fatal:
            logType = .fault
            emoji = "🚫"
        }
        logMessage = "\(emoji)[\(currentTime() as! String)][LU]"

        if tag != "" {
            logMessage += "\(tag)]"
        }
        logMessage += ": \(message) -> \(fileName.split(separator: "/").last!) :\(line)\r\n"
        if isNeededStackTraceInfo{
            logMessage += Thread.callStackSymbols.joined(separator: "\r\n")
        }
        #if DEBUG
        saveLog(logMessage)
        #endif
        //os_log("%@", log: log, type: logType, logMessage) //release에서는 <private>로 처리됨
        os_log("%{public}s", log: log, type: logType, logMessage) //release에서도 텍스트 출력
    }
    private static func saveLog(_ logMessage: String) {
        DispatchQueue.global().async {
            if let documentsDirectory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                let currentTime = currentTime(format:"yyyy-MM-dd") as! String
                let fileName = "error_log_\(currentTime).txt"
                let fileURL = documentsDirectory.appendingPathComponent(fileName)
                //print("fileurl:", fileURL) // 경로 이걸로 확인
                do {
                    if FileManager.default.fileExists(atPath: fileURL.path) {
                        let fileHandle = try FileHandle(forWritingTo: fileURL)
                        fileHandle.seekToEndOfFile()
                        if let data = logMessage.data(using: .utf8) {
                            fileHandle.write(data)
                            fileHandle.closeFile()
                        }
                    } else {
                        try logMessage.write(to: fileURL, atomically: false, encoding: .utf8)
                    }
                } catch {
                    fatalError("로그 파일 열기 또는 추가 실패: \(error)")
                }
            }
        }
    }
    
    //url encode
    public static func urlEncode(str : String ) ->String? {
        return str.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "!*'();:@&=+$,/?%#[]{} ").inverted)
    }
    //url decode
    public static func urlDecode(str : String ) ->String? {
        let replaced = str.replacingOccurrences(of: "+", with: " ")
        // 그 다음 percent encoding 디코딩
        return replaced.removingPercentEncoding
    }
    public static func getParameter(url : String, pname: String) ->String? {
        let components = URLComponents(string: url)
        let items = components?.queryItems ?? []
        for item in items {
            print("=>\(item.name), \(item.value)") // memberID, Optional("1234")
            if item.name == pname {
                var r:String? = item.value
                print(r)
                print(r!)
                return r!
            }
        }
        return ""
    }
    // String을 Base64로 인코딩
    public static func base64Encode(_ string: String) -> String? {
        guard let data = string.data(using: .utf8) else { return nil }
        return data.base64EncodedString()
    }

    // Base64를 String으로 디코딩
    public static func base64Decode(_ base64String: String) -> String? {
        guard let data = Data(base64Encoded: base64String) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // Data를 Base64로 인코딩
    public static func base64Encode(data: Data) -> String {
        return data.base64EncodedString()
    }

    // Base64를 Data로 디코딩
    public static func base64Decode(_ base64String: String) -> Data? {
        return Data(base64Encoded: base64String)
    }

    // URL-safe Base64 인코딩 (+, / 대신 -, _ 사용)
    public static func base64EncodeURLSafe(_ string: String) -> String? {
        guard let data = string.data(using: .utf8) else { return nil }
        let base64 = data.base64EncodedString()
        // URL-safe로 변환
        return base64
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // URL-safe Base64 디코딩
    public static func base64DecodeURLSafe(_ base64String: String) -> String? {
        var base64 = base64String
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        
        // 패딩 추가 (길이가 4의 배수가 되도록)
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }
        
        guard let data = Data(base64Encoded: base64) else { return nil }
        return String(data: data, encoding: .utf8)
    }
    public static func getCookie(_ name: String, _ domain: String? = nil) -> String? {
        guard let cookies = HTTPCookieStorage.shared.cookies else {
            return nil
        }
        
        for cookie in cookies {
            self.log("cookie-name: \(cookie.name)")
            if cookie.name == name.md5()  {
                if let domain = domain {
                    if cookie.domain.contains(domain) {
                        return self.base64Decode(cookie.value)
                    }
                } else {
                    return self.base64Decode(cookie.value)
                }
            }
        }
        
        return nil
    }

    public static func setCookie(name: String, value: String, domain: String, path: String = "/", expires: Date? = nil) {
        var properties: [HTTPCookiePropertyKey: Any] = [
            .name: name,
            .value: value,
            .domain: domain,
            .path: path
        ]
        
        if let expires = expires {
            properties[.expires] = expires
        } else {
            // 기본값: 30일 후
            properties[.expires] = Date().addingTimeInterval(30 * 24 * 60 * 60)
        }
        
        if let cookie = HTTPCookie(properties: properties) {
            HTTPCookieStorage.shared.setCookie(cookie)
            HTTPCookieStorage.shared.cookieAcceptPolicy = .always
        }
    }

    public static func deleteCookie(name: String, domain: String? = nil) {
        guard let cookies = HTTPCookieStorage.shared.cookies else {
            return
        }
        
        for cookie in cookies {
            if cookie.name == name {
                if let domain = domain {
                    if cookie.domain.contains(domain) {
                        HTTPCookieStorage.shared.deleteCookie(cookie)
                    }
                } else {
                    HTTPCookieStorage.shared.deleteCookie(cookie)
                }
            }
        }
    }
    public static func toInt(_ str: String?) -> Int {
        guard let str = str, !str.isEmpty else {
            return 0
        }
        return Int(str) ?? 0
    }
    class LoadingView {
        static func show(message: String? = "로딩중...") {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            
            let loadingIndicator = UIActivityIndicatorView(frame: CGRect(x: 10, y: 5, width: 50, height: 50))
            loadingIndicator.hidesWhenStopped = true
            loadingIndicator.style = .medium
            loadingIndicator.startAnimating()
            
            alert.view.addSubview(loadingIndicator)
            
            DispatchQueue.main.async {
                UIApplication.shared.windows.first?.rootViewController?.present(alert, animated: true)
            }
        }
        
        static func hide() {
            DispatchQueue.main.async {
                UIApplication.shared.windows.first?.rootViewController?.dismiss(animated: true)
            }
        }
    }
    class Storage {
        static func set(_ key:String, _ message:String) {
            UserDefaults.standard.set(message, forKey: key)
        }
        static func get(_ key:String) -> String {
            if let r = UserDefaults.standard.string(forKey: key) {
                return r
            }
            return ""
        }
        static func del(_ key:String) {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
    class DeepLink {
        static func adInfo(_ adCode: String, callBack: ((_ dt: [String:Any])->())?) {
            Util.log("InstallReferrer info: \(adCode)")
            let strURL : String = Config.shared.hostUrl! + "api/bridge/ios.php"
            let api = Http(url: strURL, method: Http.Method.POST)
            var dt: [String:Any] = ["code":"", "click_code":"", "url":"", "utm_source":"", "utm_medium":"", "mode":"", "action":"", "limit_tm":0, "popup":0, "subject":""]
            api.add(key: "return_type", value: "json")
            api.add(key: "mode", value: "adInfo")
            api.add(key: "adCode", value: adCode)
            api.returnObject({ [self] (httpDic) in
                Util.log("InstallReferrer-adInfo: \(httpDic)")
                if let result = httpDic["result"] as? String, result == "success"{
                    if let data:[String:Any] = httpDic["data"] as? [String:Any]{
                        dt["code"] = data["dl_code"] ?? ""
                        dt["click_code"] = data["dl_click_code"] ?? ""
                        dt["url"] = data["dl_param_url"] ?? ""
                        dt["popup"] = Util.toInt(data["dl_popup"] as? String)
                        dt["limit_tm"] = Util.toInt(data["limit_tm1"] as? String)
                        dt["subject"] = data["dl_subject"] ?? ""
                        dt["utm_source"] = data["dl_param_utm_source"] ?? ""
                        dt["utm_medium"] = data["dl_param_utm_medium"] ?? ""
                        dt["mode"] = data["dl_param_mode"] ?? ""
                        dt["action"] = data["dl_param_action"] ?? ""
                    }
                }
                callBack?(dt)
            }, failCallback: {
                Util.log("InstallReferrer fail")
                callBack?(dt)
            })
        }
        static func set(_ param: [String:Any]) {
            Util.log("InstallReferrer set: \(param)")
            var mode = "deeplink"
            if let mode1 = param["mode"] as? String, mode1 != "" {
                mode = mode1
            }
            Util.log("mode \(mode)")
            var DeepLink:[String: Any] = [:]
            if let dic = UserDefaults.standard.dictionary(forKey: "deeplink") {
                DeepLink = dic as [String:Any]
            }
            Util.log("txt: \(DeepLink)")
            DeepLink[mode] = param
            Util.log("txt: \(DeepLink)")
            UserDefaults.standard.set(DeepLink, forKey: "deeplink")
            UserDefaults.standard.synchronize()
        }
        static func get(_ mode: String, _ delete: Bool = false) -> [String:Any] {
            Util.log("InstallReferrer get: \(mode) / \(delete)")
            var DeepLink:[String: Any] = [:]
            if let dic = UserDefaults.standard.dictionary(forKey: "deeplink") {
                DeepLink = dic as [String:Any]
            }
            var ret:[String:Any] = [:]
            if let r2 = DeepLink[mode] as? [String:Any] {
                ret = r2
                if let limit_tm1:Int = r2["limit_tm"] as? Int, limit_tm1 > 0 {
                    let currentTime = Int(Date().timeIntervalSince1970)
                    
                    // limit_tm이 현재 시간보다 큰지 확인 (미래인지)
                    if limit_tm1 > currentTime {
                        print("아직 유효합니다. 남은 시간: \(limit_tm1 - currentTime)초")
                        if delete {
                            DeepLink.removeValue(forKey: mode)
                        }
                    } else {
                        print("만료되었습니다")
                        DeepLink.removeValue(forKey: mode)
                        ret = [:]
                    }
                }else{
                    ret = [:]
                }
            }
            UserDefaults.standard.set(DeepLink, forKey: "deeplink")
            UserDefaults.standard.synchronize()
            return ret
        }
    }
    class UserAgentParser {
        static func iosAdCode(from userAgent: String) -> String? {
            let deviceType = parseDeviceType(from: userAgent)
            let osVersion = parseOSVersion(from: userAgent)
            return "\(deviceType!.lowercased())_\(osVersion!)"
        }
        static func parseDeviceType(from userAgent: String) -> String? {
            let lowercased = userAgent.lowercased()
            
            if lowercased.contains("iphone") {
                return "iPhone"
            } else if lowercased.contains("ipad") {
                return "iPad"
            } else if lowercased.contains("macintosh") || lowercased.contains("mac os x") {
                return "Mac"
            }
            
            return nil
        }
        static func parseOSVersion(from userAgent: String) -> String? {
            // 정규표현식: "OS 17_0" 또는 "OS 17.0" 또는 "Mac OS X 10_15_7" 패턴 찾기
            let patterns = [
                "OS\\s+([0-9]+)[_\\.]([0-9]+)",           // iOS: OS 17_0 또는 OS 17.0
                "Mac OS X\\s+([0-9]+)[_\\.]([0-9]+)[_\\.]([0-9]+)"  // macOS: Mac OS X 10_15_7
            ]
            
            for pattern in patterns {
                if let regex = try? NSRegularExpression(pattern: pattern, options: []),
                   let match = regex.firstMatch(in: userAgent, options: [], range: NSRange(location: 0, length: userAgent.utf16.count)) {
                    
                    if match.numberOfRanges >= 3 {
                        let majorVersion = (userAgent as NSString).substring(with: match.range(at: 1))
                        let minorVersion = (userAgent as NSString).substring(with: match.range(at: 2))
                        
                        // macOS의 경우 (3개 버전)
                        if match.numberOfRanges >= 4 {
                            let patchVersion = (userAgent as NSString).substring(with: match.range(at: 3))
                            return "\(majorVersion).\(minorVersion).\(patchVersion)"
                        }
                        
                        // iOS의 경우 (2개 버전)
                        return "\(majorVersion).\(minorVersion)"
                    }
                }
            }
            
            return nil
        }
    }
    public static func getAppStoreVersion(completion: @escaping (String?, Int?) -> Void) {
        guard let bundleId = Bundle.main.bundleIdentifier else {
            Util.log("getAppStoreVersion: bundleId가 nil입니다", "ERROR")
            completion(nil, nil)
            return
        }
        
        //Util.log("getAppStoreVersion: bundleId=\(bundleId)")
        
        // 기기의 국가 코드 자동 가져오기
        let countryCode = Locale.current.regionCode?.lowercased() ?? "kr"
        //Util.log("getAppStoreVersion: countryCode=\(countryCode)")
        
        // URL 인코딩 (bundleId에 특수문자가 있을 수 있음)
        guard let encodedBundleId = bundleId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            Util.log("getAppStoreVersion: bundleId 인코딩 실패", "ERROR")
            completion(nil, nil)
            return
        }
        
        let timestamp = Int(Date().timeIntervalSince1970)
        let urlString = "https://itunes.apple.com/lookup?bundleId=\(encodedBundleId)&country=\(countryCode)&t=\(timestamp)"
        //Util.log("getAppStoreVersion: URL=\(urlString)")
        
        guard let url = URL(string: urlString) else {
            Util.log("getAppStoreVersion: URL 생성 실패", "ERROR")
            completion(nil, nil)
            return
        }
        
        let task = URLSession.shared.dataTask(with: url) { data, response, error in
            // 에러 체크
            if let error = error {
                Util.log("getAppStoreVersion: 네트워크 에러=\(error.localizedDescription)", "ERROR")
                completion(nil, nil)
                return
            }
            
            // 데이터 체크
            guard let data = data else {
                Util.log("getAppStoreVersion: 데이터가 nil입니다", "ERROR")
                completion(nil, nil)
                return
            }
            
            // JSON 파싱
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                Util.log("getAppStoreVersion: JSON 파싱 실패", "ERROR")
                if let responseString = String(data: data, encoding: .utf8) {
                    Util.log("getAppStoreVersion: 응답 내용=\(responseString)")
                }
                completion(nil, nil)
                return
            }
            
            //Util.log("getAppStoreVersion: JSON 응답=\(json)")
            
            // results 배열 체크
            guard let results = json["results"] as? [[String: Any]] else {
                Util.log("getAppStoreVersion: results가 없거나 배열이 아닙니다", "ERROR")
                completion(nil, nil)
                return
            }
            
            if results.isEmpty {
                Util.log("getAppStoreVersion: results 배열이 비어있습니다 (앱이 앱스토어에 없을 수 있음)", "ERROR")
                completion(nil, nil)
                return
            }
            
            guard let firstResult = results.first else {
                Util.log("getAppStoreVersion: firstResult가 nil입니다", "ERROR")
                completion(nil, nil)
                return
            }
            
            //Util.log("getAppStoreVersion: firstResult=\(firstResult)")
            //Util.log("getAppStoreVersion: firstResult의 모든 키=\(firstResult.keys)")
            
            // 모든 필드의 값을 상세히 로깅
            for (key, value) in firstResult {
                //Util.log("getAppStoreVersion: [\(key)] = \(value)")
            }
            
            // version 필드 확인 (앱스토어에 표시되는 버전)
            let version = firstResult["version"] as? String
            
            // 다른 가능한 버전 필드들도 확인
            let bundleVersion = firstResult["bundleVersion"] as? String
            let shortVersion = firstResult["shortVersion"] as? String
            let trackId = firstResult["trackId"] as? Int  // 앱 ID
            
            //Util.log("getAppStoreVersion: version 필드=\(version ?? "nil")")
            //Util.log("getAppStoreVersion: bundleVersion 필드=\(bundleVersion ?? "nil")")
            //Util.log("getAppStoreVersion: shortVersion 필드=\(shortVersion ?? "nil")")
            
            guard let version = version else {
                Util.log("getAppStoreVersion: version 필드가 없습니다", "ERROR")
                completion(nil, nil)
                return
            }
            
            // 버전 문자열 정규화: "1.0" -> "1.0.0" 형식으로 변환
            // iTunes API가 "1.0"을 반환하더라도 "1.0.0" 형식으로 표시
            let normalizedVersion = normalizeVersionString(version)
            //Util.log("getAppStoreVersion: 원본 version=\(version), 정규화된 version=\(normalizedVersion)")
            
            DispatchQueue.main.async {
                completion(normalizedVersion, trackId)
            }
        }
        
        task.resume()
    }
    
    // 버전 문자열을 정규화하는 헬퍼 함수
    // "1.0" -> "1.0.0", "1" -> "1.0.0", "1.0.0" -> "1.0.0"
    private static func normalizeVersionString(_ version: String) -> String {
        let components = version.split(separator: ".").map { String($0) }
        
        // 최소 3개의 컴포넌트가 되도록 패딩
        var normalized = components
        while normalized.count < 3 {
            normalized.append("0")
        }
        
        // 최대 3개의 컴포넌트만 사용
        if normalized.count > 3 {
            normalized = Array(normalized.prefix(3))
        }
        
        return normalized.joined(separator: ".")
    }
    
    // 버전 비교 함수
    // version1과 version2를 비교하여:
    // - version1 < version2: -1 반환
    // - version1 == version2: 0 반환
    // - version1 > version2: 1 반환
    // 예: compareVersion("1.0.0", "1.0.1") -> -1 (1.0.1이 더 큼)
    public static func compareVersion(_ version1: String, _ version2: String) -> Int {
        let v1Components = normalizeVersionString(version1).split(separator: ".").compactMap { Int($0) }
        let v2Components = normalizeVersionString(version2).split(separator: ".").compactMap { Int($0) }
        
        // 컴포넌트 개수가 다를 수 있으므로 최대 길이로 맞춤
        let maxLength = max(v1Components.count, v2Components.count)
        var v1 = v1Components
        var v2 = v2Components
        
        // 부족한 부분은 0으로 채움
        while v1.count < maxLength {
            v1.append(0)
        }
        while v2.count < maxLength {
            v2.append(0)
        }
        
        // 각 컴포넌트를 순서대로 비교
        for i in 0..<maxLength {
            if v1[i] < v2[i] {
                return -1  // version1이 더 작음
            } else if v1[i] > v2[i] {
                return 1   // version1이 더 큼
            }
        }
        
        return 0  // 같음
    }
    
    // 버전 비교 헬퍼 함수 (더 읽기 쉬운 버전)
    // version1이 version2보다 큰지 확인
    public static func isVersionGreater(_ version1: String, than version2: String) -> Bool {
        return compareVersion(version1, version2) > 0
    }
    
    // version1이 version2보다 작은지 확인
    public static func isVersionLess(_ version1: String, than version2: String) -> Bool {
        return compareVersion(version1, version2) < 0
    }
}

