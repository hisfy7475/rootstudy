//
//  String_Extension.swift
//  TEMP
//
//  Created by LEETAEIN on 2018. 3. 19..
//  Copyright © 2018년 dqnetworks. All rights reserved.
//

import Foundation
import UniformTypeIdentifiers
import CryptoKit

extension String
{
    func isNumbers() -> Bool
    {
        let numberRegEx  = "[0-9]"
        let testCase     = NSPredicate(format:"SELF MATCHES %@", numberRegEx)
        return testCase.evaluate(with: self)
    }
    public func mimeType() -> String {
        return (self as NSString).mimeType()
    }
    public func mimeTypeToExt() -> String {
        return MimeType(ext: self)
    }
}

internal let mimeTypes = [
    "application/atom+xml": "atom",
    "application/epub+zip": "epub",
    "application/font-woff": "woff",
    "application/java-archive": "jar",
    "application/javascript": "js",
    "application/json": "json",
    "application/mac-binhex40": "hqx",
    "application/msword": "doc",
    "application/postscript": "ps",
    "application/rss+xml": "rss",
    "application/rtf": "rtf",
    "application/vnd.apple.mpegurl": "m3u8",
    "application/vnd.google-earth.kml+xml": "kml",
    "application/vnd.google-earth.kmz": "kmz",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-fontobject": "eot",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.wap.wmlc": "wmlc",
    "application/x-7z-compressed": "7z",
    "application/x-cocoa": "cco",
    "application/xhtml+xml": "xhtml",
    "application/x-java-archive-diff": "jardiff",
    "application/x-java-jnlp-file": "jnlp",
    "application/x-makeself": "run",
    "application/x-perl": "pl",
    "application/x-pilot": "prc",
    "application/x-rar-compressed": "rar",
    "application/x-redhat-package-manager": "rpm",
    "application/x-sea": "sea",
    "application/x-shockwave-flash": "swf",
    "application/xspf+xml": "xspf",
    "application/x-stuffit": "sit",
    "application/x-tcl": "tcl",
    "application/x-x509-ca-cert": "crt",
    "application/x-xpinstall": "xpi",
    "application/zip": "zip",
    "audio/midi": "mid",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/x-m4a": "m4a",
    "audio/x-realaudio": "ra",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "image/vnd.wap.wbmp": "wbmp",
    "image/webp": "webp",
    "image/x-icon": "ico",
    "image/x-jng": "jng",
    "image/x-ms-bmp": "bmp",
    "application/pdf": "pdf",
    "text/css": "css",
    "text/html": "html",
    "text/mathml": "mml",
    "text/plain": "txt",
    "text/vnd.sun.j2me.app-descriptor": "jad",
    "text/vnd.wap.wml": "wml",
    "text/x-component": "htc",
    "text/xml": "xml",
    "video/3gpp": "3gp",
    "video/mp2t": "ts",
    "video/mp4": "mp4",
    "video/mpeg": "mpg",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/x-flv": "flv",
    "video/x-m4v": "m4v",
    "video/x-mng": "mng",
    "video/x-ms-asf": "asf",
    "video/x-msvideo": "avi",
    "video/x-ms-wmv": "wmv",
]
internal func MimeType(ext: String?) -> String {
    return mimeTypes[ext?.lowercased() ?? "" ] ?? "txt"
}
extension NSURL {
    public func mimeType() -> String {
        if let pathExt = self.pathExtension,
            let mimeType = UTType(filenameExtension: pathExt)?.preferredMIMEType {
            return mimeType
        }
        else {
            return "application/octet-stream"
        }
    }
}

extension URL {
    public func mimeType() -> String {
        if let mimeType = UTType(filenameExtension: self.pathExtension)?.preferredMIMEType {
            return mimeType
        }
        else {
            return "application/octet-stream"
        }
    }
}

extension NSString {
    public func mimeType() -> String {
        if let mimeType = UTType(filenameExtension: self.pathExtension)?.preferredMIMEType {
            return mimeType
        }
        else {
            return "application/octet-stream"
        }
    }
}
extension String {
    func substring(from: Int, to: Int) -> String {
        guard from < count, to >= 0, to - from >= 0 else {
            return ""
        }
        
        // Index 값 획득
        let startIndex = index(self.startIndex, offsetBy: from)
        let endIndex = index(self.startIndex, offsetBy: to + 1) // '+1'이 있는 이유: endIndex는 문자열의 마지막 그 다음을 가리키기 때문
        
        // 파싱
        return String(self[startIndex ..< endIndex])
    }
    func startsWith(var input : String)->Bool{
        if input == self.prefix(input.count) {
            return true
        }
        return false
    }
    func urlEncode() -> String? {
        return self.addingPercentEncoding( withAllowedCharacters: .urlQueryAllowed)
    }
    func urlDecode() -> String? {
        let replaced = self.replacingOccurrences(of: "+", with: " ")
        return replaced.removingPercentEncoding
    }
    func lang() -> String? {
        return NSLocalizedString(self, comment:self)
    }
    func md5() -> String {
        let data = Data(self.utf8)
        let hash = Insecure.MD5.hash(data: data)
        return hash.map { String(format: "%02x", $0) }.joined()
    }
}

extension Dictionary where Key == String {
    // 타입 확인 헬퍼 함수
    func isType(_ key: String) -> String {
        if self[key] is String {
            return "String"
        }else if self[key] is Int {
            return "Int"
        }else if self[key] is Bool {
            return "Bool"
        }else if self[key] is [Any] {
            return "Any"
        }else if self[key] is [String: Any] {
            return "ictionary"
        }
        return "unknown"
    }
}
