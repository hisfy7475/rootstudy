//
//  Http.swift
//  NeGAIProTools_Swift
//
//  Created by negaipro on 2016. 7. 14..
//  Copyright © 2016년 negaipro. All rights reserved.
//

import Foundation

public class Http
{
    public enum Method
    {
        case GET
        case POST
        case PUT
        case DELETE
    }
    
    public enum ContentType
    {
        // for All Method
        case text
        
        // for POST, PUT
        case json
        
        // for POST, PUT
        case multiPart
    }
    
    private var method = Method.GET
    private var urlStr : String = ""
    private var contentType = ContentType.text
    private var request : URLRequest? = nil
    
    private var addDatas : [String : String] = [:]
    private var addHeaderDatas : [String : String] = [:]
    // multi-part
    private var addFileDatas : [(key:String, value:Data, type:String, fileName:String)] = []
    // json
    private var addJsonDatas : [String:Any] = [:]
    
    // MARK: 초기화
    public init(url: String, method: Http.Method, contentType ct: ContentType = .text)
    {
        self.method = method
        self.urlStr = url
        self.contentType = ct
    }
    
    // MARK: add
    public func add(key:String, value:String)
    {
        addDatas[key] = value
    }
    
    public func add(key:String, value:Data, fileName:String)
    {
        var type : String = ""
        let ext = fileName.components(separatedBy: ".").last?.lowercased()
        if ext == "pdf"
        {
            type = "application/pdf"
        }
        else if ext == "exe"
        {
            type = "application/octet-stream"
        }
        else if ext == "zip"
        {
            type = "application/zip"
        }
        else if ext == "doc"
        {
            type = "application/msword"
        }
        else if ext == "xls"
        {
            type = "application/vnd.ms-excel"
        }
        else if ext == "ppt"
        {
            type = "application/vnd.ms-powerpoint"
        }
        else if ext == "gif"
        {
            type = "image/gif"
        }
        else if ext == "png"
        {
            type = "image/png"
        }
        else if ext == "jpeg" || ext == "jpg"
        {
            type = "image/jpg"
        }
        else if ext == "mp4" || ext == "mpg4"
        {
            type = "video/mp4"
        }
        else if ext == "mpg" || ext == "mpeg"
        {
            type = "video/mpeg"
        }
        else if ext == "mov"
        {
            type = "video/quicktime"
        }
        else if ext == "avi"
        {
            type = "video/x-msvideo"
        }
     
        addFileDatas.append((key:key, value:value, type:type, fileName:fileName))
    }
    
    public func add(jsonValue: [String:Any])
    {
        addJsonDatas = jsonValue
    }
    
