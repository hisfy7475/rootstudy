//
//  ViewController.swift
//
//  Created by Yeongseong Seo on 2016. 8. 12..
//  Copyright © 2016년 dqnetworks. All rights reserved.
//

import UIKit
import WebKit
import Social
import StoreKit
import ContactsUI
import SafariServices
import MobileCoreServices
import Alamofire

import FirebaseCore
import FirebaseFirestore
import FirebaseAuth
import FirebaseMessaging

import CoreLocation
import AuthenticationServices

#if FLAGNAVER
import NaverThirdPartyLogin
#endif
#if FLAGKAKAO
import KakaoSDKAuth
import KakaoSDKUser
import KakaoSDKCommon
#endif
#if FLAGGOOGLESIGN
import GoogleSignIn
#endif
	
#if FLAGADMOB
import GoogleMobileAds
import CoreLocation
import AuthenticationServices
#endif

//백화현상 관련 추가
final class SharedWebProcessPool {
    static let shared = WKProcessPool()
}

class MainViewController: UIViewController,
                          UIDocumentInteractionControllerDelegate,
                          SKStoreProductViewControllerDelegate,
                          UIImagePickerControllerDelegate,
                          WKDownloadDelegate,
                          WKUserInterfaceDelegate,
                          WQPhotoAlbumProtocol,
                          WKUIDelegate,
                          WKNavigationDelegate,
                          UIActionSheetDelegate,
                          UIDocumentPickerDelegate,
                          ASAuthorizationControllerDelegate,
                          ASAuthorizationControllerPresentationContextProviding{
    @IBOutlet weak var m_introView : UIImageView!
    @IBOutlet weak var m_introLogo : UIImageView!
    @IBOutlet weak var m_loadingView : GifLoadingImageView!
    @IBOutlet weak var m_containerView : UIView!
    @IBOutlet weak var m_indicatorView : UIView!
    @IBOutlet weak var jumpButton: UIButton!
    @IBOutlet weak var m_mainWebview : WKWebView!
    

    private let m_webConfiguration = WKWebViewConfiguration()
    //private var m_mainWebview : WKWebView!
    private var m_childView = [WKWebView]()
    private var m_childIndex : Int = 0;
    #if FLAGADMOB
    private var m_admobBannerView: BannerView!
    private var m_admobBannerViewOx: Bool = false
    private var m_mainWebviewBottomConstraint: NSLayoutConstraint?
    #endif

    private var orientationList : [String]? = nil
    public var moveUrlStr : String? = nil
    //private var callbackWKUserInterface : WKUserInterface?
    private var callbackWKUserInterface : WKUserInterfaceDefault?

    private var m_isImageCrop = false
    private var m_callbackImage : ((_ img: UIImage?)->())?
    private var jsonArray : NSMutableArray? = nil
    private var codeType : String!
    private var appStarted: Bool = false
    
   
    #if FLAGNAVER
    var naverLoginConn = NaverThirdPartyLoginConnection.getSharedInstance()
    #endif
    override var preferredStatusBarStyle: UIStatusBarStyle{
        Util.log("preferredStatusBarStyle")
        if #available(iOS 13.0, *) {
            if (UITraitCollection.current.userInterfaceStyle == .dark) {
                return UIStatusBarStyle.darkContent
            }else {
                return UIStatusBarStyle.default
            }
        } else {
            // Fallback on earlier versions
            return UIStatusBarStyle.default
        }
    }

    @objc func navigationHidden(hidden : Bool) -> Void {
        Util.log("navigationHidden")
        self.jumpButton.addTarget(self, action:#selector(doWindowFinish), for: .touchUpInside)
        self.jumpButton.isHidden = hidden
    }

    // MARK: Function, Default Start!! ---------- ---------- ---------- ---------- ----------
    override func viewDidLoad(){
        super.viewDidLoad()
        Util.log("viewDidLoad")
        
        setIntroBackgroundColor()
        self.navigationController?.delegate = self
        self.navigationController?.navigationBar.isHidden = true;
        
        let txt = Util.getCookie("PHPSESSID")
        Util.log("phpssion id:\(txt)" )

        // intro image
        
        if Config.shared.isShowIntroImage == true{
            self.m_introLogo.image = UIImage(named:"intro_logo")
            self.m_introLogo.isHidden = false
            self.m_introView.image = UIImage(named:"intro")
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                self.m_introView.isHidden = true
                self.m_introLogo.isHidden = true
                self.setBackgroundColor()
            }
        }else{
            self.m_introLogo.isHidden = true
            self.m_introView.isHidden = true
        }
         
         
        // loading image
        if Config.shared.isShowLoadingImage == true{
            let ivUrl1 = Bundle.main.url(forResource: "loading", withExtension: "gif")
            if let ivUrl = Bundle.main.url(forResource: "loading", withExtension: "gif") {
                self.m_loadingView.setGifImage(url: ivUrl, complete: nil)
                self.m_loadingView.isHidden = false;
            }
        }
        // webview
        //initChildView()
        initWebConfigration();
        initMainWebview()
        //푸시 클릭으로 들어온 경우
        let delegate = UIApplication.shared.delegate as? AppDelegate
        let pushInfo = delegate?.pushInfo
        if pushInfo != nil {
            Util.writeLog(String(format:"push:%@", pushInfo!))
            DispatchQueue.main.asyncAfter(deadline: .now() + 5.0) { [weak self] in
                // self?. 은 [weak self]와 함께 사용하여 메모리 누수(retain cycle) 방지
                guard let self = self else { return } // self가 해제된 경우 실행하지 않음
                
                Util.writeLog("10초 후 실행되었습니다!")
                delegate?.handleRemoteNoti(userInfo: pushInfo!)
                delegate?.pushInfo = nil
            }
            
        }

        // QR
        NotificationCenter.default.addObserver(self,
                            selector: #selector(doPostQRMessage),
                    name: NSNotification.Name(rawValue: "QRDATA"),
                                    object: nil)
        IAPManager.shared.SetIAPAvail(isAvail: Config.shared.isIAP);
        
        //백화현상관련 옵저버 추가
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(checkAndRecoverIfNeeded),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        
        #if FLAGADMOB
        //앱 시작시 전면 광고
        if Config.shared.isAdmobFullFirst {
            doAdMob(type:"full", view:"show")
        }
        if Config.shared.isAdmobBannerFirst {
            doAdMob(type:"banner", view:"show")
        }
        #endif
        
        //캡처 toast
        if let lusoftOptions = Bundle.main.infoDictionary?["LusoftOptions"] as? [String : AnyObject] {
            if let captureNoti = lusoftOptions["CaptureNoti"] as? Bool {
                if captureNoti {
                    //스샷 감지
                    NotificationCenter.default.addObserver(self, selector: #selector(alertPreventScreenCapture),
                                                           name: UIApplication.userDidTakeScreenshotNotification, object: nil)
                    //스크린 레코딩 감지
                    NotificationCenter.default.addObserver(self, selector: #selector(alertPreventScreenCapture),
                                                           name: UIScreen.capturedDidChangeNotification, object: nil)
                }
            }	
        }
        Util.log("viewDidLoad End")
    }
    //백화현상 관련 추가
    @objc public func checkAndRecoverIfNeeded() {
        Util.log("checkAndRecoverIfNeeded")
        // WebView가 빈 상태거나 about:blank면 복구
        if m_mainWebview.url == nil || m_mainWebview.url?.absoluteString == "about:blank" {
            if let start = Config.shared.startUrl, let url = URL(string: start) {
                m_mainWebview.load(URLRequest(url: url))
            }
        }
    }
    //앱 시작시 백그라운 - intro 표시될대
    func setIntroBackgroundColor() {
        Util.log("setIntroBackgroundColor")
        var co = UIColor(.white)
        let infoDic = Bundle.main.infoDictionary?["BUILDER_SETTING"] as! [String : AnyObject]
        print("setIntroBackgroundColor:", infoDic)
        if let cor = infoDic["COLOR_INTRO_BACKGROUND"] as? String {
            print("color:", cor)
            co = UIColor(hexCode:cor)
        }
        self.m_introView.backgroundColor = co
        self.view.backgroundColor = co


    }
    //홈바 배경색
    private var bottomHeightConstraint: NSLayoutConstraint?
    private let bottomSafeAreaView: UIView = {
        Util.log("bottomSafeAreaView")
        let infoDic = Bundle.main.infoDictionary?["BUILDER_SETTING"] as! [String : AnyObject]
        let v = UIView()
        if let  cor = infoDic["COLOR_HOMEBAR"] as? String, cor != "" {
            let homeBarColor = UIColor(hexCode:cor)
            v.backgroundColor = homeBarColor   // 원하는 색
            v.translatesAutoresizingMaskIntoConstraints = false
        }
        return v
    }()
    
    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        bottomHeightConstraint?.constant = view.safeAreaInsets.bottom
        bottomSafeAreaView.isHidden = view.safeAreaInsets.bottom == 0
    }
    //intro 종료후
    func setBackgroundColor() {
        Util.log("setBackgroundColor")
        var co = UIColor(.white)
        let infoDic = Bundle.main.infoDictionary?["BUILDER_SETTING"] as! [String : AnyObject]
        if let cor = infoDic["COLOR_BACKGROUND"] as? String {
            print("setBackgroundColor:", cor)
            co = UIColor(hexCode:cor)
        }
        self.m_introView.backgroundColor = co
        self.view.backgroundColor = co
        if let window = UIApplication.shared.windows.first {
            let tag = 987654
            if window.viewWithTag(tag) == nil {
                let statusBar = UIView(frame: window.windowScene?.statusBarManager?.statusBarFrame ?? CGRect.zero)
                statusBar.backgroundColor = co // 원하는 색상으로 변경
                statusBar.tintColor = UIColor.white
                window.addSubview(statusBar)
            }
        }
        //self.introBack.image = nil
        //self.introBack.backgroundColor = co
        //홈바 배경색
        if let homeBarColor = infoDic["COLOR_HOMEBAR"] as? String {
            view.addSubview(bottomSafeAreaView)
            NSLayoutConstraint.activate([
                bottomSafeAreaView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                bottomSafeAreaView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
                bottomSafeAreaView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
            ])
            bottomHeightConstraint = bottomSafeAreaView.heightAnchor.constraint(equalToConstant: view.safeAreaInsets.bottom)
            bottomHeightConstraint?.isActive = true
            
            // 하단 인셋이 0이면 자동 숨김
            bottomSafeAreaView.isHidden = view.safeAreaInsets.bottom == 0
        }
    }

    
    @objc func alertPreventScreenCapture(notification:Notification) -> Void {
    //@objc func alertPreventScreenCapture() -> Void {
        Util.log("lertPreventScreenCapture")
        print("UIScreen.main.isCaptured", UIScreen.main.isCaptured)
        if notification.name == UIApplication.userDidTakeScreenshotNotification {
            print("스크린샷 감지됨!")
            // 스크린샷은 한 번만 호출됨
            // 즉시 화면 숨기기
             DispatchQueue.main.async {
                 self.view.isHidden = true
                 
                 // 0.1초 후 화면 복원
                 DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                     self.view.isHidden = false
                 }
             }
        } else if notification.name == UIScreen.capturedDidChangeNotification {
            print("화면 녹화 상태 변경:", UIScreen.main.isCaptured)
            // 녹화는 시작/종료 두 번 호출됨
        }
    
        if UIScreen.main.isCaptured {
            print("aaaaaa")
        }else{
            print("bbbbb")
        }
        Util.showToast(message: "capture_no".lang()!)
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        Util.log("viewWillAppear")
        // PermissionVC가 종료되었는지 체크
        let opened = Util.Storage.get("opened")
        if opened == "2" {
            Util.Storage.set("opened", "1")
            // PermissionVC가 종료되고 돌아온 경우
            Util.log("PermissionVC 종료됨 - 웹뷰 로드")
            // 웹뷰 로드 등 후속 작업
            firstRun()
        }
    }
    //설치후 첫실행
    public func firstRun() {
        checkApplink()
    }
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        let opened = Util.Storage.get("opened")
        Util.log("viewDidAppear \(opened)")
        //self.performSegue(withIdentifier: "PERMISSION", sender:nil)
        if UserDefaults.standard.value(forKey: "opened") != nil {
            if let move = self.moveUrlStr,
                let moveUrl = URL(string: move) {
                self.m_mainWebview.load(URLRequest(url: moveUrl))
            }else  {
//                if let startUrl = Config.shared.startUrl,
//                    let url = URL(string: startUrl){
//                    self.m_mainWebview.load(URLRequest(url: url))
//                }
            }
        } else {
            if Util.isPermisson() == true{
                self.performSegue(withIdentifier: "PERMISSION", sender:nil)
            }else{
                if let move = self.moveUrlStr,
                    let moveUrl = URL(string: move) {
                    self.m_mainWebview.load(URLRequest(url: moveUrl))
                }
            }
        }
    }
    
    override func viewWillDisappear(_ animated : Bool) {
        super.viewWillDisappear(animated)
        Util.log("viewWillDisappear")
        self.children.forEach { child in
            child.willMove(toParent: nil)
            child.view.removeFromSuperview()
            child.removeFromParent()
        }
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        Util.log("didReceiveMemoryWarning")
        URLCache.shared.removeAllCachedResponses()
    }
    
    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        Util.log("viewWillTransition")
        if UIDevice.current.orientation.isLandscape {
            print("Landscape")
        } else {
            print("Portrait")
        }
    }

    override var shouldAutorotate: Bool {
        return true
    }
    
    override public var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        get {
            if orientationList == nil{
                orientationList = Bundle.main.infoDictionary?["UISupportedInterfaceOrientations"] as? [String]
            }

            var mask : UIInterfaceOrientationMask = []
            for val in orientationList!{
                switch val
                {
                case "UIInterfaceOrientationPortrait":
                    mask.insert(UIInterfaceOrientationMask.portrait)
                case "UIInterfaceOrientationLandscapeRight":
                    mask.insert(UIInterfaceOrientationMask.landscapeRight)
                case "UIInterfaceOrientationLandscapeLeft":
                    mask.insert(UIInterfaceOrientationMask.landscapeLeft)
                case "UIInterfaceOrientationPortraitUpsideDown":
                    mask.insert(UIInterfaceOrientationMask.portraitUpsideDown)
                default:
                    break
                }
            }

            return mask
        }
    }
    // MARK: Function, Default End!! ---------- ---------- ---------- ---------- ----------
    
    func initWebConfigration() -> Void {
        Util.log("initWebConfigration")
        //let webController = WKUserInterface()
        let webController = WKUserInterfaceDefault()
        webController.interfaceDelegate = self
        m_webConfiguration.processPool = SharedWebProcessPool.shared//백화현상 관련 추가
        m_webConfiguration.preferences.javaScriptCanOpenWindowsAutomatically = true;
        m_webConfiguration.preferences.javaScriptEnabled = true
        if #available(iOS 10.0, *) {
            //m_webConfiguration.mediaTypesRequiringUserActionForPlayback = .all
        } else if #available(iOS 9.0, *){
            m_webConfiguration.requiresUserActionForMediaPlayback = false
            m_webConfiguration.mediaPlaybackAllowsAirPlay = true;
        }else{
            m_webConfiguration.mediaPlaybackRequiresUserAction = false
        }

        m_webConfiguration.allowsInlineMediaPlayback = true;
        m_webConfiguration.allowsAirPlayForMediaPlayback = true;
        m_webConfiguration.allowsPictureInPictureMediaPlayback = true;
        m_webConfiguration.userContentController = webController;
        m_webConfiguration.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        
    }
    
    func initMainWebview() -> Void {
        Util.log("initMainWebview")
        //        DispatchQueue.main.async {
        //        webView = WKWebView(frame: self.view.frame)

        var rect = self.m_containerView.frame
        print("rect----", rect, self.view.frame)
        //rect = self.view.frame
        rect.origin.y = 0;
        self.m_mainWebview = WKWebView(frame: rect, configuration: self.m_webConfiguration)
        //self.m_mainWebview.configuration = self.m_webConfiguration
        
        self.m_mainWebview.navigationDelegate = self
        self.m_mainWebview.uiDelegate = self
        
        self.m_mainWebview.scrollView.bounces = false
        self.m_mainWebview.scrollView.showsHorizontalScrollIndicator = false
        self.m_mainWebview.scrollView.showsVerticalScrollIndicator = false
        self.m_mainWebview.backgroundColor = UIColor.white
        
        
        let language = UserDefaults.standard.array(forKey: "AppleLanguages")?.first as! String // 초기에 "ko-KR" , "en-KR" 등으로 저장되어있음
        let index = language.index(language.startIndex, offsetBy: 2)
        let languageCode = String(language[..<index]) //"ko" , "en" 등
        let strVersion : String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as! String
        let strBuild : String = Bundle.main.infoDictionary?["CFBundleVersion"] as! String
        var strName : String = Bundle.main.infoDictionary?["CFBundleName"] as! String
        let oUserAgent = WKWebView().value(forKey: "userAgent")
        let userAgent = "\(oUserAgent!) IPHONE lusoft/\(strName) aVer/\(strVersion) aBuild/\(strBuild) cVer/\(Config.shared.coreVersion) lang/\(languageCode)"
        self.m_mainWebview.customUserAgent = userAgent
        
        self.m_mainWebview.translatesAutoresizingMaskIntoConstraints = false
        self.m_containerView.addSubview(self.m_mainWebview);
        
        #if FLAGADMOB
        // FLAGADMOB일 때는 bottom constraint를 변수로 저장
        let bottomConstraint = self.m_mainWebview.bottomAnchor.constraint(equalTo: self.m_containerView.bottomAnchor)
        self.m_mainWebviewBottomConstraint = bottomConstraint

        NSLayoutConstraint.activate([
            self.m_mainWebview.topAnchor.constraint(equalTo: self.m_containerView.topAnchor),
            bottomConstraint,
            self.m_mainWebview.leadingAnchor.constraint(equalTo: self.m_containerView.leadingAnchor),
            self.m_mainWebview.trailingAnchor.constraint(equalTo: self.m_containerView.trailingAnchor)
        ])
        #else
        // FLAGADMOB가 아닐 때는 기존대로
        NSLayoutConstraint.activate([
            self.m_mainWebview.topAnchor.constraint(equalTo: self.m_containerView.topAnchor),
            self.m_mainWebview.bottomAnchor.constraint(equalTo: self.m_containerView.bottomAnchor),
            self.m_mainWebview.leadingAnchor.constraint(equalTo: self.m_containerView.leadingAnchor),
            self.m_mainWebview.trailingAnchor.constraint(equalTo: self.m_containerView.trailingAnchor)
        ])
        #endif
        
        NSLayoutConstraint.activate([
            self.m_mainWebview.topAnchor.constraint(equalTo: self.m_containerView.topAnchor),
            self.m_mainWebview.bottomAnchor.constraint(equalTo: self.m_containerView.bottomAnchor),
            self.m_mainWebview.leadingAnchor.constraint(equalTo: self.m_containerView.leadingAnchor),
            self.m_mainWebview.trailingAnchor.constraint(equalTo: self.m_containerView.trailingAnchor)
        ])
         

        if #available(iOS 16.4, *) {
            #if DEBUG
            self.m_mainWebview.isInspectable = true
            #endif
        }
        if let startUrl = Config.shared.startUrl,
            let url = URL(string: startUrl){
            Util.log("web first load: \(startUrl)")
            self.m_mainWebview.load(URLRequest(url: url))
        }

    }
    @objc(webView:startURLSchemeTask:) public func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        Util.log("webView objc-01")
        // URL 스킴 처리 로직
        // 예: 우리카드 앱에서 전달받은 URL 처리
        if let url = urlSchemeTask.request.url {
            // URL 처리 로직
            // 필요한 경우 응답 생성
            let response = URLResponse(url: url,
                                    mimeType: "text/html",
                                    expectedContentLength: -1,
                                    textEncodingName: nil)
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
        }
    }
    
    @objc(webView:stopURLSchemeTask:) public func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        Util.log("webView objc-02")
        // URL 스킴 태스크 중지 처리
    }
    func initChildView() -> Void {
        Util.log("initChildView")
        for _ in 0 ..< COUNT_MAX_CHILD_VIEW {
            let rect = self.m_containerView.frame;
            let childView : WKWebView = WKWebView(frame: CGRect(x: rect.size.width, y:0,
                                                                width: rect.size.width,
                                                                height: rect.size.height),
                                                  configuration: m_webConfiguration)
            childView.autoresizingMask = UIView.AutoresizingMask(rawValue: UIView.AutoresizingMask.flexibleWidth.rawValue | UIView.AutoresizingMask.flexibleHeight.rawValue
                | UIView.AutoresizingMask.flexibleTopMargin.rawValue | UIView.AutoresizingMask.flexibleBottomMargin.rawValue
                | UIView.AutoresizingMask.flexibleLeftMargin.rawValue | UIView.AutoresizingMask.flexibleRightMargin.rawValue)
            childView.uiDelegate = self
            childView.navigationDelegate = self
            childView.scrollView.bounces = false
            childView.scrollView.showsHorizontalScrollIndicator = false
            childView.scrollView.showsVerticalScrollIndicator = false
            
            m_childView.append(childView);
        }
    }

    // MARK: Function, GIF Loading Start!! ---------- ---------- ---------- ---------- ----------
    func doShowLoading(){
        Util.log("doShowLoading")
        print("doShowLoading", Config.shared.isShowLoadingImage)
        /*
        if Config.shared.isShowLoadingImage == true {
            self.m_loadingView.start()
            self.m_loadingView.isHidden = false
            if #available(iOS 10.0, *) {
                Timer.scheduledTimer(withTimeInterval: 5.0, repeats: false){_ in
                    self.doStopLoading();
                }
            } else {
                Timer.scheduledTimer(timeInterval: 5.0, target: self, selector: #selector(self.doStopLoading), userInfo: nil, repeats: false)
            }
        } else {
            self.m_indicatorView.isHidden = true
            self.m_loadingView.isHidden = true
            //self.m_introView.isHidden = true
        }
         */
    }
    
    @objc func doStopLoading() {
        self.m_loadingView.stop()
        self.m_loadingView.isHidden = true
        self.m_indicatorView.isHidden = true
    }
    // MARK: Function, GIF Loading End!! ---------- ---------- ---------- ---------- ----------
    
    // MARK: Function notification Start!! ---------- ---------- ---------- ---------- ----------
    func handlePushNoti(contentDic: [String:String]){
        Util.log("handlePushNoti")
        print(contentDic)
        var title:String = Bundle.main.infoDictionary?["CFBundleDisplayName"] as! String
        var msg:String = ""
        var mode:String = ""
        var url:String = ""
        var popup:String = "Y"
        var hostUrl = ""
        var moveUrl:String = ""

        if let hostUrl1 = Config.shared.hostUrl, let lastChar = hostUrl1.last {
            if lastChar == "/" {
                hostUrl = hostUrl1.substring(from:0, to:hostUrl1.count-2)
            }else{
                hostUrl = hostUrl1
            }
        }
        if let mode1 = contentDic["mode"] {
            mode = mode1
        }
        if let url1 = contentDic["url"] {
            url = url1
        }
        if let popup1 = contentDic["popup"] {
            popup = popup1
        }
        if let msg1 = contentDic["msg"] {
            msg = msg1
        }
        if mode == "goto" || mode == "move"{
            if url != "" {
                moveUrl = hostUrl + url
            }
        }else{
            
            if mode == "process_coupon_use" {
                moveUrl = hostUrl + "/member/coupon_list.php"
            }else if mode == "memo", let me_idx = contentDic["me_idx"] {
                moveUrl = hostUrl + "member/memo_view.php?gubun=receive&me_idx=" + me_idx
            }else if mode == "board", let bc_code = contentDic["bc_code"] {
                if let bd_idx = contentDic["bd_idx"], bd_idx.count > 0 {
                    moveUrl = hostUrl + "board/board_view.php?bc_code=" + bc_code + "&bd_idx=" + bd_idx
                }else{
                    moveUrl = hostUrl + "board/board_view.php?bc_code=" + bc_code
                }
            }else if mode == "page", let pg_idx = contentDic["pg_idx"] {
                moveUrl = hostUrl + "page/page.php?pg_idx=" + pg_idx
            }else if mode == "shop_order", let od_num = contentDic["od_num"] {
                moveUrl = hostUrl + "shop/order_view.php?od_num=" + od_num
            }else if mode == "shop_list", let cate_code = contentDic["cate_code"] {
                moveUrl = hostUrl + "shop/product_list.php?cate_code=" + cate_code
            }else if mode == "shop", let pd_num = contentDic["pd_num"] {
                moveUrl = hostUrl + "shop/product_view.php?pd_num=" + pd_num
            }else if mode == "reservation", let re_idx = contentDic["re_idx"] {
                moveUrl = hostUrl + "reservation/reservation_view.php?re_idx=" + re_idx
            }else if mode == "room", let rr_idx = contentDic["rr_idx"] {
                moveUrl = hostUrl + "reservation/room_view.php?rr_idx=" + rr_idx
            }
        }
        Util.writeLog("moveUrl:" + moveUrl)
        Util.writeLog("popup:"+popup)
        if popup == "Y" {
            if moveUrl != "" {
                alert(title: title, message: msg, cancelBtnTitle: "닫기".lang()!, btnTitles:"이동".lang()!, callBack: { (index, isCancel) in
                    self.m_mainWebview.load(URLRequest(url: URL(string: moveUrl)!))
                })
            }else{
                alert(title: title, message: msg,  btnTitles:"닫기".lang()!, callBack: { (index) in
                    //self.m_mainWebview.load(URLRequest(url: URL(string: moveUrl)!))
               })
            }
        }else{
            if moveUrl != "" {
                Util.writeLog("abc:" + moveUrl)
                //self.m_mainWebview.load(URLRequest(url: moveUrl))
                self.m_mainWebview.load(URLRequest(url: URL(string: moveUrl)!))
            }
        }
        
    }
    // MARK: Function notification End!! ---------- ---------- ---------- ---------- ----------
    
    // MARK: Image picker viewcontroller
    public func setImagePickerController(source: UIImagePickerController.SourceType, crop: Bool, complete: ((_ img: UIImage?)->())?){
        Util.log("setImagePickerController")
        if UIImagePickerController.isSourceTypeAvailable(source){
            self.m_isImageCrop = crop
            self.m_callbackImage = complete

            let imagePicker = UIImagePickerController()
            imagePicker.delegate = self
            imagePicker.allowsEditing = crop
            imagePicker.sourceType = source
            imagePicker.mediaTypes = [kUTTypeImage as String]
            if #available(iOS 9.1, *){
                imagePicker.mediaTypes.append(kUTTypeLivePhoto as String)
            }

            imagePicker.modalTransitionStyle = UIModalTransitionStyle.flipHorizontal
            self.present(imagePicker, animated: true, completion: {
                Config.shared.vcStack.push(item: imagePicker)
            })
        }
    }
    
    public func setVideoPickerController(source: UIImagePickerController.SourceType, crop: Bool, complete: ((_ img: UIImage?)->())?){
        Util.log("setVideoPickerController")
        if UIImagePickerController.isSourceTypeAvailable(source){
            let imagePicker = UIImagePickerController()
            imagePicker.delegate = self
            imagePicker.allowsEditing = crop
            imagePicker.sourceType = source
            imagePicker.mediaTypes = [kUTTypeMovie as String]

            imagePicker.modalTransitionStyle = UIModalTransitionStyle.flipHorizontal
            self.present(imagePicker, animated: true, completion: {
                Config.shared.vcStack.push(item: imagePicker)
            })
        }
    }

    func savedImagesAlbum(image: UIImage, didFinishSavingWithError error: NSError?, contextInfo: AnyObject) {
        print("저징")
    }
    // image picker controller delegate
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
        Util.log("imagePickerController")
        if let image = info[UIImagePickerController.InfoKey(rawValue: UIImagePickerController.InfoKey.originalImage.rawValue)] as? UIImage{
            picker.dismiss(animated: true, completion: {
                Config.shared.vcStack.pop()
                if self.m_isImageCrop
                {
                    self.m_callbackImage?(image)
                }
                else
                {
                    self.m_callbackImage?(image)
                }
            })
        } else {
            picker.dismiss(animated: true, completion: {
                Config.shared.vcStack.pop()
                let videoURL: URL = (info[UIImagePickerController.InfoKey(rawValue: UIImagePickerController.InfoKey.mediaURL.rawValue)] as! URL)
                UISaveVideoAtPathToSavedPhotosAlbum(videoURL.relativePath, self, nil, nil)
//                UIVideoAtPathIsCompatibleWithSavedPhotosAlbum(videoURL.absoluteString)
            })
        }
    }
    
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController){
        Util.log("imagePickerControllerDidCancel")
        picker.dismiss(animated: true, completion: {
            Config.shared.vcStack.pop()
            self.m_callbackImage?(nil)
        })
    }
    
    // MARK: Function, From WKWebView Start!! ---------- ---------- ---------- ---------- ----------
    public func setMoveUrl(_ val: String){
        Util.log("setMoveUrl \(val)")
        self.moveUrlStr = val;
        if self.m_mainWebview != nil{
            if let url = URL(string: self.moveUrlStr!) {
                self.m_mainWebview.load(URLRequest(url: url))
            }
        }
    }


    public func checkApplink() {
        Util.log("checkApplink")
        let device = UIDevice.current
        Util.log("device \(device)")
        let oUserAgent = WKWebView().value(forKey: "userAgent") as? String ?? ""
        let adCode = Util.UserAgentParser.iosAdCode(from: oUserAgent)
        Util.log("UserAgent ad code \(adCode ?? "알 수 없음")")
        let ret = Util.DeepLink.adInfo(adCode!, callBack: { (dt) in
            Util.log("callback: \(dt)")
            self.appLink(dt)
        })
        
        
    }
    //app link
    public func appLink(_ data: [String:Any]) {
        Util.log("appLink: \(data) / appStarted: \(appStarted)")
        var dt:[String:Any] = data as! [String:Any]
        dt["subject"] = Util.urlDecode(str: dt["subject"] as! String)
        var mode = dt["mode"] as? String ?? ""
        if mode == "" {
            return
        }
        Util.DeepLink.set(dt)//스토리지 저장
        var url = dt["url"] as? String ?? ""
        Util.log("url \(url)")
        if url != ""  {
            let click_code = dt["click_code"] as? String ?? ""
            let subject = dt["subject"] as? String ?? ""
            let popup = dt["popup"] as? Int ?? 0
            if url.substring(from:0, to: 0) == "/" {
                var gotoUrl = Config.shared.hostUrl!
                url = gotoUrl + url.substring(from:1, to:url.count-1)
            }
            Util.log("popup \(popup) \(subject)")
            if popup == 1 && subject != "" {
                let today:String = Util.currentTime(format: "yyyy-MM-dd") ?? ""
                let popup_yn = Util.Storage.get("applink_\(click_code)")
                let subject = Util.urlDecode(str: dt["subject"] as! String)
                //Util.log("popup yes \(subject) / \(today)")
                if popup_yn != today {
                    alert(title: subject, message: "",  cancelBtnTitle: "닫기".lang()!, btnTitles:"이동하기".lang()!,"오늘은 보지 않기".lang()!, callBack: { (index, isCancel) in
                        //self.m_mainWebview.load(URLRequest(url: URL(string: moveUrl)!))
                        Util.log("이동 클릭 \(index) / \(isCancel)")
                        if !isCancel {
                            if index == 0 {
                                //self.setMoveUrl(gotoUrl)
                                self.m_mainWebview.load(URLRequest(url: URL(string: url)!))
                            }else if index == 1 {
                                Util.Storage.set("applink_\(click_code)",  today)
                            }
                        }
                    })
                    return
                }
            }
            Util.log("popup no - gotuurl: \(url) - appStarted: \(appStarted)")
            if (appStarted) {
                setMoveUrl(url)
            }else{
                self.moveUrlStr = url
            }
        }
    }
    func doDeeplinkInfo(mode:String, cb: String, delete: Bool) -> Void {
        Util.log("doDeeplinkInfo-type: \(mode) / \(cb) /view: \(delete)")
        var rfunc = cb
        if cb == "" {
            rfunc = "result_deeplink_info"
        }
        var md = mode
        if mode == "" {
            let strJSP : String = "\(rfunc)('error', 'mode로 저장된 정보가 없습니다.', '')"
            self.doWebReturn(str: strJSP)
            return
        }
        var DeepLink:[String: Any] = [:]
        if let dic = UserDefaults.standard.dictionary(forKey: "deeplink") {
            DeepLink = dic as [String:Any]
        }
        Util.log("deeplink: \(DeepLink)")
        var ret:[String:Any] = [:]
        if let dt = DeepLink[mode] as? [String:Any] {
            let limit_tm:Int = dt["limit_tm"] as! Int
            let currentTime = Int(Date().timeIntervalSince1970)
            Util.log("limit_tm: \(dt["limit_tm"]) / \(limit_tm)/ \(currentTime)")
            if limit_tm > currentTime {
                Util.log("ok")
                let strJSP : String = "\(rfunc)('success', 'success', '\(Util.toJsonString(dt))\')"
                self.doWebReturn(str: strJSP)
                if delete {
                    DeepLink.removeValue(forKey: mode)
                }
            }else{
                Util.log("no")
                DeepLink.removeValue(forKey: mode)
                let strJSP : String = "\(rfunc)('error', 'mode로 저장된 정보가 없습니다.', '')"
                self.doWebReturn(str: strJSP)
            }
        }else{
            let strJSP : String = "\(rfunc)('error', 'mode로 저장된 정보가 없습니다.', '')"
            self.doWebReturn(str: strJSP)
        }
        UserDefaults.standard.set(DeepLink, forKey: "deeplink")
        UserDefaults.standard.synchronize()

    }
    func doUpdateCheck(state:Int, toastView: Bool) -> Void {
        Util.log("doUpdateCheck: \(state) / \(toastView)")
        let strVersion : String = Config.shared.appVersion!
        Util.log("app verson: \(strVersion)")




        // 앱스토어 버전 가져오기
        Util.getAppStoreVersion { [weak self] storeVersion, appId in
            if let storeVersion = storeVersion, let appId = appId {
                Util.log("verson: \(strVersion) / 앱스토어: \(storeVersion)")
                let subject = "업데이트 알림".lang()
                var desc = "새로운 버전이 출시되었습니다.".lang()
                let appStoreURL = "https://apps.apple.com/app/\(appId)"

                // 버전 비교
                let comparison = Util.compareVersion(strVersion, storeVersion)
                if comparison < 0 {
                    //Util.log("버전 비교: 로컬(\(strVersion)) < 앱스토어(\(storeVersion)) - 업데이트 필요")
                    if state == 1 {//강제 업데이트
                        desc = "\(desc!)\n\("앱 업데이트 후 이용가능합니다.".lang()!)"
                        self?.alert(title: subject, message: desc,  cancelBtnTitle: "업데이트".lang()!, callBack: { (index, isCancel) in
                            //self.m_mainWebview.load(URLRequest(url: URL(string: moveUrl)!))
                            Util.log("이동 클릭 \(index) / \(isCancel)")
                            if isCancel {
                                
                                if let url = URL(string: appStoreURL) {
                                    UIApplication.shared.open(url, options: [:]) { success in
                                        // 앱스토어로 이동 성공 후 앱 종료
                                        if success {
                                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                                exit(0)
                                            }
                                        }
                                    }
                                }
                            }
                        })
                    }else{//알림만
                        self?.alert(title: subject, message: desc,  cancelBtnTitle: "닫기".lang()!, btnTitles:"업데이트".lang()!, callBack: { (index, isCancel) in
                            //self.m_mainWebview.load(URLRequest(url: URL(string: moveUrl)!))
                            Util.log("이동 클릭 \(index) / \(isCancel)")
                            if !isCancel {
                                if index == 0 {
                                    if let url = URL(string: appStoreURL) {
                                        UIApplication.shared.open(url, options: [:]) { success in
                                            // 앱스토어로 이동 성공 후 앱 종료
                                            if success {
                                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                                    exit(0)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        })
                    }
                } else if comparison > 0 {
                    Util.log("버전 비교: 로컬(\(strVersion)) > 앱스토어(\(storeVersion)) - 개발 버전")
                } else {
                    Util.log("버전 비교: 로컬(\(strVersion)) == 앱스토어(\(storeVersion)) - 최신 버전")
                    if toastView {
                        Util.showToast(message:"최신버전 입니다.")
                    }
                }
            } else {
                Util.log("store verson3: \(strVersion) / nil (앱스토어 버전을 가져오지 못함)")
                if toastView {
                    Util.showToast(message:"앱스토어 버전을 가져오지 못함")
                }
            }
            /*
            if let storeVersion = storeVersion {
                // 앱스토어 버전이 있으면 함께 전달
                let strJSP = "result_app_version" + "("+strVersion.replacingOccurrences(of: ".", with: "")+", '" + strVersion + "', '" + storeVersion + "')"
                Util.log("strJSP: \(strJSP)")
            } else {
                // 앱스토어 버전을 가져오지 못한 경우 기존 방식
                let strJSP = "result_app_version" + "("+strVersion.replacingOccurrences(of: ".", with: "")+", '" + strVersion + "')"
                Util.log("strJSP: \(strJSP)")
            }
             */
        }
    }
    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        Util.log("viewWillLayoutSubviews")	
        
        //self.m_mainWebview?.frame = self.view.frame
    }
    //이동(네비게이션)을 시작하기 직전” 호출되는 콜백으로, 허용/취소(.allow/.cancel/.download) 같은 정책 결정과 함께, 이번 네비게이션에 적용할 “페이지별 설정”(WKWebpagePreferences)을 수정해 반환할 수 있습니다.
    //iOS 13+에서 추가된 메서드로, 이전 메서드(결정만 하는 버전)보다 한 단계 더 세밀하게 제어
    public func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        Util.log("webView-00")
        /*
         * Decides whether to allow or cancel a navigation.
         * 탐색을 허용할지 아니면 취소할지 결정합니다.
         */
        preferences.preferredContentMode = .mobile
        
        let strSchme = navigationAction.request.url?.scheme
        let strURL = navigationAction.request.url?.absoluteString
        let strPath = navigationAction.request.url?.path
        //let strFileName = navigationAction.request.url?.path().
        Util.log("SCHEME \(strSchme)")
        Util.log("URL \(strURL)")
        Util.log("Path \(strPath)")
        if navigationAction.shouldPerformDownload {
            /*
            var fname = ""

            var url:URL = URL(string: strURL!)!
            print("url:" + url.path as String)
            if String(url.path) != "" {
                fname = (url.path as NSString).lastPathComponent
            }
            print("fbame1:", fname)
            if fname == "" {
                var ext = "txt"
                if strSchme == "data" {
                    let m = strURL!.substring(from:5, to:9)
                    if m == "image" {
                        ext = strURL!.substring(from:11, to:13)
                    }
                }
                if strSchme == "blob" {
                    return decisionHandler(.download, preferences)
                    ext = "pdf"
                    let u:String = strURL!.replacingOccurrences(of: "blob:", with: "")
                    url = URL(string: u)!

                    print("url1:" + u)
                }
                fname = String(Date().timeIntervalSince1970) + "." + ext
            }
            //("data:image/png;base6
            //blob:https://cgt.lusof
            print("fbame2:", fname)
            //doDownloadFile(nMode:1, url: url, strFileNameServer:fname, strFileNameOrg:fname)
            //decisionHandler(.cancel, preferences)
             */
            //decisionHandler(.allow, preferences)
            decisionHandler(.download, preferences)
        }else{

            if strURL == "about:blank" {
                decisionHandler(.cancel, preferences)
            }else{
                if strSchme == "tel" || strSchme == "sms" || strSchme == "mailto" {
                    let url:URL = URL(string: strURL!)!
                    UIApplication.shared.open(url, options:[:], completionHandler: nil)
                    decisionHandler(.cancel, preferences)
                } else {
                    if let url = navigationAction.request.url {
                        if (url.absoluteString as NSString).range(of: ".m3u8").location != NSNotFound {
                            // 동영상
                            if (UIApplication.shared.delegate as? AppDelegate) != nil {
                                MoviePlayer.playerViewController(showFrom: self,
                                                                 url: url,
                                                                 showCallBack: {
                                    (vc) in Config.shared.vcStack.push(item: vc)
                                }, dismiss: { Config.shared.vcStack.pop() })
                            }
                            decisionHandler(.cancel, preferences)
                        } else if (url.absoluteString as NSString).range(of: "itunes.apple.com").location != NSNotFound
                                    || (url.absoluteString as NSString).range(of: "phobos.apple.com").location != NSNotFound {
                            // 스토어 연결
                            if UIApplication.shared.canOpenURL(url) == false {
                                alertWithOK(title: "move_not".lang()!)
                            } else {
                                UIApplication.shared.open(url, options:[:], completionHandler: nil)
                            }
                            decisionHandler(.cancel, preferences)
                        } else if (url.absoluteString as NSString).range(of: "ispmobile").location != NSNotFound {
                            // ISP 결제(이니시스)
                            if UIApplication.shared.canOpenURL(url) == false {
                                alert(title: "ISP " + "결제".lang()! + " " + "app_not".lang()!,
                                      message: "ISP " + "결제".lang()! + " " + "app_install".lang()!,
                                      cancelBtnTitle: "취소".lang()!,
                                      btnTitles: "확인".lang()!,
                                      callBack:
                                        { (index, isCancel) in
                                    if isCancel == false {
                                        if let urlISP = URL(string: "itms-appss://itunes.apple.com/kr/app/id369125087?mt=8") {
                                            UIApplication.shared.open(urlISP, options:[:], completionHandler: nil)
                                        }
                                    }
                                })
                            } else {
                                UIApplication.shared.open(url, options:[:], completionHandler: nil)
                            }
                            decisionHandler(.cancel, preferences)
                        } else if Config.shared.isKCP(strURL: url.absoluteString) == true{
                            Util.log("KCP Checked")
                            // KCP
                            if UIApplication.shared.canOpenURL(url) == false {
                                Util.log("앱이 없다")
                                alert(title: "결제".lang()! + " " + "app_not".lang()!,
                                      message: "결제".lang()! + " " + "app_install".lang()!,
                                      cancelBtnTitle: "취소".lang()!,
                                      btnTitles: "확인".lang()!,
                                      callBack:
                                        { (index, isCancel) in
                                    if isCancel == false{
                                        UIApplication.shared.open(url, options:[:], completionHandler: nil)
                                    }
                                })
                            } else {
                                Util.log("앱이 있다")
                                UIApplication.shared.open(url, options:[:], completionHandler: nil)
                            }
                            decisionHandler(.allow, preferences)
                        } else{
                            decisionHandler(.allow, preferences)
                            /*
                             nicepay 우리카드 때문에 .cancel(kcp 에서는 이렇게 되어 있었음)을 .allow로 바꿈
                             */
                        }
                    }
                }
            }
        }
    }
    //웹뷰가 어떤 요청을 열기 직전”마다 불려서, 그 네비게이션을 허용할지(.allow), 막을지(.cancel), 또는 iOS 14+에서 다운로드로 전환할지(.download) 결정하는 콜백
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        Util.log("webView-000")
        let request = navigationAction.request
        let optUrl = request.url
        let optUrlScheme = optUrl?.scheme
        guard let url = optUrl, let scheme = optUrlScheme
            else {
                return decisionHandler(WKNavigationActionPolicy.cancel)
        }
        
        print("webView-000:url : \(url)")
        
        if( scheme != "http" && scheme != "https" ) {
            if( scheme == "ispmobile" && !UIApplication.shared.canOpenURL(url) ) {  //ISP 미설치 시
                UIApplication.shared.open(URL(string: "https://itunes.apple.com/kr/app/id369125087?mt=8")!)
            } else if( scheme == "kftc-bankpay" && !UIApplication.shared.canOpenURL(url) ) {    //BANKPAY 미설치 시
                UIApplication.shared.open(URL(string: "https://itunes.apple.com/us/app/id398456030?mt=8")!)
            } else {
                if( UIApplication.shared.canOpenURL(url) ) {
                    UIApplication.shared.open(url)
                } else {
                    //1. App 미설치 확인
                    //2. info.plist 내 scheme 등록 확인
                }
            }
        }
        
        decisionHandler(WKNavigationActionPolicy.allow)
    }

    @available(iOS 14.5, *)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }
    
    @available(iOS 14.5, *)
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        print("suggestedFilename:"+suggestedFilename)
        var url = documentsURL.appendingPathComponent(suggestedFilename)
        
        if let lastDotIndex = suggestedFilename.lastIndex(of: ".") {
            let u:URL = URL(string: suggestedFilename)!
            let filename = String(Date().timeIntervalSince1970) + "." + u.pathExtension
            url = documentsURL.appendingPathComponent(filename)
            DispatchQueue.main.async {
                ActivityPopup.shared.hide()
                print("abc")
                Util.sendDownloadCompleteLocalNoti(fileName: self.decoding(str: filename)!, filePath: url.absoluteString)
            }
            //let documentController = UIDocumentInteractionController(url:url)
            //documentController.delegate = self;
            //documentController.presentPreview(animated: true)
        }
        completionHandler(url)
    }
    
    @available(iOS 14.5, *)
    func downloadDidFinish(_ download: WKDownload) {
        print("File Download Success", download)

    }
    
    @available(iOS 14.5, *)
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        print(error)
    }

    @available(iOS 8.0, *)
    //응답이 알려진 후 탐색을 허용할지 아니면 취소할지 결정
    public func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Swift.Void){
        Util.log("webView-01")
        /*
         * Decides whether to allow or cancel a navigation after its response is known.
         * 응답이 알려진 후 탐색을 허용할지 아니면 취소할지 결정합니다.
         */
        //print("===========================", navigationResponse.canShowMIMEType)
        //print(navigationResponse.canShowMIMEType)
        //if let mimeType = navigationResponse.response.mimeType {
        //    print("--------------------------", mimeType)
            
        //}
        decisionHandler(WKNavigationResponsePolicy.allow)

    }
    
    @available(iOS 8.0, *)
    //웹 컨텐트가 웹뷰로 로드되기 시작할 때
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!){
        Util.log("webView-02")
        /*
         * Called when web content begins to load in a web view.
         * 웹 컨텐트가 웹뷰로 로드되기 시작할 때 호출됩니다.
         */
        doShowLoading()
    }
    
    @available(iOS 8.0, *)
    //웹뷰가 서버 리디렉션을 수신
    public func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!){
        Util.log("webView-03")
        /*
         * Called when a web view receives a server redirect.
         * 웹뷰가 서버 리디렉션을 수신하면 호출됩니다.
         */
    }
    
    @available(iOS 8.0, *)
    //웹뷰에서 콘텐츠를 로드하는 중에 오류가 발생
    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error){
        Util.log("webView-04")
        print("webView-04", error)
        /*
         * Called when an error occurs while the web view is loading content.
         * 웹뷰에서 콘텐츠를 로드하는 중에 오류가 발생하면 호출됩니다.
         */
    }
    
    @available(iOS 8.0, *)
    //웹뷰에서 웹 콘텐츠를 받기 시작
    public func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!){
        Util.log("webView-05")
        /*
         * Called when the web view begins to receive web content.
         * 웹뷰에서 웹 콘텐츠를 받기 시작할 때 호출됩니다.
         */
    }
    
    @available(iOS 8.0, *)
    //네비게이션이 완료
    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!){
        Util.log("webView-06")
        let opened = Util.Storage.get("opened")
        Util.log("opened: \(opened)")
        /*
         * Called when the navigation is complete.
         * 네비게이션이 완료하면 호출됩니다.
         */
        let strJSP = "document.body.style.webkitTouchCallout='none'; document.body.style.KhtmlUserSelect='none'"
        //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
        doWebReturn(str: strJSP)
        if Config.shared.isShowIntroImage == true{
            Timer.scheduledTimer(timeInterval: 2, target: self, selector: #selector(self.doStopLoading), userInfo: nil, repeats: false)
        }else{
            doStopLoading()
        }
        if !appStarted  {
            if let move = self.moveUrlStr,
               move != "",
               let moveUrl = URL(string: move) {
                Util.log("moveUrlStr: \(moveUrlStr)")
                self.m_mainWebview.load(URLRequest(url: moveUrl))
                DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) {
                    // 1초 후 실행할 코드
                    Util.log("1초 후 실행됨")
                }
                
            }
            appStarted = true
        }
    }
    
    @available(iOS 8.0, *)
    //네비게이션 중 에러가
    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error){
        Util.log("webView-07")
        /*
         * Called when an error occurs during navigation.
         * 네비게이션 중 에러가 발생하면 불려갑니다.
         */
    }
    
    @available(iOS 8.0, *)
    public func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Swift.Void){
        Util.log("webView-08")
        /*
         * Called when the web view needs to respond to an authentication challenge.
         * 웹뷰가 인증 요청에 응답해야 할 때 호출됩니다.
         */
        completionHandler(Foundation.URLSession.AuthChallengeDisposition.useCredential, URLCredential(trust:challenge.protectionSpace.serverTrust!))
    }	
    
    @available(iOS 9.0, *)
    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView){
        /*
         * Called when the web view's web content process is terminated.
         * 웹뷰의 웹 콘텐츠 프로세스가 종료되면 호출됩니다.
         */
        Util.log("webViewWebContentProcessDidTerminate---------")
        //백화현상 관련 추가
        // 현재 페이지가 있으면 우선 reload
        if webView.url != nil {
            webView.reload()
            return
        }
        // 없으면 START_URL로 콜드 스타트
        if let start = Config.shared.startUrl, let url = URL(string: start) {
            webView.load(URLRequest(url: url))
        }
    }
    var popupWebView: WKWebView! // 새로 생성된 웹뷰를 담을 변수
    var popupCloseButton: UIButton!
    @available(iOS 8.0, *)
    public func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView?{
        Util.log("webView-09")
        /*
         * Creates a new web view,
         * If you do not implement this method, the web view will cancel the navigation.
         * 새 웹보기를 만듭니다,
         * 이 메소드를 구현하지 않으면 웹보기가 탐색을 취소합니다.
         */
        // 새로운 웹뷰 생성
        //let frame = UIScreen.main.bounds
        //popupWebView = WKWebView(frame: frame, configuration: configuration)
        
        let topMargin: CGFloat = 48*2 // 상단 마진 크기
        let popupFrame = CGRect(x: 0,
                              y: topMargin,
                              width: view.bounds.width,
                              height: view.bounds.height - topMargin)
        popupWebView = WKWebView(frame: popupFrame, configuration: configuration)
        
        
        // 오토레이아웃 처리
        popupWebView?.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        #if DEBUG
        if #available(iOS 16.4, *) {
            popupWebView?.isInspectable = true
        } else {
            // Fallback on earlier versions
        }
        #endif
        // Delegate 설정
        popupWebView?.navigationDelegate = self
        popupWebView?.uiDelegate = self
        
        view.addSubview(popupWebView!)
        //let popupViewController = UIViewController()
        //popupViewController.view = popupWebView

        
        // 닫기 버튼 설정
        print("width", UIScreen.main.bounds.size.width)
        //popupCloseButton = UIButton(frame: CGRect(x: 15, y: UIScreen.main.bounds.size.height-80, width: UIScreen.main.bounds.size.width-30, height: 44))
        popupCloseButton = UIButton(frame: CGRect(x: 0, y: 48, width: UIScreen.main.bounds.size.width, height: 48))
        popupCloseButton.setImage(UIImage(systemName: "xmark"), for: .normal)
        popupCloseButton.tintColor = .black
        popupCloseButton.backgroundColor = .white
        popupCloseButton.layer.cornerRadius = 0
        popupCloseButton.layer.borderWidth = 1
        popupCloseButton.contentHorizontalAlignment = .right
        popupCloseButton.imageEdgeInsets = UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 16)
        popupCloseButton.layer.borderColor = UIColor.gray.cgColor
        popupCloseButton.addTarget(self, action: #selector(popupCloseButtonTapped), for: .touchUpInside)
        view.addSubview(popupCloseButton)
        //popupViewController.view.addSubview(popupCloseButton)
        //present(popupViewController, animated: true)

        return popupWebView! // 생성한 웹뷰 반환하여 팝업 창에 표시
    }
    
    @objc func popupCloseButtonTapped() {
        popupWebView?.removeFromSuperview() // 팝업 웹뷰 제거
        popupWebView = nil // 변수 초기화
        popupCloseButton?.removeFromSuperview()
    }
    @available(iOS 9.0, *)
    public func webViewDidClose(_ webView: WKWebView){
        Util.log("webViewDidClose")
        /*
         * Notifies your app that the DOM window closed successfully.
         * DOM 윈도우가 성공적으로 닫혔다는 것을 앱에 알립니다.
         */
        if webView == popupWebView {
            popupWebView?.removeFromSuperview() // 팝업 웹뷰 제거
            popupWebView = nil // 변수 초기화
            popupCloseButton?.removeFromSuperview()
        }
    }
    
    @available(iOS 8.0, *)
    public func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Swift.Void){
        Util.log("webView-10")
        /*
         * Displays a JavaScript alert panel.
         * 자바 스크립트 경고 패널을 표시합니다.
         */
        let alertController = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alertController.addAction(UIAlertAction(title: "확인".lang(), style: .default, handler: { (action) in
               completionHandler()
        }))
        
        if self.presentedViewController == nil {
            self.present(alertController, animated: true, completion: nil)
        } else {
            completionHandler()
        }
    }
    
    @available(iOS 8.0, *)
    public func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Swift.Void){
        Util.log("webView-11")
        /*
         * Displays a JavaScript confirm panel.
         * JavaScript 확인 ​​패널을 표시합니다.
         */
        let alertController = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alertController.addAction(UIAlertAction(title: "확인".lang(), style: .default, handler: { (action) in
            completionHandler(true)
        }))
        alertController.addAction(UIAlertAction(title: "취소".lang(), style: .default, handler: { (action) in
            completionHandler(false)
        }))
        if self.presentedViewController == nil {
            self.present(alertController, animated: true, completion: nil)
        } else {
            completionHandler(false)
        }
    }
    
    @available(iOS 8.0, *)
    public func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Swift.Void){
        Util.log("webView-12")
        /*
         * Displays a JavaScript text input panel.
         * JavaScript 텍스트 입력 패널을 표시합니다.
         */
        let alertController = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alertController.addTextField { textField in
            textField.text = defaultText
        }
        alertController.addAction(UIAlertAction(title: "확인".lang(), style: .default, handler: { _ in
            completionHandler(alertController.textFields?.first?.text)
        }))
        alertController.addAction(UIAlertAction(title: "취소".lang(), style: .cancel, handler: { _ in
            completionHandler(nil)
        }))
        if self.presentedViewController == nil {
            self.present(alertController, animated: true, completion: nil)
        } else {
            completionHandler(nil)
        }
    }

    #if false
    @available(iOS 10.0, *)
    public func webView(_ webView: WKWebView, shouldPreviewElement elementInfo: WKPreviewElementInfo) -> Bool{
        Util.log("webView-13")
        /*
         * Determines whether the given element should show a preview.
         * 지정된 요소가 미리보기를 표시할지 여부를 결정합니다.
         */
        
        return true
    }
    
    @available(iOS 10.0, *)
    public func webView(_ webView: WKWebView, previewingViewControllerForElement elementInfo: WKPreviewElementInfo, defaultActions previewActions: [WKPreviewActionItem]) -> UIViewController?{
        Util.log("webView-14")
        /*
         * Called when the user performs a peek action.
         * 사용자가 peek 작업을 수행 할 때 호출됩니다.
         */
    }
    
    @available(iOS 10.0, *)
    public func webView(_ webView: WKWebView, commitPreviewingViewController previewingViewController: UIViewController){
        Util.log("webView-15")
        /*
         * Called when the user performs a pop action on the preview.
         * 사용자가 미리보기에서 팝업 액션을 수행 할 때 호출됩니다.
         */
    }
    #endif
    // MARK: Function, From WKWebView End!! ---------- ---------- ---------- ---------- ----------
    
    // MARK: Function, From Server Start!! ---------- ---------- ---------- ---------- ----------
    func doLogin(strId : String) {
        Util.log("doLogin \(strId)")
        UserDefaults.standard.set(strId, forKey: "mb_id")
        UserDefaults.standard.synchronize()

        let strURL : String = Config.shared.hostUrl! + "api/api_savePushInfo2.php"
        let api = Http(url: strURL, method: Http.Method.POST)
        api.add(key: "return_type", value: "json")
        if Config.shared.canUseFCM{
            api.add(key: "mb_regnum", value: Config.shared.fcmToken)
            api.add(key: "mb_os", value: "4")
            print("mb_regnum1:", Config.shared.fcmToken)
        }else{
            api.add(key: "mb_regnum", value: Config.shared.udid)
            api.add(key: "mb_os", value: "1")
            print("mb_regnum1:", Config.shared.udid)
        }
        api.add(key: "mb_id", value: strId)
        api.returnObject({ [self] (httpDic) in
            print("httpdic------", httpDic)
            if let result = httpDic["result"] as? String, result == "ok"{
                print(httpDic);
                let member_id : String = String(format: "%@", httpDic["member_id"] as! CVarArg)
                Config.shared.pushCatID = member_id
                UserDefaults.standard.set(Config.shared.pushCatID, forKey: "member_id")
                UserDefaults.standard.synchronize()
            }
            else{
                if let result = httpDic["result"] as? String, let result_text = httpDic["result_text"] as? String
                {
                    if result != "success" {
                        var str = result_text.replacingOccurrences(of: "+", with: "%20")
                        str = self.decoding(str: str)!
                        self.alertWithOK(title: str)
                    }
                }
                else if let arr = httpDic["result_text"] as? [[String:String]]
                {
                    if arr.count > 0 && arr[0]["ko"] != nil
                    {
                        var str = arr[0]["ko"]!
                        str = str.replacingOccurrences(of: "+", with: "%20")
                        self.alertWithOK(title: self.decoding(str: str)!)
                    }
                }
            }
        }, failCallback: {
            print("[WKWEBVIEW]LOGIN=%@", "fail")
        })
    }

    func doExitApp() -> Void{
        Util.log("doExitApp")
        alert(title: nil,
              message: "앱을종료".lang()!,
              cancelBtnTitle: "취소".lang()!,
              btnTitles: "종료".lang()!,
              callBack:{ (index, isCancel) in
                if isCancel == false
                {
                    exit(1)
                }
        })
    }

    func doWindowOpen(strURL : String) -> Void{
        Util.log("doWindowOpen")
        //백화현상 관련 추가
        if let top = self.presentedViewController, top is MainViewController { return }
        if self.isBeingPresented || self.isMovingToParent { return }
        //백화현상 관련 추가 끝
        let vc = self.storyboard?.instantiateViewController(withIdentifier:"MainViewController") as? MainViewController
        if strURL.range(of: "http") != nil{
            vc?.moveUrlStr = strURL
        }else{
            vc?.moveUrlStr = Config.shared.hostUrl! + strURL + "?force_agent=app"
        }
         
//        vc?.modalTransitionStyle = UIModalTransitionStyle.crossDissolve
        vc?.modalPresentationStyle = UIModalPresentationStyle.fullScreen
        self.present(vc!, animated: true, completion: {
            Config.shared.vcStack.push(item: vc!)
        })
    }
    
    @objc func doWindowFinish() -> Void{
        Util.log("doWindowFinish")
        self.dismiss(animated: true, completion: {
            self.jumpButton.isHidden = true
            self.navigationController?.navigationBar.isHidden = true
            let url = URL(string: Config.shared.startUrl!)
            self.m_mainWebview.load(URLRequest(url: url!))
//            Config.shared.vcStack.pop()
        })
    }
    
    func doWindowOpenBrowser(url : URL) -> Void{
        Util.log("doWindowOpenBrowser \(url)")
            if #available(iOS 10.0, *) {
                UIApplication.shared.open(url as URL)
            } else {
                UIApplication.shared.openURL(url as URL)
            }
    }
    
    func doShare(strTitle : String, url : URL, strDescription : String) -> Void{
        Util.log("doShare")
        var arr : [AnyObject] = []
        arr.append(strTitle + "\n" + strDescription as AnyObject)
        arr.append(url as AnyObject)
        
        let activity = UIActivityViewController(activityItems: arr, applicationActivities: nil)
        activity.excludedActivityTypes = [.airDrop, .print, .assignToContact, .saveToCameraRoll, .addToReadingList]
        self.present(activity, animated: true, completion: {
            Config.shared.vcStack.push(item: activity)
        })
    }
    
    func doTwitter(strTitle : String, url : URL) -> Void{
        Util.log("doTwitter")
        if let vc = SLComposeViewController(forServiceType: SLServiceTypeTwitter){
            vc.setInitialText(strTitle)
            vc.add(url)
            self.present(vc, animated: true, completion: {
                Config.shared.vcStack.push(item: vc)
            })
        }else{
            alertWithOK(title: "iphone_twitter".lang()!)
        }
    }
    
    func doFacebook(strTitle : String, url : URL) -> Void{
        Util.log("doFacebook")
        if let vc = SLComposeViewController(forServiceType: SLServiceTypeFacebook){
            vc.setInitialText(strTitle)
            vc.add(url)
            self.present(vc, animated: true, completion: {
                Config.shared.vcStack.push(item: vc)
            })
        }else{
            alertWithOK(title: "iphone_facebook".lang()!)
        }
    }
    
    func doKakaoStory(strTitle : String, url : URL) -> Void{
        Util.log("doKakaoStory")
        let strShortVersion : String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as! String
        let strVersion : String = Bundle.main.infoDictionary?["CFBundleVersion"] as! String
        var strName : String = Bundle.main.infoDictionary?["CFBundleName"] as! String
        let strSubject : String = strTitle.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed)!
        strName = strName.addingPercentEncoding(withAllowedCharacters: .urlFragmentAllowed)!
        
        var strURL = "storylink://posting?post=" + strSubject
        strURL += "&appid=" + strShortVersion
        strURL += "&appver=" + strVersion
        strURL += "&apiver=1.0&appname=" + strName
        
        if let url = URL(string:strURL){
            if UIApplication.shared.canOpenURL(url){
                alertWithOK(title: "KAKAO STORY " + "app_not".lang()!)
            }
        }
    }
    
    func doKakaoTalk(strTitle : String, url : URL) -> Void{
        Util.log("doKakaoTalk")
        /**
         * 카카오톡의 정책 변화로, URL Sheme를 사용하는 기존 방법으로는 통신이 불가함.
         * 개발자 사이트에서 템플릿을 디자인하고, 해당 탬플릿의 아이디를 가지고 호출해야 함.
         */
        if let urlKakao = URL(string:"kakaotalk://"){
            if UIApplication.shared.canOpenURL(urlKakao){
                alertWithOK(title: "KAKATALK " + "app_not".lang()!)
            }
        }
    }
    
    func doRotate(strRotate : String) -> Void{
        Util.log("doRotate")
        // 가로 세로 모드 변경
        orientationList?.removeAll()
        switch strRotate{
        case "height":
            orientationList?.append("UIInterfaceOrientationPortrait")
        case "width":
            orientationList?.append("UIInterfaceOrientationLandscapeRight")
            orientationList?.append("UIInterfaceOrientationLandscapeLeft")
        case "rotation":
            orientationList?.append("UIInterfaceOrientationPortrait")
            orientationList?.append("UIInterfaceOrientationPortraitUpsideDown")
            orientationList?.append("UIInterfaceOrientationLandscapeRight")
            orientationList?.append("UIInterfaceOrientationLandscapeLeft")
        default:
            break
        }
        UIViewController.attemptRotationToDeviceOrientation()
    }
    
    func doUploadMultiple(count : Int,type : Int) -> Void{
        Util.log("doUploadMultiple")
        jsonArray = NSMutableArray.init();
        let alertController = UIAlertController(title: nil, message: nil, preferredStyle: UIAlertController.Style.actionSheet)
        let alertView1 = UIAlertAction(title: "카메라".lang()!, style: UIAlertAction.Style.default) { (UIAlertAction) -> Void in
            self.MultipleUpload = 1
            self.doCameraUpload()
        }
        let alertView2 = UIAlertAction(title: "앨범".lang()!, style: UIAlertAction.Style.default) { (UIAlertAction) -> Void in
            //        WQPhotoAlbumSkinColor = UIColor.white
            var photoAlbumVC = WQPhotoNavigationViewController(photoAlbumDelegate: self, photoAlbumType: .selectPhoto)
            if type > 1 {//TODO
                photoAlbumVC = WQPhotoNavigationViewController(photoAlbumDelegate: self, photoAlbumType: .videoType)
            }
            photoAlbumVC.maxSelectCount = count
            photoAlbumVC.modalPresentationStyle = .fullScreen
            self.present(photoAlbumVC, animated: true, completion: nil)
        }
        
        let cancel = UIAlertAction(title: "취소".lang()!, style: UIAlertAction.Style.cancel)
        alertController.addAction(cancel)
        alertController.addAction(alertView1)
        alertController.addAction(alertView2)
        self.present(alertController, animated: true, completion: nil)
    }
    
    func photoAlbum(selectPhotos: [WQPhotoModel]) {
        Util.log("photoAlbum")
        self.MultipleUpload = selectPhotos.count
        for i  in 0 ..< selectPhotos.count{
            let model = selectPhotos[i]
            if model.videoUrl != nil {
                let time:String = Util.formateTodayDate()!;
                let fileName = "Video_" + time + "." + model.videoType!
                do {
                    let videoData = try Data(contentsOf: model.videoUrl!)
                    uploadData(uploadData: videoData, fileName: fileName)
                }catch{
                }
            }else{
                uploadFile(image: model.originImage!, isMultiple: true)
            }
        }
    }

    func doUploadChoice() -> Void{
        Util.log("doUploadChoice")
        let alertController = UIAlertController(title: nil, message: nil, preferredStyle: UIAlertController.Style.actionSheet)
        let alertView1 = UIAlertAction(title: "사진 찍기".lang()!, style: UIAlertAction.Style.default) { (UIAlertAction) -> Void in
            self.doCameraUpload()
        }
        let alertView2 = UIAlertAction(title: "사진 보관함".lang()!, style: UIAlertAction.Style.default) { (UIAlertAction) -> Void in
            self.doFileUpload()
        }
        
        let alertView3 = UIAlertAction(title: "탐색".lang()!, style: UIAlertAction.Style.default) { (UIAlertAction) -> Void in
            self.doFileApp()
        }
        alertController.addAction(alertView3)
        alertController.addAction(alertView2)
        alertController.addAction(alertView1)
        let cancel = UIAlertAction(title: "취소".lang()!, style: UIAlertAction.Style.cancel)
        alertController.addAction(cancel)
        self.present(alertController, animated: true, completion: nil)
    }
    
    func doRecordingAudio() -> Void{
        Util.log("doRecordingAudio")
        let Recording:RecordingViewController = self.storyboard!.instantiateViewController(withIdentifier: "RecordingVC") as! RecordingViewController
        Recording.definesPresentationContext = true
        Recording.providesPresentationContextTransitionStyle = true;
        Recording.modalPresentationStyle = .overCurrentContext;
        self.present(Recording, animated: false, completion: nil)

        let LTNOTIFICATION_TEST = Notification.Name(rawValue: "uploadPath")
        NotificationCenter.default.addObserver(self, selector: #selector(receiverNotification(_:)), name: LTNOTIFICATION_TEST, object: nil)
    }
    //녹음 업로드
    @objc private func receiverNotification(_ notification: Notification) {
        Util.log("receiverNotification")
        guard let userInfo = notification.userInfo else {
            return
        }
        
        let path = userInfo["path"] as? String
        let url = URL(fileURLWithPath: path!)
        do {
            let data = try Data(contentsOf: url)
            let time:String = Util.formateTodayDate()!;
            let fileName = "Recording_" + time + ".wav"
            self.uploadData(uploadData: data, fileName: fileName)
        } catch let error as Error? {
            print("%@", error!.localizedDescription);
        }
    }
   
    func doFileApp() -> Void{//TODO
        Util.log("doFileApp")
        let documentTypes : Array = ["public.content", "public.text", "public.source-code", "public.image","public.png", "public.audiovisual-content", "com.adobe.pdf", "com.apple.keynote.key", "com.microsoft.word.doc", "com.microsoft.word.docx", "com.microsoft.excel.xls","com.microsoft.excel.xlsx",  "com.microsoft.powerpoint.ppt","com.microsoft.powerpoint.pptx","public.3gpp", "public.mpeg-4", "com.compuserve.gif","public.jpeg","public.data"]
        let documentPicker = UIDocumentPickerViewController(documentTypes: documentTypes, in:UIDocumentPickerMode.open)
        documentPicker.modalPresentationStyle = .formSheet
        documentPicker.delegate = self
        self.present(documentPicker, animated: true, completion: nil)
    }
    
    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentAt url: URL) {
        Util.log("documentPicker")
        let canAccessingResource:Bool = url.startAccessingSecurityScopedResource();
        if canAccessingResource{
            do {
                let data = try Data(contentsOf: url)
                let time:String = Util.formateTodayDate()!;
                let fileName = "File_" + time + ".wav"
                self.uploadData(uploadData: data, fileName: fileName)
            } catch let error as Error? {
                print("%@", error!.localizedDescription);
            }
        }
        url.stopAccessingSecurityScopedResource();
    }
