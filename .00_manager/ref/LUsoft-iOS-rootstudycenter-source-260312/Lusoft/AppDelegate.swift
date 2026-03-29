//
//  AppDelegate.swift
//
//  Created by Yeongseong Seo on 2016. 8. 12..
//  Copyright © 2016년 dqnetworks. All rights reserved.
//

import UIKit	
import UserNotifications
import FirebaseCore
import FirebaseFirestore
import FirebaseAuth
import FirebaseMessaging
import Alamofire

#if FLAGNAVER
import NaverThirdPartyLogin
#endif
#if FLAGKAKAO
import KakaoSDKCommon
import KakaoSDKAuth
import KakaoSDKUser
#endif
#if FLAGGOOGLESIGN
import GoogleSignIn
#endif


#if FLAGADMOB
import GoogleMobileAds
#endif


extension AppDelegate : MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        let token:String = fcmToken ?? ""
        Config.shared.fcmToken = token
        print("FCM fcmToken: "+token)
        //    let dataDict:[String: String] = ["token": fcmToken]
        //    NotificationCenter.default.post(name: Notification.Name("FCMToken"), object: nil, userInfo: dataDict)
    }
    /*
    // [START ios_10_data_message]
    func messaging(_ messaging: Messaging, didReceive remoteMessage: MessagingRemoteMessage) {
        print("Received data message: \(remoteMessage.appData)")
    }
    // [END ios_10_data_message]
    */	
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate  {

    var window: UIWindow?
    var myTimer: Timer?
    var timerCount : Int = 0
    let m_localNotiInfo : Util.LocalNotiUserInfo = Util.LocalNotiUserInfo.init()
    var pushInfo: [AnyHashable : Any?]?
    
    internal func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
        Util.log("AppDelegate-01")
        // cookie, allow of all for payment system
        HTTPCookieStorage.shared.cookieAcceptPolicy = HTTPCookie.AcceptPolicy.always
        if #available(iOS 13.0, *) {
            if (UITraitCollection.current.userInterfaceStyle == .dark) {
                //return UIStatusBarStyle.darkContent
                application.statusBarStyle = .darkContent
            }else {
                application.statusBarStyle = .lightContent
                //return UIStatusBarStyle.default
            }
        } else {
            application.statusBarStyle = .darkContent
            // Fallback on earlier versions
            //return UIStatusBarStyle.default
        }
        //application.statusBarStyle = .lightContent
        // push notification, setting
        initNotification(application: application)
        // push notification, start from user action
        if #available(iOS 10, *) {
            if let launchOption = launchOptions,
                var userInfo = launchOption[UIApplication.LaunchOptionsKey.remoteNotification] as? [AnyHashable : Any?]{
                userInfo["isBack"] = true
                pushInfo = userInfo
                //handleRemoteNoti(userInfo: userInfo)
            }
        }else {
//        if let statusbar = UIApplication.shared.value(forKey: "statusBar") as? UIView {
//            statusbar.backgroundColor = UIColor.white
//        }
        }
        self.window?.makeKeyAndVisible()
        //let navi = self.window?.rootViewController as! UINavigationController
        //let rootVC = navi.topViewController as! MainViewController
        
        // FCM 토픽 구독
        if Config.shared.canUseFCM {
            Messaging.messaging().subscribe(toTopic: "news") { error in
                if let error = error {
                    print("토픽 구독 실패: \(error.localizedDescription)")
                } else {
                    print("토픽 구독 성공")
                }
            }
            Messaging.messaging().subscribe(toTopic: "ios-user") { error in
                if let error = error {
                    print("토픽 구독 실패: \(error.localizedDescription)")
                } else {
                    print("토픽 구독 성공")
                }
            }
        }
        
        //google login
        #if FLAGGOOGLESIGN
        GIDSignIn.sharedInstance.restorePreviousSignIn { user, error in
            if error != nil || user == nil {
                // Show the app's signed-out state.
                print("Show the app's signed-out state.")
            } else {
              // Show the app's signed-in state.
                print("how the app's signed-in state.")
            }
        }
        #endif
        //kakao
        #if FLAGKAKAO
        if let infoDic: [String:Any] = Bundle.main.infoDictionary {
            if let SnsLogin: [String:Any] = infoDic["SNSLOGIN"] as? Dictionary {
                if let Kakao: [String:Any] = SnsLogin["KAKAO"] as? Dictionary{
                    if let USE:Bool = Kakao["USE"] as? Bool{
                        if USE {
                            let APPKEY:String = Kakao["APPKEY"] as! String
                            KakaoSDK.shared.initialize(appKey: APPKEY, sdkType: .Swift)
                        }
                    }
                }
            }
        }
        #endif

        return true
    }
    
    func applicationWillResignActive(_ application: UIApplication) {
        Util.log("applicationWillResignActive")
    }
    
    func applicationDidEnterBackground(_ application: UIApplication) {
        Util.log("applicationDidEnterBackground")
        /*
        if #available(iOS 16, *) {
            timerCount = 0;
            myTimer = Timer.init(timeInterval: 1, target: self, selector: #selector(timeDownClick), userInfo:nil, repeats: true)
            RunLoop.main.add(myTimer!, forMode: RunLoop.Mode.default)
            myTimer!.fire()
            
        }
         */
    }

    @objc func timeDownClick() {
        timerCount+=1
        Util.log("timeCount \(timerCount)")
        if timerCount == 300 {
            exit(0)
        }
    }
    public var chkForegroundPush:Bool = false   //푸시 권한 설정상태
    func applicationWillEnterForeground(_ application: UIApplication) {
        Util.log("applicationWillEnterForeground")
        let navi = self.window?.rootViewController as! UINavigationController
        let rootVC = navi.topViewController as! MainViewController
        //백화현상 관련 추가
        rootVC.perform(#selector(MainViewController.checkAndRecoverIfNeeded), with: nil, afterDelay: 0.0)
        
        //Config.shared.vcStack.top()?.alert(title: NSLocalizedString("kDownloadComplete", comment: "kDownloadComplete"),
        /*
        rootVC.alert(title: NSLocalizedString("applicationWillEnterForeground", comment: ""),
                     message: "applicationWillEnterForeground",
                     cancelBtnTitle: NSLocalizedString("닫기", comment: ""),
                     btnTitles: NSLocalizedString("열기", comment: ""),
                     callBack: { (index, isCancel) in
                         print("callback")
                        
                     })
         */
                     
        if self.chkForegroundPush {//푸시 권한 설정 상태면
            chkForegroundPush = false
            //let navi = self.window?.rootViewController as! UINavigationController
            //let rootVC = navi.topViewController as! MainViewController
            rootVC.pushCallback()
        }
        myTimer?.invalidate()
    }
    
    func applicationDidBecomeActive(_ application: UIApplication){
        Util.log("applicationDidBecomeActive")
        application.applicationIconBadgeNumber = 0
        badgeCnt = 0
        myTimer?.invalidate()
    }

    func applicationWillTerminate(_ application: UIApplication){
        Util.log("applicationWillTerminate")
        URLCache.shared.removeAllCachedResponses()
        // do not remove cookies
    }
    func application(_ application: UIApplication, open url: URL, sourceApplication: String?, annotation: Any) -> Bool {
        Util.log("AppDelegate-02")
        #if FLAGGOOGLESIGN
        var handled: Bool
        handled = GIDSignIn.sharedInstance.handle(url)
        if handled {
            return true
        }
        #endif
        return false
    }
    
    internal func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        Util.log("AppDelegate-03 scheme_info => \(url.absoluteString)")
        
        if let scheme = url.scheme{
            print("scheme:"+scheme)
            let bundleID:String = Bundle.main.infoDictionary?["CFBundleIdentifier"] as! String
            let bArr = bundleID.split(separator:".")
            let naverScheme = bArr[0]+".naverlogin"
            if scheme.contains("kakao"){
                #if FLAGKAKAO
                if (AuthApi.isKakaoTalkLoginUrl(url)) {
                    let handled = AuthController.handleOpenUrl(url: url)
                    if handled {
                        return true  // 카카오 URL 처리 성공 시 즉시 반환
                    }
                }
                #endif
            }else if scheme.contains(naverScheme){
                #if FLAGNAVER
                NaverThirdPartyLoginConnection.getSharedInstance()?.application(app, open: url, options: options)
                #endif
            }
        }

        let scheme_info = Config.shared.getURLSchemes().first
        let urlComponent = URLComponents(url: url, resolvingAgainstBaseURL: false);
        let scheme_url : String = urlComponent!.scheme!
        if scheme_url == scheme_info {
            var gotoUrl = Config.shared.hostUrl!
            var absoluteURL : String = (urlComponent?.string)!
            print("absoluteURL1", absoluteURL)
            absoluteURL = absoluteURL.replacingOccurrences(of: scheme_url + "://", with: "")
            if let purl = URL(string: absoluteURL) {
                print("purl", purl)
                var url = ""
                var dt: [String:Any] = ["code":"", "click_code":"", "url":"", "utm_source":"", "utm_medium":"", "mode":"", "action":"", "limit_second":0, "limit_tm":0, "popup":0, "subject":""]
                
                if let code1:String = purl.getParamater("code") {
                    dt["code"] = code1
                }
                if let click_code1:String = purl.getParamater("click_code") {
                    dt["click_code"] = click_code1
                }
                if let url1:String = purl.getParamater("url") {
                    dt["url"] = url1
                    url = url1
                }
                if let popup1 = purl.getParamater("popup") {
                    let popup2 = Int(popup1)
                    dt["popup"] = popup2
                }
                if let subject1 = purl.getParamater("subject") {
                    dt["subject"] = subject1
                }
                if let utm_source1 = purl.getParamater("utm_source"){
                    dt["utm_source"] = utm_source1
                }
                if let utm_medium1 = purl.getParamater("utm_medium") {
                    dt["utm_medium"] = utm_medium1
                }
                if let mode1 = purl.getParamater("mode") {
                    dt["mode"] = mode1
                }
                if let action1 = purl.getParamater("action") {
                    dt["action"] = action1
                }
                if let limit_tm1 = purl.getParamater("limit_tm") {
                    let limit_tm2 = Int(limit_tm1)
                    dt["limit_tm"] = limit_tm2
                }
                if let limit_second1 = purl.getParamater("limit_second") {
                    let limit_second2 = Int(limit_second1)
                    dt["limit_second"] = limit_second2
                }
                print("dt", dt)
                let navi = self.window?.rootViewController as! UINavigationController
                let rootVC = navi.topViewController as! MainViewController
                rootVC.appLink(dt)

                //var url = purl.getParamater("url") as? String
                /*
                if url != "" {
                    if url.substring(from:0, to: 0) == "/" {
                        url = url.substring(from:1, to:url.count-1)
                    }
                    gotoUrl += url
                    let stack = Config.shared.vcStack
                    if stack.top() != nil {
                        while (stack.top() is MainViewController) == false{
                            stack.pop()
                        }
                    }
                    let navi = self.window?.rootViewController as! UINavigationController
                    let rootVC = navi.topViewController as! MainViewController
                    rootVC.setMoveUrl(gotoUrl)
                    //stack.top() as! MainViewController).setMoveUrl(gotoUrl)
                    print("gtourl:", gotoUrl)
                }
                 */
            }

        }
        return true
    }

    // orientation 을 위해서.
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask{
        Util.log("AppDelegate-04")
        return UIInterfaceOrientationMask.all
    }
    
    // MARK : PUSH NOTIFICATION ---------- ---------- ---------- ---------- ---------- ----------
    func initNotification(application: UIApplication){
        Util.log("initNotification-----")
        if Config.shared.isPush() == false {
            return
        }

        if Config.shared.canUseFCM{
            // Firebase Analytics
            FirebaseApp.configure()
            Messaging.messaging().delegate = self

            #if FLAGADMOB
            MobileAds.shared.start(completionHandler: nil)
            #endif
//            NotificationCenter.default.addObserver(self,selector: #selector(self.tokenRefreshNotification),
//                        name: NSNotification.Name.firInstanceIDTokenRefresh,
//                      object: nil)
//            // fcm token udid 출력 for debug
//            log("FCM fcmToken = " + Config.shared.fcmToken)
        }else{
            // udid 출력 for debug
            log("UDID = " + Config.shared.udid)
        }
        //foreground push 수신 처리
        if #available(iOS 10, *){
            UNUserNotificationCenter.current().delegate = self
            let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
            UNUserNotificationCenter.current().requestAuthorization(
                options: authOptions,
                completionHandler: {_, _ in })
       }else{
            let settings: UIUserNotificationSettings =
            UIUserNotificationSettings(types: [.alert, .badge, .sound], categories: nil)
            application.registerUserNotificationSettings(settings)
       }
       application.registerForRemoteNotifications()
         
    }

    // remote push - FCM
    /*
    @objc func tokenRefreshNotification(notification: NSNotification){
        InstanceID.instanceID().instanceID { (result, error) in
            if let error = error {
                print("Error fetching remote instange ID: \(error)")
            } else if let result = result {
                Config.shared.fcmToken = result.token
             }
        }
    }
    */

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data){
        Util.log("AppDelegate-05")
        let devToken = NSData(data: deviceToken)
        var deviceId = String(format: "%@", devToken)
        deviceId = deviceId.replacingOccurrences(of: "<", with: "")
        deviceId = deviceId.replacingOccurrences(of: ">", with: "")
        deviceId = deviceId.replacingOccurrences(of: " ", with: "")
        Messaging.messaging().apnsToken = deviceToken
        Config.shared.udid = deviceId
        print("UDID = " + deviceId)
    }
    
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error){
        Util.log("AppDelegate-06 failRegisterForRemoteNotications- \(error.localizedDescription)")
    }
    
    func application(_ application: UIApplication, didRegister notificationSettings: UIUserNotificationSettings){
        //Util.Log("AppDelegate-07")
        print("AppDelegate-07")
        application.registerForRemoteNotifications()
    }
    
    func application(_ application: UIApplication,
                     handleActionWithIdentifier identifier: String?,
                     forRemoteNotification userInfo: [AnyHashable : Any],
                     completionHandler: @escaping () -> Swift.Void){
        Util.log("AppDelegate-08")
    }
    func handleRemoteNoti(userInfo : [AnyHashable:Any?]){
        Util.log("handleRemoteNoti----------")
        let pushCatID = UserDefaults.standard.value(forKey: "member_id") as? String
        if pushCatID == nil{
            let strData = String(format: "DEBUG : %@ ", userInfo)
            Util.writeLog(strData)
            return
        }
        if let taskID = userInfo["task_id"] as? String{
            Util.writeLog("task_id:"+taskID)
            Util.writeLog("member_id:"+pushCatID!)
            Util.writeLog("url:"+Config.shared.pushUrl! + "/RecvContent")
            let api = Http(url: Config.shared.pushUrl! + "/RecvContent", method: Http.Method.POST)
            api.add(key: "member_id", value: pushCatID!)
            api.add(key: "task_id", value: taskID)
            api.returnObject({ (dic) in
                Util.writeLog("returnObject")
                Util.writeLog(String(format: "dic: %@", dic))
                if let resultCode = dic["mResultCode"] as? String,
                    resultCode != "0",
                    let resultDesc = dic["mResultDesc"] as? String {
                    print("PushCat Error : " + resultDesc)
                    return
                } else if let resultCode = dic["mResultCode"] as? Int,
                    resultCode != 0,
                    let resultDesc = dic["mResultDesc"] as? String{
                    print("PushCat Error : " + resultDesc)
                    return
                }
                
                var contentDic : [String : String]?
                let content = dic["mContent"]
                if content is String{
                    if (content as! String).count > 2 {
                        let data = (content as! String).data(using: String.Encoding.utf8)
                        do{
                            contentDic = try JSONSerialization.jsonObject(with: data!, options: []) as? [String : String]
                        }
                        catch let err{
                            print("handleRemoteNoti - JSONSerialization.jsonObject error : \(err.localizedDescription)")
                        }
                    }
                } else if content is NSDictionary{
                    contentDic = content as? [String : String]
                }
                Util.writeLog(String(format:"contentDic: %@", contentDic!))
                if contentDic != nil {
                    let navi = self.window?.rootViewController as! UINavigationController
                    let rootVC = navi.topViewController as! MainViewController
                    rootVC.handlePushNoti(contentDic: contentDic!)
                }
            })
        } else {
            let strLog : String = String(format:"Test push Result: %@", userInfo)
            Util.writeLog(strLog)
        }
        return
    }
    func handleLocalNoti(userInfo: [AnyHashable:Any?]){
        Util.log("handleLocalNoti")
        print("handleLocalNoti", m_localNotiInfo.Command, m_localNotiInfo.DownloadFileCommand)
        if (userInfo[m_localNotiInfo.Command] as? String) == m_localNotiInfo.DownloadFileCommand {
            let when = DispatchTime.now() + INTERVAL_ALERT
            DispatchQueue.main.asyncAfter(deadline: when) {
                let navi = self.window?.rootViewController as! UINavigationController
                let rootVC = navi.topViewController as! MainViewController

                //Config.shared.vcStack.top()?.alert(title: NSLocalizedString("kDownloadComplete", comment: "kDownloadComplete"),
                rootVC.alert(title: NSLocalizedString("다운로드 완료", comment: ""),
                message: userInfo["fileName"]! as? String,
                cancelBtnTitle: NSLocalizedString("닫기", comment: ""),
                btnTitles: NSLocalizedString("열기", comment: ""),
                callBack: { (index, isCancel) in
                    print("callback")
                    print(isCancel)
                    if isCancel == false {
                       if let filePath = userInfo["filePath"] as? String,let url = URL(string: filePath) {
                           let navi = self.window?.rootViewController as! UINavigationController
                           let rootVC = navi.topViewController as! MainViewController

                           rootVC.docView(url:url);
                        }
                    }
                })
            }
        } else {
            let navi = self.window?.rootViewController as! UINavigationController
            let rootVC = navi.topViewController as! MainViewController
            rootVC.handlePushNoti(contentDic: (userInfo as? [String:String])!)
        }
    }

    // local push
    func application(_ application: UIApplication, didReceive notification: UILocalNotification){
        Util.log("AppDelegate-09")
        print("로컬 푸시", notification.userInfo)
        //Util.showToast(message: "local push")
        let userInfo = notification.userInfo
        handleLocalNoti(userInfo: userInfo!)
    }
    
    // for foreground, ---------- ---------- ---------- ---------- ----------
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable : Any]) {
        // Notification Here below ios 10
        Util.log("AppDelegate-10")
        print(userInfo)
        handleRemoteNoti(userInfo: userInfo)
    }

    // for background and close and remote to local
    @available(iOS 10.0, *)
    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        Util.log("AppDelegate-11 푸시 클릭")
        let userInfo = response.notification.request.content.userInfo
        print("didReceive response", userInfo)
        if let filePath = userInfo["filePath"] as? String,let url = URL(string: filePath) {
            //Util.shared.presentDocumentInteraction(url: url)
            let navi = self.window?.rootViewController as! UINavigationController
            let rootVC = navi.topViewController as! MainViewController
            rootVC.docView(url:url);
            return
        }
        handleRemoteNoti(userInfo: userInfo)
        //Util.handleLocalNoti(userInfo: userInfo)
        completionHandler()
    }
    
    func application(_ application: UIApplication, didReceiveRemoteNotification userInfo: [AnyHashable : Any],fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        Util.log("AppDelegate-12 푸시수신2")
        // Notification Here higher ios 10
        var info = userInfo
        let state = UIApplication.shared.applicationState
        //Util.writeLog("state:" + String(format:"%@", state))
        if (state != UIApplication.State.active) {
            Util.writeLog("active")
            info["isBack"] = true
        }
        Util.writeLog(String(format: "RemoteNotification: %@", userInfo))
        Util.writeLog("1111111111-3-")
        if pushInfo == nil {
            handleRemoteNoti(userInfo: info)
        }
        //handleRemoteNoti(userInfo: info)
        completionHandler(UIBackgroundFetchResult.noData)
        //completionHandler(.newData)

        //배지 숫자 업
        badgeCnt=badgeCnt+1
        application.applicationIconBadgeNumber=badgeCnt
    }
    var badgeCnt = 0//안읽은 배지 카운트
    @available(iOS 10.0, *)
    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void){
        Util.log("AppDelegate-13 푸시수신1")
        
        let userInfo = notification.request.content.userInfo
        if let command : String = userInfo["command"] as? String{
            print("command", command);
            if (command == "download_file"){
            }else{
                Messaging.messaging().appDidReceiveMessage(userInfo)
                return
            }
        }else{
            print("userinfo:", userInfo)
        }
        print("444444", userInfo)
        completionHandler([.alert, .banner,.list, .sound])
    }
    // Universal Link 처리 (iOS 9+)
    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        
        Util.log("Universal Link received")
        //유니버설 링크 사용안함
        /*
        // Universal Link인지 확인
        guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
              let url = userActivity.webpageURL else {
            return false
        }
        
        Util.log("Universal Link URL: \(url.absoluteString)")

        // URL 파싱
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            return false
        }
        print("queryItems:", queryItems)
        // Install ID와 UTM 파라미터 추출
        var code:String = ""
        
        for item in queryItems {
            if item.name == "code", let v = item.value {
                code = v
            }
        }
        
        print("code: \(code ?? "none")")
        //print("UTM Params: \(utmParams)")
        if code != "" {
            let r = Util.InstallReferrer.info(code)
            print("rrrr:", r)
        }
        */
        /*
        // 첫 실행 시에만 저장
        if UserDefaults.standard.value(forKey: "opened") == nil {
            if let installId = installId, !utmParams.isEmpty {
                UserDefaults.standard.set(utmParams, forKey: "utm_parameters")
                UserDefaults.standard.set(installId, forKey: "install_id")
                UserDefaults.standard.synchronize()
                
                print("UTM 파라미터 저장됨: \(utmParams)")
                
                // 서버에 매칭
                matchInstallWithDevice(installId: installId, utmParams: utmParams)
            }
        }
        
        // 앱 내에서 URL 처리
        handleUniversalLinkURL(url: url)
         */
        
        return true
    }
    // MARK : Reachability, ---------- ---------- ---------- ----------
    var m_reachability: Reachability?
    func initReachability() {
        Util.log("initReachability")
        startHost()
    }
    
    func startHost() ->Void {
        Util.log("startHost")
        stopNotifier()
        setupReachability("www.apple.com")
        startNotifier()
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            self.startHost()
        }
    }
    
    func setupReachability(_ hostName: String?) {
        Util.log("setupReachability")
        let reachability: Reachability?
        if let hostName = hostName {
            reachability = Reachability(hostname: hostName)
        } else {
            reachability = Reachability()
        }
        m_reachability = reachability
        self.updateLabelColourWhenReachable(reachability!)
    }
    
    func startNotifier() {
        Util.log("startNotifier")
        do {
            try m_reachability?.startNotifier()
        } catch {
            print("Unable to start\nnotifier")
            return
        }
    }
    
    func stopNotifier() {
        Util.log("stopNotifier")
        m_reachability?.stopNotifier()
        NotificationCenter.default.removeObserver(self, name: .reachabilityChanged, object: nil)
        m_reachability = nil
    }

    private var isConnected: Bool = false;
    func updateLabelColourWhenReachable(_ reachability: Reachability) {
        Util.log("updateLabelColourWhenReachable")
        switch reachability.connection {
        case .wifi:
            if isConnected == false {
                Config.shared.network_status = ConnectionState.wifi.rawValue
                //Util.showToast(message: "Wi-Fi로 접속되었습니다.")
                isConnected = true
            }
            break
        case .cellular:
            if isConnected == false {
                Config.shared.network_status = ConnectionState.wan.rawValue
                //Util.showToast(message: "셀룰러로 접속되었습니다.")
                isConnected = true
            }
            break
        case .none:
            if isConnected == true {
                Config.shared.network_status = ConnectionState.none.rawValue
                Util.showToast(message: "네트워크 상태가 원활하지 않습니다.\n작동에 오류가 발생할 수 있습니다.")
                isConnected = false
            }
            break
        }
    }
}