    public func addHeader(key:String, value:String)
    {
        addHeaderDatas[key] = value
    }
    
    
    // MARK: prepare
    private func prepare()
    {
        if method == Method.GET || method == Method.DELETE
        {
            if urlStr.range(of: "?") == nil
            {
                self.urlStr += "?"
            }
            
            let allKeys = addDatas.keys
            var cnt = 0
            for key in allKeys
            {
                cnt += 1
                if let value = addDatas[key]
                {
                    self.urlStr += key.addingPercentEncoding(withAllowedCharacters: CharacterSet.urlQueryAllowed)! + "=" + value.addingPercentEncoding(withAllowedCharacters: CharacterSet.urlQueryAllowed)!
                    
                    if allKeys.count > cnt
                    {
                        self.urlStr += "&"
                    }
                }
            }
            
            if let url = URL(string: self.urlStr)
            {
                request = URLRequest(url: url)
            }
            else
            {
                print("URLRequest init error!! url = " + self.urlStr)
            }
            
            request?.httpMethod = (method==Method.GET ? "GET":"DELETE")
        }
        else
        {
            var data = Data()
            
            if(contentType == .multiPart)
            {
                let boundaryStr = "0xKhTmLb0uNdAry-NeGAIPro"
                
                addHeader(key: "Content-Type", value: "multipart/form-data; boundary="+boundaryStr)
                
                data.append(String("--" + boundaryStr + "\r\n").data(using: String.Encoding.utf8)!)
                
                let endBoundary = "\r\n--"+boundaryStr+"\r\n"
                
                let allKeys = addDatas.keys
                var cnt = 0
                for key in allKeys
                {
                    cnt += 1
                    if let value = addDatas[key]
                    {
                        let str = "Content-Disposition: form-data; name=\"" + key + "\"\r\n\r\n"
                        data.append(str.data(using: String.Encoding.utf8)!)
                        
                        data.append(value.data(using: String.Encoding.utf8)!)
                        
                        if allKeys.count != cnt || addFileDatas.count > 0
                        {
                            data.append(endBoundary.data(using: String.Encoding.utf8)!)
                        }
                    }
                }
                
                for tup in addFileDatas
                {
                    let str1 = "Content-Disposition: form-data; name=\""+tup.key+"\"; filename=\""+tup.fileName+"\"\r\n"
                    data.append(str1.data(using: String.Encoding.utf8)!)
                    
                    let str2 = "Content-Type: "+tup.type+"\r\n\r\n"
                    data.append(str2.data(using: String.Encoding.utf8)!)
                    
                    data.append(tup.value)
                    
                    if tup != addFileDatas.last!
                    {
                        data.append(endBoundary.data(using: String.Encoding.utf8)!)
                    }
                }
                
                let str = "\r\n--"+boundaryStr+"\r\n"
                data.append(str.data(using: String.Encoding.utf8)!)
            }
            else if contentType == .json
            {
                addHeader(key: "Content-Type", value: "application/json")
                
                do {
                    data = try JSONSerialization.data(withJSONObject: addJsonDatas, options: .prettyPrinted)
                    addHeader(key: "Content-Length", value: String(data.count))
                    
                    let strLog = String.init(data: data, encoding: .utf8)
                    print("json string : \(String(describing:strLog))")
                    print("json data size : \(data.count)")
                }
                catch let error
                {
                    print("Http - json prepare failed : \(error)")
                }
            }
            else // .Text
            {
                var str : String = ""
                let allKeys = addDatas.keys
                var cnt = 0
                for key in allKeys
                {
                    cnt += 1
                    if let value = addDatas[key]
                    {
                        str += key.addingPercentEncoding(withAllowedCharacters: CharacterSet.urlQueryAllowed)! + "=" + value.addingPercentEncoding(withAllowedCharacters: CharacterSet.urlQueryAllowed)!
                        
                        if allKeys.count > cnt
                        {
                            str += "&"
                        }
                    }
                }
                
                data = str.data(using: String.Encoding.utf8)!
            }
            
            if let url = URL(string: self.urlStr)
            {
                request = URLRequest(url: url)
            }
            else
            {
                print("URLRequest init error!! url = " + self.urlStr)
            }
            
            request?.httpMethod = (method==Method.POST ? "POST":"PUT")
            request?.httpBody = data
        }
        
        // header
        for tup in addHeaderDatas
        {
            request?.addValue(tup.value, forHTTPHeaderField: tup.key)
        }
    }
    
    // MARK: run
    public func returnData(_ complete:@escaping (Data)->(), failCallback: (()->())? = nil)
    {
        self.prepare()
        
        URLSession.shared.dataTask(with: request!) { (d, response, error) in
            
            if let data = d
            {
                print("data->string :", data, String(data: data, encoding: String.Encoding.utf8)!)
                DispatchQueue.main.async {
                    complete(data)
                }
            }
            else
            {
                print("Http - URLSession.shared.dataTask Error")
                print(String(describing: error))
                DispatchQueue.main.async {
                    failCallback?()
                }
            }
            }.resume()
    }
    
    public func returnObject(_ complete:@escaping ([String:AnyObject])->(), failCallback: (()->())? = nil)
    {
        returnData ({ (data) in
            
            do
            {
                if let obj = try JSONSerialization.jsonObject(with: data, options: []) as? [String:AnyObject]
                {
                    complete(obj)
                }
                else
                {
                    Util.writeLog("Http - JsonSerialization Failed, not String:AnyObject Type!!")
                    failCallback?()
                }
            }
            catch let err as NSError
            {
                Util.writeLog("Http - JsonSerialization Error")
                Util.writeLog(String(format:"%@:", err))
                failCallback?()
            }
        })
    }
    
    public func returnList(_ complete:@escaping ([AnyObject])->(), failCallback: (()->())? = nil)
    {
        returnData ({ (data) in
            
            do
            {
                if let list = try JSONSerialization.jsonObject(with: data, options: []) as? [AnyObject]
                {
                    complete(list)
                }
                else
                {
                    print("Http - JsonSerialization Failed, not String:AnyObject Type!!")
                    failCallback?()
                }
            }
            catch let err as NSError
            {
                print("Http - JsonSerialization Error")
                print(err)
                failCallback?()
            }
        })
    }
}
