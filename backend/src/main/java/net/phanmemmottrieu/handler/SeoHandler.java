package net.phanmemmottrieu.handler;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.springframework.stereotype.Component;

import net.phanmemmottrieu.model.StandardResponse;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

@Component
public class SeoHandler {
    public static void handleSeo(StandardResponse response, Map<String, Object> params) {
        String url = (String) params.get("url");
        try {
            Document doc = Jsoup.connect(url).get();
            Map<String, String> seoData = new HashMap<>();
            seoData.put("title", doc.title());
            seoData.put("description", doc.select("meta[name=description]").attr("content"));
            seoData.put("keywords", doc.select("meta[name=keywords]").attr("content"));
            response.set("code", 200);
            response.set("result", seoData);
            response.set("message", "ok");
            response.set("success", true);
        } catch (IOException e) {
            response.set("code", 500);
            response.set("message", "Lỗi kết nối tới URL: " + e.getMessage());
        }
    }
}