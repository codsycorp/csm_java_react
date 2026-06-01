package net.phanmemmottrieu.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;

/**
 * Supplies Metal shader assets for {@code net.ladenthin:llama} on macOS.
 *
 * <p>ggml looks for {@code default.metallib} (precompiled). Without it, runtime compile of
 * {@code ggml-metal.metal} spikes RAM and triggers OOM (exit 137) when loading 3B in-JVM.
 */
public final class LlamaMetalResourceBootstrap {

    private static final Logger log = LoggerFactory.getLogger(LlamaMetalResourceBootstrap.class);

    private static final String RESOURCE_PREFIX = "net/ladenthin/llama/Mac/aarch64";

    private static final List<String> SUPPORT_FILES = List.of(
            "ggml-common.h",
            "ggml-metal-impl.h",
            "ggml-metal.metal",
            "default.metallib"
    );

    private LlamaMetalResourceBootstrap() {
    }

    /** Call once from {@link net.phanmemmottrieu.Main} before Spring / llama JNI load. */
    public static void prepareMacMetalResources() {
        String os = System.getProperty("os.name", "");
        if (os == null || !os.toLowerCase(Locale.ROOT).contains("mac")) {
            return;
        }
        String arch = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);
        if (!arch.contains("aarch64") && !arch.contains("arm64")) {
            log.info("Llama Metal bootstrap skipped (Mac arch={} — only aarch64 bundled)", arch);
            return;
        }

        Path metalDir = resolveMetalDir();
        try {
            Files.createDirectories(metalDir);
        } catch (IOException ex) {
            log.warn("Could not create llama metal dir {}: {}", metalDir, ex.getMessage());
            return;
        }

        int copied = 0;
        for (String name : SUPPORT_FILES) {
            if (copyResourceIfMissing(RESOURCE_PREFIX + "/" + name, metalDir.resolve(name))) {
                copied++;
            }
        }

        // net.ladenthin:llama extracts ggml-metal.metal to java.io.tmpdir; ggml loads
        // default.metallib from the same directory to avoid runtime shader compile (OOM 137).
        Path tmpDir = Paths.get(System.getProperty("java.io.tmpdir", "/tmp"));
        try {
            Files.createDirectories(tmpDir);
            for (String name : SUPPORT_FILES) {
                Path target = tmpDir.resolve(name);
                Path fromMetalDir = metalDir.resolve(name);
                if (Files.isRegularFile(fromMetalDir) && !Files.isRegularFile(target)) {
                    Files.copy(fromMetalDir, target, StandardCopyOption.REPLACE_EXISTING);
                }
                if (copyResourceIfMissing(RESOURCE_PREFIX + "/" + name, target)) {
                    copied++;
                }
            }
        } catch (IOException ex) {
            log.warn("Could not stage Llama Metal assets in java.io.tmpdir: {}", ex.getMessage());
        }

        // ggml loads default.metallib from NSBundle, then from dirname(java argv[0]) — not java.io.tmpdir.
        Path metallibSource = firstExisting(
            metalDir.resolve("default.metallib"),
            tmpDir.resolve("default.metallib")
        );
        if (metallibSource != null) {
            stageMetallibBesideJavaBinary(metallibSource);
        }

        // ggml reads ggml-metal.metal from GGML_METAL_PATH_RESOURCES when compiling from source.
        if (System.getenv("GGML_METAL_PATH_RESOURCES") == null) {
            setEnvIfPossible("GGML_METAL_PATH_RESOURCES", metalDir.toString());
        }

