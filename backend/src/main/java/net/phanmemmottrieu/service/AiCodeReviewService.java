package net.phanmemmottrieu.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class AiCodeReviewService {

  private static final Logger log = LoggerFactory.getLogger(AiCodeReviewService.class);

  private final ChatgptGatewayService chatgptGatewayService;
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Value("${github.models.project-root-path:}")
  private String projectRootPath;

  @Value("${ai.review.max-files:80}")
  private int defaultMaxFiles;

  @Value("${ai.review.max-chars-per-file:3200}")
  private int maxCharsPerFile;

  @Value("${ai.review.max-total-chars:220000}")
  private int maxTotalChars;

  public AiCodeReviewService(ChatgptGatewayService chatgptGatewayService) {
    this.chatgptGatewayService = chatgptGatewayService;
  }

  public Map<String, Object> runReview(Object pathsInput, String focusInput, Integer maxFilesInput) {
    Path root = resolveProjectRoot();
    int maxFiles = Math.max(1, Math.min(200, maxFilesInput == null ? defaultMaxFiles : maxFilesInput));
    List<Path> selected = resolveCandidateFiles(root, pathsInput, maxFiles);

    StringBuilder context = new StringBuilder();
    List<String> includedFiles = new ArrayList<>();

    for (Path file : selected) {
      String compact = compactJavaFile(file);
      if (compact.isBlank()) {
        continue;
      }
      String relative = toRelativeDisplay(root, file);
      String block = "### " + relative + "\n" + compact + "\n\n";
      if (context.length() + block.length() > Math.max(10000, maxTotalChars)) {
        break;
      }
      context.append(block);
      includedFiles.add(relative);
    }

    if (includedFiles.isEmpty()) {
      throw new IllegalArgumentException("No readable Java files found for review.");
    }

    String focus = String.valueOf(focusInput == null ? "" : focusInput).trim();
    String prompt = buildReviewPrompt(context.toString(), focus);
    String raw = chatgptGatewayService.generateContent(prompt);
    String aiText = unwrapAiText(raw);
    Map<String, Object> parsed = parseJsonObject(aiText);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("files", includedFiles);
    out.put("scannedCount", includedFiles.size());
    out.put("contextChars", context.length());
    out.put("focus", focus);
    out.put("review", parsed.isEmpty() ? Map.of("raw", aiText) : parsed);
    out.put("raw", raw);
    return out;
  }

  private Path resolveProjectRoot() {
    String configured = String.valueOf(projectRootPath == null ? "" : projectRootPath).trim();
    if (!configured.isEmpty()) {
      Path p = Paths.get(configured);
      if (Files.isDirectory(p)) {
        return p;
      }
    }
    Path fallback = Paths.get(".").toAbsolutePath().normalize();
    if (Files.isDirectory(fallback.resolve("src/main/java"))) {
      return fallback;
    }
    return fallback;
  }

  private List<Path> resolveCandidateFiles(Path root, Object pathsInput, int maxFiles) {
    List<String> requested = toStringList(pathsInput);
    if (!requested.isEmpty()) {
      List<Path> selected = new ArrayList<>();
      for (String rel : requested) {
        if (selected.size() >= maxFiles) {
          break;
        }
        Path resolved = root.resolve(rel).normalize();
        if (!resolved.startsWith(root) || !Files.isRegularFile(resolved) || !resolved.toString().endsWith(".java")) {
          continue;
        }
        selected.add(resolved);
      }
      return selected;
    }

    try (var stream = Files.walk(root)) {
      return stream
          .filter(Files::isRegularFile)
          .filter(p -> p.toString().endsWith(".java"))
          .filter(p -> !p.toString().contains("/target/"))
          .filter(p -> !p.toString().contains("/.git/"))
          .limit(maxFiles)
          .toList();
    } catch (Exception ex) {
      log.warn("Cannot scan Java files from {}: {}", root, ex.getMessage());
      return Collections.emptyList();
    }
  }

  private String compactJavaFile(Path file) {
    try {
      String src = Files.readString(file, StandardCharsets.UTF_8);
      String compact = compactJavaSource(src);
      if (compact.length() > Math.max(500, maxCharsPerFile)) {
        return compact.substring(0, Math.max(500, maxCharsPerFile)) + "\n...[trimmed]...";
      }
      return compact;
    } catch (Exception ex) {
      log.debug("Cannot read {}: {}", file, ex.getMessage());
      return "";
    }
  }

  // Remove comments/blank/import lines and keep class + key method signatures.
  public String compactJavaSource(String source) {
    if (source == null || source.isBlank()) {
      return "";
    }
    String[] lines = source.split("\\n");
    StringBuilder out = new StringBuilder();
    List<String> pendingAnnotations = new ArrayList<>();
    boolean inBlockComment = false;

    for (String rawLine : lines) {
      String line = rawLine == null ? "" : rawLine;
      String trimmed = line.trim();

      if (inBlockComment) {
        if (trimmed.contains("*/")) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith("/*")) {
        if (!trimmed.contains("*/")) {
          inBlockComment = true;
        }
        continue;
      }
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
        continue;
      }

      int inlineComment = trimmed.indexOf("//");
      if (inlineComment >= 0) {
        trimmed = trimmed.substring(0, inlineComment).trim();
      }

      if (trimmed.isBlank() || trimmed.startsWith("import ")) {
        continue;
      }

      if (trimmed.startsWith("@")) {
        pendingAnnotations.add(trimmed);
        continue;
      }

      boolean keep = isClassSignature(trimmed) || isMethodSignature(trimmed) || trimmed.startsWith("package ");
      if (!keep) {
        continue;
      }

      if (!pendingAnnotations.isEmpty()) {
        for (String ann : pendingAnnotations) {
          out.append(ann).append("\n");
        }
        pendingAnnotations.clear();
      }

      if (isMethodSignature(trimmed) && trimmed.contains("{") && !trimmed.endsWith("{ ... }")) {
        String sig = trimmed.substring(0, trimmed.indexOf('{')).trim();
        out.append(sig).append(" { ... }\n");
      } else {
        out.append(trimmed).append("\n");
      }
    }

    return out.toString().trim();
  }

  private boolean isClassSignature(String line) {
    String lower = line.toLowerCase(Locale.ROOT);
    return lower.startsWith("public class ")
        || lower.startsWith("class ")
        || lower.startsWith("public interface ")
        || lower.startsWith("interface ")
        || lower.startsWith("public enum ")
        || lower.startsWith("enum ")
        || lower.startsWith("public record ")
        || lower.startsWith("record ")
        || lower.startsWith("public abstract class ")
        || lower.startsWith("abstract class ");
  }

  private boolean isMethodSignature(String line) {
    if (!line.contains("(") || !line.contains(")")) {
      return false;
    }
    String lower = line.toLowerCase(Locale.ROOT);
    if (lower.startsWith("if ") || lower.startsWith("for ") || lower.startsWith("while ")
        || lower.startsWith("switch ") || lower.startsWith("catch ") || lower.startsWith("return ")) {
      return false;
    }
    return lower.startsWith("public ") || lower.startsWith("protected ") || lower.startsWith("private ");
  }

  private String buildReviewPrompt(String context, String focus) {
    String reviewFocus = focus == null ? "" : focus.trim();
    StringBuilder sb = new StringBuilder();
    sb.append("You are a senior Java reviewer.\\n");
    sb.append("Review the compact code context and return ONLY valid JSON.\\n");
    sb.append("JSON schema:\\n");
    sb.append("{\\n");
    sb.append("  \"summary\": \"string\",\\n");
    sb.append("  \"improvements\": [\\n");
    sb.append("    {\"severity\":\"HIGH|MEDIUM|LOW\",\"file\":\"path\",\"issue\":\"string\",\"recommendation\":\"string\",\"sample_patch\":\"string\"}\\n");
    sb.append("  ]\\n");
    sb.append("}\\n");
    if (!reviewFocus.isBlank()) {
      sb.append("Focus: ").append(reviewFocus).append("\\n");
    }
    sb.append("Code context:\\n").append(context);
    return sb.toString();
  }

  private String unwrapAiText(String raw) {
    String text = String.valueOf(raw == null ? "" : raw).trim();
    if (text.isEmpty()) {
      return "";
    }
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> root = objectMapper.readValue(text, Map.class);
      Object result = root.get("result");
      if (result != null) {
        return stripCodeFence(String.valueOf(result));
      }
      Object message = root.get("message");
      if (message != null && !String.valueOf(message).isBlank()) {
        return stripCodeFence(String.valueOf(message));
      }
    } catch (Exception ignored) {
      // raw text fallback
    }
    return stripCodeFence(text);
  }

  private Map<String, Object> parseJsonObject(String text) {
    String cleaned = String.valueOf(text == null ? "" : text).trim();
    if (cleaned.isEmpty()) {
      return Collections.emptyMap();
    }
    try {
      @SuppressWarnings("unchecked")
      Map<String, Object> parsed = objectMapper.readValue(cleaned, Map.class);
      return parsed;
    } catch (Exception ignore) {
      // Continue with relaxed extraction below.
    }

    int first = cleaned.indexOf('{');
    int last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      String candidate = cleaned.substring(first, last + 1);
      try {
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(candidate, Map.class);
        return parsed;
      } catch (Exception ignored) {
        return Collections.emptyMap();
      }
    }
    return Collections.emptyMap();
  }

  private String stripCodeFence(String text) {
    String s = String.valueOf(text == null ? "" : text).trim();
    if (!s.startsWith("```")) {
      return s;
    }
    int firstBreak = s.indexOf('\n');
    if (firstBreak < 0) {
      return s;
    }
    String body = s.substring(firstBreak + 1).trim();
    if (body.endsWith("```")) {
      body = body.substring(0, body.length() - 3).trim();
    }
    return body;
  }

  private List<String> toStringList(Object input) {
    if (input == null) {
      return Collections.emptyList();
    }

    Set<String> out = new LinkedHashSet<>();
    if (input instanceof List<?> list) {
      for (Object item : list) {
        String s = String.valueOf(item == null ? "" : item).trim();
        if (!s.isEmpty()) {
          out.add(s);
        }
      }
      return new ArrayList<>(out);
    }

    String raw = String.valueOf(input).trim();
    if (raw.isEmpty()) {
      return Collections.emptyList();
    }
    for (String part : raw.split(",")) {
      String s = part.trim();
      if (!s.isEmpty()) {
        out.add(s);
      }
    }
    return new ArrayList<>(out);
  }

  private String toRelativeDisplay(Path root, Path file) {
    try {
      return root.relativize(file).toString().replace('\\', '/');
    } catch (Exception ignored) {
      return file.toString().replace('\\', '/');
    }
  }
}