//        NSFileCoordinator *fileCoordinator = [[NSFileCoordinator alloc] init];
//        NSError *error;
//        [fileCoordinator coordinateReadingItemAtURL:url options:0 error:&error byAccessor:^(NSURL *newURL) {
//        NSData *fileData = [NSData dataWithContentsOfURL:newURL];
//        NSArray *arr = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
//        NSString *documentPath = [arr lastObject];
//        NSString *desFileName = [documentPath stringByAppendingPathComponent:@"myFile"];
//        [fileData writeToFile:desFileName atomically:YES];
//        [self dismissViewControllerAnimated:YES completion:NULL];
//        }];

    func doReviewRPop() -> Void{
        Util.log("doReviewRPop")
        let storeCtrlr = SKStoreProductViewController()
        storeCtrlr.delegate = self
        storeCtrlr.loadProduct(withParameters: [SKStoreProductParameterITunesItemIdentifier: "836500024"]) { [weak self] (isSuccess, error) in
            if isSuccess {
                self?.present(storeCtrlr, animated: true, completion: {
                })
            }else {
                print("error:\(String(describing: error))")
            }
        }
    }
    func productViewControllerDidFinish(_ viewController: SKStoreProductViewController) {
        Util.log("productViewControllerDidFinish")
        dismiss(animated: true) {
            print("productViewControllerDidFinish")
        }
    }
    
    func doFileUpload() -> Void{
        Util.log("doFileUpload")
        setImagePickerController(source: UIImagePickerController.SourceType.photoLibrary, crop: false, complete: { (img) in
            if img != nil {
                self.uploadFile(image: img! ,isMultiple:false)
            }
        })
    }
    
    func doCameraUpload() -> Void{
        Util.log("doCameraUpload")
        setImagePickerController(source: UIImagePickerController.SourceType.camera, crop: false, complete: { (img) in
            if img != nil {
                //TODO갤러리저장
//                UIImageWriteToSavedPhotosAlbum(img!, nil, nil, nil);
                self.uploadFile(image: img! ,isMultiple:false)
            }
        })
    }
    
    func uploadFile(image: UIImage ,isMultiple:Bool) ->Void{
        Util.log("uploadFile")
        var img = image
        // resize
        let maxWidth: CGFloat = 1000
        if img.size.width > maxWidth{
            let scale = (maxWidth / img.size.width)
            if let resizedImg = img.resize(size: CGSize(width: img.size.width*scale, height: img.size.height*scale)){
                img = resizedImg
            }
        }
    
        let time:String = Util.formateTodayDate()!;
        var fileName = "Image_" + time
        var imgData : Data?
        if let data = img.jpegData(compressionQuality: 1.0){
                imgData = data
                fileName = fileName + ".jpeg"
        }
        if isMultiple{
        }
        uploadData(uploadData: imgData!, fileName: fileName)
    }
    
    var MultipleUpload : Int = -1;
    func uploadData(uploadData : Data, fileName : String) ->Void{
        Util.log("uploadData")
        var cancelOrFail : Bool = false
        
        let urlStr = Config.shared.hostUrl! + "api/api_fileupload.php"
        let api = Http(url: urlStr, method: Http.Method.POST, contentType: .multiPart)
        api.add(key: "return_type", value: "json")
        if let version = Bundle.main.infoDictionary?["CFBundleVersion"] as? String{
            api.add(key: "app_version", value: version)
        }
        api.add(key: "upFile", value: uploadData, fileName: fileName)
        api.returnObject({ (httpDic) in
            if let result = httpDic["result"] as? String, result == "ok"{
                cancelOrFail = false
                if self.jsonArray == nil{
                    if let oriFileName : String = httpDic["org_filename"] as? String,
                       let fileName : String = httpDic["filename"] as? String,
                       let type1 : NSNumber = httpDic["type"] as? NSNumber{
                        let type : String = String(format:"%d", type1.int64Value)
                        let strJSP : String = "file_upload_process_result('success', '" + oriFileName + "', '" + fileName + "', '" + type + "')"
                        //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
                        self.doWebReturn(str: strJSP)
                    }
                }else{
                    self.jsonArray?.add(httpDic as NSDictionary)
                    if self.MultipleUpload == self.jsonArray?.count{
                        let strJSP : String = "image_multiple_process_result('success', '" + Util.getJSONFromArray(array: self.jsonArray!) + "')"
                        //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
                        self.doWebReturn(str: strJSP)
                        self.jsonArray = nil;
                    }
                }
            }else{
                if let oriFileName : String = httpDic["org_filename"] as? String,
                    let fileName : String = httpDic["filename"] as? String,
                    let type1 : NSNumber = httpDic["type"] as? NSNumber
                {
                    let type : String = String(format:"%d", type1.int64Value)
                    let strJSP : String = "file_upload_process_result('error', '" + oriFileName + "', '" + fileName + "', '" + type + "')"
                    //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
                    self.doWebReturn(str: strJSP)
                }
            }
        })
        if cancelOrFail{
            let strJSP : String = "file_upload_process_result('none', '', '', '')"
            //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
            self.doWebReturn(str: strJSP)
        }
    }
    
    func doGPS(userCode : String) -> Void{
        Util.log("doGPS \(userCode)")
        var strJSP : String = "";
        GPS.shared.run(loopCnt: 1, complete: { (latitude, longitude) in
            strJSP = "get_gps_result('success', '" + String(latitude) + "', '" + String(longitude) + "','gps','" + userCode + "')"
            //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
            self.doWebReturn(str: strJSP)
            GPS.shared.stop()
        },
        error: { (error, description) in
            var resultCode : String = ""
            switch error
            {
            case GPS.ErrorType.Denied:
                resultCode = "off"
            case GPS.ErrorType.Network:
                resultCode = "no"
            default:
                resultCode = "other"
            }
            
            strJSP = "get_gps_result('" + resultCode + "', '', '')"
            //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
            self.doWebReturn(str: strJSP)
        })
    }
    
    func doCheckWiFi() -> Void{
        Util.log("doCheckWiFi")
        // 와이파이 체크
        var strJSP : String = ""
        switch Config.shared.network_status{
        case ConnectionState.wifi.rawValue:
            strJSP = "check_wifi_result('success')"
            break
        default:
            strJSP = "check_wifi_result('error')"
            break
        }
        //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
        doWebReturn(str: strJSP)
    }
    
    func decoding(str : String ) ->String? {
        Util.log("decoding")
        return  str.removingPercentEncoding
    }
    
    func doDownloadFile(nMode : Int, url : URL, strFileNameServer : String, strFileNameOrg : String) -> Void{
        Util.log("doDownloadFile")
        enum DownloadMode : Int{
            case Download = 1, Share = 2
        }
        print("nMode:", nMode)
        ActivityPopup.shared.show(self)
        DispatchQueue.global().async {
            do{
                if nMode == DownloadMode.Download.rawValue {
                    let data = try Data(contentsOf: url)
                    let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
                    let filePath = paths[0].absoluteString + strFileNameServer
                    let filePathUrl : URL = URL(string: self.decoding(str: filePath)!)!
                    do {
                        try data.write(to: filePathUrl, options: .atomic)
                    }  catch let error {
                        print("[WKWEBVIEW]ERROR=%@", String(describing:error.localizedDescription))
                    }
                    
                    DispatchQueue.main.async {
                        ActivityPopup.shared.hide()
                        Util.sendDownloadCompleteLocalNoti(fileName: self.decoding(str: strFileNameOrg)!, filePath: filePath)
                    }
                } else if nMode == DownloadMode.Share.rawValue {
//                    if let filePathUrl = URL(string:NSTemporaryDirectory())?.appendingPathComponent(strFileNameServer){
//                        try data.write(to: filePathUrl)
                        DispatchQueue.main.async {
                            ActivityPopup.shared.indicator.stopAnimating()
                            ActivityPopup.shared.vc.dismiss(animated: true, completion: {
                                Config.shared.vcStack.pop()
                                let documentController = UIDocumentInteractionController(url:url)
                                documentController.delegate = self;
                                documentController.presentPreview(animated: true)
                            })
//                            ActivityPopup.shared.hide()
//                            Util.shared.presentDocumentInteraction(url: url)
                        }
//                    }
                }
            } catch let err{
                DispatchQueue.main.async {
                    ActivityPopup.shared.hide()
                }
                print("[WKWEBVIEW]ERROR=%@", String(describing:err.localizedDescription))
            }
        }
    }
    public func docView(url : URL) -> Void{
        Util.log("docView")
        DispatchQueue.main.async {
            ActivityPopup.shared.indicator.stopAnimating()
            ActivityPopup.shared.vc.dismiss(animated: true, completion: {
                Config.shared.vcStack.pop()
                let documentController = UIDocumentInteractionController(url:url)
                documentController.delegate = self;
                documentController.presentPreview(animated: true)
            })
//                            ActivityPopup.shared.hide()
//                            Util.shared.presentDocumentInteraction(url: url)
        }

    }
    public func documentInteractionControllerViewControllerForPreview(_ controller: UIDocumentInteractionController) -> UIViewController{
        return self
    }
    func doTopicEdit(nMode : Int, strTopicNames : String) -> Void{
        Util.log("doTopicEdit")
        var topicList = Config.shared.FCMRegistedTopics
        if nMode == 0{
            // 등록
        }else if nMode == 4{
            // 전체 삭제
            for topic in topicList{
                Messaging.messaging().unsubscribe(fromTopic: topic)
            }
            topicList.removeAll()
        }else{
            let list = strTopicNames.components(separatedBy: "&")
            if nMode == 1{
                // 전체 삭제
                for topic in topicList{
                    Messaging.messaging().unsubscribe(fromTopic: topic)
                }
                topicList.removeAll()
                
                // regist
                for sub in list {
                    if sub.count > 0 {
                        Messaging.messaging().subscribe(toTopic: sub)
                        topicList.insert(sub)
                    }
                }
            }
            else if nMode == 2{
                // modify
                for sub in list{
                    if sub.count > 0{
                        let subList = sub.components(separatedBy: "->")
                        if subList.count == 2{
                            Messaging.messaging().unsubscribe(fromTopic: subList[0])
                            Messaging.messaging().subscribe(toTopic: subList[1])
                            
                            topicList.remove(subList[0])
                            topicList.insert(subList[1])
                        }
                    }
                }
            }
            else if nMode == 3{
                // delete
                for sub in list{
                    if sub.count > 0 {
                        let list = strTopicNames.components(separatedBy: "&")
                        for sub in list{
                            if sub.count > 0{
                                Messaging.messaging().unsubscribe(fromTopic: sub)
                                topicList.remove(sub)
                            }
                        }
                    }
                }
            }
        }
        Config.shared.FCMRegistedTopics = topicList
    }
    
    func doCheckversion() -> Void{
        Util.log("doCheckversion")
        let strVersion : String = Config.shared.appVersion!
        let strJSP = "result_app_version" + "("+strVersion.replacingOccurrences(of: ".", with: "")+", '" + strVersion + "')"
        Util.log("strJSP: \(strJSP)")
        //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
        doWebReturn(str: strJSP)
    }

    var productId:String = ""
    var iapResultID : String? = nil
    func doIAP(productID : String) -> Void{
        Util.log("doIAP: \(productID)")
        #if FLAGIAP
        print("doIAP2")
        var isAvail : Bool = false
        if IAPManager.shared.GetIAPAvail() == true{
            if IAPManager.shared.canPayments() == true{
                isAvail = true
            }
        }
        print ("isAvail:", isAvail)
        if isAvail == true{
            Util.LoadingView.show()
            self.m_indicatorView.isHidden = true;
            let nResult : [String:Any] = IAPManager.shared.purchaseMyProduct(requestID: productID)
            if (nResult["result"] as? Bool) == false {
                alertWithOK(title: "inapp_by_not: " + (nResult["msg"] as! String))
            }else {
                self.productId = productID
                iapResultID = IAPManager.shared.GetResultItemID(index : nResult["index"] as! Int)
            }
        }else{
            Util.LoadingView.hide()
        }
        IAPManager.shared.purchaseStatusBlock = {[weak self] (type) in
            self?.stateIAPMessage(message: type)
        }
        #endif
    }
    #if FLAGIAP
    public func stateIAPMessage(message : IAPHandlerAlertType){
        Util.log("stateIAPMessage")
        var strResult : String = ""
        switch(message){
        case .purchased:
            self.m_indicatorView.isHidden = true;
            let strIdentifier : String = IAPManager.shared.getIdentifierIAP()
            strResult = String(format: "app_purchase_result('%@', 'purchased', '%@')", self.productId, strIdentifier)
            Util.LoadingView.hide()
            break
        case .disabled:
            self.m_indicatorView.isHidden = true;
            Util.LoadingView.hide()
            break
        case .fail:
            self.m_indicatorView.isHidden = true;
            strResult = String(format: "app_purchase_result('%@', 'fail', '%@')", self.productId, "")
            
            Util.LoadingView.hide()
            break
        case .restored:
            self.m_indicatorView.isHidden = true;
            let strIdentifier : String = IAPManager.shared.getIdentifierIAP()
            strResult = String(format: "app_purchase_result('%@', 'restored', '%@')", self.productId, strIdentifier)
            break
        case .processing:
            break
        case .deffered:
            break
        }
        
        if(strResult.count > 0){
            //self.m_mainWebview.evaluateJavaScript(strResult, completionHandler: nil)
            doWebReturn(str: strResult)
        }
    }
    

    #endif
    
    func setUserInfo(key: String, value : String){
        Util.log("setUserInfo")
        UserDefaults.standard.set(value, forKey: key)
        UserDefaults.standard.synchronize()
    }
    
    func getUserInfo(key: String){
        Util.log("getUserInfo")
        guard let value : String = UserDefaults.standard.object(forKey: key) as? String else{
            //self.m_mainWebview.evaluateJavaScript("getUserInfo('')", completionHandler: nil)
            doWebReturn(str: "getUserInfo('')")
            return
        }
        let callBack : String = String(format:"getUserInfo('%@')", value)
        //self.m_mainWebview.evaluateJavaScript(callBack, completionHandler: nil)
        doWebReturn(str: callBack)
    }
    
    func checkInstalledApp(scheme : String){
        Util.log("checkInstalledApp")
        let url : URL = URL(string:scheme)!
        let isInstall : Bool =  UIApplication.shared.canOpenURL(url)
        let callBack : String = String(format:"getInstallApps('%@')", isInstall as CVarArg)
        //self.m_mainWebview.evaluateJavaScript(callBack, completionHandler: nil)
        doWebReturn(str: callBack)
    }
    
    func routeShare(type : String, startLat : String, startLon : String, endLat : String, endLon : String, name : String, address : String){
        Util.log("routeShare")
        var strType : String = type.trimmingCharacters(in: .whitespacesAndNewlines)
        if strType.isEmpty{
            strType = "all";
        }
        print("routeShare - main strtype:" + strType)
        if strType == "tmap"{
            let strDstName : String = name.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed)!
            let strURI : String = String(format : "tmap://route?goaly=%@&goalx=%@&goalname=%@", endLat, endLon,strDstName)
            let tMap : URL = URL(string:strURI)!
            if(UIApplication.shared.canOpenURL(tMap)){
                UIApplication.shared.open(tMap, options:[:], completionHandler: nil)
            }else{
               let str = "https://itunes.apple.com/kr/app/id431589174?mt=8"
                let url : URL = URL(string:str)!
                UIApplication.shared.open(url, options:[:], completionHandler: nil)
            }
        }else if strType == "apple"{
            let strURI : String = String(format : "maps://?t=m&saddr%@,%@&daddr=%@,%@", startLat, startLon, endLat, endLon)
            let appleMap : URL = URL(string:strURI)!
            if(UIApplication.shared.canOpenURL(appleMap)){
                UIApplication.shared.open(appleMap, options:[:], completionHandler: nil)
            }else{
               let str = "https://itunes.apple.com/kr/app/id915056765"
                let url : URL = URL(string:str)!
                UIApplication.shared.open(url, options:[:], completionHandler: nil)
            }
        }else if strType == "kakao"{
            let strURI : String = String(format : "daummaps://route?ep=%@,%@&by=CAR", endLat, endLon)
            let kakaoMap : URL = URL(string:strURI)!
            if(UIApplication.shared.canOpenURL(kakaoMap)){
                UIApplication.shared.open(kakaoMap, options:[:], completionHandler: nil)
            }else{
               let str = "https://itunes.apple.com/kr/app/id304608425?mt=8"
                let url : URL = URL(string:str)!
                UIApplication.shared.open(url, options:[:], completionHandler: nil)
            }
        }else if strType == "naver"{
            // 1 : 자동차
            // 2 : 대중교통
            // 3 : 자전거
            // 4 : 도보
            let strDstName : String = name.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed)!
            let strURI : String = String(format : "navermaps://?menu=route&routeType=1&elat=%@&elng=%@&etitle=%@", endLat, endLon, strDstName)
            let naverMap : URL = URL(string:strURI)!
            print(naverMap)
            if(UIApplication.shared.canOpenURL(naverMap)){
                UIApplication.shared.open(naverMap, options:[:], completionHandler: nil)
            }else{
               let str = "https://itunes.apple.com/kr/app/id311867728?mt=8"
                let url : URL = URL(string:str)!
                UIApplication.shared.open(url, options:[:], completionHandler: nil)
            }
        }else if strType == "google"{
            var strURI : String = "";
            if address.isEmpty == false{
                let strDstName : String = address.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed)!
                strURI = String(format : "http://maps.google.com/maps?daddr=%@", strDstName)
            }else{
                if(endLon.isEmpty == false && endLat.isEmpty == false)
                {
                    strURI = String(format : "http://maps.google.com/maps?daddr=%@,%@", endLat, endLon)
                }
            }
            
            if strURI.isEmpty == false{
                let url : URL = URL(string:strURI)!
                UIApplication.shared.open(url, options:[:], completionHandler: nil)
            }else{
                // 목적지 정보가 잘못 입력 되었습니다.
            }
        }else{
            MapsData.shared.startLat = startLat;
            MapsData.shared.startLon = startLon;
            MapsData.shared.endLat = endLat;
            MapsData.shared.endLon = endLon;
            MapsData.shared.endName = name;
            MapsData.shared.endAddress = address;
            
            let alertController = UIAlertController(title: "\n\n\n\n\n\n", message: nil, preferredStyle: UIAlertController.Style.actionSheet)
            let margin:CGFloat = 10.0
            let bgRect = CGRect(x: margin, y: margin, width: alertController.view.bounds.size.width - margin * 4.0, height: 120)
            let customView = UIView(frame: bgRect)
            alertController.view.addSubview(customView)
            
            let chooser = MapsOpenIn.instanceFromNib()
            chooser.frame = CGRect(x: 0.0, y: 0.0, width: customView.frame.size.width, height: customView.frame.size.height)
            customView.addSubview(chooser)
            
            let cancelAction = UIAlertAction(title: "취소".lang()!, style: .cancel, handler: {(alert: UIAlertAction!) in print("cancel")})
            alertController.addAction(cancelAction)
            
            DispatchQueue.main.async {
                self.present(alertController, animated: true, completion:{})
            }
        }
    }
    
    func getTelNumber(strQuery : String) -> Void {
        Util.log("getTelNumber")
        //self.m_mainWebview.evaluateJavaScript(strQuery, completionHandler: nil)
        doWebReturn(str: strQuery)
    }
    
    override func prepare(for segue: UIStoryboardSegue, sender send: Any?){
        if segue.identifier == "CODEREADER"{
//            let vc = segue.destination as! CodeReaderVC
//            vc.codeType = send as? String
        }
    }
    
    func goToCodeReader(codeType : String) -> Void {
        Util.log("goToCodeReader")
        self.codeType = codeType
        self.performSegue(withIdentifier: "CODEREADER", sender:codeType)
    }
    
    @objc func doPostQRMessage(notification: Notification) {
        if let info : [String : String] = notification.userInfo as? [String : String] {
            if let result : String = info["result"], result == "success" {
                let message : String = info["message"]!
                let strJSP : String = String(format: "result_app_get_%@('%@', '%@')",self.codeType, result, message)
                //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
                doWebReturn(str: strJSP)
            }
        }
    }
    
    func doCallPhone(scheme : String) -> Void {
        Util.log("doCallPhone")
        let url : URL = URL(string: String(format: "telprompt://%@", scheme))!
        UIApplication.shared.open(url, options:[:], completionHandler: nil)
    }
    
    func doAddChildView(url : String) -> Void {
        Util.log("doAddChildView")
        if let moveUrl = URL(string: url){
            m_childView[m_childIndex].load(URLRequest(url: moveUrl))
        }
        self.m_containerView.addSubview(m_childView[m_childIndex]);
        
        UIView.transition(with: self.m_childView[self.m_childIndex],
                          duration: TIME_DURING_VIEW_ANIMATION,
                          options: [.curveEaseInOut],
                          animations: {
                            self.m_childView[self.m_childIndex].frame = CGRect(x: 0.0, y: 0.0, width: self.m_containerView.frame.size.width, height: self.m_containerView.frame.size.height)
        }, completion: nil)
        m_childIndex += 1
    }
    
    func removeChildLastView(reload : Bool) -> Void {
        Util.log("removeChildLastView")
        m_childIndex -= 1
        if(m_childIndex <= 0) {
            m_childIndex = 0;
        }
        UIView.transition(with: self.m_childView[self.m_childIndex],
                          duration: TIME_DURING_VIEW_ANIMATION,
                          options: [.curveEaseInOut],
                          animations: {
                            self.m_childView[self.m_childIndex].frame = CGRect(x: self.m_containerView.frame.size.width,
                                                                               y: 0.0,
                                                                               width: self.m_containerView.frame.size.width,
                                                                               height: self.m_containerView.frame.size.height)
        }, completion: { (finish : Bool) ->() in
            self.clearWebview()
        })
    }
    
    func removeChildAllView() -> Void {
        Util.log("removeChildAllView")
        for i in 0 ..< self.m_childIndex {
            self.m_childView[i].frame = CGRect(x: self.m_containerView.frame.size.width,
                                                               y: 0.0,
                                                               width: self.m_containerView.frame.size.width,
                                                               height: self.m_containerView.frame.size.height)
            let clearURL = URL(string: "about:blank")
            m_childView[i].load(URLRequest(url: (clearURL ?? nil)!))
            m_childView[i].removeFromSuperview()
        }
    }
    
    func clearWebview() -> Void {
        Util.log("clearWebview")
        if let clearURL = URL(string: "about:blank"){
            m_childView[m_childIndex].load(URLRequest(url: clearURL))
            m_childView[m_childIndex].removeFromSuperview()
        }
    }
    
    // SNS Login
    func doSnsLogin(login_type: String, sns_type: String) -> Void {
        Util.log ("doSnsLogin:login_type: \(login_type) /sns_type: \(sns_type)")
        if login_type != "" && sns_type != "" {
            if sns_type == "naver"{
                self.doNaver(login_type: login_type)
            }else if sns_type == "kakao"{
                self.doKakao(login_type: login_type)
            }else if sns_type == "google"{
                self.googleSignIn()
            }else if sns_type == "apple"{
                self.doAppleSignIn(login_type: login_type)
            }else{
            }
        }else{
            self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: sns_type, message:"필수값 누락".lang()!)

        }
    }
    func doSnsLoginResult(
        result:String,
        login_type:String,
        sns_type:String,
        message:String = "",
        id:String = "",
        name:String = "",
        nickName:String = "",
        phone:String = "",
        email:String = "",
        profile:String = ""){
            Util.log("doSnsLoginResult: \(id)")
            print("id:"+id)
            
        var resultData:[String:Any] = [:]
        resultData.updateValue(login_type, forKey: "login_type")
        resultData.updateValue(sns_type, forKey: "sns_type")
        resultData.updateValue(Config.shared.fcmToken, forKey: "token")
        resultData.updateValue(id, forKey: "id")
        resultData.updateValue(name, forKey: "name")
        resultData.updateValue(nickName, forKey: "nick")
        resultData.updateValue(phone, forKey: "hp")
        resultData.updateValue(email, forKey: "email")
        resultData.updateValue(profile, forKey: "photo")
        print(resultData)
        
        //self.m_mainWebview.evaluateJavaScript("result_sns_login('\(result)','\(message)','\(Util.toJsonString(resultData))')", completionHandler: {(result, error) in
        //    if let result = result{
        //      print(result)
        //    }
        //})
            doWebReturn(str: "result_sns_login('\(result)','\(message)','\(Util.toJsonString(resultData))')")
    }
    func isAppleSignIn() -> String {
        Util.log("doAppleSignIn")
        let userID = Util.Storage.get("appleID")
        if userID == "" {
            return "logout"
        }
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        
        // 동기적으로 Apple ID 상태 확인
        let semaphore = DispatchSemaphore(value: 0)
        var result = "logout"
                
        // 현재 Apple ID 상태 확인
        appleIDProvider.getCredentialState(forUserID: userID) { (credentialState, error) in
            switch credentialState {
            case .authorized:
                // 로그인된 상태 - 로그아웃 처리
                //self.performAppleSignOut()
                result = "login"
            case .revoked, .notFound:
                // 이미 로그아웃된 상태
                print("이미 로그아웃된 상태입니다")
            case .transferred:
                // 다른 앱으로 이전된 상태
                print("다른 앱으로 이전되었습니다")
            default:
                print("알 수 없는 상태")
            }
            semaphore.signal()
        }
        // 최대 3초 대기
        _ = semaphore.wait(timeout: .now() + 3.0)
        return result
    }
    func doAppleSignIn(login_type:String) -> Void {
        Util.log("doAppleSignIn")
        if login_type == "logout" {
            doAppleSignOut()
        }else{
            let isLogin = isAppleSignIn()
            if isLogin == "login" {
                let userID = Util.Storage.get("appleID")
                let email = Util.Storage.get(userID + "_email")
                let fullName = Util.Storage.get(userID + "_funnName")
                self.doSnsLoginResult(result: "success", login_type: "login", sns_type: "apple", id: "\(userID)", name: "\(fullName)", nickName: "", phone: "", email: "\(email)", profile: "")
            }else{
                let provider = ASAuthorizationAppleIDProvider()
                let request = provider.createRequest()
                request.requestedScopes = [.fullName, .email,] // 필요한 정보 요청

                let controller = ASAuthorizationController(authorizationRequests: [request])
                controller.delegate = self
                controller.presentationContextProvider = self
                controller.performRequests()
            }
        }
    }
    func doAppleSignOut() -> Void {
        Util.log("doAppleSignOut")
        Util.showToast(message: "아이폰 설정 > Apple ID > 암호 및 보안 > Apple ID로 로그인 창에서 직접 로그아웃해야 합니다.")
        // Apple ID > 암호 및 보안 > Apple ID 로그아웃으로 이동
        /*
        if let signOutUrl = URL(string: "App-Prefs:root=ACCOUNT") {
            UIApplication.shared.open(signOutUrl) { success in
                if success {
                    print("Apple ID 로그아웃 설정으로 이동")
                } else {
                    print("Apple ID 로그아웃 설정으로 이동 실패")
                }
            }
        }
         */
    }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        Util.log("presentationAnchor")
        return self.view.window!
    }
    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        Util.log("authorizationController")
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
            print("credential", credential)
            let oUserID = Util.Storage.get("appleID")
            let userID = credential.user
            if oUserID != userID {
                Util.Storage.set("appleID", userID)
            }
            //let email = credential.email
            //let fullName = credential.fullName
            var email:String = ""
            var fullName:String = ""
            if let tmp = credential.email {
                email = tmp
            }
            if let tmp1 = credential.fullName {
                fullName = "\(tmp1.givenName ?? "") \(tmp1.familyName ?? "")".trimmingCharacters(in: .whitespaces)
            }
            //email = "aa@aa.com"
            if email != "" {
                Util.Storage.set(userID + "_email", email)
            }
            if fullName != "" {
                Util.Storage.set(userID + "_fullName", fullName)
            }
            if email == "" {
                email = Util.Storage.get(userID + "_email")
            }
            if fullName == "" {
                fullName = Util.Storage.get(userID + "_funnName")
            }

            print("Apple User ID: \(userID)")
            print("Email: \(String(describing: email))")
            print("Full Name: \(String(describing: fullName))")

            if let identityToken = credential.identityToken,
               let tokenString = String(data: identityToken, encoding: .utf8) {
                print("Identity Token: \(tokenString)")
                // 👉 여기서 서버에 토큰 전달 후 검증
            }
            self.doSnsLoginResult(result: "success", login_type: "login", sns_type: "apple", id: "\(userID)", name: "\(fullName)", nickName: "", phone: "", email: "\(email)", profile: "")
        }else{
            self.doSnsLogin(login_type: "error", sns_type: "login fail")
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        Util.log("authorizationController2")
        print("Apple Login Failed: \(error.localizedDescription)")
        self.doSnsLogin(login_type: "error", sns_type: "\(error.localizedDescription)")
    }

    func doKakao(login_type: String) -> Void {
        Util.log("doKakao1")
        #if FLAGKAKAO
        Util.log("doKakao2")
        var kakaoUse : Bool = false

        if let infoDic: [String:Any] = Bundle.main.infoDictionary {
            if let SnsLogin: [String:Any] = infoDic["SNSLOGIN"] as? Dictionary {
                if let Kakao: [String:Any] = SnsLogin["KAKAO"] as? Dictionary{
                    if let kUse:Bool = Kakao["USE"] as? Bool{
                        kakaoUse = kUse;
                        if let APPKEY:String = Kakao["APPKEY"] as? String, !APPKEY.isEmpty {
                            KakaoSDK.shared.initialize(appKey: APPKEY, sdkType: .Swift)
                            print("카카오 SDK 초기화 완료")
                        } else {
                            print("카카오 APPKEY가 비어있습니다")
                        }
                    }
                }
            }
        }

        if kakaoUse {
            if login_type == "login"{
                if (UserApi.isKakaoTalkLoginAvailable()) {
                    Util.log("aaa")
                    UserApi.shared.loginWithKakaoTalk {(oauthToken, error) in
                        if let error = error {
                            print(error)
                            self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message:"kakao error1:")
                        }else {
                            UserApi.shared.me() {(user, error) in
                                if let error = error {
                                    print(error)
                                    self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message:"kakao error2:")
                                }else {
                                    if let id = user?.id{
                                        // 실명
                                        let name = user?.kakaoAccount?.profile?.nickname as? String ?? ""
                                        let phone = user?.kakaoAccount?.phoneNumber as? String ?? ""
                                        let email = user?.kakaoAccount?.email as? String ?? ""
                                        let nickName = user?.kakaoAccount?.profile?.nickname as? String ?? ""
                                        let profile = user?.kakaoAccount?.profile?.profileImageUrl?.absoluteString as? String ?? ""
                                        self.doSnsLoginResult(result: "success", login_type: login_type, sns_type: "kakao", id: "\(id)", name: name, nickName: nickName, phone: phone, email: email, profile: profile)
                                    }else{
                                        self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message: "kakao user id 없음")
                                    }
                                }
                            }
                            print("loginWithKakaoAccount() success.")
                            
                            //do something
                            _ = oauthToken
                        }
                    }
                    
                }else{
                    Util.log("bbb")
                    UserApi.shared.loginWithKakaoAccount(prompts:[.Login] ){(oauthToken, error) in
                        if let error = error {
                            print(error)
                            self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message:"kakao error1:")
                        }else {
                            UserApi.shared.me() {(user, error) in
                                if let error = error {
                                    print(error)
                                    self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message:"kakao error2:")
                                }else {
                                    if let id = user?.id{
                                        // 카카오 네임
                                        let name = user?.kakaoAccount?.profile?.nickname as? String ?? ""
                                        let phone = user?.kakaoAccount?.phoneNumber as? String ?? ""
                                        let email = user?.kakaoAccount?.email as? String ?? ""
                                        let nickName = user?.kakaoAccount?.profile?.nickname as? String ?? ""
                                        let profile = user?.kakaoAccount?.profile?.profileImageUrl?.absoluteString as? String ?? ""
                                        self.doSnsLoginResult(result: "success", login_type: login_type, sns_type: "kakao", id: "\(id)", name: name, nickName: nickName, phone: phone, email: email, profile: profile)
                                    }else{
                                        self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message: "kakao user id 없음")
                                    }
                                }
                            }
                            print("loginWithKakaoAccount() success.")
                            //do something
                            _ = oauthToken
                        }
                    }
                }
            }else if login_type == "logout" {
                UserApi.shared.logout {(error) in
                    if let error=error {
                        print(error)
                        self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message:"logout error1:")
                    }else{
                        self.doSnsLoginResult(result: "success", login_type: login_type, sns_type: "kakao", message:"logout success")
                    }
                    return
                }
            }else if login_type == "signout" {
                UserApi.shared.unlink {(error) in
                    if let error = error {
                        print(error)
                        self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message:"logout error1:")
                    }else{
                        self.doSnsLoginResult(result: "success", login_type: login_type, sns_type: "kakao", message:"signout success")
                    }
                }
            }else{
                self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "kakao", message:"지원 안함")
            }
        }
        #endif
    }
    func doNaver(login_type: String) -> Void {
        Util.log("doNaver1")
        #if FLAGNAVER
        print("doNaver2")
        var naverUse : Bool = false
        var naverClientID : String = ""
        var naverClientSecret : String = ""
        if let infoDic: [String:Any] = Bundle.main.infoDictionary {
            if let SnsLogin: [String:Any] = infoDic["SNSLOGIN"] as? Dictionary {
                if let Naver: [String:Any] = SnsLogin["NAVER"] as? Dictionary{
                    if let nUse:Bool = Naver["USE"] as? Bool{
                        naverUse = nUse;
                    }
                    if let nClientID:String = Naver["CLIENTID"] as? String{
                        naverClientID = nClientID;
                    }
                    if let nClientSecret:String = Naver["CLIENTSECRET"] as? String{
                        naverClientSecret = nClientSecret;
                    }
                }
            }
        }
        print("naverUse:"+String(naverUse))
        print("naverClientID:"+naverClientID)
        print("naverClientSecret:"+naverClientSecret)
        if naverUse {
            if login_type == "login" {
                // 네이버 앱으로 인증하는 방식을 활성화
                self.naverLoginConn?.isNaverAppOauthEnable = true
                // SafariViewController에서 인증하는 방식을 활성화
                self.naverLoginConn?.isInAppOauthEnable = true
                // 인증 화면을 iPhone의 세로 모드에서만 사용하기
                self.naverLoginConn?.isOnlyPortraitSupportedInIphone()
                // 네이버 아이디로 로그인하기 설정
                // 애플리케이션을 등록할 때 입력한 URL Scheme
                let bundleID:String = Bundle.main.infoDictionary?["CFBundleIdentifier"] as! String
                let bArr = bundleID.split(separator:".")
                print("abc:"+bArr[0]+".naverlogin")
                self.naverLoginConn?.serviceUrlScheme = bArr[0]+".naverlogin"
                // 애플리케이션 등록 후 발급받은 클라이언트 아이디
                self.naverLoginConn?.consumerKey = naverClientID
                // 애플리케이션 등록 후 발급받은 클라이언트 시크릿
                self.naverLoginConn?.consumerSecret = naverClientSecret
                // 애플리케이션 이름
                self.naverLoginConn?.appName = "네이버 아이디로 로그인"
                self.naverLoginConn?.delegate = self
                self.naverLoginConn?.requestThirdPartyLogin()
            }else if login_type == "logout" {
                self.naverLoginConn?.resetToken()
                self.doSnsLoginResult(result: "success", login_type: login_type, sns_type: "naver", message:"logout success")
            }else if login_type == "signout" {
                self.naverLoginConn?.requestDeleteToken()
                self.doSnsLoginResult(result: "success", login_type: login_type, sns_type: "naver", message:"signout success")
            }else{
                self.doSnsLoginResult(result: "error", login_type: login_type, sns_type: "naver", message:"지원 안함")
            }
        }
        #endif
    }
    // permission
    func doPermission(name: String, show: String) -> Void {
        Util.log ("doPermission:name: \(name) /show: \(show)")
        if name == "push" {
            Permission.getPermission(name:name){yn in
                print("YN:"+String(yn)+"/show:"+show)
                if show=="Y" && yn==false {
                    
                    let appDelegate = UIApplication.shared.delegate as? AppDelegate
                    appDelegate?.chkForegroundPush=true
                    let settingUrl = NSURL(string: UIApplication.openSettingsURLString)!
                    if UIApplication.shared.canOpenURL(settingUrl as URL){
                        
                        UIApplication.shared.open(settingUrl as URL, options: self.convertToUIApplicationOpenExternalURLOptionsKeyDictionary([:]), completionHandler: { (istrue) in
                            print("dlfjsadl;fj;lasdjkf;lasdkjf;ldkjf;lsdf")
                            
                        })
                    }
                }else{
                    self.doPermissionResult(result:"success", name:"push", permit:yn ? "Y" : "N")
                }
            }
        }else{
            self.doPermissionResult(result: "error", message:"지원 안함", name: name)
        }
    }
    func getContacts() {
        Util.log("getcontacts")
        // 권한 요청
        ContactManager.shared.requestAccess { granted, error in
            if granted {
                // 연락처 가져오기
                ContactManager.shared.fetchContacts { contacts, error in
                    if let contacts = contacts {
                        self.jsonArray = NSMutableArray.init();
                        // 연락처 사용
                        contacts.forEach { contact in
                            let name = "\(contact.familyName)\(contact.givenName)"
                            let phones = contact.phoneNumbers.map { $0.value.stringValue }.joined(separator: ", ")
                            let item: NSMutableDictionary = NSMutableDictionary.init()
                            item.setValue(name, forKey: "name")
                            item.setValue(phones, forKey: "phone")
                            item.setValue("", forKey: "note")
                            
                            self.jsonArray?.add(item)
                        }
                        let strJSP : String = String(format:"getContactsInfo('success','%@')",Util.getJSONFromArray(array: self.jsonArray!))
                        print("strJSP", strJSP)
                        //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
                        self.doWebReturn(str: strJSP)
                    }
                }
            } else {
                print("연락처 접근 권한이 거부되었습니다.")
                let strJSP : String = String(format:"getContactsInfo('fail','%@')","연락처 접근 권한이 거부되었습니다.")
                //self.m_mainWebview.evaluateJavaScript(strJSP, completionHandler: nil)
                self.doWebReturn(str: strJSP)
            }
        }
    }
    
    func googleSignIn() {
        Util.log("googleSignIn")
        #if FLAGGOOGLESIGN
        Util.log("FLAGGOOGLESIGN")
        GIDSignIn.sharedInstance.signIn(withPresenting: self) { signInResult, error in
            var strJSON : String = String(format: "result_sns_login('error', '%@', '')", error.debugDescription)
            if error == nil {
                guard let signInResult = signInResult else { return }
                let user = signInResult.user
                let email:String? = user.profile?.email
                let name:String? = user.profile?.name
                let userID:String?  = user.userID!
                let idToken:String?  = user.idToken?.tokenString
                let profilePicUrl = user.profile?.imageURL(withDimension: 320)
                
                var dic2 = Dictionary<String,String>()
                dic2.updateValue("login", forKey: "login_type")
                dic2.updateValue("google", forKey: "sns_type")
                dic2.updateValue(userID!, forKey: "id")
                dic2.updateValue(idToken! , forKey: "token")
                dic2.updateValue(name!, forKey: "name")
                dic2.updateValue(name!, forKey: "nick")
                dic2.updateValue(email!, forKey: "email")
                dic2.updateValue(profilePicUrl!.absoluteString, forKey: "photo")
                dic2.updateValue("", forKey: "hp")
                
                let data2 : NSData! = try? JSONSerialization.data(withJSONObject: dic2, options: []) as NSData?
                let JSONString2 = NSString(data:data2 as Data,encoding: String.Encoding.utf8.rawValue)
                
                
                //strJSON = String(format: "getGoogleInfo('success', '%@');result_sns_login('success', '', '%@');", JSONString!, JSONString2!)
                strJSON = String(format: "result_sns_login('success', '', '%@');", JSONString2!)
            }
            //self.m_mainWebview.evaluateJavaScript(strJSON, completionHandler: {(result, error) in
            //    if let result = result{
            //      print(result)
            //    }
            //})
            self.doWebReturn(str: strJSON)
        }
        #endif
    }
    
    @IBAction func GoogleSignOut(_ sender: AnyObject) {
        #if FLAGGOOGLESIGN
        GIDSignIn.sharedInstance.signOut()
        #endif
    }
    
    
    
    #if FLAGADMOB
    private var interstitial: InterstitialAd?
    #endif
    func doAdMob(type: String, view: String) -> Void {
        Util.log("doAdMob-type: \(type) /view: \(view)")
        #if FLAGADMOB
        if type=="banner" {
            var unitID:String = "ca-app-pub-3940256099942544/2934735716"
            if let path : String = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") {
                if let dic = NSDictionary(contentsOfFile: path) as? Dictionary<String, AnyObject>{
                    if let uID = dic["ADMOB_BANNER_UNIT_ID"] as? String {
                        unitID = uID
                    }
                }
            }
            print("unitID: ", unitID)
            print("ddd:", (m_admobBannerView == nil))
            if m_admobBannerView == nil {
                self.m_admobBannerView = BannerView(adSize: AdSizeBanner)
                self.m_admobBannerView.translatesAutoresizingMaskIntoConstraints = false
                self.m_containerView.addSubview(self.m_admobBannerView);
                self.m_containerView.addConstraints(
                    [NSLayoutConstraint(item: self.m_admobBannerView,
                                        attribute: .bottom,
                                        relatedBy: .equal,
                                        toItem: self.m_containerView.safeAreaLayoutGuide,
                                        attribute: .bottom,
                                        multiplier: 1,
                                        constant: 0),
                     NSLayoutConstraint(item: self.m_admobBannerView,
                                        attribute: .centerX,
                                        relatedBy: .equal,
                                        toItem: self.m_containerView,
                                        attribute: .centerX,
                                        multiplier: 1,
                                        constant: 0)
                    ])
            }
            if view == "show" {
                self.m_admobBannerView.isHidden = false	
                self.m_admobBannerView.adUnitID = unitID
                self.m_admobBannerView.rootViewController = self
                self.m_admobBannerView.load(Request())
                if m_admobBannerViewOx == false {
                    Util.log("xxxxxxxxxxxxx: \(self.m_admobBannerView.frame.size.height)")
                    //self.m_mainWebview.frame.size.height = self.m_mainWebview.frame.size.height - self.m_admobBannerView.frame.size.height - 100
                    // adview의 높이를 가져오기 (아직 0일 수 있으므로 기본값 사용)
                    let adHeight = self.m_admobBannerView.frame.size.height > 0
                        ? self.m_admobBannerView.frame.size.height + 5
                        : 50.0 // 기본 배너 높이 (실제 높이에 맞게 조정)

                    // 기존 constraint 비활성화
                    self.m_mainWebviewBottomConstraint?.isActive = false
                    
                    // containerView의 bottom에서 adview 높이만큼 빼기
                    self.m_mainWebviewBottomConstraint = self.m_mainWebview.bottomAnchor.constraint(
                        equalTo: self.m_containerView.bottomAnchor,
                        constant: -adHeight
                    )
                    self.m_mainWebviewBottomConstraint?.isActive = true
                    
                    // 레이아웃 즉시 업데이트
                    self.view.layoutIfNeeded()
                }
                m_admobBannerViewOx = true
            }else{
                self.m_admobBannerView.isHidden = true
                if m_admobBannerViewOx == true {
                    //self.m_mainWebview.frame.size.height = self.m_mainWebview.frame.size.height + self.m_admobBannerView.frame.size.height
                    // 기존 frame 변경 코드 제거하고 constraint로 변경
                    // adview의 높이를 가져오기 (아직 0일 수 있으므로 기본값 사용)
                    let adHeight = self.m_admobBannerView.frame.size.height > 0
                        ? self.m_admobBannerView.frame.size.height + 5
                        : 50.0 // 기본 배너 높이 (실제 높이에 맞게 조정)

                    // 기존 constraint 비활성화
                    self.m_mainWebviewBottomConstraint?.isActive = false
                    
                    // containerView의 bottom에서 adview 높이만큼 빼기
                    self.m_mainWebviewBottomConstraint = self.m_mainWebview.bottomAnchor.constraint(
                        equalTo: self.m_containerView.bottomAnchor,
                        constant: -adHeight
                    )
                    self.m_mainWebviewBottomConstraint?.isActive = true
                    
                    // 레이아웃 즉시 업데이트
                    self.view.layoutIfNeeded()
                }
                m_admobBannerViewOx = false

            }
            return
        }else{
            
            let request = Request()
            //test unit id : ca-app-pub-3940256099942544/4411468910
            //ca-app-pub-4605347005074253/8597082534
            var unitID:String = "ca-app-pub-3940256099942544/4411468910"
            if let path : String = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") {
                if let dic = NSDictionary(contentsOfFile: path) as? Dictionary<String, AnyObject>{
                    if let uID = dic["ADMOB_FULL_UNIT_ID"] as? String {
                        unitID = uID
                    }
                }
            }
            print("unitID:", unitID)
            
            InterstitialAd.load(with: unitID, request: request, completionHandler: { [self] ad, error in
                if let error = error {
                    print("Failed to load interstitial ad with error: \(error.localizedDescription)")
                    Util.showToast(message: "Failed to load interstitial ad with error: \(error.localizedDescription)")
                    return	
                }
                interstitial = ad
                //interstitial?.fullScreenContentDelegate = self
                if interstitial != nil {
                    interstitial?.present(from: self)
                } else {
                    print("Ad wasn't ready")
                }
            }
            )
        }
        #endif
    }


    func pushCallback(){
        Util.log("pushCallback")
        Permission.getPermission(name:"push"){ success in
            self.doPermissionResult(result:"success", name:"push", permit:success ? "Y" : "N")
        }
    }
    func convertToUIApplicationOpenExternalURLOptionsKeyDictionary(_ input: [String: Any]) -> [UIApplication.OpenExternalURLOptionsKey: Any] {
        Util.log("convertToUIApplicationOpenExternalURLOptionsKeyDictionary")
        return Dictionary(uniqueKeysWithValues: input.map { key, value in (UIApplication.OpenExternalURLOptionsKey(rawValue: key), value)})
    }
    func doPermissionResult(result:String, message:String = "", name:String = "", permit:String = ""){
        Util.log("doPermissionResult")
        var resultData:[String:Any] = [:]
        resultData.updateValue(name, forKey: "name")
        resultData.updateValue(permit, forKey: "permit")
        print(resultData)
        //self.m_mainWebview.evaluateJavaScript("result_permission('\(result)','\(message)','\(Util.toJsonString(resultData))')", completionHandler: {(result, error) in
        //    if let result = result{
        //      print(result)
        //    }
        //})
        doWebReturn(str: "result_permission('\(result)','\(message)','\(Util.toJsonString(resultData))')")
    }
    func doWebReturn(str: String) {
        Util.log("doWebReturn: \(str)")
        self.m_mainWebview.evaluateJavaScript(str, completionHandler: {(result, error) in
            if let result = result{
              print(result)
            }
        })
    }
}
#if FLAGNAVER
extension MainViewController:NaverThirdPartyLoginConnectionDelegate{
    
