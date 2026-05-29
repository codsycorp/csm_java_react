package net.phanmemmottrieu.service;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.index.IndexReader;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermQuery;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.index.Term;
import org.apache.lucene.queryparser.classic.MultiFieldQueryParser;
import org.apache.lucene.queryparser.classic.QueryParser;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Hybrid retrieval helper: Lucene BM25 (lexical) + KNN vector fusion before heuristic rerank.
 */
public final class AiLocalLuceneHybridSearchHelper {

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[\\p{L}\\p{N}_\\.\\-/]{3,}");
    private static final StandardAnalyzer ANALYZER = new StandardAnalyzer();

    public static final String[] BUSINESS_BM25_FIELDS = {"summary", "structure", "content", "tags"};
    public static final String[] WORKSPACE_BM25_FIELDS = {"summary", "structure", "content"};

    private static final Map<String, Float> BUSINESS_FIELD_BOOSTS = Map.of(
        "summary", 2.0f,
        "structure", 1.6f,
        "tags", 1.3f,
        "content", 1.0f
    );

    private static final Map<String, Float> WORKSPACE_FIELD_BOOSTS = Map.of(
        "summary", 2.0f,
        "structure", 1.5f,
        "content", 1.0f
    );

    private AiLocalLuceneHybridSearchHelper() {
    }

    public static final class HybridCandidate<T> {
        public final T payload;
        public float vectorScore;
        public float bm25Score;

        HybridCandidate(T payload) {
            this.payload = payload;
        }
    }

    public static Query buildBusinessBm25Query(String queryText, Query scopeFilter) {
        return buildBm25Query(queryText, BUSINESS_BM25_FIELDS, BUSINESS_FIELD_BOOSTS, scopeFilter);
    }

    public static Query buildWorkspaceBm25Query(String queryText) {
        return buildBm25Query(queryText, WORKSPACE_BM25_FIELDS, WORKSPACE_FIELD_BOOSTS, null);
    }

    public static Query buildBm25Query(
            String queryText,
            String[] fields,
            Map<String, Float> fieldBoosts,
            Query scopeFilter) {
        String safe = String.valueOf(queryText == null ? "" : queryText).trim();
        if (safe.isBlank() || fields == null || fields.length == 0) {
            return null;
        }
        Query textQuery = parseTextQuery(safe, fields, fieldBoosts);
        if (textQuery == null) {
            return null;
        }
        if (scopeFilter == null) {
            return textQuery;
        }
        BooleanQuery.Builder builder = new BooleanQuery.Builder();
        builder.add(textQuery, BooleanClause.Occur.MUST);
        builder.add(scopeFilter, BooleanClause.Occur.FILTER);
        return builder.build();
    }

    private static Query parseTextQuery(String safe, String[] fields, Map<String, Float> fieldBoosts) {
        try {
            MultiFieldQueryParser parser = new MultiFieldQueryParser(fields, ANALYZER, fieldBoosts);
            parser.setDefaultOperator(QueryParser.Operator.OR);
            parser.setAllowLeadingWildcard(false);
            return parser.parse(QueryParser.escape(safe));
        } catch (Exception ignored) {
            return buildTokenFallbackQuery(safe, fields);
        }
    }

    private static Query buildTokenFallbackQuery(String safe, String[] fields) {
        LinkedHashSet<String> tokens = new LinkedHashSet<>();
        Matcher matcher = TOKEN_PATTERN.matcher(safe.toLowerCase(Locale.ROOT));
        while (matcher.find() && tokens.size() < 12) {
            tokens.add(matcher.group());
        }
        if (tokens.isEmpty()) {
            return null;
        }
        BooleanQuery.Builder builder = new BooleanQuery.Builder();
        for (String token : tokens) {
            for (String field : fields) {
                try {
                    QueryParser parser = new QueryParser(field, ANALYZER);
                    parser.setAllowLeadingWildcard(false);
                    builder.add(parser.parse(QueryParser.escape(token)), BooleanClause.Occur.SHOULD);
                } catch (Exception ignored) {
                    builder.add(new TermQuery(new Term(field, token)), BooleanClause.Occur.SHOULD);
                }
            }
        }
        builder.setMinimumNumberShouldMatch(1);
        return builder.build();
    }

    public static <T> void collectVectorHits(
            IndexSearcher searcher,
            Query vectorQuery,
            int fanout,
            BiFunction<IndexSearcher, ScoreDoc, T> toPayload,
            LinkedHashMap<String, HybridCandidate<T>> candidates,
            java.util.function.Function<T, String> keyFn) throws Exception {
        if (searcher == null || vectorQuery == null || fanout <= 0) {
            return;
        }
        TopDocs docs = searcher.search(vectorQuery, fanout);
        for (ScoreDoc scoreDoc : docs.scoreDocs) {
            try {
                T payload = toPayload.apply(searcher, scoreDoc);
                if (payload == null) {
                    continue;
                }
                String key = keyFn.apply(payload);
                if (key == null || key.isBlank()) {
                    continue;
                }
                HybridCandidate<T> acc = candidates.computeIfAbsent(key, ignored -> new HybridCandidate<>(payload));
                acc.vectorScore = Math.max(acc.vectorScore, scoreDoc.score);
            } catch (Exception ignored) {
                // skip malformed hit
            }
        }
    }

