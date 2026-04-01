//
//  RootViewController.m
//  NicePayAppSample
//
//  Created by xoghzone on 2019. 1. 9..
//  Copyright © 2019년 Nicepayments. All rights reserved.
//

#import "RootViewController.h"
#import "PaymentWebViewController.h"

@interface RootViewController ()

@end

@implementation RootViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view from its nib.
    self.title = @"초기화면";
    
    self.verNo.text = [NSString stringWithFormat:@"Ver %@",
                       [[[NSBundle bundleForClass:[self class]] infoDictionary] objectForKey:@"CFBundleVersion"]];
}

- (IBAction)requestPayment:(id)sender {
    PaymentWebViewController *vc = [[PaymentWebViewController alloc] init];
    [self.navigationController pushViewController:vc animated:YES];
    [vc release];
}

@end
