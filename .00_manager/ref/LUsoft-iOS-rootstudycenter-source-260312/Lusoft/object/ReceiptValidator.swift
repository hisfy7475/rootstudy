import Foundation
import StoreKit

class ReceiptValidator: NSObject {
    
    static let shared = ReceiptValidator()
    
    private let productionURL = "https://buy.itunes.apple.com/verifyReceipt"
    private let sandboxURL = "https://sandbox.itunes.apple.com/verifyReceipt"
    
    private override init() {
        super.init()
    }
    
    /// 영수증을 검증하는 메서드
    /// - Parameters:
    ///   - receiptData: 검증할 영수증 데이터
    ///   - completion: 검증 결과를 반환하는 클로저
    func validateReceipt(receiptData: Data, completion: @escaping (ReceiptValidationResult) -> Void) {
        // 먼저 프로덕션 서버로 검증 시도
        validateReceiptWithServer(receiptData: receiptData, url: productionURL) { [weak self] result in
            switch result {
            case .success(let response):
                completion(.success(response))
            case .failure(let error):
                // 프로덕션 서버에서 실패한 경우, 샌드박스 서버로 재시도
                if error == .receiptFromSandbox {
                    print("ReceiptValidator: 프로덕션 서버에서 샌드박스 영수증으로 감지됨. 샌드박스 서버로 재검증 시도")
                    self?.validateReceiptWithServer(receiptData: receiptData, url: self?.sandboxURL ?? "") { sandboxResult in
                        completion(sandboxResult)
                    }
                } else {
                    completion(.failure(error))
                }
            }
        }
    }
    
    /// 특정 서버로 영수증을 검증하는 내부 메서드
    /// - Parameters:
    ///   - receiptData: 검증할 영수증 데이터
    ///   - url: 검증할 서버 URL
    ///   - completion: 검증 결과를 반환하는 클로저
    private func validateReceiptWithServer(receiptData: Data, url: String, completion: @escaping (ReceiptValidationResult) -> Void) {
        guard let url = URL(string: url) else {
            completion(.failure(.invalidURL))
            return
        }
        
        // 영수증 데이터를 base64로 인코딩
        let receiptString = receiptData.base64EncodedString()
        
        // 요청 파라미터 생성
        let parameters: [String: Any] = [
            "receipt-data": receiptString,
            "password": "", // 앱별 공유 시크릿이 있는 경우 여기에 추가
            "exclude-old-transactions": true
        ]
        
        // JSON 데이터 생성
        guard let jsonData = try? JSONSerialization.data(withJSONObject: parameters) else {
            completion(.failure(.invalidRequest))
            return
        }
        
        // URLRequest 생성
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData
        
        // 네트워크 요청 실행
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    print("ReceiptValidator: 네트워크 오류 - \(error.localizedDescription)")
                    completion(.failure(.networkError(error)))
                    return
                }
                
                guard let data = data else {
                    completion(.failure(.noData))
                    return
                }
                
                do {
                    let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any]
                    
                    guard let status = json?["status"] as? Int else {
                        completion(.failure(.invalidResponse))
                        return
                    }
                    
                    switch status {
                    case 0:
                        // 성공
                        completion(.success(json ?? [:]))
                    case 21007:
                        // 샌드박스 영수증이 프로덕션 서버로 전송됨
                        completion(.failure(.receiptFromSandbox))
                    case 21008:
                        // 프로덕션 영수증이 샌드박스 서버로 전송됨
                        completion(.failure(.receiptFromProduction))
                    case 21000:
                        completion(.failure(.invalidJSON))
                    case 21002:
                        completion(.failure(.invalidReceiptData))
                    case 21003:
                        completion(.failure(.receiptNotAuthenticated))
                    case 21004:
                        completion(.failure(.sharedSecretNotMatch))
                    case 21005:
                        completion(.failure(.receiptServerUnavailable))
                    case 21006:
                        completion(.failure(.receiptIsValidButSubscriptionExpired))
                    default:
                        completion(.failure(.unknownError(status)))
                    }
                } catch {
                    print("ReceiptValidator: JSON 파싱 오류 - \(error.localizedDescription)")
                    completion(.failure(.invalidResponse))
                }
            }
        }.resume()
    }
    
    /// 현재 앱의 영수증을 가져와서 검증하는 메서드
    /// - Parameter completion: 검증 결과를 반환하는 클로저
    func validateCurrentReceipt(completion: @escaping (ReceiptValidationResult) -> Void) {
        guard let receiptURL = Bundle.main.appStoreReceiptURL,
              let receiptData = try? Data(contentsOf: receiptURL) else {
            completion(.failure(.noReceipt))
            return
        }
        
        validateReceipt(receiptData: receiptData, completion: completion)
    }
}

// MARK: - ReceiptValidationResult
enum ReceiptValidationResult {
    case success([String: Any])
    case failure(ReceiptValidationError)
}

// MARK: - ReceiptValidationError
enum ReceiptValidationError: Error, LocalizedError {
    case invalidURL
    case invalidRequest
    case networkError(Error)
    case noData
    case invalidResponse
    case invalidJSON
    case invalidReceiptData
    case receiptNotAuthenticated
    case sharedSecretNotMatch
    case receiptServerUnavailable
    case receiptIsValidButSubscriptionExpired
    case receiptFromSandbox
    case receiptFromProduction
    case noReceipt
    case unknownError(Int)
    
    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "잘못된 URL"
        case .invalidRequest:
            return "잘못된 요청"
        case .networkError(let error):
            return "네트워크 오류: \(error.localizedDescription)"
        case .noData:
            return "응답 데이터 없음"
        case .invalidResponse:
            return "잘못된 응답"
        case .invalidJSON:
            return "잘못된 JSON"
        case .invalidReceiptData:
            return "잘못된 영수증 데이터"
        case .receiptNotAuthenticated:
            return "영수증이 인증되지 않음"
        case .sharedSecretNotMatch:
            return "공유 시크릿이 일치하지 않음"
        case .receiptServerUnavailable:
            return "영수증 서버를 사용할 수 없음"
        case .receiptIsValidButSubscriptionExpired:
            return "영수증은 유효하지만 구독이 만료됨"
        case .receiptFromSandbox:
            return "샌드박스 영수증이 프로덕션 서버로 전송됨"
        case .receiptFromProduction:
            return "프로덕션 영수증이 샌드박스 서버로 전송됨"
        case .noReceipt:
            return "영수증을 찾을 수 없음"
        case .unknownError(let status):
            return "알 수 없는 오류 (상태 코드: \(status))"
        }
    }
} 