//
//  Log.swift
//  NeGAIProTools_Swift
//
//  Created by negaipro on 2016. 11. 24..
//  Copyright © 2016년 negaipro. All rights reserved.
//

import Foundation

// Log
public enum LogType
{
    case always
    case debugOnly
    case releaseOnly
}

public func log(_ log: String, _ type: LogType = .debugOnly)
{
    #if DEBUG
        if type == .always || type == .debugOnly
        {
            print(log)
        }
    #else
        if type == .always || type == .debugOnly
        {
            print(log)
        }
    #endif
}
