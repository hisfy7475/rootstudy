//
//  Stack.swift
//
//  Created by negaipro on 2016. 8. 23..
//  Copyright © 2016년 negaipro All rights reserved.
//

import Foundation

public class Stack <T:Any>
{
    private var _stackList : [T] = []

    public func push(item: T)
    {
        _stackList.append(item)
    }
    
    @discardableResult
    public func pop() -> T?
    {
        
        let last = _stackList.last
        if _stackList.count > 1{
            _stackList.removeLast()
        }
        return last
    }
    
    public func top() -> T?
    {
        return _stackList.last
    }
}
