//
//  GPS.swift
//  NeGAIProTools_Swift
//
//  Created by negaipro on 2016. 7. 14..
//  Copyright © 2016년 negaipro. All rights reserved.
//

/*
 <key>NSLocationWhenInUseUsageDescription</key>
 <string>This application requires location services to work</string>
 
 <key>NSLocationAlwaysUsageDescription</key>
 <string>This application requires location services to work</string>
 */

import Foundation
import CoreLocation

public class GPS : NSObject, CLLocationManagerDelegate
{
    public enum ActionType
    {
        case WhenInUse
        case Always
    }
    
    private static var _type = ActionType.WhenInUse
    public static var type : ActionType {
        get
        {
            return _type
        }
        set
        {
            if newValue != _type
            {
                _type = newValue
                
                GPS.shared.requestAuthorization()
            }
        }
    }
    
    
    public enum ErrorType
    {
        case Denied, Network, Description, Others
    }
    
    
    public static let shared = GPS()
    
    
    
    
    // member variables
    private var infiniteLoop : Bool = false
    private var loopCount : Int = 0
    private var hasDescription : Bool = true
    private var manager :CLLocationManager?
    private var completeCallback :((_ latitude: Double, _ longitude: Double)->())?
    private var errorCallback :((_ error: ErrorType, _ description: String)->())?
    
    // MARK: initialize
    private override init()
    {
        super.init()
        
        manager = CLLocationManager()
        manager?.delegate = self
        manager?.desiredAccuracy = kCLLocationAccuracyBest
        
        self.requestAuthorization()
    }
    
    private func requestAuthorization()
    {
        if GPS.type == ActionType.WhenInUse
        {
            let str = Bundle.main.infoDictionary?["NSLocationWhenInUseUsageDescription"]
            if str == nil
            {
                hasDescription = false
            }
            
            manager?.requestWhenInUseAuthorization()
        }
        else if GPS.type == ActionType.Always
        {
            let str = Bundle.main.infoDictionary?["NSLocationAlwaysUsageDescription"]
            if str == nil
            {
                hasDescription = false
            }
            
            manager?.requestAlwaysAuthorization()
        }
    }
    
    // MARK: run
    /**
     GPS 정보 가져오기.
     
     - Parameter loopCnt: 가져오는 횟수. 0 일경우 무한으로 가져옴.
     */
    public func run(loopCnt: UInt = 3,
                    complete: ((_ latitude: Double, _ longitude: Double)->())?,
                    error: ((_ error: ErrorType, _ description: String)->())?)
    {
        infiniteLoop = (loopCnt == 0)
        loopCount = Int(loopCnt)
        completeCallback = complete
        errorCallback = error
        
        if #available(iOS 9.0, *)
        {
            manager?.allowsBackgroundLocationUpdates = false
        }
        manager?.startUpdatingLocation()
        
        if hasDescription==false
        {
            errorCallback?(ErrorType.Description, "info.plist must have - NSLocationWhenInUseUsageDescription or NSLocationAlwaysUsageDescription")
        }
    }
    
    @available(iOS 9.0, *)
    public func backgroundRun(complete: ((_ latitude: Double, _ longitude: Double)->())?,
                              error: ((_ error: ErrorType, _ description: String)->())?)
    {
        completeCallback = complete
        errorCallback = error
        
        let list:[String] = Bundle.main.infoDictionary?["UIBackgroundModes"] as! [String]
        if list.count == 0 || list.contains("location") == false
        {
            errorCallback?(ErrorType.Description, "info.plist must have - UIBackgroundModes and the list must have 'location'")
        }
        else
        {
            manager?.allowsBackgroundLocationUpdates = true
            manager?.startUpdatingLocation()
        }
    }
    
    public func stop()
    {
        manager?.stopUpdatingLocation()
    }
    
    
    // MARK: check
    public static func authorized() -> Bool
    {
        let status = CLLocationManager.authorizationStatus()
        return (status == CLAuthorizationStatus.authorizedAlways || status == CLAuthorizationStatus.authorizedWhenInUse)
    }
    
    
    // MARK: delegate
    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation])
    {
        let location : CLLocation = locations.last!
        completeCallback?(Double(location.coordinate.latitude), Double(location.coordinate.longitude))
        
        loopCount -= 1
        
        if infiniteLoop == false && loopCount == 0
        {
            manager.stopUpdatingLocation()
        }
    }
    
    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error)
    {
        let clError = CLError(_nsError: error as NSError)
        switch clError.code
        {
        case .network:
            errorCallback?(ErrorType.Network, clError.localizedDescription)
        case .denied:
            errorCallback?(ErrorType.Denied, clError.localizedDescription)
        default:
            errorCallback?(ErrorType.Others, clError.localizedDescription)
        }
        
        manager.stopUpdatingLocation()
        loopCount = 0
        infiniteLoop = false
    }
    
    public func locationManagerDidPauseLocationUpdates(_ manager: CLLocationManager)
    {
        if infiniteLoop || loopCount > 0
        {
            manager.startUpdatingLocation()
        }
    }
}

public class GoogleMap
{
    // MARK: GoogleAPI 사용하여 위도, 경도를 주소로 변환.
    public static func convert(latitude:Double, longitude:Double, complete:@escaping (_ addressList: [String])->())
    {
        let api = Http(url: "https://maps.googleapis.com/maps/api/geocode/json", method: Http.Method.GET)
        api.add(key: "latlng", value: String(latitude)+","+String(longitude))
        api.add(key: "sensor", value: "false")
        api.returnObject ({ (httpDic) in
            var result :[String] = []
            
            print(httpDic)
            print("오류로 주석 처리")
            /*
            if let list = httpDic["results"] as? [AnyObject]
            {
                for sub in list
                {
                    if let addr = sub["formatted_address"] as? String
                    {
                        
                        result.append(addr)
                    }
                }
            }
             */
            
            complete(result)
        })
    }
}
