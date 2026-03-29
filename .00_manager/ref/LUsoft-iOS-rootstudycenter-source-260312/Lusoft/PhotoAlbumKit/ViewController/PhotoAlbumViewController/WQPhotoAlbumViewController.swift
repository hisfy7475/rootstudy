//
//  WQPhotoAlbumViewController.swift
//  WQPhotoAlbum
//
//  Created by Atimu on 2020/04/10.
//  Copyright © 2020 Atimu. All rights reserved.
//

import UIKit
import Photos
import AVFoundation
import AVKit

class WQPhotoAlbumViewController: WQPhotoBaseViewController, PHPhotoLibraryChangeObserver, UICollectionViewDelegate, UICollectionViewDataSource {

    var assetsFetchResult: PHFetchResult<PHAsset>?
    
    var maxSelectCount = 0
    
    var type: WQPhotoAlbumType = .selectPhoto
    
    // 剪裁大小
    var clipBounds: CGSize = CGSize(width: WQScreenWidth, height: WQScreenWidth)
    
    weak var photoAlbumDelegate: WQPhotoAlbumProtocol?
    
    private let cellIdentifier = "PhotoCollectionCell"
    private lazy var photoCollectionView: UICollectionView = {
        // 竖屏时每行显示4张图片
        let shape: CGFloat = 5
        let cellWidth: CGFloat = (WQScreenWidth - 5 * shape) / 4
        let flowLayout = UICollectionViewFlowLayout()
        flowLayout.sectionInset = UIEdgeInsets(top: WQNavigationTotalHeight, left: shape, bottom: self.type != .clipPhoto ? 44+WQHomeBarHeight:0, right: shape)
        flowLayout.itemSize = CGSize(width: cellWidth, height: cellWidth)
        flowLayout.minimumLineSpacing = shape
        flowLayout.minimumInteritemSpacing = shape
        //  collectionView
        let collectionView = UICollectionView(frame: CGRect(x: 0, y: 0, width: WQScreenWidth, height: WQScreenHeight), collectionViewLayout: flowLayout)
        collectionView.backgroundColor = UIColor.white
        collectionView.scrollIndicatorInsets = UIEdgeInsets(top: WQNavigationTotalHeight, left: 0, bottom: 44+WQHomeBarHeight, right: 0)
        //  添加协议方法
        collectionView.delegate = self
        collectionView.dataSource = self
        //  设置 cell
        collectionView.register(WQPhotoCollectionViewCell.self, forCellWithReuseIdentifier: self.cellIdentifier)
        return collectionView
    }()
    
    private var bottomView = WQAlbumBottomView()
    private lazy var loadingView: UIView = {
        let view = UIView(frame: CGRect(x: 0, y: WQNavigationTotalHeight, width: WQScreenWidth, height: WQScreenHeight-WQNavigationTotalHeight))
        view.backgroundColor = UIColor.clear
        let loadingBackView = UIImageView(frame: CGRect(x: view.frame.width/2-54, y: view.frame.height/2-32-54, width: 108, height: 108))
        loadingBackView.image = UIImage.wqCreateImageWithColor(color: UIColor(white: 0, alpha: 0.8), size: CGSize(width: 108, height: 108))?.wqSetRoundedCorner(radius: 6)
        view.addSubview(loadingBackView)
        let loading = UIActivityIndicatorView(style: .whiteLarge)
        loading.center = CGPoint(x: 54, y: 54)
        loading.startAnimating()
        loadingBackView.addSubview(loading)
        return view
    }()
    
    //  数据源
    private var photoData = WQPhotoData()
    
