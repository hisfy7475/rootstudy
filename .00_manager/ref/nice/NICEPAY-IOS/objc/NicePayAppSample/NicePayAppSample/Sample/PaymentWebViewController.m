//
//  PaymentWebViewController.m
//  NicePayAppSample
//
//  Created by xoghzone on 2019. 1. 9..
//  Copyright © 2019년 Nicepayments. All rights reserved.
//

#import "PaymentWebViewController.h"

#define PAY_URL     @"https://web.nicepay.co.kr/demo/v3/mobileReq.jsp"

@interface PaymentWebViewController ()

@end

@implementation PaymentWebViewController

//------------------------------------------------------------------------------------------
//
// WKUIDelegate
//
//------------------------------------------------------------------------------------------
#pragma mark - WKUIDelegate

- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
    UIAlertController *alertController = [UIAlertController alertControllerWithTitle:nil
                                                                             message:message
                                                                      preferredStyle:UIAlertControllerStyleAlert];
    [alertController addAction:[UIAlertAction actionWithTitle:@"확인"
                                                        style:UIAlertActionStyleCancel
                                                      handler:^(UIAlertAction *action) {
                                                          completionHandler();
                                                      }]];
    [self presentViewController:alertController animated:YES completion:^{}];
}

- (void)webView:(WKWebView *)webView runJavaScriptConfirmPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(BOOL result))completionHandler {
    UIAlertController *alertController = [UIAlertController alertControllerWithTitle:nil
                                                                             message:message
                                                                      preferredStyle:UIAlertControllerStyleAlert];
    [alertController addAction:[UIAlertAction actionWithTitle:@"취소"
                                                        style:UIAlertActionStyleCancel
                                                      handler:^(UIAlertAction *action) {
                                                            completionHandler(NO);
                                                        }]];
    
    [alertController addAction:[UIAlertAction actionWithTitle:@"확인"
                                                        style:UIAlertActionStyleDefault
                                                      handler:^(UIAlertAction *action) {
                                                            completionHandler(YES);
                                                        }]];
    
    [self presentViewController:alertController animated:YES completion:^{}];
}

- (void)webView:(WKWebView *)webView runJavaScriptTextInputPanelWithPrompt:(NSString *)prompt defaultText:(NSString *)defaultText initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(NSString * _Nullable))completionHandler {
    UIAlertController *alertController = [UIAlertController alertControllerWithTitle:nil
                                                                             message:prompt
                                                                      preferredStyle:UIAlertControllerStyleAlert];
    [alertController addTextFieldWithConfigurationHandler:^(UITextField *textField) {
        textField.text = defaultText;
    }];
    
    [alertController addAction:[UIAlertAction actionWithTitle:@"확인"
                                                        style:UIAlertActionStyleDefault
                                                      handler:^(UIAlertAction *action) {
        completionHandler(alertController.textFields.firstObject.text);
    }]];

    [alertController addAction:[UIAlertAction actionWithTitle:@"취소"
                                                        style:UIAlertActionStyleCancel
                                                      handler:^(UIAlertAction *action) {
        completionHandler(nil);
    }]];
    
    [self presentViewController:alertController animated:YES completion:^{}];
}

//------------------------------------------------------------------------------------------
//
// WKNavigationDelegate
//
//------------------------------------------------------------------------------------------
#pragma mark - WKNavigationDelegate
 
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURLRequest *request = navigationAction.request;
    NSURL *url = [request URL];
    NSString *urlScheme = [url scheme];
    
    NSLog(@"url : %@", url);
    
    if( ![urlScheme isEqualToString:@"http"] && ![urlScheme isEqualToString:@"https"] ) {
        if( [urlScheme isEqualToString:@"ispmobile"] && ![[UIApplication sharedApplication] canOpenURL:url] ) {
            //ISP App가 설치되어 있지 않을 경우 앱스토어로 이동
            [[UIApplication sharedApplication] openURL:[NSURL URLWithString:@"https://itunes.apple.com/kr/app/id369125087?mt=8"] 
                                               options:@{}
                                     completionHandler:nil];
        } else if( [urlScheme isEqualToString:@"kftc-bankpay"] && ![[UIApplication sharedApplication] canOpenURL:url] ) {
            //BANKPAY App가 설치되어 있지 않을 경우 앱스토어로 이동
            [[UIApplication sharedApplication] openURL:[NSURL URLWithString:@"https://itunes.apple.com/us/app/id398456030?mt=8"] 
                                               options:@{}
                                     completionHandler:nil];
        } else {
            if( [[UIApplication sharedApplication] canOpenURL:url] ) {
                [[UIApplication sharedApplication] openURL:url
                                                   options:@{}
                                         completionHandler:nil];
            } else {
                //
                //1. App 미설치 확인
                //2. info.plist 내 scheme 등록 확인
            }
        }
    }
    
    decisionHandler(WKNavigationActionPolicyAllow);
}

//------------------------------------------------------------------------------------------
//
// ViewController
//
//------------------------------------------------------------------------------------------
#pragma mark - ViewController

- (void)dealloc {
    [self.webView release];
    [super dealloc];
}

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view from its nib.
    self.title = @"구매하기";
    
    self.webView = [[[WKWebView alloc] init] autorelease];
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    [self.view addSubview:self.webView];
    
    //nicepay 결제테스트 URL 입니다.
    //제공 된 샘플 상 payRequest 스크립트 페이지를 참고 하시여 개발 하시면 됩니다.
    [self.webView loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:PAY_URL]]];
}

- (void)viewWillLayoutSubviews {
    [super viewWillLayoutSubviews];
    
    self.webView.frame = self.view.frame;
}

@end