    func toJsonString(_ paramDic:[String:Any]) -> String{
        guard let data = try? JSONSerialization.data(withJSONObject: paramDic, options: []) else {
           print("loadMsgList return")
           return ""
        }
        let jsonString:String! = String(data: data, encoding: String.Encoding.utf8)
        return jsonString
    }
    
    func getNaverInfo(){
        print ("getNaverInfo")
        guard let isValidAccessToken = self.naverLoginConn?.isValidAccessTokenExpireTimeNow() else { return }
        if !isValidAccessToken {
            return
        }
        
        guard let tokenType = self.naverLoginConn?.tokenType else { return }
        guard let accessToken = self.naverLoginConn?.accessToken else { return }
        let urlStr = "https://openapi.naver.com/v1/nid/me"
        let url = URL(string: urlStr)!

        let authorization = "\(tokenType) \(accessToken)"
        let req = AF.request(url, method: .get, parameters: nil, encoding: JSONEncoding.default, headers: ["Authorization": authorization])
        req.responseJSON { response in
            var result = "success"
            guard let body = response.value as? [String: Any] else { return }
                  
            if let resultCode = body["message"] as? String{
                if resultCode.trimmingCharacters(in: .whitespaces) == "success"{
                    result = "success"
                    let resultJson = body["response"] as! [String: Any]
                    print(resultJson)
                  
                    let name = resultJson["name"] as? String ?? ""
                    let id = resultJson["id"] as? String ?? ""
                    let phone = resultJson["mobile"] as? String ?? ""
                    let profile = resultJson["profile_image"] as? String ?? ""
                    let email = resultJson["email"] as? String ?? ""
                    let nickName = resultJson["nickname"] as? String ?? ""

                    self.doSnsLoginResult(result: result, login_type: "login", sns_type: "naver", id: id, name: name, nickName: nickName, phone: phone, email: email, profile: profile)
                }else{
                    result = "error"
                    self.doSnsLoginResult(result: result, login_type: "login", sns_type: "naver")
                      //실패
                }
            }
            
            
        }
    }
    func oauth20ConnectionDidFinishRequestACTokenWithAuthCode() {
        print("login success")
        self.getNaverInfo()
    }
    
    func oauth20ConnectionDidFinishRequestACTokenWithRefreshToken() {
        print("token refresh")
        self.getNaverInfo()
    }
    
    func oauth20ConnectionDidFinishDeleteToken() {
        print("token delete token")
    }
    
    func oauth20Connection(_ oauthConnection: NaverThirdPartyLoginConnection!, didFailWithError error: Error!) {
        print("[Error] :", error.localizedDescription)
    }

}
#endif


