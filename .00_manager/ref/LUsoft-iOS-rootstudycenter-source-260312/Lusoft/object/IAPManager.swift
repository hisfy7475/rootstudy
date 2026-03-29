import UIKit
import StoreKit


enum IAPHandlerAlertType {
    case disabled
    case restored
    case purchased
    case fail
    case processing
    case deffered
    
    func message() -> String{
        switch self {
        case .disabled: return "단말기의 인앱구매 설정이 제한되어 있습니다.!"
        case .restored: return "재구매에 성공하였습니다.!"
        case .purchased: return "구매에 성공하였습니다.!"
        case .fail : return "구매에 실패하였습니다.!"
        case .processing : return "처리중입니다."
        case .deffered : return "defferd"
        }
    }
}

extension Notification.Name {
  static let iapServicePurchaseNotification = Notification.Name("IAPServicePurchaseNotification")
}

class IAPManager: NSObject
{
    let TAG:String = "IAPManager"
    static let shared = IAPManager()
    
    private var m_isIAP : Bool = false
    private var m_registItems : Array<String> = [] // 서버상에 등록된 아이템
    fileprivate var m_productsItems : Array<SKProduct> = [] // 애플에 등록된 아이템
    fileprivate var m_strProductID : String = ""
    fileprivate var m_productsRequest : SKProductsRequest = SKProductsRequest()
    
    
    private var m_purchasedIdentifier : String = ""
    var purchaseStatusBlock: ((IAPHandlerAlertType) -> Void)?
    
    
    override init()
    {
        super.init()
        if Config.shared.isIAP == true {
            getProductItems()
        }	
    }
    
    func getProductItems() -> Void
    {
        let infoDic = Bundle.main.infoDictionary?["BUILDER_SETTING"] as! [String : AnyObject]
        self.m_registItems = infoDic["IAP_ARRAY"] as! Array<String>
        print(TAG, "getProductItems", m_registItems.count)
        if self.m_registItems.count > 0 {
            let sets:Set<String> = NSSet.init(array: self.m_registItems) as! Set<String>
            m_productsRequest = SKProductsRequest(productIdentifiers: Set(sets))
            m_productsRequest.delegate = self
            m_productsRequest.start()
            m_isIAP = true
        }
        Util.log("m_registItems \(m_registItems)")
    }
    
    public func GetIAPAvail() ->Bool
    {
        return m_isIAP
    }
    
    public func SetIAPAvail(isAvail : Bool)
    {
        m_isIAP = isAvail
    }
    
    public func GetResultItemID(index : Int) ->String
    {
        if index < 0 {
            return ""
        }
        if m_registItems.count == 0 {
            return ""
        }
        let find : SKProduct = m_productsItems[index]
        return find.productIdentifier
    }
    
    // MARK: - MAKE PURCHASE OF A PRODUCT
    public func canPayments() -> Bool
    {
        return SKPaymentQueue.canMakePayments()
    }
    
    func purchaseMyProduct(requestID: String) -> [String: Any]
    {
        print(TAG, "purchaseMyProduct m_registItems.count: ", m_registItems.count)
        print(TAG, "purchaseMyProduct m_registItems: ", m_registItems)
        print(TAG, "purchaseMyProduct m_productsItems: ", m_productsItems)
        var ret: [String: Any] = ["result":false, "msg":""]
        if m_registItems.count == 0 {
            ret["msg"] = "IAP_ARRAY Not Setting"
            return ret
        }
        if m_productsItems.count == 0{
            ret["msg"] = "APP Store Product Not Live"
            return ret
        }
        print("123")
        var index : Int = 0;
        for find : SKProduct in m_productsItems {
            if requestID == find.productIdentifier {
                break
            }
            index += 1
        }
        let product = m_productsItems[index]
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(self)
        SKPaymentQueue.default().add(payment)
        
        print("PRODUCT TO PURCHASE: \(product.productIdentifier)")
        m_strProductID = product.productIdentifier
        ret["index"] = index
        ret["result"] = true
        return ret
    }

    func restorePurchase()
    {
        SKPaymentQueue.default().add(self)
        SKPaymentQueue.default().restoreCompletedTransactions()
    }
    
    public func setIdentifierIAP(strIdentifier : String)
    {
        m_purchasedIdentifier = strIdentifier
    }
    
    public func getIdentifierIAP() -> String
    {
        return m_purchasedIdentifier
    }
}

extension IAPManager: SKProductsRequestDelegate, SKPaymentTransactionObserver{
    func productsRequest (_ request:SKProductsRequest, didReceive response:SKProductsResponse){
        Util.log("productsRequest \(response.products.count)")
        Util.log("유효하지 않은 제품 ID들: \(response.invalidProductIdentifiers)")
        if (response.products.count > 0){
            m_productsItems = response.products
            for product in m_productsItems{
                let numberFormatter = NumberFormatter()
                numberFormatter.formatterBehavior = .behavior10_4
                numberFormatter.numberStyle = .currency
                numberFormatter.locale = product.priceLocale
                let price1Str = numberFormatter.string(from: product.price)
                print(product.localizedDescription + "\nfor just \(price1Str!)")
                
                self.SetIAPAvail(isAvail: true)
            }
        }
    }
    
    func request(_ request: SKRequest, didFailWithError error: Error) {
        print("jinchae fail \(error)")
    }
    
    func paymentQueueRestoreCompletedTransactionsFinished(_ queue: SKPaymentQueue)
    {
        purchaseStatusBlock?(.restored)
    }
    
    func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction])
    {
        for transaction:AnyObject in transactions
        {
            if let trans = transaction as? SKPaymentTransaction
            {
                switch trans.transactionState
                {
                case .purchased:
                    print("purchased")
                    SKPaymentQueue.default().finishTransaction(transaction as! SKPaymentTransaction)
                    self.setIdentifierIAP(strIdentifier: (transaction.transactionIdentifier as? String)!)
                    purchaseStatusBlock?(.purchased)
                    break
                case .failed:
                    SKPaymentQueue.default().finishTransaction(transaction as! SKPaymentTransaction)
                    //                    self.setIdentifierIAP(strIdentifier: (transaction.transactionIdentifier as? String)!)
                    purchaseStatusBlock?(.fail)
                    break
                case .restored:
                    print("restored")
                    SKPaymentQueue.default().finishTransaction(transaction as! SKPaymentTransaction)
                    self.setIdentifierIAP(strIdentifier: (transaction.transactionIdentifier as? String)!)
                    purchaseStatusBlock?(.restored)
                    break
                case .purchasing:
                    print("purchasing")
                    purchaseStatusBlock?(.processing)
                    break
                case .deferred:
                    purchaseStatusBlock?(.deffered)
                    break
                default: break
                }}
        }
    }
    private func deliverPurchaseNotificationFor(id: String?) {
        guard let id = id else { return }
        
        UserDefaults.standard.set(true, forKey: id)
        // TODO: noti
        NotificationCenter.default.post( // <- 추가
            name: .iapServicePurchaseNotification,
            object: id
        )
    }
}
