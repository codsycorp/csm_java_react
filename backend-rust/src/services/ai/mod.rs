//! AI services — orchestration layer mirroring Java AiLocal* / AiAssistant* services.
//! Local inference delegates to llama.cpp sidecar process.

pub mod code_stream;
pub mod local_ops;
pub mod orchestration;
pub mod policy;
pub mod registry;
pub mod services;

pub use local_ops::AiLocalOpsService;
pub use orchestration::AiOrchestrationService;
