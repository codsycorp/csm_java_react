# 🚀 SEO-Friendly URL Migration Guide: .shtml → Clean URLs

## Overview
Chuyển đổi từ URL có `.shtml` sang clean URLs (không có extension) theo chuẩn SEO hiện đại.

**Timeline: Triển khai liền mạch với 301 redirects bảo vệ toàn bộ SEO link equity**

---

## 🎯 Migration Strategy

### Phase 1: Infrastructure (✅ COMPLETED)
- [x] **Nginx 301 Redirects** - File: `/root/la_server/nginx-shtml-redirects.conf`
  - ✏️ `.shtml` → Clean URLs (permanent 301 redirect)
  - ✏️ Query parameters preserved
  - ✏️ Bảo vệ SEO ranking (link equity)

### Phase 2: Frontend/LMKT Routes (✅ COMPLETED)
- [x] **router-global-hooks.ts** (frontend & lmkt)
  - ✏️ Fallback websiteRoutes: bỏ `.shtml` extension
  - ✏️ URL pattern matching: `/category` thay vì `/category.shtml`
  - ✏️ Detail route pattern: `/category/slug` thay vì `/category/slug.shtml`
  - ✏️ Group route handling: clean URLs only

### Phase 3: URL Generation (🔄 IN-PROGRESS)
- [x] **wu_service_detail.tsx** (frontend & lmkt)
  - ✏️ Removed `.shtml` stripping logic (URLs already clean)
  
- [ ] **wu_services.tsx** (frontend & lmkt) - NEXT STEP
  - 🔧 Search "return.*\.shtml" và bỏ .shtml
  - 🔧 Line ~498, ~1117, ~1149, ~1200, ~2355, etc.

### Phase 4: API Calls
- [ ] **wu_service.ts** (frontend & lmkt)
  - 🔧 Remove `.replace(/\.shtml$/, '')` logic
  - 🔧 URLs không còn có `.shtml`

### Phase 5: Post-Deploy Monitoring
- [ ] Monitor Nginx 301 redirects hit rate
- [ ] Verify all old `.shtml` URLs still work (through redirects)
- [ ] Check Google Search Console for crawl errors
- [ ] Verify sitemap update (if auto-generated)

---

## 📝 Changes Required in wu_services.tsx

### Frontend: `/Volumes/Datas/CSM/JavaProjects/csm_server/frontend/src/pages/website/wu_services.tsx`

**Replace all occurrences:**

```diff
- return `/${categoryKey}.shtml`;
+ return`/${categoryKey}`;

- const targetUrl = `/${defaultServiceSlug}.shtml`;
+ const targetUrl = `/${defaultServiceSlug}`;

- let url = `/${key}.shtml`;
+ let url = `/${key}`;

- let url = `/${post.serviceType}/${post.slug}.shtml`;
+ let url = `/${post.serviceType}/${post.slug}`;

- const selectedMenuKey = activeTabKey ? `/${activeTabKey}.shtml` : `/${DEFAULT_CATEGORY}.shtml`;
+ const selectedMenuKey = activeTabKey ? `/${activeTabKey}` : `/${DEFAULT_CATEGORY}`;

- "item": `${window.location.origin}/${DEFAULT_CATEGORY}.shtml`
+ "item": `${window.location.origin}/${DEFAULT_CATEGORY}`

- "item": `${window.location.origin}/${activeCategory.key}.shtml`
+ "item": `${window.location.origin}/${activeCategory.key}`

- const currentPath = window.location.pathname || `/${category.key}.shtml`;
+ const currentPath = window.location.pathname || `/${category.key}`;

- const base = `/${category.key}.shtml`;
+ const base = `/${category.key}`;
```

### LMKT: `/Volumes/Datas/CSM/JavaProjects/csm_server/lmkt/src/pages/website/wu_services.tsx`

**Same replacements as frontend**

### WebsiteFooter.tsx

Update service links:
```diff
- path: `/${cat.slug}.shtml`,
+ path: `/${cat.slug}`,
```

---

## 🔗 OLD vs NEW URL Examples

| Content Type | Old URL | New URL | Status |
|---|---|---|---|
| **Index Page** | `/phan-mem.shtml` | `/phan-mem` | 301 → Clean |
| **Category Page** | `/bat-dong-san.shtml` | `/bat-dong-san` | 301 → Clean |
| **Detail Page** | `/phan-mem/pro-name.shtml` | `/phan-mem/pro-name` | 301 → Clean |
| **With Query** | `/phan-mem.shtml?page=2` | `/phan-mem?page=2` | 301 → Clean |

---

## ✅ Verification Checklist

### Before Deploy
- [ ] All `.shtml` references removed from source code
- [ ] Nginx redirect config tested locally
- [ ] Routes tested with clean URLs (`/phan-mem`, not `/phan-mem.shtml`)
- [ ] URL generation logic verified

