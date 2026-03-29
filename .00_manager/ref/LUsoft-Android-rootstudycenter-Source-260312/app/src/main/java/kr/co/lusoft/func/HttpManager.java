package kr.co.lusoft.func;


import android.util.Log;
import android.util.Pair;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Serializable;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;

import kr.co.lusoft.util.FileUtils;
import kr.co.lusoft.util.SharedData;
import kr.co.lusoft.util.StackManager;
import kr.co.lusoft.util.Util;


public class HttpManager {
    private String TAG = "*[HttpManager";
    private class HttpData {
        private Pair<String, String> data;

        HttpData(String key, String value) {
            data = new Pair<>(key, value);
        }

        String getKey() {
            return data.first;
        }

        String getValue() {
            return data.second;
        }

        String getEncodedValue() {
            try {
                return URLEncoder.encode(data.second, "UTF-8");
            } catch (UnsupportedEncodingException e) {
                e.printStackTrace();
            }

            return data.second;
        }
    }

    private class HttpFileData {
        private Pair<String, String> data;
        private File file;

        HttpFileData(String key, File _file, String fileName)
        {
            data = new Pair<>(key, fileName);
            file = _file;
        }

        String getKey() {
            return data.first;
        }

        String getFileName() {
            try {
                return URLEncoder.encode(data.second, "UTF-8");
            } catch (UnsupportedEncodingException e) {
                e.printStackTrace();
            }

            return data.second;
        }

        public File getFile() {
            return file;
        }
    }

    public enum Method {
        GET("GET"), POST("POST"), PUT("PUT"), DELETE("DELETE");

        private final String value;

        Method(String value) {
            this.value = value;
        }

        public String getValue() {
            return value;
        }
    }

    public interface HttpCallbackObject extends Serializable
    {
        void callback(JSONObject obj);
    }

    public interface HttpCallbackList extends Serializable
    {
        void callback(JSONArray obj);
    }

    private Method method;
    private String urlStr;
    private Boolean useMultiPart;

    private HttpURLConnection connection;

    private ArrayList< HttpData > addDatas = new ArrayList<>();
    private ArrayList< HttpData > addHeaderDatas = new ArrayList<>();

    // multi-part
    private ArrayList<HttpFileData> addFileDatas = new ArrayList<>();

    public HttpManager(String url, Method meth)
    {
        urlStr = url;
        method = meth;
        useMultiPart = false;
    }
    public HttpManager(String url, Method meth, Boolean multiPart)
    {
        urlStr = url;
        method = meth;
        useMultiPart = multiPart;
    }

    public void add(String key, String value)
    {
        String addValue = value;
        if (method == Method.GET || method == Method.DELETE)
        {
            addValue = addValue.replace(" ", "+");
        }

        addDatas.add(new HttpData(key, addValue));
    }

    public void add(String key, File file, String fileName)
    {
        addFileDatas.add(new HttpFileData(key, file, fileName));
    }

    @SuppressWarnings("unused")
    public void addHeader(String key, String value)
    {
        addHeaderDatas.add(new HttpData(key, value));
    }

