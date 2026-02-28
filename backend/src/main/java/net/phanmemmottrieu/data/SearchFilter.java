package net.phanmemmottrieu.data;

import java.util.*;
import java.util.Objects;
import com.fasterxml.jackson.annotation.JsonInclude;
// Thêm import cho logger
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


@JsonInclude(JsonInclude.Include.NON_NULL)
public class SearchFilter {
    // Để logger hoạt động trong hàm static, nó cũng phải là static
    private static final Logger logger = LoggerFactory.getLogger(SearchFilter.class);

    private String operator; // "AND" / "OR"
    private List<SearchFilter> conditions;

    private String field;
    private String type;  // eq, eqignorecase, like, prefix, gte, lte, range
    private Object value;

    // Constructor mặc định để khởi tạo các trường an toàn
    public SearchFilter() {
        this.operator = "AND";
        this.conditions = new ArrayList<>();
        this.field = "";
        this.type = "";
        this.value = "";
    }

    // --- Getters and Setters ---
    public String getOperator() { return operator; }
    public void setOperator(String operator) {
        this.operator = Objects.requireNonNullElse(operator, "AND");
    }

    public List<SearchFilter> getConditions() { return conditions; }
    public void setConditions(List<SearchFilter> conditions) {
        this.conditions = Objects.requireNonNullElse(conditions, new ArrayList<>());
    }

    public String getField() { return field; }
    public void setField(String field) {
        this.field = Objects.requireNonNullElse(field, "");
    }

    public String getType() { return type; }
    public void setType(String type) {
        this.type = Objects.requireNonNullElse(type, "");
    }

    public Object getValue() { return value; }
    public void setValue(Object value) {
        this.value = Objects.requireNonNullElse(value, "");
    }
}