### After Deploy
- [ ] Test old URLs: `curl -i https://yourdomain.com/phan-mem.shtml` →  should see `301`
- [ ] Browser test: Old URLs redirect to new URLs automatically
- [ ] Analytics: Track redirect traffic
- [ ] Search Console: Monitor crawl stats
- [ ] Webmaster tools: Check for 404 errors

---

## 🛠️ Deploy Steps

### 1. Update Nginx Configuration
```bash
# Already done - included in nginx.conf
# Include in server block:
include /root/la_server/nginx-shtml-redirects.conf;

# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### 2. Deploy Frontend Changes
```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server/frontend
npm run build
# Deploy built files
```

### 3. Deploy LMKT Changes  
```bash
cd /Volumes/Datas/CSM/JavaProjects/csm_server/lmkt
npm run build
# Deploy built files
```

### 4. Flush Browser Cache (Optional)
```bash
# If using Redis/Memcached for caching
# redis-cli FLUSHDB
# or backend cache clear command
```

---

## 📊 SEO Impact

### ✅ What's Preserved
- ✅ **301 Permanent Redirects** - All old URLs redirect to new URLs
- ✅ **Link Equity** - All backlinks to `.shtml` URLs transfer via redirects
- ✅ **Page Rank** - Not lost (301 preserves PR)
- ✅ **Indexed Pages** - Google will gradually re-index new URLs
- ✅ **Query Parameters** - Preserved in redirects (`?page=2` → `?page=2`)

### 📈 Expected Results
- Slightly improved SEO over time (clean URLs are preferred by search engines)
- Better mobile UX (shorter URLs)
- Cleaner analytics reports (fewer URL variations)
- Standard modern web practices

---

## 🔐 Rollback Plan

If issues occur:

### Quick Rollback (5 minutes)
```bash
# Remove nginx redirect config
sudo vi /etc/nginx/nginx-shtml-redirects.conf
# Comment out or remove the include line
sudo nginx -t && sudo systemctl reload nginx
```

### Full Rollback (if needed)
1. Revert frontend/lmkt to previous git commit
2. Disable nginx redirects
3. Rebuild and deploy old version

---

## 📞 Monitoring

### Nginx Logs
```bash
# Check redirect hits
tail -f /var/log/nginx/access.log | grep "301\|shtml"

# Count .shtml requests
grep "\.shtml" /var/log/nginx/access.log | wc -l
```

### Google Search Console
- Monitor for 404 errors
- Check redirect chains (should be minimal)
- Verify new URLs are indexed

### Analytics
- Track old URL traffic (should redirect to new)
- Monitor bounce rate changes
- Check for any broken links

---

## ⚠️ Important Notes

1. **Nginx Must Be Updated First** - Before any frontend code changes
2. **301 Redirects Required** - Don't remove `.shtml` without redirects
3. **Query Parameters** - All `?page=X&hl=en` etc. are preserved
4. **Browser Cache** - Users may see old URLs in address bar temporarily
5. **Backlinks** - All external links to `.shtml` URLs will work (via redirects)
6. **Canonical Tags** - If used, ensure they match new clean URLs

---

## 📋 Files Modified

### Nginx
- ✅ `/root/la_server/nginx-shtml-redirects.conf` (created)
- ✅ `/Volumes/Datas/CSM/JavaProjects/csm_server/nginx.conf` (updated)

### Frontend
- ✅ `/Volumes/Datas/CSM/JavaProjects/csm_server/frontend/src/router/router-global-hooks.ts`
- ✅ `/Volumes/Datas/CSM/JavaProjects/csm_server/frontend/src/pages/website/wu_service_detail.tsx`
- 🔄 `/Volumes/Datas/CSM/JavaProjects/csm_server/frontend/src/pages/website/wu_services.tsx` (next)
- 🔄 `/Volumes/Datas/CSM/JavaProjects/csm_server/frontend/src/api/wu_service.ts` (next)

### LMKT
- ✅ `/Volumes/Datas/CSM/JavaProjects/csm_server/lmkt/src/router/router-global-hooks.ts`
- ✅ `/Volumes/Datas/CSM/JavaProjects/csm_server/lmkt/src/pages/website/wu_service_detail.tsx`
- 🔄 `/Volumes/Datas/CSM/JavaProjects/csm_server/lmkt/src/pages/website/wu_services.tsx` (next)
- 🔄 `/Volumes/Datas/CSM/JavaProjects/csm_server/lmkt/src/api/wu_service.ts` (next)

---

## 🎓 References

- [Google: URL Structure Best Practices](https://developers.google.com/search/docs/beginner/seo-starter-guide)
- [301 Redirects for SEO](https://moz.com/learn/seo/redirection)
- [Clean URLs](https://en.wikipedia.org/wiki/Clean_URL)

---

**Status**: Phase 2 Complete, Phase 3 In-Progress  
**Last Updated**: 2026-02-21  
**Next Step**: Complete wu_services.tsx URL generation replacements