    private void prepare()
    {
        try
        {
            if (method == Method.GET || method == Method.DELETE)
            {
                if (!urlStr.contains("?"))
                {
                    urlStr += "?";
                }
                urlStr += getAddDataQueryString();

                URL url = new URL(urlStr);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod(method.getValue());
            }
            else
            {
                if (useMultiPart)
                {
                    final String boundary = "0xKhTmLb-Android-0uNdAry-NeGAIPro";
                    final String endBoundary = "\r\n--" + boundary + "\r\n";

                    URL url = new URL(urlStr);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod(method.getValue());
                    connection.setDoInput(true);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Connection","Keep-Alive");
                    connection.setRequestProperty("Content-Type","multipart/form-data;boundary=" + boundary);

                    DataOutputStream dos = new DataOutputStream(connection.getOutputStream());
                    dos.writeBytes("--" + boundary + "\r\n");

                    int cnt = 0;
                    for (HttpData data : addDatas)
                    {
                        dos.writeBytes("Content-Disposition: form-data; name=\"" + data.getKey() + "\r\n\r\n");
                        dos.writeBytes(data.getEncodedValue());
                        dos.writeBytes("\r\n");

                        cnt++;

                        if (addDatas.size() != cnt || addFileDatas.size() > 0)
                        {
                            dos.writeBytes(endBoundary);
                        }
                    }

                    cnt = 0;
                    for (HttpFileData data : addFileDatas)
                    {
                        dos.writeBytes("Content-Disposition: form-data; name=\"" + data.getKey() + "\"; filename=\"" );
                        dos.write(data.getFileName().getBytes("UTF-8"));
                        dos.writeBytes("\"\r\n");
                        dos.writeBytes("Content-Type: " + FileUtils.getMimeType(data.getFile()) +"\r\n\r\n");

                        // write file
                        FileInputStream inputStream = new FileInputStream(data.getFile());
                        int bytesAvailable = inputStream.available();
                        int maxBufferSize = 1024*1024;
                        int bufferSize = Math.min(bytesAvailable, maxBufferSize);
                        byte[] buffer = new byte[bufferSize];

                        int bytesRead = inputStream.read(buffer, 0, bufferSize);
                        while (bytesRead > 0) {
                            dos.write(buffer, 0, bufferSize);
                            bytesAvailable = inputStream.available();
                            bufferSize = Math.min(bytesAvailable, maxBufferSize);
                            bytesRead = inputStream.read(buffer, 0, bufferSize);
                        }

                        if (addFileDatas.size() != cnt) {
                            dos.writeBytes(endBoundary);
                        }

                        inputStream.close();
                    }

                    dos.writeBytes(endBoundary);

                    dos.flush();
                    dos.close();
                }
                else
                {
                    URL url = new URL(urlStr);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestMethod(method.getValue());
                    connection.setDoOutput(true);

                    DataOutputStream wr = new DataOutputStream(connection.getOutputStream());
                    wr.writeBytes(getAddDataQueryString());
                    wr.flush();
                    wr.close();
                }
            }

            for (HttpData data : addHeaderDatas)
            {
                connection.setRequestProperty(data.getKey(), data.getValue());
            }
        }
        catch (MalformedURLException e)
        {
            e.printStackTrace();
        }
        catch (IOException e)
        {
            e.printStackTrace();
        }
    }

    private String getAddDataQueryString()
    {
        StringBuilder ret = new StringBuilder();
        int cnt = 0;
        for (HttpData data : addDatas)
        {
            ret.append(data.getKey()).append("=").append(data.getEncodedValue());
            cnt++;

            if (addDatas.size() != cnt)
            {
                ret.append("&");
            }
        }
        return ret.toString();
    }

    public void run(final HttpCallbackObject callback)
    {
        Thread thread = new Thread() {
            @Override
            public void run()
            {
                prepare();
                try
                {
                    Util.log("connection.getResponseCode():"+connection.getResponseCode());
                    if (connection.getResponseCode() == HttpURLConnection.HTTP_OK)
                    {
                        BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                        String inputLine;
                        StringBuilder response = new StringBuilder();

                        while ((inputLine = in.readLine()) != null)
                        {
                            response.append(inputLine);
                        }
                        in.close();

                        final String retStr = response.toString();
                        Log.d(TAG, "retStr:"+ retStr);

                        StackManager.rootActivity().runOnUiThread(new Runnable() {
                            public void run()
                            {
                                try
                                {
                                    callback.callback(new JSONObject(retStr));
                                }
                                catch (JSONException e)
                                {
                                    e.printStackTrace();
                                }
                            }
                        });
                    }
                }
                catch (IOException e)
                {
                    Util.log("IOException:"+e.getMessage());
                    e.printStackTrace();
                }
            }
        };
        thread.start();
    }

    public void getIABItems(final HttpCallbackList callback)
    {
        Thread thread = new Thread() {
            @Override
            public void run()
            {
                prepare();
                try
                {
                    if (connection.getResponseCode() == HttpURLConnection.HTTP_OK)
                    {
                        BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
                        String inputLine;
                        StringBuilder response = new StringBuilder();

                        while ((inputLine = in.readLine()) != null)
                        {
                            response.append(inputLine);
                        }
                        in.close();

                        final String retStr = response.toString();
                        Util.log(retStr);

                        StackManager.rootActivity().runOnUiThread( new Runnable() {
                            public void run()
                            {
                                try
                                {
                                    JSONArray list = new JSONArray(retStr);
                                    callback.callback(list);
                                }
                                catch (JSONException e)
                                {
                                    e.printStackTrace();
                                }
                            }
                        });
                    }
                }
                catch (IOException e)
                {
                    e.printStackTrace();
                }
            }
        };
        thread.start();
    }
}

