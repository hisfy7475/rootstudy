//
//  MapsOpenIn.swift
//  Catyalog
//
//  Created by LEETAEIN on 2018. 1. 9..
//  Copyright © 2018년 LEETAEIN. All rights reserved.
//

import UIKit


public class MapsOpenIn: UIView {
    enum MapsType : Int
    {
        case eNaver = 100
        case eKakao
        case eGoogle
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
    }
    
    required public init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }
    
    class func instanceFromNib() -> UIView {
        return UINib(nibName: "MapsOpenIn", bundle: nil).instantiate(withOwner: nil, options: nil)[0] as! UIView
    }

    @IBAction func onClickMap(sender: UIButton)
    {
        var strInstallURL : String = String.init()
        if(sender.tag == MapsType.eNaver.rawValue)
        {
            if isInstalledMap(scheme: "navermaps://") == false
            {
                strInstallURL = "https://itunes.apple.com/kr/app/%EB%84%A4%EC%9D%B4%EB%B2%84-%EC%A7%80%EB%8F%84-naver-map/id311867728?mt=8"
            }
            else
            {
                let strDstName : String = MapsData.shared.endName.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed)!
                let strURI : String = String(format : "navermaps://?menu=route&routeType=1&elat=%@&elng=%@&etitle=%@", MapsData.shared.endLat, MapsData.shared.endLon, strDstName)
                let url : URL = URL(string:strURI)!
                UIApplication.shared.openURL(url)
            }
        }
        else if(sender.tag == MapsType.eKakao.rawValue)
        {
            if isInstalledMap(scheme: "daummaps://") == false
            {
                strInstallURL = "https://itunes.apple.com/kr/app/%EC%B9%B4%EC%B9%B4%EC%98%A4%EB%A7%B5-%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD-no-1-%EC%A7%80%EB%8F%84%EC%95%B1/id304608425?mt=8"
            }
            else
            {
                let strURI : String = String(format : "daummaps://route?ep=%@,%@&by=CAR", MapsData.shared.endLat, MapsData.shared.endLon)
                let url : URL = URL(string:strURI)!
                UIApplication.shared.openURL(url)
            }
        }
        else
        {
            if isInstalledMap(scheme: "comgooglemaps://") == false
            {
                strInstallURL = "https://itunes.apple.com/kr/app/google-maps/id585027354?mt=8"
            }
            else
            {
                let strDstName : String = MapsData.shared.endAddress.addingPercentEncoding(withAllowedCharacters: .urlHostAllowed)!
                let strURI : String = String(format : "comgooglemaps://?daddr=%@", strDstName)
                let url : URL = URL(string:strURI)!
                UIApplication.shared.openURL(url)
            }
        }
        
        if(strInstallURL.isEmpty == false)
        {
            let install = URL(string:strInstallURL)!
            UIApplication.shared.openURL(install)
        }
    }
    
    func isInstalledMap(scheme: String) -> Bool {
        let intalledURL : URL = URL(string:scheme)!
        return UIApplication.shared.canOpenURL(intalledURL)
    }

    
    /*
    // Only override draw() if you perform custom drawing.
    // An empty implementation adversely affects performance during animation.
    override func draw(_ rect: CGRect) {
        // Drawing code
    }
    */

}
