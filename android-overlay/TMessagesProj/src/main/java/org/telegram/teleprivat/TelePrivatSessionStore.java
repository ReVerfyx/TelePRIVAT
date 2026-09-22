package org.telegram.teleprivat;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.HashSet;
import java.util.Set;

/**
 * Small multi-account token store for TelePRIVAT.
 * Production milestone: migrate tokens to Android Keystore-backed encrypted storage.
 */
public final class TelePrivatSessionStore {
    private static final String PREFS = "teleprivat_sessions";
    private final SharedPreferences prefs;

    public TelePrivatSessionStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public void save(String username, String token) {
        prefs.edit()
                .putString("token:" + username.toLowerCase(), token)
                .putString("active", username.toLowerCase())
                .apply();
        Set<String> accounts = new HashSet<>(prefs.getStringSet("accounts", new HashSet<>()));
        accounts.add(username.toLowerCase());
        prefs.edit().putStringSet("accounts", accounts).apply();
    }

    public String token(String username) {
        return prefs.getString("token:" + username.toLowerCase(), null);
    }

    public String activeUsername() {
        return prefs.getString("active", null);
    }

    public Set<String> accounts() {
        return new HashSet<>(prefs.getStringSet("accounts", new HashSet<>()));
    }

    public void setActive(String username) {
        prefs.edit().putString("active", username.toLowerCase()).apply();
    }

    public void remove(String username) {
        String key = username.toLowerCase();
        Set<String> accounts = new HashSet<>(prefs.getStringSet("accounts", new HashSet<>()));
        accounts.remove(key);
        SharedPreferences.Editor e = prefs.edit().remove("token:" + key).putStringSet("accounts", accounts);
        if (key.equals(activeUsername())) e.remove("active");
        e.apply();
    }
}
