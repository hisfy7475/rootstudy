//
//  MoviePlayer.swift
//
//  Created by negaipro on 2016. 8. 19..
//  Copyright © 2016년 negaipro. All rights reserved.
//

import UIKit

import MediaPlayer
import AVKit

public class MoviePlayer
{
    // for dismiss catch
    private class CustomAVPlayerViewController : AVPlayerViewController
    {
        override func viewWillDisappear(_ animated: Bool)
        {
            super.viewWillDisappear(animated)
            MoviePlayer.complete?()
        }
    }

    private class CustomMPMoviePlayerViewController : MPMoviePlayerViewController
    {
        override func viewWillDisappear(_ animated: Bool)
        {
            super.viewWillDisappear(animated)
            MoviePlayer.complete?()
        }
    }

    private static var complete : (()->())?
    
    private init() {}
    
    public static func playerViewController(showFrom: UIViewController, url: URL, showCallBack:((_ viewController : UIViewController)->())? = nil, dismiss:(()->())? = nil)
    {
        MoviePlayer.complete = nil

        if #available(iOS 9.0, *)
        {
            // av player
            let playerVc = CustomAVPlayerViewController()
            playerVc.player = AVPlayer(url: url)
            showFrom.present(playerVc, animated: true, completion: nil)
            
            MoviePlayer.complete = dismiss
            
            showCallBack?(playerVc)
        }
        else
        {
            // movie player
            if let playerVc = CustomMPMoviePlayerViewController(contentURL: url)
            {
                showFrom.presentMoviePlayerViewControllerAnimated(playerVc)
                
                MoviePlayer.complete = dismiss
                
                showCallBack?(playerVc)
            }
        }
    }
}
