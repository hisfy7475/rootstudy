//
//  AppDelegate.swift
//  NicepayAppSample
//
//  Created by xoghzone on 2019/11/27.
//  Copyright © 2019 Nicepayment. All rights reserved.
//

import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        
        window = UIWindow(frame: UIScreen.main.bounds);
        let vc = RootViewController();
        let nav = UINavigationController(rootViewController:vc);
        window?.rootViewController = nav;
        window?.makeKeyAndVisible();
        
        return true
    }
}

