//
//  RootViewController.swift
//  NicepayAppSample
//
//  Created by xoghzone on 2019/11/27.
//  Copyright © 2019 Nicepayment. All rights reserved.
//

import UIKit

class RootViewController: UIViewController {
    @IBOutlet weak var verNo : UILabel?;
    
    override func viewDidLoad() {
        super.viewDidLoad()

        title = "초기화면"
        
        // Do any additional setup after loading the view.
        var version: String? {
            guard let dic = Bundle.main.infoDictionary,
                let v = dic["CFBundleVersion"] as? String
                else {
                    return nil
            }
            
            return v
        }
        
        verNo?.text = version ?? ""
    }
    
    @IBAction func requestPayment(sender:Any) {
        let vc = PaymentWebViewController()
        self.navigationController?.pushViewController(vc, animated: true)
    }
}
