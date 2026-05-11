# AI Local Optimization Checklist

Mục tiêu: chạy nhanh, ổn định trên nhiều cấu hình, hiểu đúng yêu cầu, tiết kiệm token, và trả kết quả theo từng mảnh để cập nhật dần vào editor.

## 1. Input Contract
- Bắt buộc dùng `currentCode` làm nguồn chính.
- Luôn gửi `cursorLine` nếu có vị trí đang sửa.
- Chỉ gửi `attachments` thật sự cần thiết.
- Gửi `flowType`, `contextType`, `responseMode` để backend route đúng luồng.
- Với code string, không phụ thuộc file path trên disk.
- Giữ `message` ngắn, rõ mục tiêu, tránh nhồi nhiều yêu cầu không liên quan.

## 2. Context Strategy
- Chỉ nạp ngữ cảnh quanh vùng liên quan, không quét cả repo nếu chưa cần.
- Ưu tiên các nguồn theo thứ tự: `currentCode` -> dòng quanh cursor -> retrieval local -> attachment.
- Nếu ngữ cảnh mâu thuẫn, `currentCode` thắng.
- Với máy yếu, giảm kích thước context trước khi tăng số lượng retry.
- Với JSON/menu lớn, dùng distill/chunk thay vì gửi raw toàn bộ.

## 3. Prompt Strategy
- Ép model trả output có cấu trúc: `SEARCH/REPLACE`, `textEdits`, hoặc JSON patch.
- Không yêu cầu full code nếu chỉ sửa một phần nhỏ.
- Ghi rõ đầu ra mong muốn ngay trong prompt.
- Với nhiệm vụ analyze, chỉ yêu cầu giải thích logic hiện có.
- Với nhiệm vụ edit, yêu cầu trả đúng vùng thay đổi, không bịa thêm phần ngoài phạm vi.

## 4. Output Strategy
- Không cố trả toàn bộ kết quả trong một lần nếu prompt lớn.
- Dùng stream nhiều đoạn nhỏ, mỗi đoạn là một patch có thể áp ngay.
- Cho phép resume khi stream bị ngắt.
- Frontend nên áp patch theo từng phần lên CodeMirror hoặc tree editor.
- Nếu kết quả dài, backend nên tách thành các chunk có thứ tự rõ ràng.

## 5. Performance Strategy
- Dùng 2 tầng: fast classify/probe và edit/analyze.
- Tầng fast phải có cap output nhỏ.
- Tầng edit chỉ mở rộng context khi cần.
- Giảm batch/context/max tokens trên máy yếu.
- Bật cache cho classify và retrieval nếu yêu cầu lặp lại.
- Hạn chế bước gọi lại model không cần thiết.

## 6. Reliability Strategy
- Nếu yêu cầu chưa rõ, hỏi đúng một lớp thiếu nhất, không hỏi lan man.
- Nếu model trả output sai format, retry với prompt hẹp hơn và format cứng hơn.
- Với local-only scope, không fallback sang cloud ngoài ý muốn.
- Nếu model/circuit chưa sẵn sàng, trả lỗi rõ thay vì im lặng.
- Log ngắn gọn: prompt size, context size, output mode, route mode.

## 7. Device Profiles
- Máy yếu: giảm `context-window`, `max-tokens`, `batch-size`, `ubatch-size`.
- Máy trung bình: giữ context vừa đủ, output cap vừa phải, ưu tiên chunking.
- Máy mạnh: tăng context và output cap, nhưng vẫn giữ output có cấu trúc.
- Không nên đặt một profile cho mọi máy nếu chênh RAM/CPU lớn.
- Mỗi profile nên có giới hạn riêng cho prompt, output, và retry.

## 8. Validation
- Validate hẹp ngay sau khi sửa: file bị chạm, prompt format, hoặc response parser.
- Ưu tiên kiểm tra build/lint/typecheck cục bộ hơn là chạy toàn bộ repo.
- Test parser output cho các dạng: JSON, SEARCH/REPLACE, textEdits.
- Test các case lớn: code string dài, menu JSON lớn, attachment nhiều.
- Test fallback khi output bị cắt giữa chừng.

