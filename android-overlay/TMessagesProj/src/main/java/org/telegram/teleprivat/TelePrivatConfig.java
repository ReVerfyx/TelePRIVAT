package org.telegram.teleprivat;

public final class TelePrivatConfig {
    private TelePrivatConfig() {}

    // Replace in your release build. HTTPS is intentionally required.
    public static final String API_BASE = "https://api.example.com/api/v1";

    public static String endpoint(String path) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        return API_BASE + path;
    }
}
