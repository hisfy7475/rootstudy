//
//  URL_Extension.swift
//  TEMP
//
//  Created by LEETAEIN on 2018. 3. 8..
//  Copyright © 2018년 dqnetworks. All rights reserved.
//

import Foundation


extension URL {
    public func valueOf(_ queryParamaterName: String) -> String? {
        guard let url = URLComponents(string: self.absoluteString) else { return nil }
        return url.queryItems?.first(where: { $0.name == queryParamaterName })?.value
    }
    public func getParamater(_ queryParamaterName: String) -> String? {
        return self.valueOf(queryParamaterName)
    }
}
