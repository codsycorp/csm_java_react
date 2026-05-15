package net.phanmemmottrieu.service;

import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class AiAgenticWebSearchService {

    private static final Logger log = LoggerFactory.getLogger(AiAgenticWebSearchService.class);

    public record SearchExecution(
        boolean success,
        String provider,
        String query,
        List<String> visitedUrls,
        String markdown,
        int pageCount,
        int totalChars,
        String failureReason
    ) {}

    @Value("${ai.orchestration.web-search.enabled:${AI_ORCHESTRATION_WEB_SEARCH_ENABLED:true}}")
    private boolean enabled;

    @Value("${ai.orchestration.web-search.provider:${AI_ORCHESTRATION_WEB_SEARCH_PROVIDER:duckduckgo_html}}")
    private String provider;

    @Value("${ai.orchestration.web-search.max-results:${AI_ORCHESTRATION_WEB_SEARCH_MAX_RESULTS:3}}")
    private int maxResults;

    @Value("${ai.orchestration.web-search.max-page-chars:${AI_ORCHESTRATION_WEB_SEARCH_MAX_PAGE_CHARS:1800}}")
    private int maxPageChars;

    @Value("${ai.orchestration.web-search.timeout-ms:${AI_ORCHESTRATION_WEB_SEARCH_TIMEOUT_MS:3500}}")
    private int timeoutMs;

    @Value("${ai.orchestration.web-search.user-agent:${AI_ORCHESTRATION_WEB_SEARCH_USER_AGENT:Mozilla/5.0 (compatible; CSM-AI/1.0; +https://localhost)}}")
    private String userAgent;

    public boolean isEnabled() {
        return enabled;
    }

    public SearchExecution search(String rawQuery) {
        String query = String.valueOf(rawQuery == null ? "" : rawQuery).trim();
        if (!enabled || query.isBlank()) {
            return new SearchExecution(false, normalizeProvider(), query, List.of(), "", 0, 0, enabled ? "blank_query" : "disabled");
        }
        try {
            List<SearchCandidate> candidates = fetchCandidates(query);
            if (candidates.isEmpty()) {
                return new SearchExecution(false, normalizeProvider(), query, List.of(), "", 0, 0, "no_results");
            }

            StringBuilder markdown = new StringBuilder();
            List<String> visitedUrls = new ArrayList<>();
            int pagesAdded = 0;
            int chars = 0;
            for (SearchCandidate candidate : candidates) {
                if (pagesAdded >= Math.max(1, maxResults)) {
                    break;
                }
                WebPage page = fetchPage(candidate.url());
                if (page == null || page.content().isBlank()) {
                    continue;
                }
                visitedUrls.add(page.url());
                if (markdown.length() > 0) {
                    markdown.append("\n\n");
                }
                markdown.append("## Web Source ").append(pagesAdded + 1).append("\n");
                markdown.append("title: ").append(page.title()).append("\n");
                markdown.append("url: ").append(page.url()).append("\n");
                if (!candidate.snippet().isBlank()) {
                    markdown.append("search_snippet: ").append(candidate.snippet()).append("\n");
                }
                markdown.append("content:\n").append(page.content());
                pagesAdded++;
                chars += page.content().length();
            }

            if (pagesAdded <= 0) {
                return new SearchExecution(false, normalizeProvider(), query, List.of(), "", 0, 0, "no_fetchable_pages");
            }
            return new SearchExecution(true, normalizeProvider(), query, List.copyOf(visitedUrls), markdown.toString(), pagesAdded, chars, "");
        } catch (Exception ex) {
            log.warn("Agentic web search failed provider={} query={}: {}", normalizeProvider(), query, ex.getMessage());
            return new SearchExecution(false, normalizeProvider(), query, List.of(), "", 0, 0, ex.getMessage());
        }
    }

    private List<SearchCandidate> fetchCandidates(String query) throws Exception {
        if (!"duckduckgo_html".equals(normalizeProvider())) {
            return List.of();
        }
        String encoded = URLEncoder.encode(query, StandardCharsets.UTF_8);
        Document doc = baseConnection("https://html.duckduckgo.com/html/?q=" + encoded).get();
        Elements links = doc.select("a.result__a, a[data-testid=result-title-a], a[href]");
        Set<String> seen = new LinkedHashSet<>();
        List<SearchCandidate> out = new ArrayList<>();
        for (Element link : links) {
            if (out.size() >= Math.max(2, maxResults * 2)) {
                break;
            }
            String resolvedUrl = resolveResultUrl(link.attr("href"));
            if (resolvedUrl.isBlank() || !isHttpUrl(resolvedUrl) || !seen.add(resolvedUrl)) {
                continue;
            }
            String title = compactText(link.text(), 220);
            if (title.isBlank()) {
                continue;
            }
            Element snippetNode = findSnippetNode(link);
            String snippet = snippetNode == null ? "" : compactText(snippetNode.text(), 320);
            out.add(new SearchCandidate(title, resolvedUrl, snippet));
        }
        return out;
    }

    private WebPage fetchPage(String url) {
        try {
            Document doc = baseConnection(url).get();
            doc.select("script,style,noscript,svg,header,footer,nav,aside,form").remove();
            String title = compactText(doc.title(), 200);
            String content = extractMainContent(doc);
            if (content.isBlank()) {
                return null;
            }
            return new WebPage(url, title.isBlank() ? url : title, content);
        } catch (Exception ex) {
            log.debug("Skip web page url={} reason={}", url, ex.getMessage());
            return null;
        }
    }

    private Connection baseConnection(String url) {
        return Jsoup.connect(url)
            .userAgent(String.valueOf(userAgent == null ? "Mozilla/5.0" : userAgent).trim())
            .timeout(Math.max(1000, timeoutMs))
            .followRedirects(true)
            .ignoreContentType(true)
            .maxBodySize(0);
    }

    private String extractMainContent(Document doc) {
        String content = extractFromSelectors(doc, "article", "main", "[role=main]", ".content", ".post-content", ".entry-content");
        if (content.isBlank()) {
            content = compactText(doc.body() == null ? "" : doc.body().text(), Math.max(600, maxPageChars));
        }
        return compactText(content, Math.max(600, maxPageChars));
    }

    private String extractFromSelectors(Document doc, String... selectors) {
        for (String selector : selectors) {
            Element element = doc.selectFirst(selector);
            if (element == null) {
                continue;
            }
            String text = compactText(element.text(), Math.max(600, maxPageChars));
            if (!text.isBlank()) {
                return text;
            }
        }
        return "";
    }

    private Element findSnippetNode(Element link) {
        Element parent = link.parent();
        for (int i = 0; i < 3 && parent != null; i++) {
            Element snippet = parent.selectFirst(".result__snippet, [data-result='snippet'], .snippet");
            if (snippet != null) {
                return snippet;
            }
            parent = parent.parent();
        }
        return null;
    }

    private String resolveResultUrl(String href) {
        String raw = String.valueOf(href == null ? "" : href).trim();
        if (raw.isBlank()) {
            return "";
        }
        if (raw.startsWith("//")) {
            raw = "https:" + raw;
        }
        if (raw.startsWith("/")) {
            raw = "https://duckduckgo.com" + raw;
        }
        try {
            URI uri = URI.create(raw);
            String query = String.valueOf(uri.getQuery() == null ? "" : uri.getQuery());
            if (!query.isBlank()) {
                for (String part : query.split("&")) {
                    if (part.startsWith("uddg=")) {
                        return URLDecoder.decode(part.substring(5), StandardCharsets.UTF_8);
                    }
                }
            }
        } catch (Exception ignored) {
            // Fall back to raw href.
        }
        return raw;
    }

    private boolean isHttpUrl(String value) {
        String lower = String.valueOf(value == null ? "" : value).trim().toLowerCase(Locale.ROOT);
        return lower.startsWith("http://") || lower.startsWith("https://");
    }

    private String compactText(String raw, int maxChars) {
        String text = String.valueOf(raw == null ? "" : raw)
            .replace('\u0000', ' ')
            .replaceAll("\\s+", " ")
            .trim();
        if (text.length() <= Math.max(120, maxChars)) {
            return text;
        }
        return text.substring(0, Math.max(120, maxChars) - 3) + "...";
    }

    private String normalizeProvider() {
        String normalized = String.valueOf(provider == null ? "duckduckgo_html" : provider).trim().toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? "duckduckgo_html" : normalized;
    }

    private record SearchCandidate(String title, String url, String snippet) {}

    private record WebPage(String url, String title, String content) {}
}