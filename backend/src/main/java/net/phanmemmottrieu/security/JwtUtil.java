package net.phanmemmottrieu.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Component;

import org.springframework.beans.factory.annotation.Value;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Date;

@Component
public class JwtUtil {
    private final SecretKey secretKey;
    private final long jwtExpirationMs = 86400000; // 1 ngày

    public JwtUtil(@Value("${jwt.secret:}") String secret) {
        this.secretKey = Keys.hmacShaKeyFor(deriveKeyBytes(secret));
    }

    public String generateToken(String subject, int loginVersion) {
        return Jwts.builder()
                .setSubject(subject)
                .claim("ver", loginVersion)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + jwtExpirationMs))
                .signWith(secretKey)
                .compact();
    }

    public String generateToken(String subject, String userId, int loginVersion) {
        return Jwts.builder()
                .setSubject(subject)
                .claim("uid", userId)
                .claim("ver", loginVersion)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + jwtExpirationMs))
                .signWith(secretKey)
                .compact();
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public String getUsernameFromToken(String token) {
        Claims claims = Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
        return claims.getSubject();
    }

    public int getLoginVersionFromToken(String token) {
        Claims claims = Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
        Object version = claims.get("ver");
        if (version instanceof Number) {
            return ((Number) version).intValue();
        }
        if (version instanceof String) {
            try {
                return Integer.parseInt((String) version);
            } catch (NumberFormatException e) {
                return 0;
            }
        }
        return 0;
    }

    public String getUserIdFromToken(String token) {
        Claims claims = Jwts.parser().verifyWith(secretKey).build().parseSignedClaims(token).getPayload();
        Object uid = claims.get("uid");
        if (uid == null) {
            return "";
        }
        return String.valueOf(uid).trim();
    }

    private byte[] deriveKeyBytes(String secret) {
        String raw = secret == null ? "" : secret.trim();
        if (!raw.isEmpty()) {
            return normalizeKeyBytes(raw);
        }
        return normalizeKeyBytes("default-dev-secret-change-me");
    }

    private byte[] normalizeKeyBytes(String raw) {
        byte[] bytes = raw.getBytes(StandardCharsets.UTF_8);
        if (bytes.length >= 32) {
            return bytes;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return digest.digest(bytes);
        } catch (Exception e) {
            return Keys.secretKeyFor(SignatureAlgorithm.HS256).getEncoded();
        }
    }
}