    deinit {
        if WQPhotoAlbumEnableDebugOn {
            print("=====================\(self)Unmemory leak")
        }
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()

        if #available(iOS 11.0, *) {
            self.photoCollectionView.contentInsetAdjustmentBehavior = .never
        } else {
            self.automaticallyAdjustsScrollViewInsets = false
        }
        self.view.addSubview(self.photoCollectionView)
        self.initNavigation()
        if type != .clipPhoto {
            self.setBottomView()
        }
        self.getAllPhotos()
    }
    
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        
        UIApplication.shared.setStatusBarStyle(.lightContent, animated: true)
        if self.photoData.dataChanged {
            self.photoCollectionView.reloadData()
            self.completedButtonShow()
        }
    }
    
    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        
        self.photoData.dataChanged = false
    }
    
    //  MARK:- private method
    private func initNavigation() {
        self.setNavTitle(title: NSLocalizedString("kAll", comment: ""))
        self.setBackNav()
        self.setRightTextButton(text:NSLocalizedString("kCancel", comment: ""), color: UIColor.white)
        self.view.bringSubviewToFront(self.naviView)
    }
    
    private func setBottomView() {
        self.bottomView.leftClicked = { [unowned self] in
            self.gotoPreviewViewController(previewArray: self.photoData.seletedAssetArray, currentIndex: 0)
        }
        self.bottomView.rightClicked = { [unowned self] in
            self.selectSuccess(fromeView: self.view, selectAssetArray: self.photoData.seletedAssetArray)
        }
        self.view.addSubview(self.bottomView)
    }
    
    private func getAllPhotos() {
        //注意点！！-这里必须注册通知，不然第一次运行程序时获取不到图片，以后运行会正常显示。体验方式：每次运行项目时修改一下 Bundle Identifier，就可以看到效果。
        PHPhotoLibrary.shared().register(self)
        let status = PHPhotoLibrary.authorizationStatus()
        if status == .restricted || status == .denied {
            // 无权限
            // do something...
            if WQPhotoAlbumEnableDebugOn {
                let alert = UIAlertController(title: nil, message: "갤러리의 이미지를 불러오는  권한을 허용하세요.", preferredStyle: .alert)
                let cancleAction = UIAlertAction(title: NSLocalizedString("kCancel", comment: ""), style: .cancel, handler: nil)
                alert.addAction(cancleAction)
                let goAction = UIAlertAction(title: "설정", style: .default, handler: { (action) in
                    if let url = URL(string: UIApplication.openSettingsURLString), UIApplication.shared.canOpenURL(url) {
                        UIApplication.shared.open(url, options: [:], completionHandler: nil)
                    }
                })
                alert.addAction(goAction)
                self.present(alert, animated: true, completion: nil)
            }

            return;
        }
        DispatchQueue.global(qos: .userInteractive).async { [self] in
            //  获取所有系统图片信息集合体
            let allOptions = PHFetchOptions()
            //  对内部元素排序，按照时间由远到近排序
            allOptions.sortDescriptors = [NSSortDescriptor.init(key: "creationDate", ascending: false)]
            if(self.type == WQPhotoAlbumType.selectPhoto){
                allOptions.predicate = NSPredicate(format: "mediaType = %d", PHAssetMediaType.image.rawValue)
            }
            //  将元素集合拆解开，此时 allResults 内部是一个个的PHAsset单元
            let fetchAssets = self.assetsFetchResult ?? PHAsset.fetchAssets(with: allOptions)
            let assetsArray = fetchAssets.objects(at: IndexSet.init(integersIn: 0..<fetchAssets.count))
            self.photoData.assetArray = assetsArray
            if(self.type == WQPhotoAlbumType.videoType){
                self.getVideosFromAlbum { (_result: [WQPhotoModel]) in
//                    for model : WQPhotoModel in _result{
//                    }
                }
            }
            if self.photoData.divideArray.count == 0 {
                self.photoData.divideArray = Array(repeating: false, count: self.photoData.assetArray.count)
                self.photoData.dataChanged = false
            }
            DispatchQueue.main.async {
                self.photoCollectionView.reloadData()
            }
        }
    }
    
    private func getVideosFromAlbum(result: @escaping (([WQPhotoModel]) -> Void)){
          var videos: [WQPhotoModel] = []

          let option = PHVideoRequestOptions()
          option.version = .current
          option.deliveryMode = .automatic
          option.isNetworkAccessAllowed = true
                    
          let assets: PHFetchResult = PHAsset.fetchAssets(with: .video, options: nil)
          let manager = PHImageManager.default()
          var tempCount = assets.count
   
          // 获取视频
          for i in 0..<assets.count {
              let asset = assets.object(at: i)
              manager.requestAVAsset(forVideo: asset, options: option) { (avasset, audioMix, array) in
                  // 为了防止多次回调
                  tempCount = tempCount - 1
                  
                  guard let videoAsset: AVURLAsset = avasset as? AVURLAsset else {
                      if tempCount == 0 {
                         result([])
                      }
                      return
                  }
                  
                  let model = WQPhotoModel()
                  model.asset = asset
                  model.avSet = avasset
                  let types:[Substring] = videoAsset.url.absoluteString.split(separator: ".")
                  model.videoType = String(types.last!)
                  model.videoUrl = videoAsset.url
                  model.duration = CMTimeGetSeconds(videoAsset.duration)
                  model.creationDate = asset.creationDate
                  videos.append(model)
                  self.photoData.videoDatas.updateValue(model, forKey: model.asset!.localIdentifier)
                  if tempCount == 0 {
                      // 把视频按照日期排序
                      let newVideos = videos.sorted(by: { (video1, video2) -> Bool in
                          guard let date1 = video1.creationDate,
                              let date2 = video2.creationDate else {
                              return true
                          }
                          return date1 < date2
                          })
                      result(newVideos)
                  }
              }
          }
      }

    private func completedButtonShow() {
        if self.photoData.seletedAssetArray.count > 0 {
            self.bottomView.rightButtonTitle = NSLocalizedString("kOK", comment: "")+"(\(self.photoData.seletedAssetArray.count))"
            self.bottomView.buttonIsEnabled = true
        } else {
            self.bottomView.rightButtonTitle = NSLocalizedString("kOK", comment: "")
            self.bottomView.buttonIsEnabled = false
        }
    }
    
    private func showLoadingView(inView: UIView) {
        inView.addSubview(loadingView)
    }
    private func hideLoadingView() {
        loadingView.removeFromSuperview()
    }
    
    // MARK:- handle events
    private func gotoPreviewViewController(previewArray: [PHAsset], currentIndex: Int) {
        let previewVC = WQPhotoPreviewViewController()
        previewVC.maxSelectCount = maxSelectCount
        previewVC.currentIndex = currentIndex
        previewVC.photoData = self.photoData
        previewVC.previewPhotoArray = previewArray
        previewVC.sureClicked = { [unowned self] (view: UIView, selectPhotos: [PHAsset]) in
            self.selectSuccess(fromeView: view, selectAssetArray: selectPhotos)
        }
        self.navigationController?.pushViewController(previewVC, animated: true)
    }
    
    private func gotoClipViewController(photoImage: UIImage) {
        let clipVC = WQPhotoClipViewController()
        clipVC.clipBounds = self.clipBounds
        clipVC.photoImage = photoImage
        clipVC.sureClicked = { [unowned self] (clipPhoto: UIImage?) in
            if self.photoAlbumDelegate != nil, self.photoAlbumDelegate!.responds(to: #selector(WQPhotoAlbumProtocol.photoAlbum(clipPhoto:))) {
                self.photoAlbumDelegate?.photoAlbum!(clipPhoto: clipPhoto)
            }
            self.dismiss(animated: true, completion: nil)
        }
        self.navigationController?.pushViewController(clipVC, animated: true)
    }

    private func selectPhotoCell(cell: WQPhotoCollectionViewCell, index: Int) {
        photoData.divideArray[index] = !photoData.divideArray[index]
        let asset = photoData.assetArray[index]
        if photoData.divideArray[index] {
            if maxSelectCount != 0, photoData.seletedAssetArray.count >= maxSelectCount {
                //超过最大数
                cell.isChoose = false
                photoData.divideArray[index] = !photoData.divideArray[index]
                let alert = UIAlertController(title: nil, message:String(format :NSLocalizedString("kCheck",comment: ""), maxSelectCount), preferredStyle: .alert)
                let action = UIAlertAction(title: NSLocalizedString("kOK", comment: ""), style: .cancel, handler: nil)
                alert.addAction(action)
                self.present(alert, animated: true, completion: nil)
                return
            }
            photoData.seletedAssetArray.append(asset)
        } else {
            if let removeIndex = photoData.seletedAssetArray.firstIndex(of: asset) {
                photoData.seletedAssetArray.remove(at: removeIndex)
            }
        }
        self.completedButtonShow()
    }

    private func selectSuccess(fromeView: UIView, selectAssetArray: [PHAsset]) {
        self.showLoadingView(inView: fromeView)
        var selectPhotos: [WQPhotoModel] = Array(repeating: WQPhotoModel(), count: selectAssetArray.count)
        let group = DispatchGroup()
        for i in 0 ..< selectAssetArray.count {
            let asset = selectAssetArray[i]
            if asset.mediaType == PHAssetMediaType.video{
                selectPhotos[i] = self.photoData.videoDatas[asset.localIdentifier]!
            }else{
                group.enter()
                let photoModel = WQPhotoModel()
                _ = WQCachingImageManager.default().requestThumbnailImage(for: asset, resultHandler: { (image: UIImage?, dictionry: Dictionary?) in
                    photoModel.thumbnailImage = image
                })
                _ = WQCachingImageManager.default().requestPreviewImage(for: asset, progressHandler: nil, resultHandler: { (image: UIImage?, dictionry: Dictionary?) in
                    var downloadFinined = true
                    if let cancelled = dictionry![PHImageCancelledKey] as? Bool {
                        downloadFinined = !cancelled
                    }
                    if downloadFinined, let error = dictionry![PHImageErrorKey] as? Bool {
                        downloadFinined = !error
                    }
                    if downloadFinined, let resultIsDegraded = dictionry![PHImageResultIsDegradedKey] as? Bool {
                        downloadFinined = !resultIsDegraded
                    }
                    if downloadFinined, let photoImage = image {
                        photoModel.originImage = photoImage
                        selectPhotos[i] = photoModel
                        group.leave()
                    }
                })
            }
        }
        group.notify(queue: DispatchQueue.main, execute: {
            self.hideLoadingView()
            if self.photoAlbumDelegate != nil {
                if self.photoAlbumDelegate!.responds(to: #selector(WQPhotoAlbumProtocol.photoAlbum(selectPhotoAssets:))){
                    self.photoAlbumDelegate?.photoAlbum!(selectPhotoAssets: selectAssetArray)
                }
                if self.photoAlbumDelegate!.responds(to: #selector(WQPhotoAlbumProtocol.photoAlbum(selectPhotos:))) {
                    self.photoAlbumDelegate?.photoAlbum!(selectPhotos: selectPhotos)
                }
            }
            self.dismiss(animated: true, completion: nil)
        })
    }
    
    override func rightButtonClick(button: UIButton) {
        self.navigationController?.dismiss(animated: true)
    }
    
    // MARK:- delegate
    //  PHPhotoLibraryChangeObserver  第一次获取相册信息，这个方法只会进入一次
    func photoLibraryDidChange(_ changeInstance: PHChange) {
        guard self.photoData.assetArray.count == 0 else {return}
        DispatchQueue.main.async {
            self.getAllPhotos()
        }
    }
    
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        return self.photoData.assetArray.count
    }
    
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        guard let cell = collectionView.dequeueReusableCell(withReuseIdentifier: cellIdentifier, for: indexPath) as? WQPhotoCollectionViewCell, self.photoData.assetArray.count > indexPath.row else {return WQPhotoCollectionViewCell()}
        let asset = self.photoData.assetArray[indexPath.row]
        _ = WQCachingImageManager.default().requestThumbnailImage(for: asset) { (image: UIImage?, dictionry: Dictionary?) in
            cell.photoImage = image ?? UIImage()
        }
        if type == .clipPhoto {
            cell.selectButton.isHidden = true
        } else {
            if indexPath.row < self.photoData.divideArray.count{
                cell.isChoose = self.photoData.divideArray[indexPath.row]
                cell.selectPhotoCompleted = { [weak self] in
                    guard let strongSelf = self else {return}
                    strongSelf.selectPhotoCell(cell: cell, index: indexPath.row)
                }
            }
       
        }
        return cell
    }
    
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        let assetData = self.photoData.assetArray[indexPath.row]
        if self.type == .clipPhoto {
            self.showLoadingView(inView: self.view)
            let asset = self.photoData.assetArray[indexPath.row]
            _ = WQCachingImageManager.default().requestPreviewImage(for: asset, progressHandler: nil, resultHandler: { (image: UIImage?, dictionry: Dictionary?) in
                var downloadFinined = true
                if let cancelled = dictionry![PHImageCancelledKey] as? Bool {
                    downloadFinined = !cancelled
                }
                if downloadFinined, let error = dictionry![PHImageErrorKey] as? Bool {
                    downloadFinined = !error
                }
                if downloadFinined, let resultIsDegraded = dictionry![PHImageResultIsDegradedKey] as? Bool {
                    downloadFinined = !resultIsDegraded
                }
                if downloadFinined, let photoImage = image {
                    self.hideLoadingView()
                    self.gotoClipViewController(photoImage: photoImage)
                }
            })
        }else if assetData.mediaType == PHAssetMediaType.video{
            let index = assetData.localIdentifier
            let photoData = self.photoData.videoDatas[index]
            if photoData != nil{
                let playerView = AVPlayer(url: photoData!.videoUrl!)
                let playerViewController = AVPlayerViewController()
                playerViewController.player = playerView
                self.present(playerViewController, animated: true) {
                       playerViewController.player?.play()
                }
            }
          
        } else {
            self.gotoPreviewViewController(previewArray: self.photoData.assetArray, currentIndex: indexPath.row)
        }
    }
}