    public static <T> void collectBm25Hits(
            IndexSearcher searcher,
            Query bm25Query,
            int fanout,
            BiFunction<IndexSearcher, ScoreDoc, T> toPayload,
            LinkedHashMap<String, HybridCandidate<T>> candidates,
            java.util.function.Function<T, String> keyFn) throws Exception {
        if (searcher == null || bm25Query == null || fanout <= 0) {
            return;
        }
        TopDocs docs = searcher.search(bm25Query, fanout);
        for (ScoreDoc scoreDoc : docs.scoreDocs) {
            try {
                T payload = toPayload.apply(searcher, scoreDoc);
                if (payload == null) {
                    continue;
                }
                String key = keyFn.apply(payload);
                if (key == null || key.isBlank()) {
                    continue;
                }
                HybridCandidate<T> acc = candidates.computeIfAbsent(key, ignored -> new HybridCandidate<>(payload));
                acc.bm25Score = Math.max(acc.bm25Score, scoreDoc.score);
            } catch (Exception ignored) {
                // skip malformed hit
            }
        }
    }

    public static <T> List<T> fuseAndRank(
            LinkedHashMap<String, HybridCandidate<T>> candidates,
            float vectorWeight,
            float bm25Weight,
            java.util.function.BiFunction<T, Float, T> withFusedScore,
            int limit) {
        if (candidates == null || candidates.isEmpty()) {
            return List.of();
        }
        float maxVector = 0f;
        float maxBm25 = 0f;
        for (HybridCandidate<T> candidate : candidates.values()) {
            maxVector = Math.max(maxVector, candidate.vectorScore);
            maxBm25 = Math.max(maxBm25, candidate.bm25Score);
        }
        final float maxVectorFinal = maxVector;
        final float maxBm25Final = maxBm25;
        float safeVectorWeight = Math.max(0f, vectorWeight);
        float safeBm25Weight = Math.max(0f, bm25Weight);
        if (safeVectorWeight <= 0f && safeBm25Weight <= 0f) {
            safeVectorWeight = 0.55f;
            safeBm25Weight = 0.45f;
        }
        final float vectorWeightFinal = safeVectorWeight;
        final float bm25WeightFinal = safeBm25Weight;

        List<Map.Entry<String, HybridCandidate<T>>> ranked = new ArrayList<>(candidates.entrySet());
        ranked.sort((left, right) -> Double.compare(
            fusedScore(right.getValue(), maxVectorFinal, maxBm25Final, vectorWeightFinal, bm25WeightFinal),
            fusedScore(left.getValue(), maxVectorFinal, maxBm25Final, vectorWeightFinal, bm25WeightFinal)));

        List<T> out = new ArrayList<>();
        for (Map.Entry<String, HybridCandidate<T>> entry : ranked) {
            HybridCandidate<T> candidate = entry.getValue();
            float fused = (float) fusedScore(candidate, maxVectorFinal, maxBm25Final, vectorWeightFinal, bm25WeightFinal);
            out.add(withFusedScore.apply(candidate.payload, fused));
            if (out.size() >= Math.max(1, limit)) {
                break;
            }
        }
        return out;
    }

    private static double fusedScore(
            HybridCandidate<?> candidate,
            float maxVector,
            float maxBm25,
            float vectorWeight,
            float bm25Weight) {
        double vectorPart = maxVector > 0f && candidate.vectorScore > 0f
            ? (candidate.vectorScore / maxVector) * vectorWeight
            : 0d;
        double bm25Part = maxBm25 > 0f && candidate.bm25Score > 0f
            ? (candidate.bm25Score / maxBm25) * bm25Weight
            : 0d;
        if (vectorPart <= 0d && bm25Part <= 0d) {
            return 0d;
        }
        if (vectorPart <= 0d) {
            return bm25Part;
        }
        if (bm25Part <= 0d) {
            return vectorPart;
        }
        return vectorPart + bm25Part;
    }

    public static int resolveFanout(int k, int multiplier, int minFanout) {
        int safeK = Math.max(1, k);
        int safeMultiplier = Math.max(2, multiplier);
        return Math.max(minFanout, safeK * safeMultiplier);
    }

    public static Analyzer analyzer() {
        return ANALYZER;
    }

    public static int countIndexDocs(IndexReader reader) {
        return reader == null ? 0 : reader.numDocs();
    }
}
