package org.telegram.teleprivat;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class TelePrivatApi {
    private TelePrivatApi() {}

    public static JSONObject post(String path, JSONObject body, String token) throws Exception {
        return request("POST", path, body, token);
    }

    public static JSONObject get(String path, String token) throws Exception {
        return request("GET", path, null, token);
    }

    private static JSONObject request(String method, String path, JSONObject body, String token) throws Exception {
        URL url = new URL(TelePrivatConfig.endpoint(path));
        if (!"https".equalsIgnoreCase(url.getProtocol())) {
            throw new IllegalStateException("TelePRIVAT API must use HTTPS");
        }

        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(10000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Accept", "application/json");

        if (token != null && !token.isEmpty()) {
            c.setRequestProperty("Authorization", "Bearer " + token);
        }

        if (body != null) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) {
                os.write(bytes);
            }
        }

        int code = c.getResponseCode();
        BufferedReader br = new BufferedReader(new InputStreamReader(
                code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream(),
                StandardCharsets.UTF_8
        ));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();

        JSONObject result = sb.length() == 0 ? new JSONObject() : new JSONObject(sb.toString());
        if (code < 200 || code >= 300) {
            throw new TelePrivatHttpException(code, result.optString("error", "HTTP_" + code));
        }
        return result;
    }

    public static final class TelePrivatHttpException extends Exception {
        public final int code;
        public TelePrivatHttpException(int code, String message) {
            super(message);
            this.code = code;
        }
    }
}