// 相册底部view
class WQAlbumBottomView: UIView {
    
    private lazy var previewButton: UIButton = {
        let button = UIButton(frame: CGRect(x: 12, y: 2, width: 80, height: 40))
        button.backgroundColor = UIColor.clear
        button.contentHorizontalAlignment = .left
        button.titleLabel?.font = UIFont.systemFont(ofSize: 17)
        button.setTitle(NSLocalizedString("kPreview", comment: ""), for: .normal)
        button.setTitleColor(UIColor(white: 0.5, alpha: 1), for: .disabled)
        button.setTitleColor(UIColor.white, for: .normal)
        button.addTarget(self, action: #selector(previewClick(button:)), for: .touchUpInside)
        button.isEnabled = false
        return button
    }()
    
    private lazy var sureButton: UIButton = {
        let button = UIButton(frame: CGRect(x: WQScreenWidth-12-80, y: 6, width: 80, height: 32))
        button.titleLabel?.font = UIFont.systemFont(ofSize: 14)
        button.setTitle(NSLocalizedString("kOK", comment: ""), for: .normal)
        button.setBackgroundImage(UIImage.wqCreateImageWithColor(color: WQPhotoAlbumSkinColor, size: CGSize(width: 80, height: 32))?.wqSetRoundedCorner(radius: 4), for: .normal)
        button.setBackgroundImage(UIImage.wqCreateImageWithColor(color: WQPhotoAlbumSkinColor.withAlphaComponent(0.5), size: CGSize(width: 80, height: 32))?.wqSetRoundedCorner(radius: 4), for: .disabled)
        button.setTitleColor(UIColor(white: 0.5, alpha: 1), for: .disabled)
        button.setTitleColor(UIColor.white, for: .normal)
        button.addTarget(self, action: #selector(sureClick(button:)), for: .touchUpInside)
        button.isEnabled = false
        return button
    }()
    
    var leftButtonTitle: String? {
        didSet {
            self.previewButton.setTitle(leftButtonTitle, for: .normal)
        }
    }
    
    var rightButtonTitle: String? {
        didSet {
            self.sureButton.setTitle(rightButtonTitle, for: .normal)
        }
    }
    
    var buttonIsEnabled = false {
        didSet {
            self.previewButton.isEnabled = buttonIsEnabled
            self.sureButton.isEnabled = buttonIsEnabled
        }
    }
    
    // 预览闭包
    var leftClicked: (() -> Void)?
    
    // 完成闭包
    var rightClicked: (() -> Void)?
    
    enum WQAlbumBottomViewType {
        case normal, noPreview
    }
    
    convenience init() {
        self.init(frame: CGRect(x: 0, y: WQScreenHeight-WQHomeBarHeight-44, width: WQScreenWidth, height: 44+WQHomeBarHeight), type: .normal)
    }
    
    convenience init(type: WQAlbumBottomViewType) {
        self.init(frame: CGRect(x: 0, y: WQScreenHeight-WQHomeBarHeight-44, width: WQScreenWidth, height: 44+WQHomeBarHeight), type: type)
    }
    
    convenience override init(frame: CGRect) {
        self.init(frame: frame, type: .normal)
    }
    
    init(frame: CGRect, type: WQAlbumBottomViewType) {
        super.init(frame: frame)
        self.backgroundColor = UIColor(white: 0.1, alpha: 0.9)
        if type == .normal {
            self.addSubview(self.previewButton)
        }
        
        self.addSubview(self.sureButton)
    }
    
    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    //MARK: handle events
    @objc func previewClick(button: UIButton) {
        if leftClicked != nil {
            leftClicked!()
        }
    }
    
    @objc func sureClick(button: UIButton) {
        if rightClicked != nil {
            rightClicked!()
        }
    }
}
