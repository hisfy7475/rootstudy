//
//  Config.swift
//  TEMP
//
//  Created by LEETAEIN on 01/11/2018.
//  Copyright © 2018 dqnetworks. All rights reserved.
//

import UIKit
import AVFoundation
import AudioToolbox
import UserNotifications


class Config {
    
    static let shared = Config()
    
    public let coreVersion = "1.0.0"
    public let vcStack = Stack<UIViewController>() // viewcontroller stack
    
    public var pushCatID : String?
    public var uploadPath = NSNotification.Name(rawValue: "uploadPath")
    
    private let infoDic = Bundle.main.infoDictionary?["BUILDER_SETTING"] as! [String : AnyObject]
    private let paymentArray : Array = Bundle.main.infoDictionary?["LSApplicationQueriesSchemes"] as! Array<String>
    
    
    private var _network_status : Int?
    var network_status : Int {
        get {
            return _network_status!
        }
        set {
            _network_status = newValue
        }
    }

    private var _udid : String?
    var udid : String {
        get {
            if _udid == nil
            {
                if let str = UserDefaults.standard.object(forKey: "udid")
                {
                    _udid = str as? String
                }
                else
                {
                    _udid = "ios_udid_not_available"
                }
            }
            return _udid!
        }
        set {
            _udid = newValue
            UserDefaults.standard.set(NSString(string: newValue), forKey: "udid")
        }
    }
    
    private var _fcmToken : String?
    var fcmToken : String {
        get {
            if _fcmToken == nil
            {
                if let str = UserDefaults.standard.object(forKey: "fcmtoken")
                {
                    _fcmToken = str as? String
                }
                else
                {
                    _fcmToken = "ios_udid_not_available"
                }
            }
            
            return _fcmToken!
        }
        set {
            _fcmToken = newValue
            UserDefaults.standard.set(NSString(string: newValue), forKey: "fcmtoken")
        }
    }
    
    var isShowIntroImage : Bool {
        get {
            if let val = infoDic["SHOW_INTRO_IMAGE"] as? Bool
            {
                return val
            }
            
            return false
        }
    }
    
    var isShowLoadingImage : Bool {
        get {
            if let val = infoDic["SHOW_LOADING_IMAGE"] as? Bool
            {
                return val
            }
            
            return false
        }
    }
    
    var stateColor : String? {
        get {
            return Util.nilOrValue(infoDic["STATE_COLOR"] as? String)
        }
    }
    
    var hostUrl : String? {
        get {
            var url = Util.nilOrValue(infoDic["HOST_URL"] as? String)
            if !(url?.hasSuffix("/"))! {
                url = url?.appending("/")
            }
            return url
        }
    }
    
    var startUrl : String? {
        get {
            return Util.nilOrValue(infoDic["START_URL"] as? String)
        }
    }
    
    var pushUrl : String? {
        get {
            return Util.nilOrValue(infoDic["PUSH_HOST_URL"] as? String)
        }
    }
    
    var appVersion : String? {
        get {
            let plist : [String : Any] = Bundle.main.infoDictionary!
            let strInfo : String = plist["CFBundleShortVersionString"] as! String
            return Util.nilOrValue(strInfo)
        }
    }
    
    public func isPush() ->Bool
    {
        /**
         * 2017.02.20.LEETEAIN, 추가
         * 기존의 앱들에는 적용이 안됨, 따라서 기본값을 true로 함.
         **/
        var result : Bool = false;
        let val = infoDic["PUSH_AVAIL"]
        if val == nil {
            result = true
        }
        else {
            if let val = infoDic["PUSH_AVAIL"] as? Bool
            {
                result = val
            }
        }
        return result;
    }
    
    var isIAP : Bool {
        /**
         * 2018.03.22.LEETEAIN, 추가
         * 기존의 앱들에는 적용이 안됨, 따라서 기본값을 false로 함.
         **/
        get {
            let val = infoDic["IAP_AVAIL"]
            if val == nil {
                return false
            }
            else {
                if let val = infoDic["IAP_AVAIL"] as? Bool
                {
                    return val
                }
            }
            
            return false
        }
    }
    
    public func isKCP(strURL : String) ->Bool
    {
        var result : Bool = false;
        Util.log("isKCP: \(strURL)")
        Util.log("pamentArray: \(paymentArray)")
        if paymentArray.count == 0
        {
            result = false
        }
        else
        {
            for item in paymentArray
            {
                if (strURL as NSString).range(of: item).location != NSNotFound
                {
                    result = true;
                    break;
                }
            }
        }
        
        return result;
    }
    //admob full first
    var isAdmobFullFirst : Bool {
        get {
            if let dict: [String: AnyObject] = infoDic["ADMOB"] as? Dictionary
            {
                if let val: Bool = dict["FULL_START"] as? Bool {
                    return val
                }
            }
            return false
        }
    }
    //admob full end
    var isAdmobFullEnd : Bool {
        get {
            if let dict: [String: AnyObject] = infoDic["ADMOB"] as? Dictionary
            {
                if let val: Bool = dict["FULL_END"] as? Bool {
                    return val
                }
            }
            return false
        }
    }
    //admob banner start
    var isAdmobBannerFirst : Bool {
        get {
            if let dict: [String: AnyObject] = infoDic["ADMOB"] as? Dictionary
            {
                if let val: Bool = dict["BANNER_START"] as? Bool {
                    return val
                }
            }
            return false
        }
    }

    public func getURLSchemes() ->[String] {
        if let infoDictionary = Bundle.main.infoDictionary {
            if let urlTypes = infoDictionary["CFBundleURLTypes"] as? [AnyObject] {
                if let urlType = urlTypes.first as? [String : AnyObject] {
                    if let urlSchemes = urlType["CFBundleURLSchemes"] as? [String] {
                        return urlSchemes
                    }
                }
            }
        }
        
        return []
    }
    
    private var _canUseFCM : Bool?
    var canUseFCM : Bool {
        get {
            if _canUseFCM == nil
            {
                if let _ = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist")
                {
                    _canUseFCM = true
                }
                else
                {
                    _canUseFCM = false
                }
            }
            
            return _canUseFCM!
        }
    }
    
    public var FCMRegistedTopics: Set<String> {
        get {
            guard let list = UserDefaults.standard.array(forKey: registedTopicsKey) as? [String] else {
                return []
            }
            
            return Set(list)
        }
        set {
            UserDefaults.standard.set(Array(newValue), forKey: registedTopicsKey)
            UserDefaults.standard.synchronize()
        }
    }
    
    public func getPermission() ->Dictionary<String, Any> {
        if let path : String = Bundle.main.path(forResource: "Permission", ofType: "plist") {
            if let dic = NSDictionary(contentsOfFile: path) as? Dictionary<String, Any> {
                return dic
            }
        }
        return Dictionary<String, Bool>()
    }
}
