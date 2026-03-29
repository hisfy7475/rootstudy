//
//  ImagePicker.swift
//  NeGAIProTools_Swift
//
//  Created by Yeongseong Seo on 2016. 8. 16..
//  Copyright © 2016년 negaipro. All rights reserved.
//

import UIKit
import MobileCoreServices

public class PhotoPicker
{
    public static let shared = PhotoPicker()
    
    private var crop = false
    private var callback : ((_ img: UIImage?)->())?
    
    private init() {}
    
    // MARK: Image picker viewcontroller
    public func show(from: UIViewController, source: UIImagePickerController.SourceType, crop: Bool, complete: ((_ img: UIImage?)->())?)
    {
        if UIImagePickerController.isSourceTypeAvailable(source)
        {
            self.crop = crop
            self.callback = complete
            
            let vc = UIImagePickerController()
            vc.delegate = self as? (UIImagePickerControllerDelegate & UINavigationControllerDelegate)
            vc.allowsEditing = crop
            vc.sourceType = source
            vc.mediaTypes = [kUTTypeImage as String]
            if #available(iOS 9.1, *)
            {
                vc.mediaTypes.append(kUTTypeLivePhoto as String)
            }
            
            vc.modalTransitionStyle = UIModalTransitionStyle.flipHorizontal
            from.present(vc, animated: true, completion: {
                Config.shared.vcStack.push(item: vc)
            })
        }
    }

    // image picker controller delegate
    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [String : AnyObject])
    {
        picker.dismiss(animated: true, completion: {
            
            Config.shared.vcStack.pop()
            
            if self.crop
            {
                self.callback?(info[UIImagePickerController.InfoKey.editedImage.rawValue] as? UIImage)
            }
            else
            {
                self.callback?(info[UIImagePickerController.InfoKey.originalImage.rawValue] as? UIImage)
            }
        })
    }
    
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController)
    {
        picker.dismiss(animated: true, completion: {
            
            Config.shared.vcStack.pop()
            self.callback?(nil)
        })
    }
}

public class MoviePicker
{
    public static let shared = MoviePicker()
    
    private var callback : ((_ url: URL?)->())?
    
    private init() {}
    
    // MARK: Image picker viewcontroller
    public func show(from: UIViewController, source: UIImagePickerController.SourceType, complete: ((_ url: URL?)->())?)
    {
        if UIImagePickerController.isSourceTypeAvailable(source)
        {
            self.callback = complete
            
            let vc = UIImagePickerController()
            vc.delegate = self as? (UIImagePickerControllerDelegate & UINavigationControllerDelegate)
            vc.sourceType = source
            vc.mediaTypes = [kUTTypeMovie as String]
            
            vc.modalTransitionStyle = UIModalTransitionStyle.flipHorizontal
            from.present(vc, animated: true, completion: {
                Config.shared.vcStack.push(item: vc)
            })
        }
    }
    
    
    // image picker controller delegate
    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [String : AnyObject])
    {
        picker.dismiss(animated: true, completion: {
            
            Config.shared.vcStack.pop()
            self.callback?(info[UIImagePickerController.InfoKey.mediaURL.rawValue] as? URL)
        })
    }
    
    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController)
    {
        picker.dismiss(animated: true, completion: {
            
            Config.shared.vcStack.pop()
            self.callback?(nil)
        })
    }
}
