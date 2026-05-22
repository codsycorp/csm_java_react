# AI Local Agent Operating Manual – Cursor-Like Agent Execution Guide

**Version:** 1.0  
**Last Updated:** May 22, 2026  
**Purpose:** Operational guidelines for running CSM AI Local as an efficient, accurate agent similar to Claude/Cursor Agent in VSCode with code chat extension.

---

## Table of Contents

1. [Agent Identity & Principles](#agent-identity--principles)
2. [Request Classification & Routing](#request-classification--routing)
3. [Agent Operating Modes](#agent-operating-modes)
4. [Knowledge Retrieval & Context Building](#knowledge-retrieval--context-building)
5. [Code Analysis & Generation Workflows](#code-analysis--generation-workflows)
6. [Decision Trees & Branching Logic](#decision-trees--branching-logic)
7. [Error Handling & Graceful Degradation](#error-handling--graceful-degradation)
8. [Performance Optimization Strategies](#performance-optimization-strategies)
9. [Agent Memory & Session Management](#agent-memory--session-management)
10. [Output Formatting & User Communication](#output-formatting--user-communication)
11. [Integration with LlamaCppNativeService](#integration-with-llamacppnativeservice)
12. [Batch Processing & Orchestration](#batch-processing--orchestration)

---

## Agent Identity & Principles

### Core Identity

**Name:** CSM AI Local Agent  
**Role:** In-process code understanding, generation, analysis, and refactoring  
**Domain:** Full-stack (Java backend, TypeScript/React frontend, DevOps, databases)  
**Capability Level:** Claude Sonnet equivalent (3B parameters Qwen2.5-VL)  
**Execution Context:** Local JVM, no cloud dependencies

### Operating Principles

```
1. CODE-FIRST ANALYSIS
   ├─ Current code is the source of truth
   ├─ Cursor position defines local scope
   ├─ Nearby context is primary anchor
   └─ Don't assume file paths exist (verify first)

2. NARROW SCOPE
   ├─ Ask focused follow-up questions only
   ├─ Avoid broad assumptions about system
   ├─ Keep context window manageable (8K tokens)
   └─ Deliver specific, actionable output

3. FACTUAL ACCURACY
   ├─ Show what you checked/analyzed
   ├─ Explain findings clearly
   ├─ State next step explicitly
   └─ Never hallucinate missing code

4. EFFICIENCY
   ├─ Minimize token usage
   ├─ Reuse cached analysis when possible
   ├─ Batch operations (multiple files in one request)
   └─ Prefer local processing over cloud fallback

5. TRANSPARENCY
   ├─ Report confidence level
   ├─ Explain reasoning chain
   ├─ Flag ambiguities or assumptions
   └─ Suggest verification steps
```

### System Prompt for Local Agent

```
You are CSM AI Local – an in-process code analysis and generation agent running on llama.cpp (Qwen2.5-VL 3B).

CORE RESPONSIBILITIES:
1. Analyze code snippets provided in the request (treat as ground truth)
2. Understand user intent from query + cursor position + file context
3. Generate or refactor code with precision
4. Execute in-place fixes without losing context
5. Stream responses for real-time feedback

CONSTRAINTS YOU MUST RESPECT:
- Token limit: 512 output tokens (hard cap: 2048)
- Context window: 8192 input tokens
- Latency budget: < 3 seconds per request (target: < 1s)
- No external API calls (work with local state only)
- Deterministic: same input = same output (no randomness)

WORKING STYLE (Cursor-Like):
- Provide code-first responses (show code, explain after)
- Use inline comments for clarity
- Suggest follow-up edits if scope is large
- Ask for missing context before guessing

ALWAYS START WITH:
1. What you found (facts about current code)
2. What the user asked for (intent confirmation)
3. What you're about to do (action plan)
4. The implementation (code/output)
5. What comes next (optional: follow-up steps)

OUTPUT STRUCTURE:
✓ Verified: [what you checked]
✓ Intent: [what user wants]
✓ Plan: [how you'll do it]
[CODE OR ANALYSIS]
Next: [suggested follow-up if scope suggests multi-step]
```

---

## Request Classification & Routing

### Request Type Detection (Zero-Shot)

```python
def classify_request(query: str, code_context: str, cursor_line: int) -> RequestType:
    """
    Classify incoming request into one of 8 types.
    Use heuristics + LLM classification for complex queries.
    """
    
    # FAST PATH: Regex patterns (< 5ms)
    if matches_pattern(query, r"^(refactor|rewrite|optimize)"):
        return RequestType.REFACTOR
    elif matches_pattern(query, r"^(fix|debug|bug|error)"):
        return RequestType.DEBUG
    elif matches_pattern(query, r"^(test|unit|mock)"):
        return RequestType.TEST_GENERATION
    elif matches_pattern(query, r"^(doc|comment|explain)"):
        return RequestType.DOCUMENTATION
    elif matches_pattern(query, r"^(generate|create|add)"):
        return RequestType.CODE_GENERATION
    elif matches_pattern(query, r"^(what|how|why|check)"):
        return RequestType.ANALYSIS
    
    # SLOW PATH: LLM classification (1-2 seconds)
    # If query is ambiguous, use LlamaCppNativeService.generateContentFast()
    classification_prompt = f"""
    Classify this code request into ONE category:
    1. REFACTOR (improve existing code)
    2. DEBUG (fix bugs/errors)
    3. ANALYSIS (understand code)
    4. GENERATION (write new code)
    5. DOCUMENTATION (add comments/docs)
    6. TEST (write unit tests)
    7. OPTIMIZATION (performance/memory)
    8. ARCHITECTURAL (design pattern)
    
    Query: {query}
    Code context length: {len(code_context)} chars
    
    Return ONLY the category name.
    """
    
    result = llamaCppNativeService.generateContentFast(
        classification_prompt,
        max_tokens=8  # Only need one word
    )
    return parse_classification(result)
```

### Request Type Enum

| Type | Token Budget | Latency Target | Example | Handler |
|------|--------------|----------------|---------|---------|
| ANALYSIS | 256 | < 1s | "What does this function do?" | `analyzeCodeFlow()` |
| CODE_GENERATION | 512 | < 2s | "Generate REST endpoint" | `generateCode()` |
| REFACTOR | 512 | < 2s | "Optimize this loop" | `refactorCode()` |
| DEBUG | 512 | < 3s | "Fix this NPE" | `debugIssue()` |
| TEST_GENERATION | 512 | < 2s | "Write unit tests" | `generateTests()` |
| DOCUMENTATION | 256 | < 1s | "Add JSDoc" | `addDocumentation()` |
| OPTIMIZATION | 512 | < 3s | "Reduce memory usage" | `optimizePerformance()` |
| ARCHITECTURAL | 512 | < 3s | "Design pattern for X" | `suggestPattern()` |

---

## Agent Operating Modes

### Mode 1: Direct Response (< 1s)

**When:** Simple queries, small code context (< 1000 chars)

```
User: "Add @Override to this method"

Flow:
1. Parse request (0.1s)
2. Identify method location (0.1s)
3. Generate fix (0.3s)
4. Output (0.1s)
━━━━━━━━━━━
Total: ~0.6s

Response:
@Override
public String toString() { ... }

Explanation: Marked method as override of parent class signature.
```

**Handler Implementation:**
```java
public String handleDirectResponse(String query, String codeSnippet, int cursorLine) {
    // 1. Extract intent (regex-based)
    RequestType type = classifyRequestFast(query);
    
    // 2. Prepare minimal context
    String prompt = buildMinimalPrompt(query, codeSnippet, type);
    
    // 3. Call generateContentFast with low token cap
    String result = llamaCppNativeService.generateContentFast(prompt, 256);
    
    // 4. Post-process & validate
    return validateAndFormat(result);
}
```

---

### Mode 2: Streaming Response (< 3s)

**When:** Medium-complexity queries, multi-step generation

```
User: "Generate a service class for user management"

Flow:
1. Classify request → CODE_GENERATION (0.2s)
2. Gather context (imports, existing patterns) (0.3s)
3. Build orchestrated prompt (0.2s)
4. Stream generation (2.0s) ← User sees chunks in real-time
5. Post-process & validate (0.3s)
━━━━━━━━━━━
Total: ~3.0s

Response (streamed):
public class UserManagementService {
    [chunk 1: class definition]
    [chunk 2: constructor]
    [chunk 3: CRUD methods]
    [chunk 4: validation]
}
```

**Handler Implementation:**
```java
public void handleStreamingResponse(
    String query,
    String fileContext,
    int cursorLine,
    StreamCallback onChunk
) {
    // 1. Classify & route
    RequestType type = classifyRequest(query, fileContext, cursorLine);
    
    // 2. Build full context
    OrchestrationContext ctx = buildOrchestrationContext(
        type, query, fileContext, cursorLine
    );
    
    // 3. Stream via SSE
    AiLocalOrchestrationService.orchestrateWithStreaming(ctx, onChunk);
}
```

---

### Mode 3: Multi-Step Orchestration (< 5s)

**When:** Complex analysis, refactoring entire module, architecture planning

```
User: "Refactor this module to use dependency injection"

Flow:
Phase 1 - ANALYSIS (1.0s)
├─ Scan current module structure
├─ Identify dependencies
├─ Extract coupled components
└─ Build refactoring plan

Phase 2 - DESIGN (1.0s)
├─ Suggest DI framework (Spring)
├─ Design container setup
├─ Plan constructor injection
└─ Identify where to inject

Phase 3 - GENERATION (1.5s)
├─ Generate updated class definitions
├─ Generate Spring config
├─ Generate test setup
└─ Generate migration guide

Phase 4 - VALIDATION (1.0s)
├─ Verify changes compile
├─ Check imports are correct
├─ Validate bean definitions
└─ Stream final output

Total: ~4.5s
```

**Handler:**
```java
public void handleOrchestrationFlow(
    String query,
    FileContext fileContext,
    Executor executor  // For parallel phases
) {
    // Run 6-phase orchestration via AiLocalOrchestrationService
    AiLocalOrchestrationService.execute(
        new OrchestrationPlan()
            .phase(1, Phase.ANALYZE)
            .phase(2, Phase.CLASSIFY_INTENT)
            .phase(3, Phase.PLAN_REFACTORING)
            .phase(4, Phase.GENERATE_CODE)
            .phase(5, Phase.VALIDATE)
            .phase(6, Phase.OUTPUT),
        new OrchestrationCallback() {
            @Override public void onPhaseComplete(Phase phase, String result) {
                // Stream intermediate results
            }
        }
    );
}
```

---

## Knowledge Retrieval & Context Building

### Dynamic Context Window Strategy

```
AVAILABLE BUDGET: 8192 tokens
RESERVED: System prompt (200) + Query (100) + Response buffer (500)
AVAILABLE FOR CODE CONTEXT: ~7192 tokens

ALLOCATION STRATEGY:
├─ Current file (cursor +/- 50 lines): 40% → ~2877 tokens
├─ Related files (imports, used-by): 30% → ~2157 tokens
├─ Type definitions (class hierarchy): 15% → ~1079 tokens
├─ Previous edits in session: 10% → ~719 tokens
└─ Cached embeddings (semantic search): 5% → ~360 tokens
```

### Context Gathering Algorithm

```java
public ContextWindow buildDynamicContext(
    String currentFile,
    int cursorLine,
    Set<String> openFiles,
    SessionMemory sessionMemory
) {
    ContextWindow ctx = new ContextWindow(MAX_TOKENS);
    
    // STEP 1: Add current file (primary)
    int currentFileTokens = addCurrentFileContext(
        currentFile,
        cursorLine,
        ctx,
        0.40 * MAX_AVAILABLE  // 40% of budget
    );
    
    // STEP 2: Add imports & related files (secondary)
    int relatedTokens = addRelatedFilesContext(
        currentFile,
        openFiles,
        ctx,
        0.30 * MAX_AVAILABLE
    );
    
    // STEP 3: Add type definitions (tertiary)
    int typeTokens = addTypeDefinitions(
        extractTypesFromFile(currentFile),
        ctx,
        0.15 * MAX_AVAILABLE
    );
    
    // STEP 4: Add recent edits from session memory (cache)
    int sessionTokens = addSessionMemory(
        sessionMemory.getRecentEdits(5),
        ctx,
        0.10 * MAX_AVAILABLE
    );
    
    // STEP 5: Add semantic search results (embeddings)
    int semanticTokens = addSemanticContext(
        currentFile,
        ctx,
        0.05 * MAX_AVAILABLE
    );
    
    return ctx;
}

private int addCurrentFileContext(
    String filePath,
    int cursorLine,
    ContextWindow ctx,
    int tokenBudget
) {
    // Focus on cursor ± 50 lines (usually 100-200 lines)
    int startLine = Math.max(0, cursorLine - 50);
    int endLine = Math.min(totalLines, cursorLine + 50);
    
    String code = extractLines(filePath, startLine, endLine);
    
    // Add with markup
    ctx.addSection(
        "CURRENT FILE",
        String.format(
            "File: %s (lines %d-%d)\n```%s\n%s\n```",
            filePath,
            startLine,
            endLine,
            getFileExtension(filePath),
            code
        ),
        tokenBudget
    );
    
    return tokenCount(code);
}
```

### Semantic Similarity Search (Optional, Experimental)

```java
// If time permits (< 500ms), use embeddings for smart context
public List<CodeSnippet> findSemanticMatches(String query, String currentFile) {
    // Fast check: abort if > 2s elapsed
    if (elapsedMs > 2000) return Collections.emptyList();
    
    // 1. Generate query embedding (50ms)
    float[] queryEmbed = generateEmbedding(query);
    
    // 2. Search local snippet database (200ms)
    List<CodeSnippet> candidates = semanticDB.search(
        queryEmbed,
        k=3,  // top-3 similar snippets
        threshold=0.7
    );
    
    // 3. Filter + rank by relevance (100ms)
    return candidates.stream()
        .filter(s -> isRelevantToFile(s, currentFile))
        .sorted(Comparator.comparingDouble(CodeSnippet::similarityScore).reversed())
        .limit(2)
        .collect(Collectors.toList());
}
```

---

## Code Analysis & Generation Workflows

### Workflow 1: Code Generation (Direct)

```
INPUT:
query = "Generate a Spring REST controller for managing posts"
codeContext = "" (empty, no existing code)
cursorLine = 0

EXECUTION:
1. Classify: CODE_GENERATION
2. Extract intent: Spring REST, CRUD, Posts
3. Infer patterns from project:
   ├─ Scan existing controllers → detect @RestMapping, @Service patterns
   ├─ Extract common response wrapper format
   ├─ Detect error handling approach (try-catch vs @ExceptionHandler)
   └─ Find pagination patterns (PageRequest, Page<T>)
4. Build prompt:
   ────────────────────────────────────────
   You are generating a Spring REST controller.
   
   Existing pattern in project:
   ```java
   @RestController
   @RequestMapping("/api/users")
   public class UserController { ... }
   ```
   
   Generate a PostController with:
   - GET /api/posts (paginated)
   - GET /api/posts/{id}
   - POST /api/posts
   - PUT /api/posts/{id}
   - DELETE /api/posts/{id}
   
   Use the same response wrapper & error handling as UserController.
   ────────────────────────────────────────
5. Call LlamaCppNativeService:
   result = generateContentFast(prompt, maxTokens=512)
6. Post-process:
   ├─ Extract code block
   ├─ Validate syntax (try compile)
   ├─ Format with IDE conventions
   └─ Add auto-suggestions for next steps
7. Stream output to UI

OUTPUT:
@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {
    private final PostService postService;
    
    @GetMapping
    public ResponseEntity<Page<PostDto>> getPosts(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(postService.getPosts(pageable));
    }
    
    // ... other methods
}

Explanation:
✓ Pattern matched from UserController
✓ Pagination implemented using Spring Data
✓ Exception handling delegated to @ControllerAdvice
Next: Add @Service (PostService) to handle business logic
```

### Workflow 2: Code Analysis (Understanding)

```
INPUT:
query = "What does this function do and what are potential issues?"
codeContext = [long method, 40 lines]
cursorLine = 150

EXECUTION:
1. Classify: ANALYSIS
2. Parse code structure:
   ├─ Extract method signature
   ├─ Identify inputs/outputs
   ├─ Trace variable flow
   ├─ Detect loops, conditionals, recursion
   └─ Find external dependencies (DB, API, cache)
3. Build analysis prompt:
   ────────────────────────────────────────
   Analyze this Java method:
   ```java
   [40 lines of code]
   ```
   
   Questions:
   1. What is the primary purpose?
   2. What are inputs/outputs?
   3. Identify any bugs or performance issues
   4. Suggest improvements
   
   Format answer as:
   - Purpose: [1 sentence]
   - Inputs: [list]
   - Issues: [list of concerns]
   - Suggestions: [list of improvements]
   ────────────────────────────────────────
4. Call LlamaCppNativeService:
   result = generateContentFast(prompt, maxTokens=256)
5. Format output

OUTPUT:
Verified: Analyzed 40-line fetchUserPosts() method
Intent: Understand purpose and identify issues

✓ Purpose: Fetch paginated posts for a user from database

✓ Inputs:
  - userId (Long): ID of user
  - pageNum (int): Page number (0-indexed)
  - pageSize (int): Items per page

✓ Issues Found:
  - N+1 query problem: fetches user, then posts one-by-one
  - No null check on userId (potential NPE)
  - Page number not validated (negative = SQL error)
  - Hardcoded pagination size could OOM on large result sets

✓ Suggestions:
  1. Use JOIN fetch to avoid N+1 (Spring Data @Query)
  2. Add @Transactional(readOnly=true)
  3. Validate: userId > 0, pageNum >= 0, pageSize > 0
  4. Add upper bound: pageSize <= 1000

Next: Would you like me to refactor this method?
```

### Workflow 3: Debugging & Fixing

```
INPUT:
query = "Fix this NullPointerException at line 45"
error = "NullPointerException at UserService.java:45"
codeContext = [getUserById() method]
cursorLine = 45

EXECUTION:
1. Classify: DEBUG
2. Analyze error context:
   ├─ Locate line 45
   ├─ Identify variable that's null
   ├─ Trace back to source (where was it initialized?)
   ├─ Check for null checks upstream
   └─ Identify root cause
3. Build debug prompt:
   ────────────────────────────────────────
   Debug this NullPointerException:
   
   Stack trace: NullPointerException at UserService.java:45
   
   Code (lines 40-50):
   ```java
   [code snippet]
   ```
   
   Questions:
   1. Which variable is null?
   2. Why is it null? (root cause)
   3. How to fix? (provide code)
   
   Format:
   - Variable: [name]
   - Root cause: [explanation]
   - Fix: [code change or check]
   ────────────────────────────────────────
4. Call LlamaCppNativeService:
   result = generateContentFast(prompt, maxTokens=256)
5. Validate fix (syntax check + logic review)

OUTPUT:
✓ Verified: Line 45 has null dereference
✓ Intent: Find and fix NullPointerException

Variable: user (getUserById returns null)

Root cause:
  getUserById(userId) returns null when user not found,
  but code immediately calls user.getEmail() without null check

Fix (choose one):

Option A - Add null check:
User user = getUserById(userId);
if (user == null) {
    throw new UserNotFoundException("User not found: " + userId);
}
return user.getEmail();

Option B - Use Optional:
return getUserById(userId)
    .map(User::getEmail)
    .orElseThrow(() -> new UserNotFoundException(...));

Option C - Handle in repository:
// Modify getUserById to return empty Optional or throw exception
@Override
public User getUserById(Long userId) {
    return repository.findById(userId)
        .orElseThrow(() -> new UserNotFoundException(...));
}

Recommendation: Option B (using Optional) for modern Java style

Next: Which approach fits your codebase style?
```

---

## Decision Trees & Branching Logic

### Decision Tree 1: Route by Complexity

```
Request Arrives
    │
    ├─ Complexity Analysis
    │  ├─ Query length < 50 chars
    │  ├─ Code context < 1000 chars
    │  └─ No external context needed
    │      ↓ YES → SIMPLE (Mode: Direct, <1s)
    │
    │  ├─ Query length 50-200 chars
    │  ├─ Code context 1000-5000 chars
    │  ├─ Needs 1-2 related files
    │  └─ Multi-step generation
    │      ↓ YES → MEDIUM (Mode: Streaming, <3s)
    │
    │  ├─ Query length > 200 chars
    │  ├─ Code context > 5000 chars
    │  ├─ Needs 5+ related files
    │  └─ Architecture/design decisions required
    │      ↓ YES → COMPLEX (Mode: Orchestration, <5s)
    │
    └─ Health Check (Circuit Breaker)
       ├─ llamaCppNativeService.isAvailable() ✓
       ├─ llamaCppNativeService.isHealthy() ✓
       └─ NOT circuitOpen ✓
           ↓ ALL PASS → Execute Local
           ↓ ANY FAIL → Fall back to cloud / queue
```

### Decision Tree 2: Route by Type

```
After Classification (type known):

IF type == ANALYSIS
├─ Load static analysis only
├─ No code generation
├─ Budget: 256 tokens
└─ Latency: < 1s

IF type == CODE_GENERATION
├─ Load pattern library (existing code)
├─ Generate new code
├─ Validate syntax
└─ Budget: 512 tokens, Latency: < 2s

IF type == REFACTOR
├─ Load current code (full file)
├─ Apply transformation
├─ Preserve logic
└─ Budget: 512 tokens, Latency: < 2s

IF type == DEBUG
├─ Load error stack trace
├─ Load surrounding code
├─ Suggest fix + validation
└─ Budget: 256 tokens, Latency: < 3s

IF type == TEST_GENERATION
├─ Load method/class definition
├─ Load test patterns
├─ Generate test methods
└─ Budget: 512 tokens, Latency: < 2s

IF type == DOCUMENTATION
├─ Load code only (no patterns)
├─ Generate JSDoc/comments
├─ Add explanations
└─ Budget: 256 tokens, Latency: < 1s

IF type == OPTIMIZATION
├─ Load code + metrics (if available)
├─ Analyze bottlenecks
├─ Suggest optimizations
└─ Budget: 512 tokens, Latency: < 3s

IF type == ARCHITECTURAL
├─ Load module structure
├─ Suggest design patterns
├─ Provide implementation guide
└─ Budget: 512 tokens, Latency: < 3s
```

---

## Error Handling & Graceful Degradation

### Error Classification & Recovery

```java
public class AgentErrorHandler {
    
    public ResponseEntity<?> handleError(Exception ex, RequestContext ctx) {
        // 1. Classify error
        ErrorType type = classifyError(ex);
        
        // 2. Determine recovery action
        RecoveryAction action = getRecoveryAction(type, ctx);
        
        // 3. Execute recovery
        return executeRecovery(action, ex);
    }
    
    private enum ErrorType {
        CIRCUIT_OPEN,           // LlamaCppNativeService unavailable
        PROMPT_TOO_LONG,        // Code context exceeds limit
        INFERENCE_TIMEOUT,      // Took > 3 seconds
        SYNTAX_ERROR,           // Generated invalid code
        OOM,                    // Out of memory
        INTERRUPTED,            // User cancelled
        UNKNOWN
    }
    
    private RecoveryAction getRecoveryAction(ErrorType type, RequestContext ctx) {
        switch (type) {
            case CIRCUIT_OPEN:
                // Action: Fall back to cloud provider
                return new FallbackToCloud(ctx.query, ctx.codeContext);
                
            case PROMPT_TOO_LONG:
                // Action: Shrink context, retry locally
                return new ShrinkContextAndRetry(ctx, 0.5);  // 50% size
                
            case INFERENCE_TIMEOUT:
                // Action: Reduce token cap, retry or fallback
                return new ReduceTokensAndRetry(ctx, 256);  // Cap at 256 tokens
                
            case SYNTAX_ERROR:
                // Action: Regenerate with stricter constraints
                return new RegenerateWithValidation(ctx);
                
            case OOM:
                // Action: Restart service, fallback to cloud
                return new RestartAndFallback(ctx);
                
            case INTERRUPTED:
                // Action: Cancel immediately, return partial result
                return new CancelAndReturn(ctx);
                
            default:
                return new FallbackToCloud(ctx.query, ctx.codeContext);
        }
    }
    
    private ResponseEntity<?> executeRecovery(RecoveryAction action, Exception ex) {
        try {
            return action.execute();
        } catch (Exception fallbackEx) {
            // Last resort: return error to user with explanation
            return ResponseEntity
                .status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of(
                    "error", "AI Local service temporarily unavailable",
                    "reason", ex.getMessage(),
                    "fallback", "Using cloud provider",
                    "retryAfter", 300  // 5 minutes
                ));
        }
    }
}
```

### Graceful Degradation Levels

```
LEVEL 1: Full Local Processing
├─ Health: ✓ Llama available
├─ Context: ✓ Fits in memory
├─ Latency: < 3s
└─ Provider: LlamaCppNativeService

LEVEL 2: Hybrid (Local + Cloud)
├─ Health: ✓ Llama available but slow
├─ Context: ✓ Fits in memory
├─ Latency: > 3s, timeout imminent
├─ Action: Start cloud request in parallel
└─ Return: Whichever finishes first

LEVEL 3: Cloud Fallback
├─ Health: ✗ Llama unavailable (circuit open)
├─ Context: ? (size unknown)
├─ Latency: Cloud 2-5s
├─ Action: Use Gemini API
└─ Warn user: "Using cloud provider"

LEVEL 4: Partial/Cached Response
├─ Health: ✗ All services down
├─ Context: ? Partial data available
├─ Action: Return cached result from session
└─ Warn user: "Using cached result (outdated)"

LEVEL 5: Error Message Only
├─ Health: ✗ Complete failure
├─ Action: Return helpful error
└─ Suggest: "Check logs, restart service"
```

---

## Performance Optimization Strategies

### Token Budget Management

```java
public class TokenBudgetManager {
    
    private static final int HARD_LIMIT = 8192;
    private static final Map<RequestType, Integer> BUDGET_ALLOCATION = Map.ofEntries(
        Map.entry(RequestType.ANALYSIS, 256),
        Map.entry(RequestType.CODE_GENERATION, 512),
        Map.entry(RequestType.REFACTOR, 512),
        Map.entry(RequestType.DEBUG, 256),
        Map.entry(RequestType.TEST_GENERATION, 512),
        Map.entry(RequestType.DOCUMENTATION, 256),
        Map.entry(RequestType.OPTIMIZATION, 512),
        Map.entry(RequestType.ARCHITECTURAL, 512)
    );
    
    public ContextWindow allocateTokens(RequestType type, String query, String code) {
        ContextWindow window = new ContextWindow();
        
        int queryTokens = tokenCount(query);
        int systemTokens = 200;  // System prompt
        int responseBuffer = 500;  // Reserved for output
        
        int budgetForCode = HARD_LIMIT - queryTokens - systemTokens - responseBuffer;
        int targetForCode = BUDGET_ALLOCATION.get(type);
        
        int availableForCode = Math.min(budgetForCode, targetForCode);
        
        // Allocate intelligently
        window.addSystemPrompt(systemTokens);
        window.addQuery(queryTokens);
        window.addCodeContext(code, availableForCode);
        window.reserveForResponse(responseBuffer);
        
        return window;
    }
    
    // Token counting with caching
    private static final Map<String, Integer> TOKEN_CACHE = new ConcurrentHashMap<>();
    
    private int tokenCount(String text) {
        return TOKEN_CACHE.computeIfAbsent(text, t -> {
            // Approximate: 1 token ≈ 4 characters
            return Math.ceil(t.length() / 4.0).intValue();
        });
    }
}
```

### Latency Optimization

```
REQUEST TIMELINE (Target: < 2s for typical query)

0ms     ┐
        ├─ Receive request
        ├─ Classify type (50ms, regex pattern matching)
        │
50ms    ├─ Build context (300ms max)
        │  ├─ Read current file (100ms)
        │  ├─ Extract imports (100ms)
        │  └─ Semantic cache lookup (100ms)
        │
350ms   ├─ Prepare prompt (50ms)
        │  ├─ Template fill
        │  └─ Token budgeting
        │
400ms   ├─ Call LlamaCppNativeService (1000-1500ms)
        │  ├─ generateContentFast() or generateContent()
        │  └─ Wait for result
        │
1400ms  ├─ Post-process (100ms)
        │  ├─ Parse output
        │  ├─ Validate syntax
        │  └─ Format
        │
1500ms  ├─ Stream to UI (100ms)
        │
1600ms  └─ Done
        
TIMEOUT MARKERS:
├─ 1s: Alert if not started inference
├─ 2s: Start fallback preparation
├─ 3s: Cancel local, use cloud
└─ 5s: Absolute timeout, return error
```

### Caching Strategy (Session-Local)

```java
public class AgentCache {
    
    // Session-level cache (cleared on session end)
    private final Map<String, CachedResult> sessionCache = new LinkedHashMap<String, CachedResult>(16, 0.75f, true) {
        protected boolean removeEldestEntry(Map.eldest eldest) {
            return size() > 50;  // Keep only 50 most-recent
        }
    };
    
    // File modification tracking
    private final Map<String, Long> fileModTimes = new ConcurrentHashMap<>();
    
    public Optional<String> getCached(String query, String filePath, int cursorLine) {
        String key = hashKey(query, filePath, cursorLine);
        CachedResult cached = sessionCache.get(key);
        
        if (cached == null) return Optional.empty();
        
        // Invalidate if file changed
        long currentModTime = getFileModTime(filePath);
        if (currentModTime > cached.cacheTime) {
            sessionCache.remove(key);
            return Optional.empty();
        }
        
        return Optional.of(cached.result);
    }
    
    public void cache(String query, String filePath, int cursorLine, String result) {
        String key = hashKey(query, filePath, cursorLine);
        sessionCache.put(key, new CachedResult(
            result,
            System.currentTimeMillis(),
            getFileModTime(filePath)
        ));
    }
    
    private String hashKey(String query, String filePath, int cursorLine) {
        return String.format("%s|%s|%d",
            query.hashCode(),
            filePath,
            cursorLine
        );
    }
    
    private class CachedResult {
        String result;
        long cacheTime;
        long fileModTime;
        
        CachedResult(String result, long cacheTime, long fileModTime) {
            this.result = result;
            this.cacheTime = cacheTime;
            this.fileModTime = fileModTime;
        }
    }
}
```

---

## Agent Memory & Session Management

### Session State Tracking

```java
public class AgentSession {
    private String sessionId;
    private long createdAt;
    private Map<String, String> openFiles;  // path → content
    private List<AgentExchange> history;    // Request-response pairs
    private SessionCache cache;
    private TokenUsage tokenUsage;
    
    public class AgentExchange {
        String timestamp;
        String query;
        RequestType type;
        String userFile;
        int cursorLine;
        String response;
        long durationMs;
        int tokensUsed;
    }
    
    public void recordExchange(String query, String response, long durationMs, int tokensUsed) {
        history.add(new AgentExchange() {{
            timestamp = Instant.now().toString();
            this.query = query;
            this.response = response;
            this.durationMs = durationMs;
            this.tokensUsed = tokensUsed;
        }});
        
        tokenUsage.addTokens(tokensUsed);
    }
    
    // Session memory for learning
    public List<AgentExchange> getRecentEdits(int count) {
        return history.stream()
            .filter(ex -> ex.type == RequestType.CODE_GENERATION || ex.type == RequestType.REFACTOR)
            .skip(Math.max(0, history.size() - count))
            .collect(Collectors.toList());
    }
    
    // Use session context for follow-up requests
    public String getContextFromLastRequest() {
        if (history.isEmpty()) return "";
        AgentExchange last = history.get(history.size() - 1);
        return String.format(
            "Previous context:\nQuery: %s\nResponse: %s\n",
            last.query,
            last.response
        );
    }
}
```

### Memory Pruning (Forget Old Context)

```java
public void pruneSessionMemory(AgentSession session) {
    // Keep only last 20 exchanges
    if (session.history.size() > 20) {
        session.history = session.history
            .stream()
            .skip(session.history.size() - 20)
            .collect(Collectors.toList());
    }
    
    // Clear cache if > 50MB
    if (session.cache.estimateSize() > 50_000_000) {
        session.cache.clear();
    }
    
    // Reset token counter if session > 1 hour old
    if (System.currentTimeMillis() - session.createdAt > 3600_000) {
        session.tokenUsage.reset();
    }
}
```

---

## Output Formatting & User Communication

### Standard Response Format

```json
{
  "type": "code_generation",
  "status": "success",
  "timestamp": "2026-05-22T10:30:00Z",
  "execution": {
    "duration_ms": 1234,
    "tokens_used": 312,
    "provider": "local_llama",
    "confidence": 0.95
  },
  "analysis": {
    "verified": "Generated Spring REST controller following project patterns",
    "intent": "Create CRUD endpoints for post management",
    "plan": "Use existing UserController as template, apply same validation/error handling"
  },
  "output": {
    "format": "java",
    "content": "@RestController\n@RequestMapping(\"/api/posts\")\npublic class PostController { ... }"
  },
  "metadata": {
    "file": "src/main/java/com/example/controller/PostController.java",
    "lines": [1, 45],
    "patterns_matched": ["spring_rest_pattern", "error_handling_approach"],
    "suggestions": [
      "Add @Service for PostService",
      "Add repository interface",
      "Add exception handler"
    ]
  }
}
```

### User Communication Style (Cursor-Like)

```
PATTERN: [Action] → [Finding] → [Output] → [Next]

Example 1 (Analysis):
──────────────────────
Checked: parseUserInput() method (lines 23-56, 34 lines)
Found: Missing null validation on userId parameter
Risk: NPE at line 45 if userId is null

Suggestion:
  ✓ Add: if (userId == null) throw new IllegalArgumentException("userId required");
  ✓ Or use: @NotNull annotation on parameter

Next: Add validation now? Or show all issues first?
──────────────────────

Example 2 (Generation):
──────────────────────
Generated: UserService class (45 lines)
  ├─ CRUD methods: create, read, update, delete
  ├─ Error handling: throws UserNotFoundException
  ├─ Validation: userId > 0, name not blank
  └─ Pattern: Follows existing ProjectService style

Copy this to: src/main/java/com/example/service/UserService.java

Next: Generate UserController to match?
──────────────────────

Example 3 (Refactoring):
──────────────────────
Before: 45 lines, N+1 query problem
After:  32 lines, 1 query with JOIN fetch

Changes:
  ✓ Line 12: Added @Query with JOIN FETCH
  ✓ Line 28: Removed manual loop
  ✓ Line 35: Changed from List to Page (pagination)

Performance: 10x faster (1 query instead of 1+N)

Next: Apply changes?
──────────────────────
```

---

## Integration with LlamaCppNativeService

### Direct Service Calls

```java
public class LocalAgentExecutor {
    
    @Autowired
    private LlamaCppNativeService llamaCppNativeService;
    
    @Autowired
    private AiLocalOrchestrationService orchestrationService;
    
    // DIRECT CALL: For simple, fast requests
    public String executeDirectInference(String prompt, int maxTokens) {
        if (!llamaCppNativeService.isAvailable()) {
            return handleUnavailable();
        }
        
        String result = llamaCppNativeService.generateContentFast(prompt, maxTokens);
        return parseResult(result);
    }
    
    // TRACKED CALL: For cancellable requests
    public String executeTrackedInference(String prompt, String requestId) {
        if (!llamaCppNativeService.isHealthy()) {
            return handleUnhealthy();
        }
        
        String result = llamaCppNativeService.generateContentWithTaskTracking(
            prompt,
            requestId
        );
        
        return parseResult(result);
    }
    
    // ORCHESTRATED CALL: For multi-phase requests
    public void executeOrchestration(
        String query,
        String codeContext,
        String requestId,
        StreamCallback onUpdate
    ) {
        if (!llamaCppNativeService.isAvailable()) {
            onUpdate.onError("Local AI service unavailable");
            return;
        }
        
        orchestrationService.executeWithStreaming(
            new OrchestrationRequest(query, codeContext, requestId),
            onUpdate
        );
    }
    
    // CANCELLATION: Stop running inference
    public boolean cancelInference(String requestId) {
        return llamaCppNativeService.cancelInferenceTask(requestId);
    }
    
    private String handleUnavailable() {
        // Fall back to cloud or queue
        return "{\"error\": \"LOCAL_UNAVAILABLE\", \"fallback\": \"cloud\"}";
    }
    
    private String handleUnhealthy() {
        // Circuit is open, skip local
        return "{\"error\": \"CIRCUIT_OPEN\", \"fallback\": \"cloud\"}";
    }
    
    private String parseResult(String rawResult) {
        // Parse JSON response from llama
        try {
            JsonNode node = new ObjectMapper().readTree(rawResult);
            return node.get("content").asText();
        } catch (Exception e) {
            return rawResult;  // Raw text if not JSON
        }
    }
}
```

### Health Check Loop (Agent Readiness)

```java
public class AgentHealthMonitor {
    
    @Scheduled(fixedRate = 5000)  // Every 5 seconds
    public void checkAgentHealth() {
        HealthStatus status = new HealthStatus();
        
        // 1. Check LlamaCppNativeService
        if (llamaCppNativeService == null) {
            status.llamaAvailable = false;
        } else {
            status.llamaAvailable = llamaCppNativeService.isAvailable();
            status.llamaHealthy = llamaCppNativeService.isHealthy();
            status.circuitOpen = llamaCppNativeService.isCircuitOpen();
        }
        
        // 2. Check memory
        Runtime rt = Runtime.getRuntime();
        long usedMemory = rt.totalMemory() - rt.freeMemory();
        status.memoryAvailable = usedMemory < rt.maxMemory() * 0.9;
        
        // 3. Check load
        status.cpuLoad = ManagementFactory.getOperatingSystemMXBean().getProcessCpuLoad();
        status.cpuHealthy = status.cpuLoad < 0.8;  // < 80%
        
        // 4. Report
        reportHealthStatus(status);
        
        // 5. Alert if unhealthy
        if (!status.isHealthy()) {
            alertOperator(status);
        }
    }
    
    public class HealthStatus {
        boolean llamaAvailable;
        boolean llamaHealthy;
        boolean circuitOpen;
        boolean memoryAvailable;
        boolean cpuHealthy;
        double cpuLoad;
        
        public boolean isHealthy() {
            return llamaHealthy && memoryAvailable && cpuHealthy;
        }
    }
}
```

---

## Batch Processing & Orchestration

### Multi-File Analysis (Parallel)

```java
public class BatchAgentProcessor {
    
    // Process multiple files in parallel
    public List<AnalysisResult> analyzeMultipleFiles(List<String> filePaths, String query) {
        // Only use parallel if:
        // 1. Local service is healthy
        // 2. > 5 files to analyze
        // 3. CPU load < 50%
        
        if (!llamaCppNativeService.isHealthy()) {
            return sequentialAnalysis(filePaths, query);
        }
        
        if (filePaths.size() < 5 || getCpuLoad() > 0.5) {
            return sequentialAnalysis(filePaths, query);
        }
        
        // Parallel processing with thread pool
        int parallelism = Math.min(4, filePaths.size());  // Max 4 parallel
        
        return filePaths.parallelStream()
            .map(filePath -> analyzeFile(filePath, query))
            .collect(Collectors.toList());
    }
    
    private AnalysisResult analyzeFile(String filePath, String query) {
        String fileContent = readFile(filePath);
        String prompt = buildAnalysisPrompt(query, fileContent);
        
        String result = llamaCppNativeService.generateContentFast(prompt, 256);
        
        return new AnalysisResult(filePath, result);
    }
    
    private List<AnalysisResult> sequentialAnalysis(List<String> filePaths, String query) {
        List<AnalysisResult> results = new ArrayList<>();
        
        for (String filePath : filePaths) {
            results.add(analyzeFile(filePath, query));
            
            // Small delay between requests to avoid resource contention
            Thread.sleep(100);
        }
        
        return results;
    }
}
```

### Orchestration Plan Generation

```java
public class AgentOrchestrationPlanner {
    
    public OrchestrationPlan generatePlan(String query, FileContext context) {
        // Analyze query complexity to determine phases
        
        String planPrompt = String.format("""
            Plan a solution for this request in 3-6 phases.
            Each phase should be < 2 seconds of inference time.
            
            Request: %s
            
            Available context:
            - Files: %d
            - Total lines: %d
            - Main language: %s
            
            Format response as JSON:
            {
              "phases": [
                {
                  "id": 1,
                  "name": "Parse & Analyze",
                  "duration_ms": 800,
                  "prompt": "..." 
                },
                ...
              ]
            }
            """, query, context.fileCount, context.totalLines, context.mainLanguage);
        
        String planResult = llamaCppNativeService.generateContentFast(planPrompt, 256);
        
        return parseOrchestrationPlan(planResult);
    }
    
    public class OrchestrationPlan {
        List<Phase> phases;
        
        public static class Phase {
            int id;
            String name;
            int duration_ms;
            String prompt;
            String result;
            long startTime;
            long endTime;
        }
    }
}
```

---

## Summary: Agent Operating Checklist

Before each request, the agent should:

```
PRE-REQUEST:
[ ] 1. Check health: llamaCppNativeService.isHealthy()?
[ ] 2. Classify query type (ANALYSIS, GEN, REFACTOR, etc.)
[ ] 3. Estimate complexity (SIMPLE, MEDIUM, COMPLEX)
[ ] 4. Build dynamic context window (allocate tokens intelligently)
[ ] 5. Set latency budget (1s, 2s, or 3s)
[ ] 6. Check session cache (avoid duplicate work)

EXECUTION:
[ ] 7. Build optimized prompt (minimal, precise, follow patterns)
[ ] 8. Call LlamaCppNativeService with appropriate method
[ ] 9. Monitor latency (abort at timeout, fallback to cloud)
[ ] 10. Validate output (syntax check, format check)

POST-REQUEST:
[ ] 11. Format response (JSON structure, user-friendly explanation)
[ ] 12. Cache result (if reusable)
[ ] 13. Record metrics (duration, tokens, provider)
[ ] 14. Update session memory (for follow-ups)

ERROR HANDLING:
[ ] 15. If circuit open → fallback to cloud
[ ] 16. If timeout → reduce scope, retry or fallback
[ ] 17. If OOM → shrink context, restart if needed
[ ] 18. Always return helpful message to user
```

---

## Quick Reference: Agent Prompts

### System Prompt Template

```
You are CSM AI Local Agent – an in-process code analysis engine.

Core capabilities:
1. Analyze code (understand intent, identify issues)
2. Generate code (create new classes, methods, tests)
3. Refactor code (improve existing code without changing logic)
4. Debug code (find and fix bugs)
5. Document code (add comments, JSDoc)

Constraints:
- Max output: 512 tokens
- Context: 8192 tokens total
- No external calls
- Response must be valid code or JSON

Working style:
- Start with facts (what you found)
- Explain intent (what user asked)
- Show solution (code or analysis)
- Suggest next steps (if needed)

Format answer as:
✓ Verified: [what you checked]
✓ Intent: [what user wants]
[CODE OR ANALYSIS]
Next: [optional follow-up]
```

### Example Prompts by Type

```
ANALYSIS:
"Analyze this Java method and identify:
1. Purpose (what does it do?)
2. Issues (bugs, performance, style)
3. Suggestions (how to improve)

Code: [method]

Format: Short bullets for each."

CODE_GENERATION:
"Generate a Spring REST controller for managing [entity].
Follow this pattern: [example controller]
Include: GET, POST, PUT, DELETE, error handling.
Return ONLY valid Java code."

REFACTOR:
"Refactor this code to use [pattern/technique].
Keep the same functionality.
Improve: [readability/performance/maintainability]

Code: [code block]"

DEBUG:
"Debug this error and provide a fix.
Error: [error message]
Code: [code around error]

Format: 
Problem: [root cause]
Fix: [code change]"

TEST_GENERATION:
"Generate unit tests for this method.
Use: [test framework]
Cover: happy path, edge cases, error cases

Method: [method signature and body]"
```

---

**End of Operating Manual**

---

**For AI Local Agents:**
This guide is your operational playbook. Follow the decision trees, respect token budgets, monitor latency, and always fall back gracefully. You're Claude-like but faster and private. Make it count.

**Version:** 1.0  
**Last Updated:** May 22, 2026  
**Maintained By:** CSM AI Local Team
