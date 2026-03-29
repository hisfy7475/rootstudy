//
//  UIViewController_Extension.swift
//
//  Created by Yeongseong Seo on 2016. 8. 17..
//  Copyright © 2016년 dqnetworks. All rights reserved.
//

import UIKit

extension UIViewController : UINavigationControllerDelegate
{
    
    public func navigationControllerSupportedInterfaceOrientations(_ navigationController: UINavigationController) -> UIInterfaceOrientationMask {
        return (navigationController.topViewController?.supportedInterfaceOrientations)!
    }
    
    // MARK: alert
    public func alertWithOK(title: String)
    {
        let alert = UIAlertController(title: title, message: nil, preferredStyle: UIAlertController.Style.alert)
        alert.addAction(UIAlertAction(title: LS("kOK"), style: UIAlertAction.Style.default, handler: nil))
        self.present(alert, animated: true, completion: {
            Config.shared.vcStack.push(item: alert)
        })
    }
    public func alert(title: String?,
                      message: String?,
                      btnTitles: String...,
        callBack: ((_ index: Int)->())?)
    {
        let alert = UIAlertController(title: title, message: message, preferredStyle: UIAlertController.Style.alert)
        
        for i in 0..<btnTitles.count
        {
            let btnTitle = btnTitles[i]
            alert.addAction(UIAlertAction(title: btnTitle, style: UIAlertAction.Style.default, handler: { (action) in
                Config.shared.vcStack.pop()
                callBack?(i)
            }))
        }
        
        self.present(alert, animated: true, completion: {
            Config.shared.vcStack.push(item: alert)
        })
    }
    
    public func alert(title: String?,
                      message: String?,
                      cancelBtnTitle: String?,
                      btnTitles: String...,
        callBack: ((_ index: Int, _ isCancel: Bool)->())?)
    {
        let alert = UIAlertController(title: title, message: message, preferredStyle: UIAlertController.Style.alert)
        
        if let cancel = cancelBtnTitle
        {
            alert.addAction(UIAlertAction(title: cancel, style: UIAlertAction.Style.cancel, handler: { (action) in
                Config.shared.vcStack.pop()
                callBack?(0, true)
            }))
        }
        
        for i in 0..<btnTitles.count
        {
            let btnTitle = btnTitles[i]
            alert.addAction(UIAlertAction(title: btnTitle, style: UIAlertAction.Style.default, handler: { (action) in
                Config.shared.vcStack.pop()
                callBack?(i, false)
            }))
        }

        self.present(alert, animated: true, completion: {
            Config.shared.vcStack.push(item: alert)
        })
    }
    
    
    // MARK: localized string
    func LS(_ key: String) -> String
    {
        return NSLocalizedString(key, comment: "")
    }
}
