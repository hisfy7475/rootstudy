//
//  UIImage_Extension.swift
//
//  Created by Yeongseong Seo on 2016. 10. 26..
//  Copyright © 2016년 dqnetworks. All rights reserved.
//

import UIKit
import ImageIO

extension UIImage
{
    public func isPNG() -> Bool
    {
        if let alphaInfo = self.cgImage?.alphaInfo
        {
            switch alphaInfo
            {
            case CGImageAlphaInfo.none, CGImageAlphaInfo.noneSkipLast, CGImageAlphaInfo.noneSkipFirst:
                return false
            default:
                break
            }
        }
        
        return true
    }
    
    public static func isPNG(data: Data) -> Bool
    {
        if let image = UIImage.init(data: data)
        {
            return image.isPNG()
        }
        
        return false
    }
    
    public static func isGIF(data: Data) -> Bool
    {
        if let source = CGImageSourceCreateWithData(data as CFData, nil),
            CGImageSourceGetCount(source) > 1
        {
            return true
        }
        
        return false
    }
    
    // return data of png or jpg
    public func data() -> Data?
    {
        var imgData : Data?
        if self.isPNG()
        {
            if let data = self.pngData()
            {
                imgData = data
            }
        }
        else
        {
            if let data = self.jpegData(compressionQuality: 1.0)
            {
                imgData = data
            }
        }
        
        return imgData
    }
    
    public func resize(size: CGSize) -> UIImage?
    {
        UIGraphicsBeginImageContext(size)
        
        let rect = CGRect(x: 0, y: 0, width: size.width, height: size.height)
        self.draw(in: rect)
        if let image = UIGraphicsGetImageFromCurrentImageContext()
        {
            UIGraphicsEndImageContext()
            
            return image
        }
        
        return nil
    }
}
