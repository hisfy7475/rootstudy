//
//  CodeReaderVC.swift
//  lusoft
//
//  Created by LEETAEIN on 2018. 10. 8..
//  Copyright © 2018년 dqnetworks. All rights reserved.
//

import UIKit
import AVFoundation


class CodeReaderVC: UIViewController, AVCaptureMetadataOutputObjectsDelegate {

    @IBOutlet weak var viewPreview: UIView!
    var captureSession: AVCaptureSession?
    var videoPreviewLayer: AVCaptureVideoPreviewLayer!
    
    
    override func viewDidLoad() {
        super.viewDidLoad()
        captureSession = nil
    }
    
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        self.navigationController?.navigationBar.isHidden = false
    }
    
    override func viewWillDisappear(_ animated : Bool) {
        super.viewWillDisappear(animated)
        self.navigationController?.navigationBar.isHidden = true
    }
    
    override func viewDidAppear(_ animated: Bool) {
        let isOk : Bool = startReading();
        if isOk == true {
            Util.showToast(message: "스캐너를 시작합니다.")
        } else {
            Util.showToast(message: "스캐너 구동에 실패하였습니다.\n다시 시도해 주세요.")
            stopReading()
        }
    }
    
    override var shouldAutorotate: Bool {
        return true
    }

    func drawCrossline() -> Void {
        let widthPath = UIBezierPath()
        widthPath.move(to: self.viewPreview.center)
        widthPath.addLine(to: CGPoint(x: self.viewPreview.center.x - 27, y: self.viewPreview.center.y))
        widthPath.addLine(to: CGPoint(x: self.viewPreview.center.x + 27, y: self.viewPreview.center.y))

        let shapeLayer1 = CAShapeLayer()
        shapeLayer1.path = widthPath.cgPath
        shapeLayer1.strokeColor = UIColor.red.cgColor
        shapeLayer1.lineWidth = 2.0
        viewPreview.layer.addSublayer(shapeLayer1)
        
        let heightPath = UIBezierPath()
        heightPath.move(to: self.viewPreview.center)
        heightPath.addLine(to: CGPoint(x: self.viewPreview.center.x, y: self.viewPreview.center.y - 27))
        heightPath.addLine(to: CGPoint(x: self.viewPreview.center.x, y: self.viewPreview.center.y + 27))
        
        let shapeLayer2 = CAShapeLayer()
        shapeLayer2.path = heightPath.cgPath
        shapeLayer2.strokeColor = UIColor.red.cgColor
        shapeLayer2.lineWidth = 2.0
        viewPreview.layer.addSublayer(shapeLayer2)
    }
    
    func startReading() -> Bool {
        let captureDevice = AVCaptureDevice.default(for: AVMediaType.video)
        do {
            let input = try AVCaptureDeviceInput(device: captureDevice!)
            captureSession = AVCaptureSession()
            captureSession?.sessionPreset = AVCaptureSession.Preset.high
            captureSession?.addInput(input)
        } catch let error as NSError {
            print(error)
            return false
        }
        
        videoPreviewLayer = AVCaptureVideoPreviewLayer(session: captureSession! )
        videoPreviewLayer.videoGravity = AVLayerVideoGravity.resizeAspectFill
        videoPreviewLayer.frame = viewPreview.layer.bounds
        viewPreview.layer.addSublayer(videoPreviewLayer)
        
        drawCrossline()
        
        /* Check for metadata */
        let captureMetadataOutput = AVCaptureMetadataOutput()
        captureSession?.addOutput(captureMetadataOutput)
//        let interestRect = videoPreviewLayer.metadataOutputRectConverted(fromLayerRect: videoPreviewLayer.frame)
//        captureMetadataOutput.rectOfInterest = interestRect
        captureMetadataOutput.metadataObjectTypes =   captureMetadataOutput.availableMetadataObjectTypes
        captureMetadataOutput.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        DispatchQueue.global(qos: .background).async {
            self.captureSession!.startRunning()
        }
        return true
    }
    
    @objc func stopReading() {
        captureSession?.stopRunning()
        captureSession = nil
        videoPreviewLayer.removeFromSuperlayer()
        onClickBarbuttonItem()
    }
    
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        for metaData in metadataObjects {
            print(metaData.description)
            let transformed = videoPreviewLayer?.transformedMetadataObject(for: metaData) as? AVMetadataMachineReadableCodeObject
            if let unwraped = transformed {
                let postData : [String : String] = ["result" : "success", "message" : unwraped.stringValue!]
                NotificationCenter.default.post(name: NSNotification.Name(rawValue: "QRDATA"),
                                                object: nil,
                                                userInfo: postData)
                self.performSelector(onMainThread: #selector(stopReading), with: nil, waitUntilDone: false)
            } else {
//                let postData : [String : String] = ["result" : "error", "message" : ""]
//                NotificationCenter.default.post(name: NSNotification.Name(rawValue: "QRDATA"),
//                                                object: nil,
//                                                userInfo: postData)
//                self.performSelector(onMainThread: #selector(stopReading), with: nil, waitUntilDone: false)
            }
        }
    }
    
    @IBAction func onClickBarbuttonItem() {
//        self.dismiss(animated: true, completion: nil)
        self.navigationController?.popViewController(animated: true)
    }
 
}
