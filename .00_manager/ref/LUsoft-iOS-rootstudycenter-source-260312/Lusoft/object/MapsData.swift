//
//  MapsData.swift
//  lusoft
//
//  Created by LEETAEIN on 2018. 1. 9..
//  Copyright © 2018년 dqnetworks. All rights reserved.
//

import UIKit


class MapsData: NSObject {
    
    static let shared = MapsData()
    
    private var _strStartLat : String?
    var startLat : String {
        get {
            return _strStartLat!
        }
        set {
            _strStartLat = newValue
        }
    }
    
    private var _strStartLon : String?
    var startLon : String {
        get {
            return _strStartLon!
        }
        set {
            _strStartLon = newValue
        }
    }
    
    private var _strEndLat : String?
    var endLat : String {
        get {
            return _strEndLat!
        }
        set {
            _strEndLat = newValue
        }
    }
    
    private var _strEndLon : String?
    var endLon : String {
        get {
            return _strEndLon!
        }
        set {
            _strEndLon = newValue
        }
    }
    
    private var _strEndName : String?
    var endName : String {
        get {
            return _strEndName!
        }
        set {
            _strEndName = newValue
        }
    }
    
    private var _strEndAddr : String?
    var endAddress : String {
        get {
            return _strEndAddr!
        }
        set {
            _strEndAddr = newValue
        }
    }
}
