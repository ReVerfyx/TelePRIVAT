package app.teleprivat.resolver;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import it.tdlight.Init;
import it.tdlight.client.APIToken;
import it.tdlight.client.AuthenticationSupplier;
import it.tdlight.client.SimpleTelegramClient;
import it.tdlight.client.SimpleTelegramClientBuilder;
import it.tdlight.client.SimpleTelegramClientFactory;
import it.tdlight.client.TDLibSettings;
import it.tdlight.jni.TdApi;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class Main {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static SimpleTelegramClient client;
    private static SimpleTelegramClientFactory factory;
    private static String internalToken;

    public static void main(String[] args) throws Exception {
        int apiId = Integer.parseInt(required("TELEGRAM_API_ID"));
        String apiHash = required("TELEGRAM_API_HASH");
        String botToken = required("TELEGRAM_BOT_TOKEN");
        internalToken = required("TELEGRAM_RESOLVER_TOKEN");

        Init.init();

        factory = new SimpleTelegramClientFactory();
        APIToken apiToken = new APIToken(apiId, apiHash);
        TDLibSettings settings = TDLibSettings.create(apiToken);
        settings.setDatabaseDirectoryPath(Paths.get("/data/tdlib"));
        settings.setDownloadedFilesDirectoryPath(Paths.get("/data/downloads"));

        SimpleTelegramClientBuilder builder = factory.builder(settings);
        client = builder.build(AuthenticationSupplier.bot(botToken));

        String proxyHost = System.getenv("TELEGRAM_PROXY_HOST");
        String proxySecret = System.getenv("TELEGRAM_PROXY_SECRET");
        String proxyPort = System.getenv("TELEGRAM_PROXY_PORT");

        if (proxyHost != null && !proxyHost.isBlank()
                && proxySecret != null && !proxySecret.isBlank()
                && proxyPort != null && !proxyPort.isBlank()) {
            TdApi.Proxy proxy = new TdApi.Proxy(
                    proxyHost.trim(),
                    Integer.parseInt(proxyPort),
                    new TdApi.ProxyTypeMtproto(proxySecret.trim())
            );
            client.send(new TdApi.AddProxy(proxy, true, "")).get(30, TimeUnit.SECONDS);
        }

        client.getMeAsync().get(90, TimeUnit.SECONDS);

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", 8090), 0);
        server.createContext("/health", Main::health);
        server.createContext("/resolve", Main::resolve);
        server.setExecutor(null);
        server.start();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try { if (client != null) client.close(); } catch (Exception ignored) {}
            try { if (factory != null) factory.close(); } catch (Exception ignored) {}
        }));

        System.out.println("TelePRIVAT Telegram resolver listening on :8090");
    }

    private static void health(HttpExchange exchange) throws IOException {
        write(exchange, 200, Map.of("ok", true, "service", "telegram-resolver"));
    }

    private static void resolve(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            write(exchange, 405, Map.of("error", "METHOD_NOT_ALLOWED"));
            return;
        }
        String token = exchange.getRequestHeaders().getFirst("X-Resolver-Token");
        if (token == null || !constantEquals(token, internalToken)) {
            write(exchange, 403, Map.of("error", "FORBIDDEN"));
            return;
        }

        String username = queryParam(exchange, "username");
        if (username == null) {
            write(exchange, 400, Map.of("error", "USERNAME_REQUIRED"));
            return;
        }
        username = username.trim().replaceFirst("^@", "").toLowerCase();
        if (!username.matches("[a-z0-9_]{3,32}")) {
            write(exchange, 400, Map.of("error", "INVALID_USERNAME"));
            return;
        }

        try {
            TdApi.Chat chat = client.send(new TdApi.SearchPublicChat(username)).get(20, TimeUnit.SECONDS);
            if (!(chat.type instanceof TdApi.ChatTypePrivate privateChat)) {
                write(exchange, 404, Map.of("error", "NOT_A_USER"));
                return;
            }

            TdApi.User user = client.send(new TdApi.GetUser(privateChat.userId)).get(20, TimeUnit.SECONDS);
            String resolvedUsername = username;
            if (user.usernames != null && user.usernames.activeUsernames != null
                    && user.usernames.activeUsernames.length > 0) {
                resolvedUsername = user.usernames.activeUsernames[0];
            }

            String displayName = ((user.firstName == null ? "" : user.firstName) + " "
                    + (user.lastName == null ? "" : user.lastName)).trim();

            Map<String, Object> out = new LinkedHashMap<>();
            out.put("telegram_user_id", Long.toString(user.id));
            out.put("username", resolvedUsername);
            out.put("display_name", displayName.isBlank() ? resolvedUsername : displayName);
            out.put("has_avatar", user.profilePhoto != null);
            out.put("source", "telegram_mtproto");
            write(exchange, 200, out);
        } catch (Exception e) {
            String message = e.getMessage() == null ? "TELEGRAM_LOOKUP_FAILED" : e.getMessage();
            if (message.contains("USERNAME_NOT_OCCUPIED") || message.contains("chat not found")) {
                write(exchange, 404, Map.of("error", "USERNAME_NOT_FOUND"));
            } else {
                write(exchange, 502, Map.of("error", "TELEGRAM_LOOKUP_FAILED"));
            }
        }
    }

    private static String queryParam(HttpExchange exchange, String key) {
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null) return null;
        for (String part : raw.split("&")) {
            String[] kv = part.split("=", 2);
            if (kv.length == 2 && URLDecoder.decode(kv[0], StandardCharsets.UTF_8).equals(key)) {
                return URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static void write(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] bytes = JSON.writeValueAsBytes(body);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) throw new IllegalStateException(name + " is required");
        return value;
    }

    private static boolean constantEquals(String a, String b) {
        byte[] x = a.getBytes(StandardCharsets.UTF_8);
        byte[] y = b.getBytes(StandardCharsets.UTF_8);
        if (x.length != y.length) return false;
        int v = 0;
        for (int i = 0; i < x.length; i++) v |= x[i] ^ y[i];
        return v == 0;
    }
}
