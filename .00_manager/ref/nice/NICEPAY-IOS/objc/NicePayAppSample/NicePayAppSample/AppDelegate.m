//
//  AppDelegate.m
//  NicePayAppSample
//
//  Created by xoghzone on 2019. 1. 9..
//  Copyright © 2019년 Nicepayments. All rights reserved.
//

#import "AppDelegate.h"
#import "RootViewController.h"

@interface AppDelegate ()

@end

@implementation AppDelegate

//------------------------------------------------------------------------------------------
//
// AppDelegate
//
//------------------------------------------------------------------------------------------
#pragma mark - AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    // Override point for customization after application launch.
    
    self.window = [[[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]] autorelease];
    
    RootViewController *vc = [[RootViewController alloc] init];
    UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:vc];

    [self.window setRootViewController:nav];
    [self.window makeKeyAndVisible];
    
    [nav release];
    [vc release];
    
    return YES;
}

@end
