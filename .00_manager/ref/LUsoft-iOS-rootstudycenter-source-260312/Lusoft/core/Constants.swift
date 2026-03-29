//
//  Const.swift
//  lusoft
//
//  Created by Yeongseong Seo on 2017. 5. 16..
//  Copyright © 2017년 dqnetworks. All rights reserved.
//

import Foundation


public let INTERVAL_ALERT : Double = 2.0


public let registedTopicsKey = "registedTopicsKey"


public let COUNT_MAX_CHILD_VIEW : Int = 99
public let TIME_DURING_VIEW_ANIMATION : Double = 0.4


public enum ConnectionState: Int {
    case none = 0
    case wan = 1
    case wifi = 2
}
