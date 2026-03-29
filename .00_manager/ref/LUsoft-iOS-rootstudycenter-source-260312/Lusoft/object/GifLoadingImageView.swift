//
//  GifImageView.swift
//  NeGAIProTools_Swift
//
//  Created by negaipro on 2016. 8. 8..
//  Copyright © 2016년 negaipro. All rights reserved.
//

import UIKit
import ImageIO

public class GifLoadingImageView : UIImageView
{
    private var imageList : [UIImage] = []
    
    private var duration : Float = 0
    private var animCount : Int = 0
    private var timer : Timer?
    
    public init(url: URL)
    {
        super.init(image: nil)
        self.setGifImage(url: url)
    }
    
    public init(data: Data)
    {
        super.init(image: nil)
        self.setGifImage(data: data)
    }
    
    required public init?(coder aDecoder: NSCoder)
    {
        super.init(coder: aDecoder)
    }
    
    deinit
    {
        if timer != nil
        {
            timer?.invalidate()
            timer = nil
        }
    }
    
    private func clearAll()
    {
        imageList.removeAll()
        duration = 0
        animCount = 0
        
        if timer != nil
        {
            timer?.invalidate()
            timer = nil
        }
    }
    
    public func start()
    {
        if timer != nil
        {
            timer?.invalidate()
            timer = nil
        }
        
        if imageList.count > 0
        {
            self.image = imageList[0]
            
            animCount = 0
            
            timer = Timer.scheduledTimer(timeInterval: TimeInterval(duration/Float(imageList.count)),
                                         target: self,
                                         selector: #selector(GifLoadingImageView.gifAnimation),
                                         userInfo: nil,
                                         repeats: true)
        }
    }
    
    public func stop()
    {
        if timer != nil
        {
            timer?.invalidate()
            timer = nil
        }
    }
    
    public func setGifImage(url: URL, complete: (( _ error: Error)->())? = nil)
    {
        //
        // gif 이미지를 프로그레스로 사용할 때, 
        // 해당 이미지를 로드하는 과정에서,
        // DispatchQueue.global가 로딩과 인트로를 늘어지게 하는 현상이 발견되었다.
        // 추가적인 디버깅 및 유지보수가 필요하다
        // 2017.02.01.LEETAEIN
        //
        DispatchQueue.global().async{            
            do
            {
                let data = try Data(contentsOf: url)
                DispatchQueue.main.async {
                    self.setGifImage(data: data, complete: complete)
                }
            }
            catch let error
            {
                self.clearAll()
                complete?(error)
            }
        }
    }
    
    public func setGifImage(data: Data,complete: (( _ error: Error)->())? = nil)
    {
        self.clearAll()
        
        if let source = CGImageSourceCreateWithData(data as CFData, nil)
        {
            let count = CGImageSourceGetCount(source)
            
            duration = 0
            if count <= 1
            {
                imageList.append(UIImage(data: data)!)
                self.image = imageList[0]
            }
            else
            {
                for i in 0..<count
                {
                    if let image : CGImage = CGImageSourceCreateImageAtIndex(source, i, nil)
                    {
                        duration += frameDuration(at: i, source: source)
                        imageList.append(UIImage(cgImage: image, scale: UIScreen.main.scale, orientation: UIImage.Orientation.up))
                    }
                }
                
                if imageList.count > 0
                {
                    self.image = imageList[0]
                    
                    if timer != nil
                    {
                        timer?.invalidate()
                        timer = nil
                    }
                    timer = Timer.scheduledTimer(timeInterval: TimeInterval(duration/Float(imageList.count)),
                                                 target: self,
                                                 selector: #selector(GifLoadingImageView.gifAnimation),
                                                 userInfo: nil,
                                                 repeats: true)
                }
            }
        }
    }
    
    private func frameDuration(at: Int, source: CGImageSource) -> Float
    {
        var frameDuration : Float = 0.1
        let frameProperties = CGImageSourceCopyPropertiesAtIndex(source, at, nil)! as NSDictionary
        let gifProperties = frameProperties[kCGImagePropertyGIFDictionary as String] as! NSDictionary
        
        if let delayTimeUnclampedProp : NSNumber = gifProperties[kCGImagePropertyGIFUnclampedDelayTime as String] as? NSNumber
        {
            frameDuration = delayTimeUnclampedProp.floatValue
        }
        else if let delayTimeProp : NSNumber = gifProperties[kCGImagePropertyGIFDelayTime as String] as? NSNumber
        {
            frameDuration = delayTimeProp.floatValue
        }
        
        if frameDuration < 0.011
        {
            frameDuration = 0.100
        }
        
        return frameDuration
    }
    
    @objc private func gifAnimation()
    {
        self.image = imageList[animCount%imageList.count]
        animCount += 1
    }
}