## 9. Frontend Streaming
- Nhận patch stream theo thứ tự và hiển thị tiến độ.
- Không đợi full response mới cập nhật UI.
- Có cơ chế rollback/undo nếu patch lỗi.
- Với CodeMirror, cập nhật theo line/patch để giữ tương tác mượt.
- Với menu tree, áp add/edit/delete trực tiếp vào data source.

## 10. Practical Rules
- Luôn ưu tiên đúng hơn là dài hơn.
- Luôn ưu tiên ngắn hơn nhưng đủ dữ kiện.
- Không đoán nếu dữ kiện chưa đủ.
- Không quét toàn repo nếu một đoạn code string đã đủ.
- Không nhét “mọi thứ” vào prompt chỉ vì sợ thiếu sót.

## 11. Suggested Defaults for Weak Machines
- `context-window`: thấp đến vừa, không chạy max mặc định.
- `max-tokens`: cap vừa đủ cho patch hoặc JSON ngắn.
- `batch-size` / `ubatch-size`: tăng vừa phải, tránh OOM.
- `temperature`: thấp để ổn định format.
- `top-p` / `top-k`: đủ hẹp để giảm nhiễu.
- `fast path`: bắt buộc cho classify, question routing, and small edits.

## 12. What to Avoid
- Không gửi full repo hoặc full file rất dài nếu chỉ sửa một phần.
- Không đòi output “vô hạn” trong một lần sinh.
- Không để model tự do viết lan man khi cần patch chính xác.
- Không dùng một prompt chung cho mọi loại task.
- Không bỏ qua cursorLine / nearby context nếu có.

## 13. Operational Summary
- Code string là nguồn chính.
- Cursor là điểm neo.
- Retrieval chỉ là phụ trợ.
- Output phải có cấu trúc.
- Stream theo mảnh.
- Profile theo máy.
- Validate hẹp ngay sau sửa.

## 14. Short Answer
Muốn hệ thống local AI chạy tốt trên mọi máy, cách đúng không phải là "cho model nghĩ nhiều hơn", mà là "cho model thấy ít hơn nhưng đúng hơn", rồi bắt nó trả patch nhỏ, có cấu trúc, áp được ngay vào editor.

## 15. Current Backend Mapping
Đây là cách checklist này map trực tiếp vào hệ thống hiện có của bạn:

- Input contract: `ApiSpringController` nhận `currentCode`, `cursorLine`, `flowType`, `contextType`, `responseMode`, `attachments`, `editorMetadata`.
- Local prompt shaping: `buildCodingPrompt(...)` đã ép code-string-first và có block request schema.
- Local retrieval: `LocalAiAssistantContextService` lấy ngữ cảnh hẹp từ Lucene + code analysis.
- Business memory: `AiBusinessMemoryVectorService` chỉ nên dùng cho RAG phụ trợ, không thay `currentCode`.
- Session continuity: `AiConversationContextService` và `AiAssistantGatewayService` giữ ngữ cảnh liên tục nhưng phải được cắt gọn.
- Fast route: `LlamaCppNativeService.generateContentFast(...)` dùng cho classify/probe/short edit.
- Budget guard: `AiPromptBudgetService` quyết định cap theo profile `safe/aggressive`.
- Output patching: frontend phải parse `SEARCH/REPLACE`, `textEdits`, hoặc JSON patch rồi áp dần lên CodeMirror/tree.

## 16. Exact Property Contract
Những key dưới đây là trọng tâm nên giữ nhất quán khi tinh chỉnh hệ thống:

