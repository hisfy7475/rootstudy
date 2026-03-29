//
//  ActivityPopup.swift
//
//  Created by negaipro on 2016. 8. 18..
//  Copyright © 2016년 dqnetworks. All rights reserved.
//

import UIKit

public class ActivityPopup
{
    public let vc = UIViewController()
    public let indicator : UIActivityIndicatorView
    
    public static let shared = ActivityPopup()
    
    private init()
    {
        // bg
        vc.view.backgroundColor = UIColor.init(red: 0/255.0, green: 0/255.0, blue: 0/255.0, alpha: 0.4)
        //vc.view.backgroundColor = init(r: 0, green: 0, blue: 0, alpha: 0.4)
        
        // indicator view
        indicator = UIActivityIndicatorView(style: UIActivityIndicatorView.Style.whiteLarge)
        indicator.center = vc.view.center
        vc.view .addSubview(indicator)
        
        // modal
        vc.modalPresentationStyle = UIModalPresentationStyle.overCurrentContext
    }
    
    public func show(_ from: UIViewController)
    {
        indicator.startAnimating()
        from.present(vc, animated: true, completion: {
            Config.shared.vcStack.push(item: self.vc)
        })
    }
    
    public func hide()
    {
        indicator.stopAnimating()
        vc.dismiss(animated: true, completion: {
            Config.shared.vcStack.pop()
        })
    }
}
