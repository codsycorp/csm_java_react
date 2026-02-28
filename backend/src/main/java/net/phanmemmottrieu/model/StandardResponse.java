package net.phanmemmottrieu.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.MediaType;

import java.util.*;
import java.util.Base64; // Đảm bảo Base64 được import nếu dùng trong toString()

@JsonInclude(JsonInclude.Include.NON_NULL)
public class StandardResponse {
    private Map<String, Object> properties = new HashMap<>();

    @JsonIgnore
    private Boolean isApi = false; // Đảm bảo trường này là private Boolean
    @JsonIgnore
    private byte[] binaryBody;
    @JsonIgnore
    private String contentType;

    @JsonAnyGetter
    public Map<String, Object> getPropertiesMap() {
        return properties;
    }

    public void setProperties(Map<String, Object> properties) {
        this.properties = properties;
    }

    public Object get(String key) {
        return properties.get(key);
    }

    public void set(String key, Object value) {
        properties.put(key, value);
    }

    // ĐÂY LÀ PHƯƠNG THỨC MÀ LỖI ĐANG BÁO: getIsApi()
    public Boolean getIsApi() { // Phương thức getter chính xác cho isApi
        return this.isApi;
    }

    public void setIsApi(Boolean api) {
        this.isApi = api;
    }

    public void setHtmlBody(String html) {
        this.set("body", html);
    }

    public void setJsonBody(Object obj) {
        try {
            this.set("body", new ObjectMapper().writeValueAsString(obj));
        } catch (JsonProcessingException e) {
            this.set("body", "{\"error\": \"Lỗi xử lý JSON khi đặt body\"}");
        }
    }

    public void setBinaryBody(byte[] data, String mimeType) {
        this.binaryBody = data;
        this.contentType = mimeType;
    }

    public boolean hasBinaryBody() {
        return binaryBody != null;
    }

    public byte[] getBinaryBody() {
        return binaryBody;
    }

    public String getContentType() {
        return contentType != null ? contentType : MediaType.APPLICATION_OCTET_STREAM_VALUE;
    }

    @Override
    public String toString() {
        try {
            return new ObjectMapper().writeValueAsString(this);
        } catch (JsonProcessingException e) {
            return "{\"error\":\"Lỗi serialize StandardResponse thành JSON\"}";
        }
    }
}