- `ai.local.llama.system-prompt`: contract ngắn, code-string-first, không giả định file path.
- `ai.local.llama.runtime-profile`: profile runtime cho máy yếu/trung bình/mạnh.
- `ai.local.llama.context-window`: ảnh hưởng trực tiếp KV cache và tốc độ.
- `ai.local.llama.max-tokens`: cap output, không nên để quá lớn cho fast path.
- `ai.local.llama.batch-size` và `ai.local.llama.ubatch-size`: ảnh hưởng tốc độ prompt eval và RAM.
- `ai.local.intent-classify.*`: routing step-1, nên giữ configurable.
- `ai.code-stream.routing.*`: điều phối simple-first / retry / prompt cap.
- `ai.router.score-v2.*`: quyết định local-only / hybrid / cloud-only.
- `ai.assistant.prompt-budget.*`: giới hạn prompt theo menu/code/analyze.
- `ai.local.chunking.*`: chia context lớn thành chunk nhỏ trước khi gọi model.

## 17. Weak-Machine Presets
Nếu mục tiêu là máy yếu 2 core / 5-6 GB RAM, dùng bộ overrides này làm mặc định vận hành:

```properties
ai.local.llama.runtime-profile=conservative
ai.local.llama.context-window=8192
ai.local.llama.max-tokens=192
ai.local.llama.batch-size=48
ai.local.llama.ubatch-size=24
ai.local.llama.temperature=0.1
ai.local.llama.top-p=0.85
ai.local.llama.top-k=32
ai.code-stream.routing.force-simple-first=true
ai.code-stream.routing.simple-first-max-chars=60000
ai.code-stream.routing.retry-default-max-prompt-chars=80000
ai.local.pre-analysis.enabled=false
ai.local.fast-question.max-tokens=256
ai.local.intent-classify.cache-ttl-ms=45000
ai.local.intent-classify.adaptive-cache-ttl-ms=1800000
```

## 18. Normal-Machine Presets
Nếu máy trung bình, ưu tiên cân bằng giữa tốc độ và độ đúng:

```properties
ai.local.llama.runtime-profile=balanced
ai.local.llama.context-window=16384
ai.local.llama.max-tokens=512
ai.local.llama.batch-size=96
ai.local.llama.ubatch-size=48
ai.local.llama.temperature=0.15
ai.local.llama.top-p=0.85
ai.local.llama.top-k=32
ai.local.chunking.enabled=true
ai.local.chunking.threshold-chars=60000
ai.local.chunking.chunk-size-chars=6000
ai.local.chunking.max-chunks=10
```

## 19. Strong-Machine Presets
Nếu máy mạnh, vẫn nên giữ output có cấu trúc nhưng có thể nới context:

```properties
ai.local.llama.runtime-profile=max
ai.local.llama.context-window=32768
ai.local.llama.max-tokens=1024
ai.local.llama.batch-size=128
ai.local.llama.ubatch-size=64
ai.local.llama.temperature=0.2
ai.local.llama.top-p=0.9
ai.local.llama.top-k=40
```

## 20. Streaming Patch Contract
Khi code string được sửa từng phần, frontend nên tuân thủ một contract cố định:

- `add`: thêm khối mới.
- `edit`: thay đúng vùng hiện có.
- `delete`: xoá đúng khối đã xác định.
- Mỗi patch phải có id, path, và lý do ngắn.
- Mỗi stream event nên kèm `stage`, `status`, `percent`, `elapsedMs`, `requestId`.
- Nếu patch chưa đủ tự tin, giữ trạng thái pending thay vì áp bừa.
- Nếu output bị cắt giữa chừng, frontend phải cho phép retry/resume từ patch cuối đã áp.

## 21. Minimal Prompt Formula
Khi gửi yêu cầu cho local AI, dùng công thức sau:

```text
Goal + currentCode + cursorLine + 1-sentence change scope + desired output format
```

Ví dụ:

```text
Sửa bug parse JSON ở đoạn này. currentCode là nguồn chính. cursorLine=128. Chỉ sửa đúng phần parse, trả SEARCH/REPLACE blocks, không trả full file.
```

## 22. Final Operating Rule
Nếu muốn chính xác và nhanh trên nhiều máy, local AI không được làm việc theo kiểu "suy luận rộng rồi trả dài". Nó phải làm theo kiểu: nhận code string tối thiểu, định vị hẹp, trả patch có cấu trúc, áp từng mảnh, và chỉ mở rộng context khi thật sự cần.
