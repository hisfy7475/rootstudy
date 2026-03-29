//
//  RecodeViewController.swift
//  LuSoft
//
//  Created by Atimu on 24/04/2019.
//  Copyright © 2019 dqnetworks. All rights reserved.
//

import UIKit
import Foundation
import AVFoundation

class RecordingViewController: UIViewController {
    @IBOutlet weak var labelTime: UILabel!
    @IBOutlet weak var recodeImage: UIImageView!
    @IBOutlet weak var buttonRestart: UIButton!
    @IBOutlet weak var buttonSave: UIButton!
    var recodeType :NSInteger!
    var second :NSInteger!
    var countTimer : Timer?
    var player: AVAudioPlayer?
    var recorder: AVAudioRecorder?
    let file_path = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true).first?.appending("/record.wav")
    
    
    override func viewDidLoad() {
        super.viewDidLoad()
        restart(buttonRestart);
        // Do any additional setup after loading the view.
    }
    
    @IBAction func save(_ sender: UIButton) {
        self.dismiss(animated: false) {
            NotificationCenter.default.post(name:Config.shared.uploadPath, object: self, userInfo: ["path":self.file_path!])
        }
    }
    
    @IBAction func recode(_ sender: UIButton) {
        if(recodeType == 2){
            self.labelTime.text = "재생중입니다"
            //녹음재생
            play()
        }else if(recodeType == 1){
            recodeType = 2;
            self.recodeImage.image = UIImage.init(named: "icon_play");
            self.buttonRestart.isHidden = false;
            self.buttonSave.isHidden = false;
            //녹음완료
            stopRecord()
        }else{
            second = 0;
            recodeType = 1;
            self.recodeImage.image = UIImage.init(named: "icon_stop");
            //녹음시작
            beginRecord()
        }
    }
    
    func startTimer() {
        countTimer = Timer.scheduledTimer(timeInterval: 1, target: self, selector: #selector(updataSecond), userInfo: nil, repeats: true)
        countTimer!.fire()
    }

    @objc func updataSecond() {
        if recodeType == 1 {
            var minutesText = ""
            var secondsText = ""

            minutesText = second % 3600 / 60 > 9 ? "\(second % 3600 / 60)" : "0\(second % 3600 / 60)"
            secondsText = (second % 60) > 9 ? "\(second % 60)" : "0\(second % 60)"
            self.labelTime.text = String(format: "%@:%@", minutesText,secondsText);
            second += 1
        }else if recodeType == 2 && second>1{
            second -= 1
        }else{
            self.labelTime.text = "재생이 완료 되였습니다"
            stopTimer()
        }
    }
    
    func stopTimer() {
        if countTimer != nil {
            countTimer!.invalidate()
            countTimer = nil
        }
    }
    
    func beginRecord() {
        let session = AVAudioSession.sharedInstance()
        //sessionType
        do {
            try session.setCategory(AVAudioSession.Category.playAndRecord)
        } catch let err{
            print("쎄팅실패:\(err.localizedDescription)")
        }

        do {
            try session.setActive(true)
        } catch let err {
            print("초기화실패:\(err.localizedDescription)")
        }
  
        let recordSetting: [String: Any] = [AVSampleRateKey: NSNumber(value: 16000),
            AVFormatIDKey: NSNumber(value: kAudioFormatLinearPCM),
            AVLinearPCMBitDepthKey: NSNumber(value: 16),
            AVNumberOfChannelsKey: NSNumber(value: 1),
            AVEncoderAudioQualityKey: NSNumber(value: AVAudioQuality.min.rawValue)
        ];
        //녹음시작
        do {
            let url = URL(fileURLWithPath: file_path!)
            recorder = try AVAudioRecorder(url: url, settings: recordSetting)
            recorder!.prepareToRecord()
            recorder!.record()
            //timer시작
            startTimer()
        } catch let err {
            print("녹음실패:\(err.localizedDescription)")
        }
    }
    
    //녹음완료
    func stopRecord() {
        if let recorder = self.recorder {
            if recorder.isRecording {
                print("savePath：\(file_path!)")
            }else {
            }
            recorder.stop()
            self.recorder = nil
            //timer정지
            stopTimer()
        }else {
            print("초기화실패")
        }
    }
    
    func play() {
        do {
            player = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: file_path!))
            second = NSInteger(player!.duration+0.5);
            player!.play()
            startTimer()
        } catch let err {
            print("error:\(err.localizedDescription)")
        }
    }
    
    @IBAction func restart(_ sender: UIButton) {
        recodeType = 0;
        self.labelTime.text = "00:00"
        self.recodeImage.image = UIImage.init(named: "icon_record");
        self.buttonRestart.isHidden = true;
        self.buttonSave.isHidden = true;
    }
    
    @IBAction func back(_ sender: UIButton) {
        self.dismiss(animated: false, completion: nil);
    }

}