        boolean hasMetallib = hasPrecompiledMetallib();
        if (hasMetallib) {
            log.info("Llama Metal: default.metallib ready at {} (skip runtime shader compile)", metalDir);
        } else {
            log.warn(
                "Llama Metal: default.metallib missing — use CPU (gpu-layers=0) or run: "
                    + "./scripts/setup-llama-metal-macos.sh");
        }
        if (copied > 0) {
            log.info("Llama Metal: copied {} file(s) to {}", copied, metalDir);
        }
    }

    public static boolean hasPrecompiledMetallib() {
        Path javaBinMetallib = resolveJavaBinaryDir().resolve("default.metallib");
        if (Files.isRegularFile(javaBinMetallib)) {
            return true;
        }
        Path tmpMetallib = Paths.get(System.getProperty("java.io.tmpdir", "/tmp")).resolve("default.metallib");
        if (Files.isRegularFile(tmpMetallib)) {
            return true;
        }
        return Files.isRegularFile(resolveMetalDir().resolve("default.metallib"));
    }

    private static Path resolveJavaBinaryDir() {
        String javaHome = System.getProperty("java.home", "");
        if (javaHome.isBlank()) {
            return Paths.get("");
        }
        return Paths.get(javaHome.trim(), "bin");
    }

    private static Path firstExisting(Path... candidates) {
        for (Path candidate : candidates) {
            if (candidate != null && Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    /** Re-stage Metal assets immediately before first JNI model load (lazy load path). */
    public static void ensureReadyBeforeNativeLoad() {
        if (!isMacAarch64()) {
            return;
        }
        Path metalDir = resolveMetalDir();
        Path source = firstExisting(
            metalDir.resolve("default.metallib"),
            classpathResourcePath("default.metallib")
        );
        if (source == null) {
            prepareMacMetalResources();
            source = firstExisting(
                metalDir.resolve("default.metallib"),
                classpathResourcePath("default.metallib")
            );
        }
        if (source != null) {
            stageMetallibBesideJavaBinary(source);
            stageMetallibBesideProcessCommand(source);
            stageFileBesideTempDir(source, "default.metallib");
            stageLlamaNativeDir(source);
        }
    }

    private static void stageLlamaNativeDir(Path source) {
        String nativeDir = System.getProperty("net.ladenthin.llama.tmpdir");
        if (nativeDir == null || nativeDir.isBlank()) {
            nativeDir = Paths.get(System.getProperty("user.home", ""), ".csm", "llama-native").toString();
        }
        copyIfDifferent(source, Paths.get(nativeDir.trim()).resolve("default.metallib"), "net.ladenthin.llama.tmpdir");
    }

    private static boolean isMacAarch64() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (!os.contains("mac")) {
            return false;
        }
        String arch = System.getProperty("os.arch", "").toLowerCase(Locale.ROOT);
        return arch.contains("aarch64") || arch.contains("arm64");
    }

    private static Path classpathResourcePath(String name) {
        String resource = RESOURCE_PREFIX + "/" + name;
        ClassLoader cl = LlamaMetalResourceBootstrap.class.getClassLoader();
        try (InputStream in = cl.getResourceAsStream(resource)) {
            if (in == null) {
                return null;
            }
            Path tmp = Files.createTempFile("csm-llama-", "-" + name);
            Files.copy(in, tmp, StandardCopyOption.REPLACE_EXISTING);
            return tmp;
        } catch (IOException ex) {
            log.warn("Llama Metal: could not read classpath {}: {}", resource, ex.getMessage());
            return null;
        }
    }

    private static void stageMetallibBesideProcessCommand(Path source) {
        ProcessHandle.current().info().command().ifPresent(command -> {
            Path binDir = Paths.get(command).getParent();
            if (binDir == null) {
                return;
            }
            copyIfDifferent(source, binDir.resolve("default.metallib"), "process command dir");
        });
    }

    private static void stageFileBesideTempDir(Path source, String name) {
        copyIfDifferent(source, Paths.get(System.getProperty("java.io.tmpdir", "/tmp")).resolve(name), "java.io.tmpdir");
    }

    private static void copyIfDifferent(Path source, Path target, String label) {
        try {
            if (target.getParent() != null) {
                Files.createDirectories(target.getParent());
            }
            if (Files.isRegularFile(target) && Files.size(target) == Files.size(source)) {
                return;
            }
            Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING);
            log.info("Llama Metal: staged {} at {} ({})", nameOf(source), target, label);
        } catch (IOException ex) {
            log.warn("Llama Metal: could not stage {} at {}: {}", nameOf(source), target, ex.getMessage());
        }
    }

    private static String nameOf(Path path) {
        return path == null ? "asset" : path.getFileName().toString();
    }

    private static void stageMetallibBesideJavaBinary(Path source) {
        copyIfDifferent(source, resolveJavaBinaryDir().resolve("default.metallib"), "JAVA_HOME/bin");
    }

    private static Path resolveMetalDir() {
        String custom = System.getProperty("net.ladenthin.llama.tmpdir");
        if (custom != null && !custom.isBlank()) {
            return Paths.get(custom.trim());
        }
        String env = System.getenv("GGML_METAL_PATH_RESOURCES");
        if (env != null && !env.isBlank()) {
            return Paths.get(env.trim());
        }
        return Paths.get(System.getProperty("user.home", ""), ".csm", "llama-metal");
    }

    private static boolean copyResourceIfMissing(String resourcePath, Path target) {
        if (Files.isRegularFile(target)) {
            return false;
        }
        ClassLoader cl = LlamaMetalResourceBootstrap.class.getClassLoader();
        try (InputStream in = cl.getResourceAsStream(resourcePath)) {
            if (in == null) {
                return false;
            }
            Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            return true;
        } catch (IOException ex) {
            log.warn("Failed to copy Llama Metal resource {} → {}: {}", resourcePath, target, ex.getMessage());
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    private static void setEnvIfPossible(String key, String value) {
        try {
            Class<?> processEnvironment = Class.forName("java.lang.ProcessEnvironment");
            var getenv = processEnvironment.getDeclaredMethod("getenv");
            getenv.setAccessible(true);
            Object env = getenv.invoke(null);
            if (env instanceof java.util.Map<?, ?> map) {
                ((java.util.Map<String, String>) map).put(key, value);
                log.info("Llama Metal: GGML_METAL_PATH_RESOURCES={}", value);
            }
        } catch (Exception ex) {
            log.debug("Could not set {} via reflection (set in shell): {}", key, ex.getMessage());
        }
    }
}
