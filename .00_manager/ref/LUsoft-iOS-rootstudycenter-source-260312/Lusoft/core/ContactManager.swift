import Contacts
import ContactsUI

class ContactManager {
    static let shared = ContactManager()
    private let contactStore = CNContactStore()
    
    private init() {}
    
    // 주소록 접근 권한 요청
    func requestAccess(completion: @escaping (Bool, Error?) -> Void) {
        contactStore.requestAccess(for: .contacts) { granted, error in
            DispatchQueue.main.async {
                completion(granted, error)
            }
        }
    }
    
    // 모든 연락처 가져오기
    func fetchContacts(completion: @escaping ([CNContact]?, Error?) -> Void) {
        let keys = [
            CNContactGivenNameKey,
            CNContactFamilyNameKey,
            CNContactPhoneNumbersKey,
            CNContactEmailAddressesKey
        ] as [CNKeyDescriptor]
        
        let request = CNContactFetchRequest(keysToFetch: keys)
        
        var contacts: [CNContact] = []
        
        do {
            try contactStore.enumerateContacts(with: request) { contact, stop in
                contacts.append(contact)
            }
            completion(contacts, nil)
        } catch {
            completion(nil, error)
        }
    }
}
