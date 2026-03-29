//
//  Permission.swift
//  LuSoft
//
//  Created by 루소프트 on 22/08/2023.
//  Copyright © 2023 dqnetworks. All rights reserved.
//

import Foundation
import UserNotifications

class Permission {
    static let shared = Permission()
    
    public static func getPermission(name:String, completion:@escaping (Bool)->()) {
        if name=="push"{
            self.isNotificationsEnabled{ success in
                completion(success)
            }
        }
    }

    public static func isNotificationsEnabled(completion:@escaping (Bool)->() ) {
        UNUserNotificationCenter.current()
            .getNotificationSettings { permission in
                switch permission.authorizationStatus  {
                case .authorized:
                    print("푸시 수신 동의")
                    completion(true)
                default:
                    completion(false)
                }
                
                //case .denied:
                //    print("푸시 수신 거부")
                //case .notDetermined:
                //    print("한 번 허용 누른 경우")
                //case .provisional:
                //    print("푸시 수신 임시 중단")
                //case .ephemeral:
                //    // @available(iOS 14.0, *)
                //    print("푸시 설정이 App Clip에 대해서만 부분적으로 동의한 경우")
            }
         
    }

}
