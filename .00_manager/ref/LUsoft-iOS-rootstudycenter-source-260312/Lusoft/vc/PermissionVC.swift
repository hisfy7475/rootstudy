//
//  PermissionView.swift
//  Canerata
//
//  Created by Atimu on 19/9/2019.
//  Copyright © 2019 Canerata. All rights reserved.
//

import UIKit
import Contacts


class PermissionCell : UITableViewCell {
    @IBOutlet weak var ivIcon : UIImageView!
    @IBOutlet weak var lbTitle : UILabel!
    @IBOutlet weak var lbDetail : UILabel!
}

class PermissionFooter : UIView {
    @IBOutlet weak var btnOk : UIButton!
}


class PermissionVC: UIViewController, UITableViewDelegate, UITableViewDataSource, UNUserNotificationCenterDelegate {

    @IBOutlet weak var textTitle: UILabel!
    @IBOutlet weak var textSub: UILabel!
    @IBOutlet weak var m_table: UITableView!
    @IBOutlet weak var btnConfirm: UIButton!
    private var m_footerView : PermissionFooter! = nil
    private var m_items : Array<NSMutableDictionary> = Array<NSMutableDictionary>()
    private var keys : Array<NSDictionary> = Array<NSDictionary>()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        m_table.delegate = self
        m_table.dataSource = self
        var btnColor:String = "#353C46"
        var co = UIColor(named: "btnColor")// UIColor(.white)
        let infoDic = Bundle.main.infoDictionary?["BUILDER_SETTING"] as! [String : AnyObject]
        if let cor = infoDic["COLOR_PRIMARY"] as? String {
            print("color:", cor)
            co = UIColor(hexCode:cor)
        }
        btnConfirm.backgroundColor = co
        var PerDic: [String: Bool] = [
            "storage"       : false,
            "notifications" : false,
            "camera"        : false,
            "location"      : true,
            "calendar"      : true,
            "contact"       : true,
            "microphone"    : true,
            "sensor"        : true,
            "ble"           : true,
            "fitness"       : true,
            "health"        : true,
        ]
        var readItem: Dictionary<String, Any>!
        if let path : String = Bundle.main.path(forResource: "Permission", ofType: "plist") {
            readItem = NSDictionary(contentsOfFile: path) as? Dictionary<String, Any>
        }

        for (pkey, pess) in PerDic {
            var title = NSLocalizedString("permission_" + pkey, comment:pkey)
            let desc = NSLocalizedString("permission_" + pkey + "_desc", comment:pkey)
            var disp = false
            var ess = pess as Bool
            if let s:Dictionary<String, Bool> = readItem[pkey] as? Dictionary<String, Bool>{
                if let disp1:Bool = s["use"] as? Bool {
                    disp = disp1
                }
                if let ess1:Bool = s["ess"] as? Bool {
                    ess = ess1
                }
            }
            print("kk", pkey, disp,ess)
            if disp {
                title = title + " (" + (ess ? "필수".lang()! : "선택".lang()!) + ")"
                let cellItem: NSMutableDictionary = NSMutableDictionary.init()
                cellItem.setValue(UIImage(named: "icon_"+pkey), forKey: "image")
                cellItem.setValue(pkey, forKey: "type")
                cellItem.setValue(title, forKey: "title")
                cellItem.setValue(desc, forKey: "detail")
                m_items.append(cellItem)
            }
        }
        if m_items.count == 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self.agreePermission(sender: UIButton.init())
            }
        }
    }
    
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
    }
    
    override func viewWillDisappear(_ animated : Bool) {
        super.viewWillDisappear(animated)
    }
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
    }
    
    override var shouldAutorotate: Bool {
        return true
    }
    
    // MARK : UITableView ---------- ---------- ---------- ---------- ----------
    func tableView(_ tableView: UITableView, heightForHeaderInSection section: Int) -> CGFloat {
        return 0.0;
    }
    
//    func tableView(_ tableView: UITableView, heightForFooterInSection section: Int) -> CGFloat {
//        return self.m_footerView.bounds.height
//    }
    
    func numberOfSections(in tableView: UITableView) -> Int {
        return 1;
    }
    
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return m_items.count;
    }
    
    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "PermissionCell", for: indexPath) as! PermissionCell
        
        let item: NSMutableDictionary = m_items[indexPath.row]
        cell.ivIcon?.image = (item["image"] as! UIImage)
        cell.lbTitle?.text = (item["title"] as! String)
        cell.lbDetail?.text = (item["detail"] as! String)
    
        return cell
    }
    
//    func tableView(_ tableView: UITableView, viewForFooterInSection section: Int) -> UIView? {
//        return self.m_footerView;
//    }
    
    @IBAction func onOkClick(_ sender: UIButton) {
        print("222222")
        agreePermission(sender: sender)
    }

    @IBAction func agreePermission(sender : UIButton){
        if m_items.count>0 {
            for item : NSMutableDictionary in m_items {
                let key = item["type"] as! String
                switch key {
                case "notifications":
                    /*
                     if #available(iOS 10, *){
                     UNUserNotificationCenter.current().delegate = self
                     let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
                     UNUserNotificationCenter.current().requestAuthorization(
                     options: authOptions,
                     completionHandler: {_, _ in })
                     }else{
                     let settings: UIUserNotificationSettings =
                     UIUserNotificationSettings(types: [.alert, .badge, .sound], categories: nil)
                     application.registerUserNotificationSettings(settings)
                     }
                     application.registerForRemoteNotifications()
                     */
                    if #available(iOS 10, *){
                        UNUserNotificationCenter.current().delegate = self
                        let authOptions: UNAuthorizationOptions = [.alert, .badge, .sound]
                        UNUserNotificationCenter.current().requestAuthorization(
                            options: authOptions,
                            completionHandler: {_, _ in })
                   }else{
                        let settings: UIUserNotificationSettings =
                        UIUserNotificationSettings(types: [.alert, .badge, .sound], categories: nil)
                       UIApplication.shared.registerUserNotificationSettings(settings)
                   }
                    UIApplication.shared.registerForRemoteNotifications()

                    break
                case "fitness":
                    break
                case "health":
                    break
                case "calendar":
                    break
                case "camera":
                    break
                case "contact":
                    let status = CNContactStore.authorizationStatus(for: .contacts)
                    if status == .notDetermined {
                        let store = CNContactStore()
                        store.requestAccess(for: .contacts, completionHandler: { (isRight : Bool,error : Error?) in
                            
                            if isRight {
                                print("seccess")
                            } else {
                                print("fail")
                            }
                        })
                        
                    }
                    break
                case "location":
                    GPS.shared.run(loopCnt: 1, complete: { (latitude, longitude) in
                    }) { (error, description) in}
                    break
                case "microphone":
                    break
                case "telephone":
                    break
                case "sensor":
                    break
                case "sms":
                    break
                case "storage":
                    break
                default:
                    break
                }
            }
        }
        //첫 실행 체크
        UserDefaults.standard.set("2", forKey: "opened")
        UserDefaults.standard.synchronize()
        self.dismiss(animated: true, completion: nil)
    }

    /*
    // MARK: - Navigation

    // In a storyboard-based application, you will often want to do a little preparation before navigation
    override func prepare(for segue: UIStoryboardSegue, sender: Any?) {
        // Get the new view controller using segue.destination.
        // Pass the selected object to the new view controller.
    }
    */

}
