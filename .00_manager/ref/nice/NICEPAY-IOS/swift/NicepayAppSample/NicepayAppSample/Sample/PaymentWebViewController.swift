//
//  PaymentWebViewController.swift
//  NicepayAppSample
//
//  Created by xoghzone on 2019/11/27.
//  Copyright © 2019 Nicepayment. All rights reserved.
//

import UIKit
import WebKit

class PaymentWebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let PAY_URL: String = "https://web.nicepay.co.kr/demo/v3/mobileReq.jsp"
    var webView: WKWebView? = nil
    
    override func viewDidLoad() {
        super.viewDidLoad()

        // Do any additional setup after loading the view.
        title = "구매하기"
        
        webView = WKWebView(frame: self.view.frame)
        webView?.navigationDelegate = self
        webView?.uiDelegate = self
        self.view.addSubview(webView!)
        
        //nicepay 결제테스트 URL 입니다.
        //제공 된 샘플 상 payRequest 스크립트 페이지를 참고 하시여 개발 하시면 됩니다.
        let url = URL(string: PAY_URL)
        let request = URLRequest(url: url!)
        webView?.load(request)
    }
    
    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        
        webView?.frame = self.view.frame
    }
    
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "확인", style: .default, handler: { (UIAlertAction) in
            completionHandler()
        }))
        
        self.present(alert, animated: true, completion: nil)
    }
    
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "취소", style: .default, handler: { (UIAlertAction) in
            completionHandler(false)
        }))
        alert.addAction(UIAlertAction(title: "확인", style: .default, handler: { (UIAlertAction) in
            completionHandler(true)
        }))
        
        self.present(alert, animated: true, completion: nil)
    }
    
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: "", message: prompt, preferredStyle: .alert)
        alert.addTextField { (textField) in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "확인", style: .default, handler: { (action) in
            if let text = alert.textFields?.first?.text {
                completionHandler(text)
            } else {
                completionHandler(defaultText)
            }
        }))
        alert.addAction(UIAlertAction(title: "취소", style: .default, handler: { (action) in
            completionHandler(nil)
        }))
        
        self.present(alert, animated: true, completion: nil)
    }
    
    //UserAgent issue
    @available(iOS 13, *)
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        
        preferences.preferredContentMode = .mobile
        
        let request = navigationAction.request
        let optUrl = request.url
        let optUrlScheme = optUrl?.scheme
        
        guard let url = optUrl, let scheme = optUrlScheme
            else {
                return decisionHandler(.cancel, preferences)
        }
        
        debugPrint("url : \(url)")
       
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
        
        decisionHandler(.allow, preferences)
    }
    
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let request = navigationAction.request
        let optUrl = request.url
        let optUrlScheme = optUrl?.scheme
        
        guard let url = optUrl, let scheme = optUrlScheme
            else {
                return decisionHandler(WKNavigationActionPolicy.cancel)
        }
        
        debugPrint("url : \(url)")
        
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
}
