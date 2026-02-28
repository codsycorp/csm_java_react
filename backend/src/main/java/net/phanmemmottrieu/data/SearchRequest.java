package net.phanmemmottrieu.data;

import java.util.*;

public class SearchRequest {
    private String appId;
    private String tableName;
    private SearchFilter filters;

    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }

    public String getTableName() { return tableName; }
    public void setTableName(String tableName) { this.tableName = tableName; }

    public SearchFilter getFilters() { return filters; }
    public void setFilters(SearchFilter filters) { this.filters = filters; }
}